import * as THREE from 'three'
import { layout, colors } from './config.js'

export function createTargetGrid(scene, targets, targetGrid) {
  const palette = [colors.light, colors.dark]
  const spacing = layout.targetSize + layout.targetGap
  const offset = ((layout.targetCount - 1) * spacing) / 2

  for (let row = 0; row < layout.targetCount; row += 1) {
    for (let column = 0; column < layout.targetCount; column += 1) {
      const color =
        palette[(Math.floor(row / 2) + Math.floor(column / 2)) % palette.length]
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(layout.targetSize, layout.targetSize, layout.targetSize),
        new THREE.MeshStandardMaterial({ color, roughness: 0.68 }),
      )
      cube.position.set(
        column * spacing - offset,
        layout.targetSize / 2,
        row * spacing - offset + layout.beltZ,
      )
      cube.userData.gridRow = row
      cube.userData.gridColumn = column
      cube.userData.color = color
      cube.castShadow = true
      cube.receiveShadow = true
      scene.add(cube)
      targets.push(cube)
      targetGrid[row][column] = cube
    }
  }
}
