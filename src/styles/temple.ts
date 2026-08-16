import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectedCapKind,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::temple-v3::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function pushStyledColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  cell: QRCell,
  matrixSize: number,
  topLevel: number,
  seedText: string,
  salt: string,
): void {
  for (let level = 1; level <= topLevel; level += 1) {
    let kind: VoxelKind = 'wood'
    if (level <= 2) kind = 'stone'
    else if (level >= topLevel - 1) kind = 'primary'
    else if (level % 3 === 0) kind = 'plaster'

    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      level === topLevel ? projectedCapKind(cell) : kind,
      kind === 'primary'
        ? 0.08
        : (localNoise(seedText, cell.row, cell.col, `${salt}-${level}`) * 0.54 + level * 0.043) % 1,
    )
  }
}

function buildFinderGardens(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const topLeft = cell.row <= 7 && cell.col <= 7
    const topRight = cell.row <= 7 && cell.col >= matrix.size - 8
    const bottomLeft = cell.row >= matrix.size - 8 && cell.col <= 7
    const noise = localNoise(seedText, cell.row, cell.col, 'finder-landscape')

    // Finder regions remain low landscape/support zones so the enlarged torii and
    // rear shrine hall dominate the silhouette instead of three corner structures.
    if (topRight) {
      if (!cell.dark && noise > 0.44) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'water', random)
        lifted.add(cellKey(cell.row, cell.col))
      } else if (cell.dark && noise > 0.9) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
        lifted.add(cellKey(cell.row, cell.col))
      }
      continue
    }

    if (topLeft && cell.dark && noise > 0.9) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
      continue
    }

    if (bottomLeft && noise > 0.94) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, cell.dark ? 2 : 1, cell.dark ? 'wood' : 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildMainHall(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  lifted: Set<string>,
  hallRow: number,
  center: number,
): void {
  const halfWidth = Math.max(5, Math.min(10, Math.floor(matrix.size * 0.28)))
  const halfDepth = Math.max(2, Math.min(3, Math.floor(matrix.size * 0.09)))

  // A much broader/deeper hall replaces the previous thin 3-row strip. The roof
  // mass stretches laterally so Temple reads as a shrine complex, not a small prop.
  for (let row = hallRow - halfDepth; row <= hallRow + halfDepth; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue

      const rowDistance = Math.abs(row - hallRow)
      const colDistance = Math.abs(col - center)
      const ridge = rowDistance === 0 && colDistance <= Math.max(2, halfWidth - 3)
      const outerEave = colDistance >= halfWidth - 1 || rowDistance === halfDepth
      const topLevel = ridge ? 10 : outerEave ? 6 : rowDistance <= 1 ? 8 : 7

      pushStyledColumn(voxels, cell, matrix.size, topLevel, seedText, 'hall')
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  // Front veranda / dais extends the hall toward the approach and increases its
  // ground footprint without competing with the roof height.
  const verandaRow = hallRow + halfDepth + 1
  for (let col = center - halfWidth + 2; col <= center + halfWidth - 2; col += 1) {
    const cell = getCell(matrix, verandaRow, col)
    if (!cell) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 3, col % 3 === 0 ? 'wood' : 'stone', () => localNoise(seedText, verandaRow, col, 'veranda'))
    lifted.add(cellKey(cell.row, cell.col))
  }
}

function buildApproach(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  hallRow: number,
  toriiRow: number,
  center: number,
): void {
  const halfWidth = matrix.size >= 33 ? 3 : 2

  for (let row = hallRow + 4; row < toriiRow; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const nearHall = row <= hallRow + 6
      const nearTorii = row >= toriiRow - 2
      const step = nearHall ? 3 : nearTorii ? 2 : 1
      pushProjectedColumn(voxels, cell, matrix.size, 1, step, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildTorii(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  lifted: Set<string>,
  toriiRow: number,
  center: number,
): void {
  const safeHalfWidth = Math.max(6, Math.min(Math.floor(matrix.size * 0.36), Math.floor((matrix.size - 3) / 2)))
  const postOffset = Math.max(3, safeHalfWidth - 3)
  const postColumns = [
    center - postOffset - 1,
    center - postOffset,
    center + postOffset,
    center + postOffset + 1,
  ]
  const toriiRows = [toriiRow, Math.min(matrix.size - 1, toriiRow + 1)]

  // Two-cell-wide, two-cell-deep posts make the torii read as architecture rather
  // than two thin voxel sticks. The top beam spans roughly two thirds of the QR.
  for (const row of toriiRows) {
    for (const col of postColumns) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      for (let level = 1; level <= 11; level += 1) {
        pushCellVoxel(voxels, cell, matrix.size, level, level === 11 ? projectedCapKind(cell) : 'primary', 0.08)
      }
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  // Lower nuki beam: one row deep, wide and visually separate from the upper lintel.
  for (let col = center - safeHalfWidth + 1; col <= center + safeHalfWidth - 1; col += 1) {
    const cell = getCell(matrix, toriiRow, col)
    if (!cell) continue
    pushCellVoxel(voxels, cell, matrix.size, 9, 'primary', 0.08)
    // If this column has no higher upper-beam voxel, cap it here for scanner safety.
    if (Math.abs(col - center) > safeHalfWidth) {
      pushCellVoxel(voxels, cell, matrix.size, 10, projectedCapKind(cell), 0.08)
    }
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Massive two-layer upper lintel, two rows deep. The outer ends extend past the
  // posts to create the familiar torii silhouette seen in the reference image.
  for (const row of toriiRows) {
    for (let col = center - safeHalfWidth; col <= center + safeHalfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      pushCellVoxel(voxels, cell, matrix.size, 12, 'primary', 0.08)
      pushCellVoxel(voxels, cell, matrix.size, 13, projectedCapKind(cell), 0.08)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

export function generateTemple(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'temple')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 2,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const center = Math.round((matrix.size - 1) / 2)
  const hallRow = Math.max(9, center - Math.max(3, Math.floor(matrix.size * 0.14)))
  const toriiRow = Math.min(matrix.size - 4, center + Math.max(5, Math.floor(matrix.size * 0.24)))

  buildFinderGardens(voxels, matrix, seedText, random, lifted)
  buildMainHall(voxels, matrix, seedText, lifted, hallRow, center)
  buildApproach(voxels, matrix, random, lifted, hallRow, toriiRow, center)
  buildTorii(voxels, matrix, lifted, toriiRow, center)

  // Only a few low side lanterns survive; the enlarged torii and main hall now
  // control both the horizontal footprint and the vertical hierarchy.
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || !cell.dark) continue
    if (Math.abs(cell.row - center) > matrix.size * 0.32) continue
    if (Math.abs(cell.col - center) < Math.max(5, matrix.size * 0.15)) continue
    const noise = localNoise(seedText, cell.row, cell.col, 'lantern')
    if (noise < 0.988) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 3, 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'temple',
    'Temple',
    lifted,
    'OVERSIZED TORII / WIDE SHRINE HALL / BROAD STONE APPROACH / LOW FINDER GARDENS',
    'courtyard-pad',
  )
}
