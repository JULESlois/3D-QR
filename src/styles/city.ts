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

type UrbanArchetype = 'podium' | 'landmark' | 'tower' | 'slab' | 'courtyard' | 'terrace'

interface UrbanColumn {
  cell: QRCell
  topLevel: number
  archetype: UrbanArchetype
  priority: number
}

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::city-v3::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function registerColumn(
  columns: Map<string, UrbanColumn>,
  cell: QRCell,
  topLevel: number,
  archetype: UrbanArchetype,
  priority: number,
): void {
  if (cell.zone !== 'data') return
  const key = cellKey(cell.row, cell.col)
  const current = columns.get(key)
  if (current && current.priority > priority) return
  if (current && current.priority === priority && current.topLevel >= topLevel) return
  columns.set(key, { cell, topLevel, archetype, priority })
}

function registerRect(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  centerRow: number,
  centerCol: number,
  halfRows: number,
  halfCols: number,
  height: (cell: QRCell, dr: number, dc: number) => number,
  archetype: UrbanArchetype,
  priority: number,
): void {
  for (let dr = -halfRows; dr <= halfRows; dr += 1) {
    for (let dc = -halfCols; dc <= halfCols; dc += 1) {
      const cell = getCell(matrix, centerRow + dr, centerCol + dc)
      if (!cell || cell.zone !== 'data') continue
      registerColumn(columns, cell, height(cell, dr, dc), archetype, priority)
    }
  }
}

function registerCourtyardBlock(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  centerRow: number,
  centerCol: number,
  seedText: string,
): void {
  const halfRows = 3
  const halfCols = 3

  for (let dr = -halfRows; dr <= halfRows; dr += 1) {
    for (let dc = -halfCols; dc <= halfCols; dc += 1) {
      // Leave a real 3x3 open court in the middle so this reads as a block, not a slab.
      if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) continue
      const cell = getCell(matrix, centerRow + dr, centerCol + dc)
      if (!cell || cell.zone !== 'data') continue
      const edgeBand = Math.abs(dr) === halfRows || Math.abs(dc) === halfCols
      if (!edgeBand) continue
      const height = 5 + Math.round(localNoise(seedText, cell.row, cell.col, 'courtyard-height'))
      registerColumn(columns, cell, height, 'courtyard', 2)
    }
  }
}

function registerTerrace(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  centerRow: number,
  centerCol: number,
): void {
  const halfRows = 2
  const halfCols = 3

  for (let dr = -halfRows; dr <= halfRows; dr += 1) {
    for (let dc = -halfCols; dc <= halfCols; dc += 1) {
      const cell = getCell(matrix, centerRow + dr, centerCol + dc)
      if (!cell || cell.zone !== 'data') continue
      const step = Math.floor((dc + halfCols) / 2)
      registerColumn(columns, cell, 4 + step, 'terrace', 2)
    }
  }
}

function bodyKind(archetype: UrbanArchetype, level: number, topLevel: number): VoxelKind {
  switch (archetype) {
    case 'landmark':
      if (level % 4 === 0) return 'primary'
      return level % 2 === 0 ? 'glass' : 'stone'
    case 'tower':
      return level % 2 === 0 ? 'glass' : 'stone'
    case 'slab':
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'courtyard':
      return level % 4 === 0 ? 'glass' : 'stone'
    case 'terrace':
      return level >= topLevel - 1 ? 'primary' : level % 3 === 0 ? 'glass' : 'plaster'
    case 'podium':
    default:
      return level === 2 ? 'primary' : 'stone'
  }
}

function buildUrbanColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  column: UrbanColumn,
  matrixSize: number,
  seedText: string,
): void {
  const { cell, topLevel, archetype } = column

  for (let level = 1; level <= topLevel; level += 1) {
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      level === topLevel ? projectedCapKind(cell) : bodyKind(archetype, level, topLevel),
      (localNoise(seedText, cell.row, cell.col, `${archetype}-${level}`) * 0.68 + level * 0.037) % 1,
    )
  }
}

export function generateCity(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'city')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const columns = new Map<string, UrbanColumn>()
  const center = Math.round((matrix.size - 1) / 2)
  const districtOffset = Math.max(6, Math.round(matrix.size * 0.23))

  // CENTRAL BUSINESS DISTRICT -------------------------------------------------
  // A 7x7 podium with a 5x5 mixed-polarity tower creates a single unmistakable
  // skyscraper mass. QR light/dark cells only affect the scanner-facing roof caps.
  registerRect(
    matrix,
    columns,
    center,
    center,
    3,
    3,
    () => 3,
    'podium',
    4,
  )
  registerRect(
    matrix,
    columns,
    center,
    center,
    2,
    2,
    (cell, dr, dc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(dc))
      const noise = localNoise(seedText, cell.row, cell.col, 'landmark')
      return ring === 0 ? 15 : ring === 1 ? 13 + Math.round(noise) : 10 + Math.round(noise)
    },
    'landmark',
    6,
  )

  // One narrow antenna is allowed to use either scanner polarity. It is a roof
  // detail of the same landmark rather than another disconnected tower.
  const antenna = getCell(matrix, center, center)
  if (antenna?.zone === 'data') registerColumn(columns, antenna, 18, 'landmark', 8)

  // SECONDARY DISTRICTS -------------------------------------------------------
  // Long low slabs establish real block footprints and street canyons.
  registerRect(
    matrix,
    columns,
    center + 2,
    center - districtOffset,
    1,
    3,
    (cell) => 5 + Math.round(localNoise(seedText, cell.row, cell.col, 'west-slab')),
    'slab',
    2,
  )
  registerRect(
    matrix,
    columns,
    center - 3,
    center + districtOffset,
    2,
    1,
    (cell) => 6 + Math.round(localNoise(seedText, cell.row, cell.col, 'east-slab')),
    'slab',
    2,
  )

  // A real perimeter block with a hollow courtyard gives the city a different
  // horizontal archetype instead of another collection of single-cell columns.
  registerCourtyardBlock(
    matrix,
    columns,
    center + districtOffset,
    center - Math.max(3, Math.round(districtOffset * 0.42)),
    seedText,
  )

  // A stepped block creates a low-to-high profile distinct from the CBD tower.
  registerTerrace(
    matrix,
    columns,
    center - districtOffset,
    center + Math.max(2, Math.round(districtOffset * 0.32)),
  )

  // One compact secondary office tower balances the skyline without returning to
  // the old random-pillar density.
  registerRect(
    matrix,
    columns,
    center + Math.round(districtOffset * 0.52),
    center + districtOffset,
    1,
    1,
    (cell, dr, dc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(dc))
      return ring === 0 ? 11 : 9 + Math.round(localNoise(seedText, cell.row, cell.col, 'secondary-tower'))
    },
    'tower',
    3,
  )

  for (const column of columns.values()) {
    buildUrbanColumn(voxels, column, matrix.size, seedText)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }

  // Small pale civic plazas near the CBD soften the road network. They stay low and
  // sparse; most of the unbuilt symbol remains the continuous street/open-space field.
  let plazaCount = 0
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || cell.dark) continue
    if (columns.has(cellKey(cell.row, cell.col))) continue
    const d = Math.hypot(cell.row - center, cell.col - center)
    if (d < 5 || d > 8) continue
    if (localNoise(seedText, cell.row, cell.col, 'plaza') < 0.93) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'plaster', random)
    lifted.add(cellKey(cell.row, cell.col))
    plazaCount += 1
    if (plazaCount >= 10) break
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'city',
    'City',
    lifted,
    `CBD LANDMARK / SLABS / COURTYARD BLOCK / TERRACES / ${columns.size} BUILT CELLS`,
    'display-plaque',
  )
}
