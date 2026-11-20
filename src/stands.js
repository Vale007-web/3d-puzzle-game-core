import * as THREE from 'three'
import { layout, colors } from './config.js'
import { createTextSprite, setTextSprite } from './ui.js'

export function createStandSystem(scene) {
  const standMeshes = []
  const availableStands = []
  const returningStands = []

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(layout.standBenchWidth, 0.25, layout.standBenchDepth),
    new THREE.MeshStandardMaterial({ color: colors.standBench, roughness: 0.65 }),
  )
  platform.position.set(layout.standBenchX, 0.125, layout.standBenchZ)
  platform.castShadow = true
  platform.receiveShadow = true
  scene.add(platform)

  const standSpacing = layout.standThickness + 0.08
  const firstX = layout.standBenchX - ((layout.maxStands - 1) * standSpacing) / 2
  const material = new THREE.MeshStandardMaterial({ color: colors.stand, roughness: 0.55 })

  for (let index = 0; index < layout.maxStands; index += 1) {
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(
        layout.standThickness,
        layout.playerBoxSize,
        layout.playerBoxSize,
      ),
      material.clone(),
    )
    stand.position.set(
      firstX + index * standSpacing,
      0.25 + layout.playerBoxSize / 2,
      layout.standBenchZ,
    )
    stand.rotation.set(0, 0, 0)
    stand.castShadow = true
    stand.receiveShadow = true
    stand.userData.stackPosition = stand.position.clone()
    stand.userData.stackRotation = stand.rotation.clone()
    stand.userData.trackMountRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, Math.PI / 2),
    )
    scene.add(stand)
    standMeshes.push(stand)
    availableStands.push(stand)
  }

  const counter = createTextSprite(`${availableStands.length}/${layout.maxStands}`)
  counter.position.set(layout.standBenchX, layout.standCounterY, layout.standBenchZ + 2.50)
  counter.scale.set(1.8, 1.36, 1)
  scene.add(counter)

  function updateCounter() {
    setTextSprite(counter, `${availableStands.length}/${layout.maxStands}`)
  }

  function getStackPosition(slot) {
    const spacing = layout.standThickness + 0.08
    const first = layout.standBenchX - ((layout.maxStands - 1) * spacing) / 2
    return new THREE.Vector3(
      first + slot * spacing,
      0.25 + layout.playerBoxSize / 2,
      layout.standBenchZ,
    )
  }

  function animateStand(stand, destination, rotationZ, onComplete) {
    const destinationRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, rotationZ),
    )
    stand.userData.motion = {
      startPosition: stand.position.clone(),
      destination,
      startRotation: stand.quaternion.clone(),
      destinationRotation,
      elapsed: 0,
      onComplete,
    }
  }

  function animateToStackSlot(stand, slot) {
    const destination = getStackPosition(slot)
    stand.userData.stackPosition = destination.clone()
    animateStand(stand, destination, stand.userData.stackRotation.z)
  }

  function updateStandPosition(box) {
    const stand = box.userData.stand
    if (!stand || stand.userData.motion) return
    stand.position.set(box.position.x, 0.465 + layout.standThickness / 2, box.position.z)
    stand.quaternion.copy(box.quaternion).multiply(stand.userData.trackMountRotation)
  }

  function assign(box, conveyorPath) {
    const stand = availableStands.pop()
    if (!stand) return false

    box.userData.stand = stand
    box.userData.standReady = false
    stand.userData.box = box
    updateCounter()
    for (let index = 0; index < availableStands.length; index += 1) {
      animateToStackSlot(availableStands[index], index + 1)
    }

    const spawnPoint = conveyorPath.getPointAt(0)
    animateStand(
      stand,
      new THREE.Vector3(spawnPoint.x, 0.465 + layout.standThickness / 2, spawnPoint.z),
      Math.PI / 2,
      () => {
        if (box.userData.stand === stand) box.userData.standReady = true
      },
    )
    return true
  }

  function release(box) {
    const stand = box.userData.stand
    if (!stand) return
    delete box.userData.stand
    box.userData.standReady = false
    delete stand.userData.box
    returningStands.push(stand)
    animateStand(stand, getStackPosition(0), stand.userData.stackRotation.z, () => {
      const returnIndex = returningStands.indexOf(stand)
      if (returnIndex !== -1) returningStands.splice(returnIndex, 1)
      availableStands.unshift(stand)
      for (let index = 0; index < availableStands.length; index += 1) {
        animateToStackSlot(availableStands[index], index)
      }
      updateCounter()
    })
  }

  function update(deltaTime) {
    for (const stand of standMeshes) {
      const motion = stand.userData.motion
      if (!motion) {
        if (stand.userData.box) updateStandPosition(stand.userData.box)
        continue
      }
      motion.elapsed += deltaTime
      const progress = Math.min(motion.elapsed / layout.standTravelDuration, 1)
      const easedProgress = progress * progress * (3 - 2 * progress)
      stand.position.lerpVectors(motion.startPosition, motion.destination, easedProgress)
      stand.quaternion.slerpQuaternions(
        motion.startRotation,
        motion.destinationRotation,
        easedProgress,
      )
      if (progress < 1) continue
      stand.position.copy(motion.destination)
      stand.quaternion.copy(motion.destinationRotation)
      delete stand.userData.motion
      motion.onComplete?.()
    }
  }

  function reset() {
    availableStands.length = 0
    returningStands.length = 0
    for (const [index, stand] of standMeshes.entries()) {
      stand.position.copy(getStackPosition(index))
      stand.rotation.copy(stand.userData.stackRotation)
      stand.userData.stackPosition.copy(getStackPosition(index))
      delete stand.userData.motion
      delete stand.userData.box
      availableStands.push(stand)
    }
    updateCounter()
  }

  return {
    assign,
    release,
    updatePosition: updateStandPosition,
    update,
    reset,
    get availableCount() {
      return availableStands.length
    },
  }
}
