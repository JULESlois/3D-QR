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

type UrbanArchetype =
  | 'podium'
  | 'landmark'
  | 'setback'
  | 'tower'
  | 'twin'
  | 'slab'
  | 'terrace'
  | 'crown'

interface UrbanColumn {
  cell: QRCell
  topLevel: number
  archetype: UrbanArchetype
  priority: number
}

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::city-v4::${salt}::${row}:${col}`) % 10000) / 10000
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

function buildLandmark(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  seedText: string,
): void {
  registerRect(matrix, columns, row, col, 3, 3, () => 4, 'podium', 3)
  registerRect(
    matrix,
    columns,
    row,
    col,
    2,
    2,
    (cell, dr, dc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(dc))
      const n = localNoise(seedText, cell.row, cell.col, 'landmark-body')
      return ring === 0 ? 18 : ring === 1 ? 15 + Math.round(n) : 12 + Math.round(n)
    },
    'landmark',
    7,
  )
  registerRect(matrix, columns, row, col, 1, 1, () => 19, 'landmark', 8)
  const spire = getCell(matrix, row, col)
  if (spire?.zone === 'data') registerColumn(columns, spire, 23, 'crown', 10)
}

function buildSetbackTower(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  seedText: string,
): void {
  registerRect(matrix, columns, row, col, 2, 2, () => 7, 'setback', 3)
  registerRect(
    matrix,
    columns,
    row,
    col,
    1,
    1,
    (cell) => 12 + Math.round(localNoise(seedText, cell.row, cell.col, 'setback-mid') * 2),
    'setback',
    5,
  )
  const crown = getCell(matrix, row, col)
  if (crown?.zone === 'data') registerColumn(columns, crown, 17, 'crown', 7)
}

function buildPodiumTower(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  vertical: boolean,
): void {
  registerRect(matrix, columns, row, col, vertical ? 3 : 1, vertical ? 1 : 3, () => 5, 'podium', 3)
  registerRect(matrix, columns, row, col, 1, 1, (_cell, dr, dc) => 13 - Math.max(Math.abs(dr), Math.abs(dc)), 'tower', 5)
}

function buildTwinTowers(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  seedText: string,
): void {
  registerRect(matrix, columns, row, col, 1, 4, () => 4, 'podium', 3)
  for (const [offset, salt, peak] of [[-2, 'twin-a', 16], [2, 'twin-b', 14]] as const) {
    registerRect(
      matrix,
      columns,
      row,
      col + offset,
      1,
      1,
      (cell, dr, dc) => {
        const ring = Math.max(Math.abs(dr), Math.abs(dc))
        return peak - ring * 2 + Math.round(localNoise(seedText, cell.row, cell.col, salt))
      },
      'twin',
      6,
    )
  }
}

function buildSlab(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  horizontal: boolean,
  seedText: string,
): void {
  registerRect(
    matrix,
    columns,
    row,
    col,
    horizontal ? 1 : 4,
    horizontal ? 4 : 1,
    (cell, dr, dc) => {
      const along = horizontal ? Math.abs(dc) : Math.abs(dr)
      return 8 + (along <= 1 ? 2 : 0) + Math.round(localNoise(seedText, cell.row, cell.col, 'slab') * 1.2)
    },
    'slab',
    4,
  )
}

function buildTerrace(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -3; dc <= 3; dc += 1) {
      const cell = getCell(matrix, row + dr, col + dc)
      if (!cell || cell.zone !== 'data') continue
      const step = Math.floor((dc + 3) / 2)
      registerColumn(columns, cell, 6 + step + (Math.abs(dr) <= 1 ? 1 : 0), 'terrace', 4)
    }
  }
}

function buildCrownedTower(
  matrix: QRMatrixData,
  columns: Map<string, UrbanColumn>,
  row: number,
  col: number,
  seedText: string,
): void {
  registerRect(
    matrix,
    columns,
    row,
    col,
    1,
    1,
    (cell, dr, dc) => 13 - Math.max(Math.abs(dr), Math.abs(dc)) + Math.round(localNoise(seedText, cell.row, cell.col, 'crown-body')),
    'tower',
    5,
  )
  for (const dc of [-1, 0, 1]) {
    const cell = getCell(matrix, row, col + dc)
    if (!cell || cell.zone !== 'data') continue
    registerColumn(columns, cell, dc === 0 ? 18 : 15, 'crown', 7)
  }
}

function bodyKind(archetype: UrbanArchetype, level: number, topLevel: number): VoxelKind {
  switch (archetype) {
    case 'landmark':
      if (level % 5 === 0) return 'primary'
      return level % 2 === 0 ? 'glass' : 'stone'
    case 'setback':
      return level % 3 === 0 ? 'glass' : level % 4 === 0 ? 'primary' : 'stone'
    case 'tower':
      return level % 2 === 0 ? 'glass' : 'plaster'
    case 'twin':
      return level % 3 === 0 ? 'primary' : level % 2 === 0 ? 'glass' : 'stone'
    case 'slab':
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'terrace':
      return level >= topLevel - 2 ? 'primary' : level % 3 === 0 ? 'glass' : 'plaster'
    case 'crown':
      return level >= topLevel - 2 ? 'primary' : 'glass'
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
      (localNoise(seedText, cell.row, cell.col, `${archetype}-${level}`) * 0.7 + level * 0.033) % 1,
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
  const spread = Math.max(7, Math.round(matrix.size * 0.19))
  const outer = Math.max(spread + 3, Math.round(matrix.size * 0.27))

  // Dense skyline: multiple coherent buildings, each with a deliberately different
  // footprint and height curve. This keeps the city crowded without reverting to
  // the old field of unrelated single-cell pillars.
  buildLandmark(matrix, columns, center, center, seedText)
  buildSetbackTower(matrix, columns, center - spread, center - spread, seedText)
  buildTwinTowers(matrix, columns, center - spread, center + spread, seedText)
  buildSlab(matrix, columns, center + spread, center - spread, true, seedText)
  buildCrownedTower(matrix, columns, center + spread, center + spread, seedText)
  buildPodiumTower(matrix, columns, center - outer, center, true)
  buildPodiumTower(matrix, columns, center, center + outer, false)
  buildSetbackTower(matrix, columns, center, center - outer, seedText)
  buildTerrace(matrix, columns, center + outer, center)

  // A few compact infill towers close street gaps and make the skyline read as a
  // real high-rise district rather than eight isolated landmarks.
  const infill = [
    [center - Math.round(spread * 0.45), center - Math.round(spread * 0.2), 12],
    [center - Math.round(spread * 0.3), center + Math.round(spread * 0.48), 11],
    [center + Math.round(spread * 0.42), center + Math.round(spread * 0.1), 13],
    [center + Math.round(spread * 0.22), center - Math.round(spread * 0.5), 10],
  ] as const

  for (const [row, col, peak] of infill) {
    registerRect(
      matrix,
      columns,
      row,
      col,
      1,
      1,
      (cell, dr, dc) => peak - Math.max(Math.abs(dr), Math.abs(dc)) + Math.round(localNoise(seedText, cell.row, cell.col, 'infill')),
      'tower',
      4,
    )
  }

  for (const column of columns.values()) {
    buildUrbanColumn(voxels, column, matrix.size, seedText)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }

  // Keep a few pale plazas at street level, but do not let open space dominate the
  // composition. Most visual weight now comes from differentiated towers.
  let plazaCount = 0
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || cell.dark) continue
    if (columns.has(cellKey(cell.row, cell.col))) continue
    const d = Math.hypot(cell.row - center, cell.col - center)
    if (d > outer + 2) continue
    if (localNoise(seedText, cell.row, cell.col, 'plaza') < 0.972) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'plaster', random)
    lifted.add(cellKey(cell.row, cell.col))
    plazaCount += 1
    if (plazaCount >= 8) break
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'city',
    'City',
    lifted,
    `DENSE SKYLINE / LANDMARK + SETBACK + TWIN + SLAB + TERRACE + CROWN / ${columns.size} BUILT CELLS`,
    'display-plaque',
  )
}
