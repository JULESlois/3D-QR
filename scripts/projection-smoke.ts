import { CELL_SIZE, positionForCell } from '../src/sculpture'
import { createQRMatrix } from '../src/qr'
import { STYLES } from '../src/styles'

interface ProjectionCase {
  label: string
  payload: string
  minVersion: number
}

const cases: readonly ProjectionCase[] = [
  { label: 'compact', payload: 'A', minVersion: 1 },
  { label: 'typical-url', payload: 'https://github.com/JULESlois/3D-QR', minVersion: 3 },
  { label: 'medium-content', payload: `forest-${'mixed-case-payload/'.repeat(9)}`, minVersion: 6 },
  { label: 'large-content', payload: `city-${'projection-coverage/'.repeat(24)}`, minVersion: 10 },
]

const EPSILON = 1e-7

function assertVoxelStructure(styleId: string, matrixSize: number, voxels: ReturnType<(typeof STYLES)[number]['generate']>['voxels']): void {
  const occupied = new Set<string>()

  for (const voxel of voxels) {
    const expected = positionForCell(voxel.row, voxel.col, matrixSize)
    if (Math.abs(voxel.x - expected.x) > EPSILON || Math.abs(voxel.z - expected.z) > EPSILON) {
      throw new Error(
        `${styleId} placed voxel ${voxel.row}:${voxel.col} off its QR column: `
        + `expected (${expected.x}, ${expected.z}), received (${voxel.x}, ${voxel.z}).`,
      )
    }

    const level = Math.round(voxel.y / CELL_SIZE)
    if (Math.abs(voxel.y - level * CELL_SIZE) > EPSILON) {
      throw new Error(
        `${styleId} placed voxel ${voxel.row}:${voxel.col} at off-grid height ${voxel.y}.`,
      )
    }

    const key = `${voxel.row}:${voxel.col}:${level}`
    if (occupied.has(key)) {
      throw new Error(
        `${styleId} generated duplicate voxels at QR column ${voxel.row}:${voxel.col}, level ${level}.`,
      )
    }
    occupied.add(key)
  }
}

let sceneCount = 0
let previousVersion = 0

for (const testCase of cases) {
  const matrix = createQRMatrix(testCase.payload)

  if (matrix.version < testCase.minVersion) {
    throw new Error(`${testCase.label} only produced QR v${matrix.version}; expected v${testCase.minVersion}+ for coverage.`)
  }
  if (matrix.version <= previousVersion) {
    throw new Error(`${testCase.label} produced QR v${matrix.version}; smoke cases must exercise strictly increasing symbol sizes.`)
  }
  previousVersion = matrix.version

  for (const style of STYLES) {
    const build = style.generate(matrix, testCase.payload)

    if (build.voxels.length === 0) {
      throw new Error(`${style.id} generated an empty scene for QR v${matrix.version}.`)
    }
    if (!Number.isFinite(build.maxHeight) || build.maxHeight <= 0) {
      throw new Error(`${style.id} generated an invalid height for QR v${matrix.version}.`)
    }
    if (build.styleId !== style.id) {
      throw new Error(`${style.id} returned mismatched style id ${build.styleId}.`)
    }

    assertVoxelStructure(style.id, matrix.size, build.voxels)
    sceneCount += 1
  }

  console.log(`projection smoke: ${testCase.label} / QR v${matrix.version} / ${matrix.size}x${matrix.size} / ${STYLES.length} styles OK`)
}

console.log(`projection smoke: ${sceneCount} generated scenes passed projection and voxel-structure invariants across QR v${cases[0].minVersion} to v${previousVersion}`)
