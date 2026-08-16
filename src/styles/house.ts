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
  return (hashString(`${seedText}::house-v3::${salt}::${row}:${col}`) % 10000) / 10000
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
  wallHeight: number,
  seedText: string,
  salt: string,
  flags: { door?: boolean; window?: boolean; garageDoor?: boolean; chimney?: boolean } = {},
): void {
  for (let level = 1; level <= topLevel; level += 1) {
    let kind: VoxelKind
    if (level === topLevel) {
      kind = projectedCapKind(cell)
    } else if (flags.chimney && level > wallHeight) {
      kind = 'stone'
    } else if (flags.door && level <= Math.min(4, wallHeight)) {
      kind = 'wood'
    } else if (flags.garageDoor && level >= 2 && level <= Math.min(4, wallHeight)) {
      kind = 'wood'
    } else if (flags.window && level >= 3 && level <= 4) {
      kind = 'glass'
    } else if (level <= 1) {
      kind = 'stone'
    } else if (level <= wallHeight) {
      kind = 'plaster'
    } else {
      kind = level >= topLevel - 2 ? 'primary' : 'wood'
    }

    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      kind,
      (localNoise(seedText, cell.row, cell.col, `${salt}-${level}`) * 0.6 + level * 0.039) % 1,
    )
  }
}

function buildMainHouse(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  lifted: Set<string>,
  center: number,
  halfWidth: number,
  halfDepth: number,
  wallHeight: number,
  roofRise: number,
): void {
  const frontRow = center + halfDepth
  const chimneyCells = new Set([
    cellKey(center - 1, center - halfWidth + 2),
    cellKey(center, center - halfWidth + 2),
  ])

  for (let row = center - halfDepth; row <= center + halfDepth; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue

      const rowDistance = Math.abs(row - center)
      const roofLevel = wallHeight + Math.max(1, roofRise - rowDistance)
      const key = cellKey(row, col)
      const isDoor = row === frontRow && Math.abs(col - center) <= 1
      const isFrontWindow = row === frontRow && (Math.abs(col - center) === 4 || Math.abs(col - center) === 5)
      const isSideWindow = (col === center - halfWidth || col === center + halfWidth)
        && (row === center - 2 || row === center + 1)
      const isWindow = isFrontWindow || isSideWindow
      const isChimney = chimneyCells.has(key)
      const topLevel = isChimney ? roofLevel + 4 : roofLevel

      pushStyledColumn(
        voxels,
        cell,
        matrix.size,
        topLevel,
        wallHeight,
        seedText,
        'main',
        { door: isDoor, window: isWindow, chimney: isChimney },
      )
      lifted.add(key)
    }
  }
}

function buildFrontGable(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  lifted: Set<string>,
  center: number,
  frontRow: number,
  wallHeight: number,
): void {
  const depth = 4
  const halfWidth = 3

  for (let dr = 1; dr <= depth; dr += 1) {
    for (let dc = -halfWidth; dc <= halfWidth; dc += 1) {
      const cell = getCell(matrix, frontRow + dr, center + dc)
      if (!cell || cell.zone !== 'data') continue
      const roofPeak = Math.max(1, 4 - Math.abs(dc))
      const topLevel = wallHeight - 1 + roofPeak
      const isDoor = dr === depth && Math.abs(dc) <= 1
      const isWindow = dr === depth && Math.abs(dc) === 2
      pushStyledColumn(voxels, cell, matrix.size, topLevel, wallHeight - 1, seedText, 'front-gable', { door: isDoor, window: isWindow })
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildGarageWing(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  lifted: Set<string>,
  center: number,
  halfWidth: number,
  frontRow: number,
): void {
  const garageCenterCol = center + halfWidth + 4
  const garageCenterRow = center + 1
  const garageHalfWidth = 3
  const garageHalfDepth = 2
  const garageWall = 4
  const garageRoofRise = 3

  for (let row = garageCenterRow - garageHalfDepth; row <= garageCenterRow + garageHalfDepth; row += 1) {
    for (let col = garageCenterCol - garageHalfWidth; col <= garageCenterCol + garageHalfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      const rowDistance = Math.abs(row - garageCenterRow)
      const topLevel = garageWall + Math.max(1, garageRoofRise - rowDistance)
      const garageDoor = row >= frontRow && col >= garageCenterCol - 2 && col <= garageCenterCol + 2
      pushStyledColumn(voxels, cell, matrix.size, topLevel, garageWall, seedText, 'garage', { garageDoor })
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildRoofEaves(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  halfWidth: number,
  halfDepth: number,
  wallHeight: number,
): void {
  for (const row of [center - halfDepth - 1, center + halfDepth + 1]) {
    for (let col = center - halfWidth - 1; col <= center + halfWidth + 1; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, wallHeight + 1, wallHeight + 2, 'wood', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildPorchAndPath(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  frontGableRow: number,
  wallHeight: number,
): void {
  for (let row = frontGableRow + 1; row <= frontGableRow + 2; row += 1) {
    for (let col = center - 3; col <= center + 3; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  for (const col of [center - 3, center + 3]) {
    const cell = getCell(matrix, frontGableRow + 2, col)
    if (!cell || cell.zone !== 'data') continue
    pushProjectedColumn(voxels, cell, matrix.size, 3, wallHeight - 1, 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  for (let col = center - 4; col <= center + 4; col += 1) {
    const cell = getCell(matrix, frontGableRow + 2, col)
    if (!cell || cell.zone !== 'data') continue
    pushProjectedColumn(voxels, cell, matrix.size, wallHeight, wallHeight + 1, 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  const endRow = Math.min(matrix.size - 2, frontGableRow + Math.max(7, Math.round(matrix.size * 0.17)))
  for (let row = frontGableRow + 3; row <= endRow; row += 1) {
    for (const col of [center - 1, center]) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

export function generateHouse(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'house')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 1,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const center = Math.round((matrix.size - 1) / 2)
  const halfWidth = Math.max(6, Math.min(8, Math.floor(matrix.size * 0.2)))
  const halfDepth = Math.max(3, Math.min(4, Math.floor(matrix.size * 0.11)))
  const wallHeight = Math.max(6, Math.min(7, Math.round(matrix.size * 0.16)))
  const roofRise = Math.max(4, Math.min(5, Math.round(matrix.size * 0.12)))
  const frontRow = center + halfDepth
  const frontGableRow = frontRow + 4

  buildMainHouse(voxels, matrix, seedText, lifted, center, halfWidth, halfDepth, wallHeight, roofRise)
  buildFrontGable(voxels, matrix, seedText, lifted, center, frontRow, wallHeight)
  buildGarageWing(voxels, matrix, seedText, lifted, center, halfWidth, frontRow)
  buildRoofEaves(voxels, matrix, random, lifted, center, halfWidth, halfDepth, wallHeight)
  buildPorchAndPath(voxels, matrix, random, lifted, center, frontGableRow, wallHeight)

  return finalizeSculpture(
    matrix,
    voxels,
    'house',
    'House',
    lifted,
    'LARGE GABLED HOME / FRONT GABLE / 2-CELL CHIMNEY / GARAGE WING / PORCH + PATH',
    'courtyard-pad',
  )
}
