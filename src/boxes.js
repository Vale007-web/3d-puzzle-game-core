import * as THREE from 'three'
import { layout, colors, tuning } from './config.js'
import { createTargetGrid } from './grid.js'
import { addAmmoCounter, updateAmmoCounter } from './ui.js'

export function createBoxSystem({
  scene,
  camera,
  renderer,
  conveyorPath,
  conveyorSegments,
  stands,
  ui,
}) {
  const targets = []
  const targetGrid = Array.from(
    { length: layout.targetCount },
    () => Array(layout.targetCount).fill(null),
  )
  const benchColumns = Array.from({ length: layout.boxColumns }, () => [])
  const activeBoxes = []
  const destroyingBoxes = []
  const projectiles = []
  const waitingSlots = []
  const waitingBoxes = Array(layout.waitingSlotCount).fill(null)
  const idleBoxes = new Set()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let lastBoxClick = -Infinity
  let gameState = 'playing'
  let idleAnimationTime = 0

  function addWaitingBench() {
    const spacing = layout.playerBoxSize + 0.18
    const horizontalOffset = ((layout.waitingSlotCount - 1) * spacing) / 2
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: colors.waitingBench,
      roughness: 0.72,
    })

    for (let index = 0; index < layout.waitingSlotCount; index += 1) {
      const platform = new THREE.Mesh(
        new THREE.BoxGeometry(layout.playerBoxSize, 0.16, layout.playerBoxSize),
        platformMaterial.clone(),
      )
      platform.position.set(index * spacing - horizontalOffset, 0.08, layout.waitingSlotZ)
      platform.receiveShadow = true
      platform.castShadow = true
      scene.add(platform)
      waitingSlots.push(platform)
    }
  }

  function addPlayerBoxes() {
    const spacing = layout.playerBoxSize + layout.playerBoxGap
    const horizontalOffset = ((layout.boxColumns - 1) * spacing) / 2

    for (let row = 0; row < layout.boxRows; row += 1) {
      for (let column = 0; column < layout.boxColumns; column += 1) {
        const color = (row + column) % 2 === 0 ? colors.light : colors.dark
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(
            layout.playerBoxSize,
            layout.playerBoxSize,
            layout.playerBoxSize,
          ),
          new THREE.MeshStandardMaterial({ color, roughness: 0.62 }),
        )
        box.userData.color = color
        box.userData.benchRow = row
        box.userData.benchColumn = column
        box.userData.ammo = layout.playerAmmo
        box.position.set(
          column * spacing - horizontalOffset,
          layout.playerBoxSize / 2,
          layout.playerBoxesTopZ + row * spacing,
        )
        box.castShadow = true
        box.receiveShadow = true
        addAmmoCounter(box)
        scene.add(box)
        benchColumns[column].push({ box, color, row, column })
      }
    }
  }

  function initialize() {
    addWaitingBench()
    createTargetGrid(scene, targets, targetGrid)
    addPlayerBoxes()
  }

  function finishGame(state, reason) {
    if (gameState !== 'playing') return
    gameState = state
    ui.finishGame(state, reason)
  }

  function onPointerDown(event) {
    if (gameState !== 'playing') return
    const now = performance.now()
    if (now - lastBoxClick < layout.clickCooldown * 1000) return

    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)

    const boxesInBench = benchColumns.flat().map((entry) => entry.box)
    const boxesInWaiting = waitingBoxes.filter(Boolean)
    const [hit] = raycaster.intersectObjects([...boxesInBench, ...boxesInWaiting], false)
    if (!hit) return

    const box = hit.object
    if (stands.availableCount === 0) return

    if (box.userData.waitingSlot !== undefined) {
      const slot = box.userData.waitingSlot
      if (waitingBoxes[slot] !== box) return
      waitingBoxes[slot] = null
      delete box.userData.waitingSlot
      delete box.userData.waitingScaleAnimation
    } else {
      const column = box.userData.benchColumn
      const columnBoxes = benchColumns[column]
      if (columnBoxes[0]?.box !== box) return

      columnBoxes.shift()
      for (const [row, entry] of columnBoxes.entries()) {
        entry.row = row
        entry.box.userData.benchRow = row
        setBenchBoxPosition(entry.box)
      }
    }

    stopIdleAnimation(box)
    lastBoxClick = now
    box.userData.pathDistance = 0
    box.userData.shotTimer = 0
    stands.assign(box, conveyorPath)
    activeBoxes.push(box)
    startBoxSpawnAnimation(box)
  }

  function getBoxPathTransform(progress) {
    const point = conveyorPath.getPointAt(progress)
    const tangent = conveyorPath.getTangentAt(progress).normalize()
    const facing = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize()
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, -Math.atan2(facing.x, -facing.z), 0),
    )
    return {
      position: new THREE.Vector3(
        point.x,
        0.465 + layout.standThickness + layout.playerBoxSize / 2,
        point.z,
      ),
      facing,
      rotation,
    }
  }

  function startBoxSpawnAnimation(box) {
    const spawnTransform = getBoxPathTransform(0)
    box.userData.spawnAnimation = {
      startPosition: box.position.clone(),
      destination: spawnTransform.position,
      startRotation: box.quaternion.clone(),
      destinationRotation: spawnTransform.rotation,
      startScale: box.scale.clone(),
      destinationScale: new THREE.Vector3().setScalar(tuning.beltBoxScale),
      elapsed: 0,
    }
    box.userData.facing = spawnTransform.facing
  }

  function updateBoxSpawnAnimation(box, deltaTime) {
    const animation = box.userData.spawnAnimation
    animation.elapsed += deltaTime
    const progress = Math.min(animation.elapsed / layout.standTravelDuration, 1)
    const easedProgress = progress * progress * (3 - 2 * progress)
    box.position.lerpVectors(
      animation.startPosition,
      animation.destination,
      easedProgress,
    )
    box.quaternion.slerpQuaternions(
      animation.startRotation,
      animation.destinationRotation,
      easedProgress,
    )
    box.scale.lerpVectors(
      animation.startScale,
      animation.destinationScale,
      easedProgress,
    )

    if (progress < 1) return
    box.position.copy(animation.destination)
    box.quaternion.copy(animation.destinationRotation)
    box.scale.copy(animation.destinationScale)
    delete box.userData.spawnAnimation
    stands.updatePosition(box)
  }

  function updateBoxOnPath(box) {
    const pathLength = conveyorPath.getLength()
    const progress = THREE.MathUtils.clamp(box.userData.pathDistance / pathLength, 0, 1)
    const transform = getBoxPathTransform(progress)
    box.position.copy(transform.position)
    box.userData.facing = transform.facing
    box.quaternion.copy(transform.rotation)
    stands.updatePosition(box)
  }

  function setBenchBoxPosition(box) {
    const spacing = layout.playerBoxSize + layout.playerBoxGap
    const horizontalOffset = ((layout.boxColumns - 1) * spacing) / 2
    box.userData.benchTargetPosition = new THREE.Vector3(
      box.userData.benchColumn * spacing - horizontalOffset,
      layout.playerBoxSize / 2,
      layout.playerBoxesTopZ + box.userData.benchRow * spacing,
    )
  }

  function updateBenchBoxes(deltaTime) {
    const smoothing = 1 - Math.exp(-tuning.benchSmoothing * deltaTime)
    for (const column of benchColumns) {
      for (const { box } of column) {
        if (box.userData.benchTargetPosition) {
          box.position.lerp(box.userData.benchTargetPosition, smoothing)
        }
      }
    }
  }

  function updateWaitingBoxes(deltaTime) {
    const smoothing = 1 - Math.exp(-tuning.waitingSmoothing * deltaTime)
    for (let index = 0; index < waitingBoxes.length; index += 1) {
      const box = waitingBoxes[index]
      if (!box) continue
      const slot = waitingSlots[index]
      const targetPosition = new THREE.Vector3(
        slot.position.x,
        slot.position.y + 0.08 + layout.playerBoxSize / 2,
        slot.position.z,
      )
      box.position.lerp(targetPosition, smoothing)
      const scaleAnimation = box.userData.waitingScaleAnimation
      if (!scaleAnimation) continue
      scaleAnimation.elapsed += deltaTime
      const progress = Math.min(
        scaleAnimation.elapsed / layout.standTravelDuration,
        1,
      )
      const easedProgress = progress * progress * (3 - 2 * progress)
      box.scale.lerpVectors(
        scaleAnimation.startScale,
        scaleAnimation.destinationScale,
        easedProgress,
      )
      if (progress === 1) {
        box.scale.copy(scaleAnimation.destinationScale)
        delete box.userData.waitingScaleAnimation
      }
    }
  }

  function stopIdleAnimation(box) {
    if (!idleBoxes.delete(box)) return
    box.quaternion.copy(box.userData.idleBaseQuaternion)
    delete box.userData.idleBaseQuaternion
  }

  function updateIdleAnimations(deltaTime) {
    if (gameState !== 'playing') {
      for (const box of idleBoxes) stopIdleAnimation(box)
      return
    }

    idleAnimationTime += deltaTime
    const eligibleBoxes = new Set([
      ...benchColumns.map((column) => column[0]?.box).filter(Boolean),
      ...waitingBoxes.filter(Boolean),
    ])

    for (const box of idleBoxes) {
      if (!eligibleBoxes.has(box)) stopIdleAnimation(box)
    }

    const horizontalRockAxis = new THREE.Vector3(1, 0, 0)
    for (const box of eligibleBoxes) {
      if (!idleBoxes.has(box)) {
        box.userData.idleBaseQuaternion = box.quaternion.clone()
        idleBoxes.add(box)
      }
      const angle =
        Math.sin(idleAnimationTime * tuning.idleRockSpeed) *
        tuning.idleRockAmplitude
      const rockingRotation = new THREE.Quaternion().setFromAxisAngle(
        horizontalRockAxis,
        angle,
      )
      box.quaternion.copy(rockingRotation).multiply(box.userData.idleBaseQuaternion)
    }
  }

  function getPathSegmentAt(distance) {
    let segmentStart = 0
    for (const segment of conveyorSegments) {
      const segmentEnd = segmentStart + segment.curve.getLength()
      if (distance <= segmentEnd) return segment
      segmentStart = segmentEnd
    }
    return conveyorSegments[conveyorSegments.length - 1]
  }

  function updateActiveBoxes(deltaTime) {
    for (let index = activeBoxes.length - 1; index >= 0; index -= 1) {
      const box = activeBoxes[index]
      if (box.userData.spawnAnimation) {
        updateBoxSpawnAnimation(box, deltaTime)
        continue
      }
      if (!box.userData.standReady) continue
      box.userData.pathDistance += tuning.boxSpeed * deltaTime

      if (box.userData.pathDistance >= conveyorPath.getLength()) {
        const availableSlot = waitingBoxes.indexOf(null)
        if (availableSlot === -1) {
          beginBoxDestruction(index)
          finishGame('lost', 'Waiting bench is full')
          break
        }

        activeBoxes.splice(index, 1)
        stands.release(box)
        box.userData.waitingSlot = availableSlot
        box.userData.benchTargetPosition = null
        box.userData.waitingScaleAnimation = {
          startScale: box.scale.clone(),
          destinationScale: new THREE.Vector3(1, 1, 1),
          elapsed: 0,
        }
        waitingBoxes[availableSlot] = box
        continue
      }

      updateBoxOnPath(box)
      const segment = getPathSegmentAt(box.userData.pathDistance)
      if (segment.type === 'straight' && shootAtGridTarget(box, segment.side)) {
        beginBoxDestruction(index)
      }
    }
  }

  function getGridLineForBox(box, side) {
    const spacing = layout.targetSize + layout.targetGap
    const firstGridX = -((layout.targetCount - 1) * spacing) / 2
    const firstGridZ = layout.beltZ - ((layout.targetCount - 1) * spacing) / 2
    const laneTolerance = layout.targetSize / 2 + 0.14
    const nearestIndex = (coordinate, firstCoordinate) =>
      Math.round((coordinate - firstCoordinate) / spacing)

    if (side === 'bottom' || side === 'top') {
      const column = nearestIndex(box.position.x, firstGridX)
      const columnCenter = firstGridX + column * spacing
      if (
        column < 0 ||
        column >= layout.targetCount ||
        Math.abs(box.position.x - columnCenter) > laneTolerance
      ) {
        return null
      }
      const rowStart = side === 'bottom' ? layout.targetCount - 1 : 0
      const rowStep = side === 'bottom' ? -1 : 1
      for (let row = rowStart; row >= 0 && row < layout.targetCount; row += rowStep) {
        const target = targetGrid[row][column]
        if (target && !target.userData.destroying) return target
      }
      return null
    }

    const row = nearestIndex(box.position.z, firstGridZ)
    const rowCenter = firstGridZ + row * spacing
    if (
      row < 0 ||
      row >= layout.targetCount ||
      Math.abs(box.position.z - rowCenter) > laneTolerance
    ) {
      return null
    }
    const columnStart = side === 'right' ? layout.targetCount - 1 : 0
    const columnStep = side === 'right' ? -1 : 1
    for (
      let column = columnStart;
      column >= 0 && column < layout.targetCount;
      column += columnStep
    ) {
      const target = targetGrid[row][column]
      if (target && !target.userData.destroying) return target
    }
    return null
  }

  function shootAtGridTarget(box, side) {
    const target = getGridLineForBox(box, side)
    if (!target || target.userData.color !== box.userData.color) return false
    if (target.userData.projectileIncoming) return false

    const direction = box.userData.facing
    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 8),
      new THREE.MeshStandardMaterial({
        color: colors.projectile,
        emissive: colors.projectileEmissive,
        roughness: 0.4,
      }),
    )
    projectile.position.set(box.position.x, target.position.y, box.position.z)
    projectile.castShadow = true
    scene.add(projectile)

    box.userData.ammo -= 1
    updateAmmoCounter(box)
    target.userData.projectileIncoming = true
    projectiles.push({
      mesh: projectile,
      target,
      direction: direction.clone(),
      speed: tuning.projectileSpeed,
      distanceToTarget: direction.dot(
        new THREE.Vector3(
          target.position.x - box.position.x,
          0,
          target.position.z - box.position.z,
        ),
      ),
    })
    return box.userData.ammo === 0
  }

  function beginBoxDestruction(index) {
    const [box] = activeBoxes.splice(index, 1)
    stands.release(box)
    box.userData.destroying = true
    box.userData.destroyTime = 0
    destroyingBoxes.push(box)
  }

  function removeProjectile(index) {
    const [{ mesh, target }] = projectiles.splice(index, 1)
    if (targets.includes(target) && !target.userData.destroying) {
      target.userData.projectileIncoming = false
    }
    scene.remove(mesh)
    mesh.geometry.dispose()
    mesh.material.dispose()
  }

  function updateProjectiles(deltaTime) {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index]
      const { mesh, target, direction, speed } = projectile
      if (!targets.includes(target) || target.userData.destroying) {
        removeProjectile(index)
        continue
      }
      projectile.distanceToTarget -= speed * deltaTime
      if (projectile.distanceToTarget <= target.geometry.parameters.width / 2) {
        beginTargetDestruction(target)
        removeProjectile(index)
        continue
      }
      mesh.position.addScaledVector(direction, speed * deltaTime)
    }
  }

  function beginTargetDestruction(target) {
    if (target.userData.destroying) return
    target.userData.destroying = true
    target.userData.destroyTime = 0
  }

  function updateDestroyedTargets(deltaTime) {
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index]
      if (!target.userData.destroying) continue
      target.userData.destroyTime += deltaTime
      const progress = Math.min(
        target.userData.destroyTime / tuning.destructionDuration,
        1,
      )
      target.scale.setScalar(1 - progress)
      target.material.transparent = true
      target.material.opacity = 1 - progress
      if (progress < 1) continue
      scene.remove(target)
      target.geometry.dispose()
      target.material.dispose()
      targetGrid[target.userData.gridRow][target.userData.gridColumn] = null
      targets.splice(index, 1)
      if (targets.length === 0) finishGame('won')
    }
  }

  function updateDestroyedBoxes(deltaTime) {
    for (let index = destroyingBoxes.length - 1; index >= 0; index -= 1) {
      const box = destroyingBoxes[index]
      box.userData.destroyTime += deltaTime
      const progress = Math.min(
        box.userData.destroyTime / tuning.destructionDuration,
        1,
      )
      box.scale.setScalar(1 - progress)
      box.material.transparent = true
      box.material.opacity = 1 - progress
      box.userData.ammoCounter.sprite.material.opacity = 1 - progress
      if (progress < 1) continue
      disposePlayerBox(box)
      destroyingBoxes.splice(index, 1)
    }
  }

  function checkGameOverConditions() {
    if (gameState !== 'playing') return
    const playerBenchBoxes = benchColumns.flat().map((entry) => entry.box)
    const waitingBenchBoxes = waitingBoxes.filter(Boolean)
    const playableBoxes = [
      ...activeBoxes,
      ...waitingBenchBoxes,
      ...playerBenchBoxes,
    ].filter((box) => !box.userData.destroying && box.userData.ammo > 0)

    if (playableBoxes.length === 0 && projectiles.length === 0) {
      finishGame('lost', 'Out of available boxes')
      return
    }

    if (targets.length === 0) return
    const matchInProgress =
      projectiles.length > 0 ||
      targets.some(
        (target) =>
          target.userData.destroying || target.userData.projectileIncoming,
      )
    if (matchInProgress) return

    const availableBoxColors = new Set(playableBoxes.map((box) => box.userData.color))
    const exposedTargetColors = getExposedTargetColors()
    const hasReachableMatch = [...availableBoxColors].some((color) =>
      exposedTargetColors.has(color),
    )
    if (!hasReachableMatch) {
      finishGame('lost', 'Deadlock: No matching targets reachable')
    }
  }

  function getExposedTargetColors() {
    const exposedColors = new Set()

    const addFirstTargetFromLine = (getTargetAt) => {
      for (let index = 0; index < layout.targetCount; index += 1) {
        const target = getTargetAt(index)
        if (!target || target.userData.destroying) continue
        exposedColors.add(target.userData.color)
        return
      }
    }

    for (let row = 0; row < layout.targetCount; row += 1) {
      addFirstTargetFromLine((column) => targetGrid[row][column])
      addFirstTargetFromLine((column) => targetGrid[row][layout.targetCount - 1 - column])
    }

    for (let column = 0; column < layout.targetCount; column += 1) {
      addFirstTargetFromLine((row) => targetGrid[row][column])
      addFirstTargetFromLine((row) => targetGrid[layout.targetCount - 1 - row][column])
    }

    return exposedColors
  }

  function disposePlayerBox(box) {
    scene.remove(box)
    box.geometry.dispose()
    box.material.dispose()
    const { texture, sprite } = box.userData.ammoCounter
    texture.dispose()
    sprite.material.dispose()
  }

  function reset() {
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      removeProjectile(index)
    }
    const boxes = new Set([
      ...benchColumns.flat().map((entry) => entry.box),
      ...activeBoxes,
      ...destroyingBoxes,
      ...waitingBoxes.filter(Boolean),
    ])
    for (const box of idleBoxes) stopIdleAnimation(box)
    for (const box of boxes) disposePlayerBox(box)
    for (const target of targets) {
      scene.remove(target)
      target.geometry.dispose()
      target.material.dispose()
    }
    targets.length = 0
    for (const row of targetGrid) row.fill(null)
    activeBoxes.length = 0
    destroyingBoxes.length = 0
    benchColumns.forEach((column) => { column.length = 0 })
    waitingBoxes.fill(null)
    stands.reset()
    createTargetGrid(scene, targets, targetGrid)
    addPlayerBoxes()
    gameState = 'playing'
    lastBoxClick = -Infinity
    ui.hideGameOver()
  }

  function update(deltaTime) {
    if (gameState === 'playing') {
      updateBenchBoxes(deltaTime)
      updateWaitingBoxes(deltaTime)
      updateActiveBoxes(deltaTime)
      updateProjectiles(deltaTime)
      updateDestroyedTargets(deltaTime)
      updateDestroyedBoxes(deltaTime)
      checkGameOverConditions()
    } else {
      updateDestroyedBoxes(deltaTime)
    }
    updateIdleAnimations(deltaTime)
  }

  return {
    initialize,
    onPointerDown,
    update,
    reset,
  }
}
