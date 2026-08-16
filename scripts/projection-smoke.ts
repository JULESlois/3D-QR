import { createQRMatrix } from '../src/qr'
import { STYLES } from '../src/styles'

const payloads = [
  'A',
  'https://github.com/JULESlois/3D-QR',
]

let sceneCount = 0

for (const payload of payloads) {
  const matrix = createQRMatrix(payload)

  for (const style of STYLES) {
    const build = style.generate(matrix, payload)

    if (build.voxels.length === 0) {
      throw new Error(`${style.id} generated an empty scene for QR v${matrix.version}.`)
    }
    if (!Number.isFinite(build.maxHeight) || build.maxHeight <= 0) {
      throw new Error(`${style.id} generated an invalid height for QR v${matrix.version}.`)
    }
    if (build.styleId !== style.id) {
      throw new Error(`${style.id} returned mismatched style id ${build.styleId}.`)
    }

    sceneCount += 1
  }

  console.log(`projection smoke: QR v${matrix.version} / ${matrix.size}x${matrix.size} / ${STYLES.length} styles OK`)
}

console.log(`projection smoke: ${sceneCount} generated scenes passed projection invariants`)
