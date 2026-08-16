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
  return (hashString(`${seedText}::house-v2::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function facadeKind(
  level: number,
  wallHeight: number,
  isDoor: boolean,
  isWindow: boolean,
  isChimney: boolean,
): VoxelKind {
  if (isChimney && level > wallHeight + 1) return 'stone'
  if (level > wallHeight) return level === wallHeight + 1 ? 'primary' : 'wood'
  if (isDoor && level <= Math.min(4, wallHeight)) return 'wood'
  if (isWindow && level >= 2 && level <= 3) return 'glass'
  if (level === 1) return 'stone'
  return 'plaster'
}

function buildHouseBody(
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
  const chimneyRow = center - 1
  const chimneyCol = center - halfWidth + 2

  for (let row = center - halfDepth; row <= center + halfDepth; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue

      const rowDistance = Math.abs(row - center)
      const roofLevel = wallHeight + Math.max(1, roofRise - rowDistance)
      const isDoor = row === frontRow && col === center
      const isFrontWindow = row === frontRow && (col === center - 3 || col === center + 3)
      const isSideWindow = (col === center - halfWidth || col === center + halfWidth)
        && (row === center - 1 || row === center + 1)
      const isWindow = isFrontWindow || isSideWindow
      const isChimney = row === chimneyRow && col === chimneyCol
      const topLevel = isChimney ? roofLevel + 3 : roofLevel

      for (let level = 1; level <= topLevel; level += 1) {
        pushCellVoxel(
          voxels,
          cell,
          matrix.size,
          level,
          level === topLevel
            ? projectedCapKind(cell)
            : facadeKind(level, wallHeight, isDoor, isWindow, isChimney),
          (localNoise(seedText, row, col, `body-${level}`) * 0.66 + level * 0.041) % 1,
        )
      }

      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildRoofOverhang(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  halfWidth: number,
  halfDepth: number,
  wallHeight: number,
): void {
  const rows = [center - halfDepth - 1, center + halfDepth + 1]
  for (const row of rows) {
    for (let col = center - halfWidth - 1; col <= center + halfWidth + 1; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, wallHeight + 1, wallHeight + 2, 'wood', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const cols = [center - halfWidth - 1, center + halfWidth + 1]
  for (const col of cols) {
    for (let row = center - halfDepth; row <= center + halfDepth; row += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, wallHeight + 1, wallHeight + 2, 'wood', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildPorch(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  frontRow: number,
  wallHeight: number,
): void {
  for (let row = frontRow + 1; row <= frontRow + 2; row += 1) {
    for (let col = center - 2; col <= center + 2; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  // Two porch posts plus a floating canopy make the front facade immediately legible.
  for (const col of [center - 2, center + 2]) {
    const cell = getCell(matrix, frontRow + 2, col)
    if (!cell || cell.zone !== 'data') continue
    pushProjectedColumn(voxels, cell, matrix.size, 3, wallHeight - 1, 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  for (let row = frontRow + 1; row <= frontRow + 2; row += 1) {
    for (let col = center - 3; col <= center + 3; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone !== 'data') continue
      pushProjectedColumn(voxels, cell, matrix.size, wallHeight, wallHeight + 1, 'wood', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildFrontPath(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  center: number,
  startRow: number,
): void {
  const endRow = Math.min(matrix.size - 2, startRow + Math.max(5, Math.round(matrix.size * 0.13)))
  for (let row = startRow; row <= endRow; row += 1) {
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
  const halfWidth = Math.max(4, Math.min(6, Math.floor(matrix.size * 0.16)))
  const halfDepth = Math.max(2, Math.min(3, Math.floor(matrix.size * 0.09)))
  const wallHeight = Math.max(5, Math.min(6, Math.round(matrix.size * 0.14)))
  const roofRise = Math.max(3, Math.min(4, Math.round(matrix.size * 0.1)))
  const frontRow = center + halfDepth

  // One coherent mixed-polarity residence replaces the old dark-module mass. The
  // roof is a deterministic stepped gable whose ridge runs across the house width.
  buildHouseBody(
    voxels,
    matrix,
    seedText,
    lifted,
    center,
    halfWidth,
    halfDepth,
    wallHeight,
    roofRise,
  )
  buildRoofOverhang(voxels, matrix, random, lifted, center, halfWidth, halfDepth, wallHeight)
  buildPorch(voxels, matrix, random, lifted, center, frontRow, wallHeight)
  buildFrontPath(voxels, matrix, random, lifted, center, frontRow + 3)

  return finalizeSculpture(
    matrix,
    voxels,
    'house',
    'House',
    lifted,
    'GABLED ROOF / CHIMNEY / FRONT WINDOWS + DOOR / PORCH / GARDEN PATH',
    'courtyard-pad',
  )
}
