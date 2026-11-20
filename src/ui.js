import * as THREE from 'three'
import { layout, colors } from './config.js'

export function createTextSprite(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the 3D text canvas.')

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 2
  sprite.userData.canvas = canvas
  sprite.userData.context = context
  sprite.userData.texture = texture
  setTextSprite(sprite, text)
  return sprite
}

export function setTextSprite(sprite, text) {
  const { canvas, context, texture } = sprite.userData
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = 'bold 240px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 30
  context.strokeStyle = colors.textOutline
  context.fillStyle = colors.white
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
}

export function addAmmoCounter(box) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the ammo counter canvas.')

  context.font = 'bold 104px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 10
  context.strokeStyle = colors.ammoOutline
  context.fillStyle = colors.white
  context.strokeText(String(box.userData.ammo), canvas.width / 2, canvas.height / 2)
  context.fillText(String(box.userData.ammo), canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const counter = new THREE.Sprite(material)
  counter.scale.set(1.53, 0.93, 1)
  counter.position.set(0, layout.playerBoxSize / 2 + 0.08, 0)
  box.add(counter)
  box.userData.ammoCounter = { canvas, context, texture, sprite: counter }
}

export function updateAmmoCounter(box) {
  const { canvas, context, texture } = box.userData.ammoCounter
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = 'bold 104px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 8
  context.strokeStyle = colors.ammoOutline
  context.fillStyle = colors.white
  context.strokeText(String(box.userData.ammo), canvas.width / 2, canvas.height / 2)
  context.fillText(String(box.userData.ammo), canvas.width / 2, canvas.height / 2)
  texture.needsUpdate = true
}

export function createGameUI(app) {
  app.style.position = 'relative'
  const modal = document.createElement('div')
  modal.className = 'game-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:none',
    'align-items:center',
    'justify-content:center',
    `background:${colors.modalBackdrop}`,
    'z-index:2',
    'font-family:system-ui,sans-serif',
  ].join(';')

  const panel = document.createElement('div')
  panel.className = 'game-modal__panel'
  panel.style.cssText = [
    'min-width: min(82vw, 320px)',
    'padding:32px 28px',
    'border-radius:18px',
    `background:${colors.modalPanel}`,
    `color:${colors.modalText}`,
    'text-align:center',
    `--modal-border:${colors.modalBorder}`,
  ].join(';')
  const title = document.createElement('h2')
  title.style.cssText = 'margin:0 0 8px;font-size:clamp(28px,8vw,42px)'
  const subtitle = document.createElement('p')
  subtitle.className = 'game-modal__subtitle'
  subtitle.hidden = true
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Retry'
  retry.style.cssText = [
    'border:0',
    'border-radius:10px',
    'padding:12px 28px',
    `background:${colors.retryButton}`,
    `color:${colors.retryButtonText}`,
    'font:700 18px system-ui,sans-serif',
    'cursor:pointer',
  ].join(';')
  retry.addEventListener('click', () => retryHandler?.())
  panel.append(title, subtitle, retry)
  modal.append(panel)
  app.append(modal)

  let retryHandler = null
  return {
    setRetryHandler(handler) {
      retryHandler = handler
    },
    finishGame(state, reason) {
      const victory = state === 'won'
      title.textContent = victory ? 'Victory!' : 'Game Over'
      subtitle.textContent = victory ? '' : reason ?? ''
      subtitle.hidden = victory || !reason
      modal.className = `game-modal ${victory ? 'game-modal--victory' : 'game-modal--game-over'}`
      panel.className = `game-modal__panel ${victory ? 'game-modal__panel--victory' : 'game-modal__panel--game-over'}`
      modal.style.display = 'flex'
    },
    hideGameOver() {
      modal.style.display = 'none'
      modal.className = 'game-modal'
      panel.className = 'game-modal__panel'
    },
  }
}
