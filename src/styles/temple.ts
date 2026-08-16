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
  return (hashString(`${seedText}::temple-v2::${salt}::${row}:${col}`) % 10000) / 10000
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

    // Finder regions are landscape/support zones now, not three competing towers.
    if (topRight) {
      if (!cell.dark && noise > 0.38) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'water', random)
        lifted.add(cellKey(cell.row, cell.col))
      } else if (cell.dark && noise > 0.86) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
        lifted.add(cellKey(cell.row, cell.col))
      }
      continue
    }

    if (topLeft && cell.dark && noise > 0.84) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, noise > 0.94 ? 3 : 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
      continue
    }

    if (bottomLeft && noise > 0.9) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, cell.dark ? 3 : 1, cell.dark ? 'wood' : 'stone', random)
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
  const halfWidth = Math.max(3, Math.min(5, Math.floor(matrix.size * 0.16)))

  for (let row = hallRow - 1; row <= hallRow + 1; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue

      const edge = Math.abs(col - center) === halfWidth
      const ridge = row === hallRow && Math.abs(col - center) <= Math.max(1, halfWidth - 2)
      const topLevel = ridge ? 8 : edge ? 5 : row === hallRow ? 7 : 6
      pushStyledColumn(voxels, cell, matrix.size, topLevel, seedText, 'hall')
      lifted.add(cellKey(cell.row, cell.col))
    }
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
  for (let row = hallRow + 2; row < toriiRow; row += 1) {
    for (let col = center - 1; col <= center + 1; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const step = row > toriiRow - 3 ? 1 : row < hallRow + 4 ? 2 : 1
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
  const beamHalfWidth = Math.max(4, Math.min(7, Math.floor(matrix.size * 0.22)))
  const postOffset = Math.max(2, beamHalfWidth - 2)
  const leftPost = center - postOffset
  const rightPost = center + postOffset

  for (const col of [leftPost, rightPost]) {
    const cell = getCell(matrix, toriiRow, col)
    if (!cell) continue
    for (let level = 1; level <= 10; level += 1) {
      pushCellVoxel(
        voxels,
        cell,
        matrix.size,
        level,
        level === 10 ? projectedCapKind(cell) : 'primary',
        0.08,
      )
    }
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Floating crossbeams are legal because QR safety depends only on the highest
  // scanner-facing voxel in each projection column, not on columns being solid.
  for (let col = center - beamHalfWidth; col <= center + beamHalfWidth; col += 1) {
    const cell = getCell(matrix, toriiRow, col)
    if (!cell) continue

    pushCellVoxel(voxels, cell, matrix.size, 7, 'primary', 0.08)
    pushCellVoxel(voxels, cell, matrix.size, 9, 'primary', 0.08)
    pushCellVoxel(voxels, cell, matrix.size, 10, projectedCapKind(cell), 0.08)
    lifted.add(cellKey(cell.row, cell.col))
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
  const hallRow = Math.max(9, center - Math.max(2, Math.floor(matrix.size * 0.1)))
  const toriiRow = Math.min(matrix.size - 4, center + Math.max(4, Math.floor(matrix.size * 0.18)))

  buildFinderGardens(voxels, matrix, seedText, random, lifted)
  buildMainHall(voxels, matrix, seedText, lifted, hallRow, center)
  buildApproach(voxels, matrix, random, lifted, hallRow, toriiRow, center)
  buildTorii(voxels, matrix, lifted, toriiRow, center)

  // Sparse side lanterns keep the courtyard inhabited without becoming another
  // ring of towers around the three QR finders.
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || !cell.dark) continue
    if (Math.abs(cell.row - center) > matrix.size * 0.3) continue
    if (Math.abs(cell.col - center) < 4) continue
    const noise = localNoise(seedText, cell.row, cell.col, 'lantern')
    if (noise < 0.975) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 3 + Math.floor(noise * 2), 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'temple',
    'Temple',
    lifted,
    'FOREGROUND TORII / AXIAL APPROACH / REAR MAIN HALL / LOW FINDER GARDENS',
    'courtyard-pad',
  )
}
