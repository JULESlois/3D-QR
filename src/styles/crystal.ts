import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushProjectedColumn,
  type SculptureBuild,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::crystal-v5::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function buildSanctumFrame(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
): { halfCols: number; halfRows: number } {
  const halfCols = Math.max(7, Math.min(11, Math.floor(matrix.size * 0.32)))
  const halfRows = Math.max(4, Math.min(7, Math.floor(matrix.size * 0.21)))

  for (let row = center - halfRows; row <= center + halfRows; row += 1) {
    for (let col = center - halfCols; col <= center + halfCols; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue

      const rowDistance = Math.abs(row - center)
      const colDistance = Math.abs(col - center)
      const outerBorder = rowDistance === halfRows || colDistance === halfCols
      const innerBorder = rowDistance === halfRows - 1 || colDistance === halfCols - 1
      if (!outerBorder && !innerBorder) continue

      const rearWall = row === center - halfRows
      const topLevel = rearWall
        ? 4
        : outerBorder
          ? 3
          : 2

      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  return { halfCols, halfRows }
}

function buildEnergyPool(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  lifted: Set<string>,
  center: number,
  halfCols: number,
  halfRows: number,
): void {
  const poolHalfCols = Math.max(4, halfCols - 2)
  const poolHalfRows = Math.max(2, halfRows - 2)

  for (let row = center - poolHalfRows; row <= center + poolHalfRows; row += 1) {
    for (let col = center - poolHalfCols; col <= center + poolHalfCols; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const ripple = localNoise(seedText, row, col, 'pool')
      const radial = Math.hypot(
        (row - center) / Math.max(1, poolHalfRows),
        (col - center) / Math.max(1, poolHalfCols),
      )
      const topLevel = ripple > 0.93 && radial < 0.82 ? 2 : 1
      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'water', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildFloatingCore(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
): void {
  // Give the hero crystal a deliberately broad faceted silhouette instead of a bundle
  // of narrow towers. The upper crown spreads left/right, the middle contracts, and a
  // long lower point hangs over the basin. Every shard still occupies only its own QR
  // column, so the sculpture remains projection-safe when viewed from the QR camera.
  const heroShards = [
    // Central spine and hanging point.
    [0, 0, 4, 22],
    [1, 0, 5, 19],
    [2, 0, 6, 15],
    [3, 0, 8, 12],

    // Wide upper crown: asymmetric heights keep the outline crystalline rather than pyramidal.
    [-1, -1, 6, 20],
    [-1, 1, 6, 18],
    [-2, -2, 8, 18],
    [-2, 2, 8, 17],
    [-2, -3, 10, 16],
    [-3, 1, 10, 17],
    [-3, 3, 11, 15],

    // Mid-body shoulders and fractured side planes.
    [0, -1, 6, 17],
    [0, 1, 6, 16],
    [0, -2, 8, 15],
    [0, 2, 8, 14],
    [1, -2, 8, 14],
    [1, 2, 9, 13],
    [2, -1, 8, 13],
    [2, 1, 9, 12],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of heroShards) {
    const cell = getCell(matrix, center + dr, center + dc)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Detached crown splinters exaggerate the broken mineral outline without competing
  // with the central mass. They sit closer to the hero than the old satellites, so the
  // eye reads one large fractured crystal instead of three unrelated monuments.
  const splinters = [
    [-2, -5, 10, 15],
    [-1, 5, 11, 14],
    [1, -4, 9, 13],
    [2, 4, 10, 12],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of splinters) {
    const cell = getCell(matrix, center + dr, center + dc)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

function buildPeripheralPylons(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  halfCols: number,
  halfRows: number,
): void {
  const points = [
    [center - halfRows + 1, center - halfCols + 1],
    [center - halfRows + 1, center + halfCols - 1],
    [center + halfRows - 1, center - halfCols + 1],
    [center + halfRows - 1, center + halfCols - 1],
  ] as const

  for (const [row, col] of points) {
    const cell = getCell(matrix, row, col)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 4, 'stone', random)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

function buildFrontDais(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  halfCols: number,
  halfRows: number,
): void {
  const row = Math.min(matrix.size - 1, center + halfRows + 1)
  const halfWidth = Math.max(3, Math.floor(halfCols * 0.55))
  for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
    const cell = getCell(matrix, row, col)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

export function generateCrystal(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'crystal')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 3,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const center = Math.round((matrix.size - 1) / 2)

  const { halfCols, halfRows } = buildSanctumFrame(voxels, matrix, random, lifted, center)
  buildEnergyPool(voxels, matrix, seedText, random, lifted, center, halfCols, halfRows)
  buildPeripheralPylons(voxels, matrix, random, lifted, center, halfCols, halfRows)
  buildFrontDais(voxels, matrix, random, lifted, center, halfCols, halfRows)
  buildFloatingCore(voxels, matrix, random, lifted, center)

  return finalizeSculpture(
    matrix,
    voxels,
    'crystal',
    'Crystal',
    lifted,
    'BROAD FRACTURED HERO CRYSTAL / SPLIT CROWN / HANGING POINT / ENERGY BASIN / LOW SANCTUM FRAME',
    'mineral-slab',
  )
}
