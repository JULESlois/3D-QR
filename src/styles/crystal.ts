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
  return (hashString(`${seedText}::crystal-v3::${salt}::${row}:${col}`) % 10000) / 10000
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

  // The sanctum now occupies roughly the central half of the QR instead of a small
  // square. A two-cell-thick low frame gives the altar architectural presence.
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

  // A large basin fills most of the sanctum interior, matching the altar-room
  // reference instead of leaving the central crystal on a tiny isolated pad.
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
  // A 5x5 diamond replaces the old 3x3 crystal. The body stays suspended above
  // the basin, but its footprint and shoulders are large enough to dominate the room.
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const manhattan = Math.abs(dr) + Math.abs(dc)
      if (manhattan > 3) continue

      const cell = getCell(matrix, center + dr, center + dc)
      if (!cell) continue

      const fromLevel = manhattan === 0 ? 5 : manhattan === 1 ? 6 : manhattan === 2 ? 7 : 8
      const topLevel = manhattan === 0 ? 19 : manhattan === 1 ? 17 : manhattan === 2 ? 14 : 11
      pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  // Broad shoulder shards sit close to the hero crystal; they enlarge the central
  // composition without creating distant competing geodes.
  const shoulders = [
    [0, -4, 7, 12],
    [0, 4, 7, 12],
    [-1, -4, 8, 11],
    [1, 4, 8, 11],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of shoulders) {
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
    // Pylons are intentionally lower than before so the enlarged crystal remains
    // the only dominant vertical accent.
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

  // Finder regions remain part of the scanner slab. Scale is created by the central
  // sanctum footprint, not by promoting recognition boxes into three towers.
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
    'LARGE SUSPENDED CORE / EXPANDED ENERGY BASIN / BROAD SANCTUM FRAME / LOW PYLONS',
    'mineral-slab',
  )
}
