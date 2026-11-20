import * as THREE from 'three'
import { layout, colors } from './config.js'

export function createGameScene(app) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(colors.background)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  camera.position.set(0, 24, 6)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  const { path, segments } = createConveyorPath()
  addLighting(scene)
  addEnvironment(scene)
  addConveyorLoop(scene, path)

  const resize = () => resizeGameView(app, camera, renderer)
  return { scene, camera, renderer, conveyorPath: path, conveyorSegments: segments, resize }
}

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(colors.white, colors.hemisphereGround, 2))

  const sunlight = new THREE.DirectionalLight(colors.sunlight, 2.5)
  sunlight.position.set(-8, 30, 22)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.camera.left = -22
  sunlight.shadow.camera.right = 22
  sunlight.shadow.camera.top = 24
  sunlight.shadow.camera.bottom = -24
  sunlight.shadow.camera.near = 0.5
  sunlight.shadow.camera.far = 80
  sunlight.shadow.normalBias = 0.03
  sunlight.target.position.set(0, 0, 12)
  sunlight.shadow.camera.updateProjectionMatrix()
  scene.add(sunlight, sunlight.target)
}

function addEnvironment(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 148),
    new THREE.MeshStandardMaterial({ color: colors.ground, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.08
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(36, 48, colors.gridMajor, colors.gridMinor)
  grid.position.y = -0.065
  grid.material.transparent = true
  grid.material.opacity = 0.32
  scene.add(grid)
}

function addConveyorLoop(scene, path) {
  const track = new THREE.Mesh(
    createTrackRibbon(path, layout.trackBandWidth, 0.08, 128),
    new THREE.MeshStandardMaterial({
      color: colors.track,
      roughness: 0.62,
      side: THREE.DoubleSide,
    }),
  )
  track.castShadow = true
  track.receiveShadow = true
  scene.add(track)

  const beltSurface = new THREE.Mesh(
    createTrackRibbon(path, layout.trackBandWidth - 0.28, 0.465, 128),
    new THREE.MeshStandardMaterial({
      color: colors.belt,
      roughness: 0.88,
      side: THREE.DoubleSide,
    }),
  )
  beltSurface.receiveShadow = true
  scene.add(beltSurface)
}

function createTrackRibbon(path, width, y, subdivisions) {
  const positions = []
  const indices = []
  const halfWidth = width / 2

  for (let index = 0; index <= subdivisions; index += 1) {
    const progress = index / subdivisions
    const point = path.getPointAt(progress)
    const tangent = path.getTangentAt(progress).normalize()
    const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x)
    const edgeA = point.clone().addScaledVector(perpendicular, halfWidth)
    const edgeB = point.clone().addScaledVector(perpendicular, -halfWidth)
    positions.push(edgeA.x, y, edgeA.z, edgeB.x, y, edgeB.z)

    if (index < subdivisions) {
      const vertex = index * 2
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createConveyorPath() {
  const halfWidth = layout.beltWidth / 2 - layout.trackBandWidth / 2
  const halfDepth = layout.beltDepth / 2 - layout.trackBandWidth / 2
  const radius = layout.beltCornerRadius - layout.trackBandWidth / 2
  const path = new THREE.CurvePath()
  const segments = []
  const point = (x, z) => new THREE.Vector3(x, 0, z + layout.beltZ)
  let current = point(-halfWidth + radius, halfDepth)

  const addLine = (end, side) => {
    const curve = new THREE.LineCurve3(current, end)
    path.add(curve)
    segments.push({ curve, type: 'straight', side })
    current = end
  }
  const addCorner = (control, end) => {
    const curve = new THREE.QuadraticBezierCurve3(current, control, end)
    path.add(curve)
    segments.push({ curve, type: 'corner' })
    current = end
  }

  addLine(point(halfWidth - radius, halfDepth), 'bottom')
  addCorner(point(halfWidth, halfDepth), point(halfWidth, halfDepth - radius))
  addLine(point(halfWidth, -halfDepth + radius), 'right')
  addCorner(point(halfWidth, -halfDepth), point(halfWidth - radius, -halfDepth))
  addLine(point(-halfWidth + radius, -halfDepth), 'top')
  addCorner(point(-halfWidth, -halfDepth), point(-halfWidth, -halfDepth + radius))
  addLine(point(-halfWidth, halfDepth - radius), 'left')

  return { path, segments }
}

function resizeGameView(app, camera, renderer) {
  const { width, height } = app.getBoundingClientRect()
  if (width === 0 || height === 0) return

  const aspect = width / height
  const boxSpacing = layout.playerBoxSize + layout.playerBoxGap
  const benchHalfWidth =
    ((layout.boxColumns - 1) * boxSpacing) / 2 + layout.playerBoxSize / 2
  const worldMinX = Math.min(
    -layout.beltWidth / 2,
    layout.standBenchX - layout.standBenchWidth / 2,
    -benchHalfWidth,
  )
  const worldMaxX = Math.max(
    layout.beltWidth / 2,
    layout.standBenchX + layout.standBenchWidth / 2,
    benchHalfWidth,
  )
  const requiredWidth =
    2 * Math.max(Math.abs(worldMinX), Math.abs(worldMaxX)) +
    layout.horizontalPadding * 2
  const worldTop = layout.beltZ - layout.beltDepth / 2 - layout.trackBandWidth / 2
  const visibleBenchRows = Math.min(3, layout.boxRows)
  const firstBenchRowZ = layout.playerBoxesTopZ
  const playerBenchMinZ = firstBenchRowZ - layout.playerBoxSize / 2
  const playerBenchMaxZ =
    firstBenchRowZ +
    (visibleBenchRows - 1) * boxSpacing +
    layout.playerBoxSize / 2
  const worldBottom = Math.max(
    layout.beltZ + layout.beltDepth / 2 + layout.trackBandWidth / 2,
    layout.waitingSlotZ + layout.playerBoxSize / 2,
    playerBenchMaxZ,
    layout.standBenchZ + layout.standBenchDepth / 2,
  )
  const worldMinZ = Math.min(
    worldTop,
    layout.waitingSlotZ - layout.playerBoxSize / 2,
    playerBenchMinZ,
    layout.standBenchZ - layout.standBenchDepth / 2,
  )
  const centerZ = (worldMinZ + worldBottom) / 2
  const cameraTilt = Math.atan2(6, 24)
  const cameraUpY = Math.sin(cameraTilt)
  const cameraUpZ = -Math.cos(cameraTilt)
  const maxWorldY = Math.max(
    layout.playerBoxSize + 0.57,
    layout.standCounterY + 0.68,
  )
  const projectedBounds = [worldMinZ, worldBottom].flatMap((z) =>
    [0, maxWorldY].map((y) => y * cameraUpY + (z - centerZ) * cameraUpZ),
  )
  const projectedMin = Math.min(...projectedBounds)
  const projectedMax = Math.max(...projectedBounds)
  const verticalFitHeight =
    projectedMax - projectedMin + layout.verticalPadding * 2
  const horizontalFitHeight = requiredWidth / aspect
  const viewHeight = Math.max(verticalFitHeight, horizontalFitHeight)
  const viewWidth = viewHeight * aspect
  const viewCenterY = (projectedMin + projectedMax) / 2

  camera.left = -viewWidth / 2
  camera.right = viewWidth / 2
  camera.top = viewCenterY + viewHeight / 2
  camera.bottom = viewCenterY - viewHeight / 2
  camera.position.set(0, 24, centerZ + 6)
  camera.lookAt(0, 0, centerZ)
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}
