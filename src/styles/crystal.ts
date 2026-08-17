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
  return (hashString(`${seedText}::crystal-v4::${salt}::${row}:${col}`) % 10000) / 10000
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
  // Treat the hero mineral as a fractured cluster rather than one symmetric voxel
  // pyramid. Each shard stays inside its QR column, but staggered roots and tips create
  // a much more recognizable crystalline silhouette in the isometric view.
  const shards = [
    [0, 0, 5, 20],
    [-1, 0, 6, 18],
    [0, 1, 7, 17],
    [1, 0, 7, 15],
    [0, -1, 8, 14],
    [-2, 1, 8, 16],
    [-2, 2, 10, 14],
    [-1, 2, 9, 13],
    [1, -2, 8, 14],
    [2, -2, 10, 13],
    [2, -1, 9, 12],
    [-1, -3, 9, 12],
    [1, 3, 10, 13],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of shards) {
    const cell = getCell(matrix, center + dr, center + dc)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Short buttress facets around the roots make the suspended cluster widen toward
  // the basin without turning it back into a solid diamond mass.
  const rootFacets = [
    [1, 1, 6, 10],
    [-1, -1, 6, 11],
    [2, 0, 7, 10],
    [0, 2, 8, 11],
    [-2, -1, 8, 11],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of rootFacets) {
    const cell = getCell(matrix, center + dr, center + dc)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, fromLevel, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Two detached satellite shards give the cluster a broken, energetic outline while
  // remaining close enough to read as one object instead of competing monuments.
  const satellites = [
    [-1, -5, 8, 13],
    [2, 5, 9, 12],
  ] as const

  for (const [dr, dc, fromLevel, topLevel] of satellites) {
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
    'ASYMMETRIC SHARD CLUSTER / SUSPENDED ROOT FACETS / ENERGY BASIN / LOW SANCTUM FRAME',
    'mineral-slab',
  )
}
