import { CELL_SIZE, QUIET_ZONE, cellKey, positionForCell } from '../src/sculpture'
import { createQRMatrix, type QRMatrixData } from '../src/qr'
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

type GeneratedBuild = ReturnType<(typeof STYLES)[number]['generate']>
type GeneratedVoxel = GeneratedBuild['voxels'][number]

function assertVoxelStructure(styleId: string, matrixSize: number, voxels: GeneratedVoxel[]): void {
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

function assertScannerProjection(styleId: string, matrix: QRMatrixData, build: GeneratedBuild): void {
  const topByColumn = new Map<string, GeneratedVoxel>()

  for (const voxel of build.voxels) {
    const key = cellKey(voxel.row, voxel.col)
    const current = topByColumn.get(key)
    if (!current || voxel.y > current.y) topByColumn.set(key, voxel)

    const insideSymbol = voxel.row >= 0
      && voxel.row < matrix.size
      && voxel.col >= 0
      && voxel.col < matrix.size

    if (!insideSymbol && voxel.y > EPSILON) {
      throw new Error(
        `${styleId} elevated quiet-zone column ${voxel.row}:${voxel.col} to y=${voxel.y}.`,
      )
    }
  }

  for (const cell of matrix.cells) {
    const top = topByColumn.get(cellKey(cell.row, cell.col))
    if (!top) {
      throw new Error(`${styleId} omitted QR column ${cell.row}:${cell.col} from the physical projection.`)
    }

    const scannerDark = top.kind === 'floor-dark' || top.kind === 'qr-top'
    const scannerLight = top.kind === 'floor-light' || top.kind === 'light-top'

    if (cell.dark && !scannerDark) {
      throw new Error(
        `${styleId} exposes ${top.kind} above dark QR module ${cell.row}:${cell.col}.`,
      )
    }
    if (!cell.dark && !scannerLight) {
      throw new Error(
        `${styleId} exposes ${top.kind} above light QR module ${cell.row}:${cell.col}.`,
      )
    }
  }

  for (const top of topByColumn.values()) {
    const insideSymbol = top.row >= 0
      && top.row < matrix.size
      && top.col >= 0
      && top.col < matrix.size
    if (!insideSymbol && top.kind !== 'floor-light') {
      throw new Error(
        `${styleId} exposes ${top.kind} in quiet-zone column ${top.row}:${top.col}; expected floor-light.`,
      )
    }
  }
}

function assertBuildMetrics(styleId: string, matrix: QRMatrixData, build: GeneratedBuild): void {
  const expectedMaxHeight = Math.max(...build.voxels.map((voxel) => voxel.y + CELL_SIZE))
  if (Math.abs(build.maxHeight - expectedMaxHeight) > EPSILON) {
    throw new Error(
      `${styleId} reports maxHeight=${build.maxHeight}, but geometry reaches ${expectedMaxHeight}.`,
    )
  }

  const expectedFootprint = (matrix.size + QUIET_ZONE * 2) * CELL_SIZE
  if (Math.abs(build.footprint - expectedFootprint) > EPSILON) {
    throw new Error(
      `${styleId} reports projection footprint ${build.footprint}; expected ${expectedFootprint}.`,
    )
  }

  if (!Number.isFinite(build.physicalFootprint) || build.physicalFootprint <= 0) {
    throw new Error(`${styleId} reports invalid physical footprint ${build.physicalFootprint}.`)
  }

  const baseDarkCount = build.voxels.filter((voxel) => voxel.y === 0 && voxel.kind === 'floor-dark').length
  const baseLightCount = build.voxels.filter((voxel) => voxel.y === 0 && voxel.kind === 'floor-light').length
  const foundationVoxelCount = build.voxels.filter((voxel) => voxel.y < 0).length

  if (build.baseDarkCount !== baseDarkCount || build.groundDarkCount !== baseDarkCount) {
    throw new Error(`${styleId} reports inconsistent dark base counts.`)
  }
  if (build.baseLightCount !== baseLightCount) {
    throw new Error(`${styleId} reports inconsistent light base count.`)
  }
  if (build.foundationVoxelCount !== foundationVoxelCount) {
    throw new Error(`${styleId} reports inconsistent foundation voxel count.`)
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
    assertScannerProjection(style.id, matrix, build)
    assertBuildMetrics(style.id, matrix, build)
    sceneCount += 1
  }

  console.log(`projection smoke: ${testCase.label} / QR v${matrix.version} / ${matrix.size}x${matrix.size} / ${STYLES.length} styles OK`)
}

console.log(`projection smoke: ${sceneCount} generated scenes passed column, scanner-surface, quiet-zone, and build-metric invariants across QR v${cases[0].minVersion} to v${previousVersion}`)
