import './style.css'
import { createBoxSystem } from './boxes.js'
import { createGameScene } from './scene.js'
import { createStandSystem } from './stands.js'
import { createGameUI } from './ui.js'

const app = document.querySelector('#app')
if (!(app instanceof HTMLElement)) {
  throw new Error('Unable to find the application mount point.')
}

const { scene, camera, renderer, conveyorPath, conveyorSegments, resize } =
  createGameScene(app)
const stands = createStandSystem(scene)
const ui = createGameUI(app)
const boxes = createBoxSystem({
  scene,
  camera,
  renderer,
  conveyorPath,
  conveyorSegments,
  stands,
  ui,
})
ui.setRetryHandler(boxes.reset)

app.appendChild(renderer.domElement)
boxes.initialize()
renderer.domElement.addEventListener('pointerdown', boxes.onPointerDown)
window.addEventListener('resize', resize)
resize()
requestAnimationFrame(animate)

let previousFrameTime
function animate(timestamp) {
  requestAnimationFrame(animate)
  const deltaTime =
    previousFrameTime === undefined
      ? 0
      : Math.min((timestamp - previousFrameTime) / 1000, 0.05)
  previousFrameTime = timestamp
  stands.update(deltaTime)
  boxes.update(deltaTime)
  renderer.render(scene, camera)
}
