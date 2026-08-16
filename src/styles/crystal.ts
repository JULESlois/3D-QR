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
  return (hashString(`${seedText}::crystal-v2::${salt}::${row}:${col}`) % 10000) / 10000
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
  const halfCols = Math.max(5, Math.min(7, Math.floor(matrix.size * 0.22)))
  const halfRows = Math.max(3, Math.min(4, Math.floor(matrix.size * 0.14)))

  for (let row = center - halfRows; row <= center + halfRows; row += 1) {
    for (let col = center - halfCols; col <= center + halfCols; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const border = Math.abs(row - center) === halfRows || Math.abs(col - center) === halfCols
      if (!border) continue
      const topLevel = (col === center - halfCols || col === center + halfCols) && Math.abs(row - center) >= halfRows - 1
        ? 4
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
  for (let row = center - halfRows + 1; row <= center + halfRows - 1; row += 1) {
    for (let col = center - halfCols + 1; col <= center + halfCols - 1; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const ripple = localNoise(seedText, row, col, 'pool')
      const topLevel = ripple > 0.88 ? 2 : 1
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
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const cell = getCell(matrix, center + dr, center + dc)
      if (!cell) continue
      const manhattan = Math.abs(dr) + Math.abs(dc)
      const fromLevel = manhattan === 0 ? 6 : manhattan === 1 ? 7 : 8
      const topLevel = manhattan === 0 ? 15 : manhattan === 1 ? 12 : 10
      pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  // Two small suspended side shards reinforce the altar composition without
  // reproducing the old three-finder-geode silhouette.
  for (const dc of [-3, 3]) {
    const cell = getCell(matrix, center, center + dc)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, 6, 9, 'crystal', random)
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
    [center - halfRows, center - halfCols],
    [center - halfRows, center + halfCols],
    [center + halfRows, center - halfCols],
    [center + halfRows, center + halfCols],
  ] as const

  for (const [row, col] of points) {
    const cell = getCell(matrix, row, col)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 5, 'stone', random)
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

  // Finder regions deliberately remain part of the low scanner-facing slab. The
  // scene no longer promotes all three recognition boxes into competing crystals.
  const { halfCols, halfRows } = buildSanctumFrame(voxels, matrix, random, lifted, center)
  buildEnergyPool(voxels, matrix, seedText, random, lifted, center, halfCols, halfRows)
  buildPeripheralPylons(voxels, matrix, random, lifted, center, halfCols, halfRows)
  buildFloatingCore(voxels, matrix, random, lifted, center)

  return finalizeSculpture(
    matrix,
    voxels,
    'crystal',
    'Crystal',
    lifted,
    'SUSPENDED CORE / ENERGY BASIN / LOW STONE FRAME / FOUR PYLONS',
    'mineral-slab',
  )
}
