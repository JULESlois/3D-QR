import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectionToneForCell,
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
  | 'needle'
  | 'ziggurat'
  | 'bridge'

interface UrbanColumn {
  cell: QRCell
  fromLevel: number
  topLevel: number
  archetype: UrbanArchetype
  priority: number
}

const ARCHETYPE_COLOR_PHASE: Readonly<Record<UrbanArchetype, number>> = {
  podium: 0.18,
  landmark: 0.72,
  setback: 0.56,
  tower: 0.86,
  twin: 0.08,
  slab: 0.38,
  terrace: 0.32,
  crown: 0.68,
  needle: 0.92,
  ziggurat: 0.14,
  bridge: 0.54,
}

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::city-v6::${salt}::${row}:${col}`) % 10000) / 10000
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
  fromLevel = 1,
): void {
  if (cell.zone !== 'data') return
  const key = cellKey(cell.row, cell.col)
  const current = columns.get(key)
  if (current && current.priority > priority) return
  if (current && current.priority === priority && current.topLevel >= topLevel) return
  columns.set(key, {
    cell,
    fromLevel: Math.max(1, Math.min(fromLevel, topLevel)),
    topLevel,
    archetype,
    priority,
  })
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

function buildLandmark(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, seedText: string): void {
  // Give the skyline one unmistakable Art-Deco anchor instead of another generic
  // rectangular tower. A broad podium steps inward through three shoulder bands;
  // the cross-shaped crown then rises above the diagonal corners before terminating
  // in a single tall spire. Every piece still occupies an original QR data column.
  registerRect(matrix, columns, row, col, 3, 3, (cell, dr, dc) => {
    const ring = Math.max(Math.abs(dr), Math.abs(dc))
    const n = localNoise(seedText, cell.row, cell.col, 'landmark-podium')
    return ring === 3 ? 5 : 6 + Math.round(n)
  }, 'podium', 3)

  registerRect(matrix, columns, row, col, 2, 2, (cell, dr, dc) => {
    const ring = Math.max(Math.abs(dr), Math.abs(dc))
    const n = localNoise(seedText, cell.row, cell.col, 'landmark-setback')
    if (ring === 2) return 10 + Math.round(n)
    if (ring === 1) return 15 + Math.round(n)
    return 20
  }, 'landmark', 7)

  // Cardinal shoulders make the crown read as a deliberate stepped skyscraper in
  // isometric view; keeping diagonals lower preserves visible notches around it.
  for (const [dr, dc, height] of [
    [-1, 0, 21],
    [1, 0, 20],
    [0, -1, 22],
    [0, 1, 21],
  ] as const) {
    const shoulder = getCell(matrix, row + dr, col + dc)
    if (shoulder?.zone === 'data') registerColumn(columns, shoulder, height, 'crown', 9)
  }

  const spire = getCell(matrix, row, col)
  if (spire?.zone === 'data') registerColumn(columns, spire, 28, 'crown', 10)
}

function buildSetbackTower(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, seedText: string): void {
  registerRect(matrix, columns, row, col, 2, 2, () => 7, 'setback', 3)
  registerRect(matrix, columns, row, col, 1, 1, (cell) => 12 + Math.round(localNoise(seedText, cell.row, cell.col, 'setback-mid') * 2), 'setback', 5)
  const crown = getCell(matrix, row, col)
  if (crown?.zone === 'data') registerColumn(columns, crown, 17, 'crown', 7)
}

function buildPodiumTower(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, vertical: boolean): void {
  registerRect(matrix, columns, row, col, vertical ? 3 : 1, vertical ? 1 : 3, () => 5, 'podium', 3)
  registerRect(matrix, columns, row, col, 1, 1, (_cell, dr, dc) => 13 - Math.max(Math.abs(dr), Math.abs(dc)), 'tower', 5)
}

function buildTwinTowers(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, seedText: string): void {
  registerRect(matrix, columns, row, col, 1, 4, () => 4, 'podium', 3)
  for (const [offset, salt, peak] of [[-2, 'twin-a', 17], [2, 'twin-b', 14]] as const) {
    registerRect(matrix, columns, row, col + offset, 1, 1, (cell, dr, dc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(dc))
      return peak - ring * 2 + Math.round(localNoise(seedText, cell.row, cell.col, salt))
    }, 'twin', 6)
  }
}

function buildSlab(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, horizontal: boolean, seedText: string): void {
  registerRect(matrix, columns, row, col, horizontal ? 1 : 4, horizontal ? 4 : 1, (cell, dr, dc) => {
    const along = horizontal ? Math.abs(dc) : Math.abs(dr)
    return 8 + (along <= 1 ? 2 : 0) + Math.round(localNoise(seedText, cell.row, cell.col, 'slab') * 1.2)
  }, 'slab', 4)
}

function buildTerrace(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -3; dc <= 3; dc += 1) {
      const cell = getCell(matrix, row + dr, col + dc)
      if (!cell || cell.zone !== 'data') continue
      const step = Math.floor((dc + 3) / 2)
      registerColumn(columns, cell, 6 + step + (Math.abs(dr) <= 1 ? 1 : 0), 'terrace', 4)
    }
  }
}

function buildCrownedTower(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number, seedText: string): void {
  registerRect(matrix, columns, row, col, 1, 1, (cell, dr, dc) => 13 - Math.max(Math.abs(dr), Math.abs(dc)) + Math.round(localNoise(seedText, cell.row, cell.col, 'crown-body')), 'tower', 5)
  for (const dc of [-1, 0, 1]) {
    const cell = getCell(matrix, row, col + dc)
    if (!cell || cell.zone !== 'data') continue
    registerColumn(columns, cell, dc === 0 ? 18 : 15, 'crown', 7)
  }
}

function buildNeedleTower(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number): void {
  registerRect(matrix, columns, row, col, 2, 2, () => 5, 'podium', 3)
  registerRect(matrix, columns, row, col, 1, 1, (_cell, dr, dc) => 11 - Math.max(Math.abs(dr), Math.abs(dc)), 'needle', 5)
  for (const [dr, dc, height] of [[0, 0, 20], [-1, 0, 15], [1, 0, 15], [0, -1, 14], [0, 1, 14]] as const) {
    const cell = getCell(matrix, row + dr, col + dc)
    if (cell?.zone === 'data') registerColumn(columns, cell, height, 'needle', 7)
  }
}

function buildZiggurat(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number): void {
  registerRect(matrix, columns, row, col, 3, 3, () => 5, 'ziggurat', 3)
  registerRect(matrix, columns, row, col, 2, 2, () => 8, 'ziggurat', 4)
  registerRect(matrix, columns, row, col, 1, 1, () => 11, 'ziggurat', 5)
  const top = getCell(matrix, row, col)
  if (top?.zone === 'data') registerColumn(columns, top, 14, 'crown', 6)
}

function buildSkybridgeGate(matrix: QRMatrixData, columns: Map<string, UrbanColumn>, row: number, col: number): void {
  // Two narrow pylons with a deliberately open slot create strong negative space.
  // The upper bridge is registered only at high levels, so the street/view corridor
  // remains physically open below it instead of becoming another solid slab block.
  for (const dc of [-3, 3]) {
    registerRect(matrix, columns, row, col + dc, 1, 1, (_cell, dr, innerDc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(innerDc))
      return 16 - ring * 2 + (dc < 0 ? 1 : 0)
    }, 'tower', 7)
  }

  for (let dc = -2; dc <= 2; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const cell = getCell(matrix, row + dr, col + dc)
      if (!cell || cell.zone !== 'data') continue
      const topLevel = dr === 0 ? 16 : 15
      registerColumn(columns, cell, topLevel, 'bridge', 9, 13)
    }
  }

  // A one-cell crown on each pylon makes the pair read as a designed gateway rather
  // than two unrelated towers that happen to touch the elevated connector.
  for (const dc of [-3, 3]) {
    const crown = getCell(matrix, row, col + dc)
    if (crown?.zone === 'data') registerColumn(columns, crown, 19, 'crown', 10)
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
    case 'needle':
      return level % 4 === 0 ? 'primary' : 'glass'
    case 'ziggurat':
      return level % 3 === 0 ? 'primary' : 'stone'
    case 'bridge':
      return level === topLevel - 1 ? 'primary' : 'glass'
    case 'crown':
      return level >= topLevel - 2 ? 'primary' : 'glass'
    case 'podium':
    default:
      return level === 2 ? 'primary' : 'stone'
  }
}

function archetypeColorPhase(
  archetype: UrbanArchetype,
  cell: Pick<QRCell, 'row' | 'col'>,
  level: number,
  seedText: string,
): number {
  const base = ARCHETYPE_COLOR_PHASE[archetype]
  const texture = (localNoise(seedText, cell.row, cell.col, `${archetype}-material`) - 0.5) * 0.08
  const verticalBand = ((level % 5) - 2) * 0.006
  return Math.max(0.02, Math.min(0.98, base + texture + verticalBand))
}

function buildUrbanColumn(voxels: ReturnType<typeof createBaseVoxels>, column: UrbanColumn, matrixSize: number, seedText: string): void {
  const { cell, fromLevel, topLevel, archetype } = column
  for (let level = fromLevel; level <= topLevel; level += 1) {
    const kind = bodyKind(archetype, level, topLevel)
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      kind,
      archetypeColorPhase(archetype, cell, level, seedText),
      level === topLevel ? projectionToneForCell(cell) : undefined,
    )
  }
}

type StreetRole = 'lane' | 'sidewalk' | 'crosswalk'

function streetRole(cell: QRCell, center: number, spread: number, outer: number): StreetRole | null {
  if (cell.zone !== 'data') return null

  const dr = cell.row - center
  const dc = cell.col - center
  const adr = Math.abs(dr)
  const adc = Math.abs(dc)
  if (adr > outer + 2 || adc > outer + 2) return null

  // Four boulevard spokes run toward the central landmark. Their two-cell shoulders
  // make the street mass visible in isometric view while the landmark itself is free
  // to interrupt the avenue physically, like a civic block at the city center.
  const verticalBoulevard = adc <= 1
  const horizontalBoulevard = adr <= 1

  // A one-cell square ring creates a legible block boundary around the landmark and
  // reconnects the four spokes. This is deliberately geometric rather than noisy so
  // the base reads as planned streets instead of leftover QR cells.
  const ringRadius = Math.max(5, Math.round(spread * 0.72))
  const onRing = Math.max(adr, adc) === ringRadius

  if (!verticalBoulevard && !horizontalBoulevard && !onRing) return null

  const atRingJunction = onRing && (adc <= 1 || adr <= 1)
  if (atRingJunction && ((cell.row + cell.col) & 1) === 0) return 'crosswalk'

  const centerLane = adc === 0 || adr === 0 || onRing
  return centerLane ? 'lane' : 'sidewalk'
}

export function generateCity(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'city')
  const { random } = context
  const voxels = createBaseVoxels(context, { mode: 'symbol-pad', thickness: 2, foundationKind: 'foundation' })
  const lifted = new Set<string>()
  const columns = new Map<string, UrbanColumn>()
  const center = Math.round((matrix.size - 1) / 2)
  const spread = Math.max(7, Math.round(matrix.size * 0.18))
  const outer = Math.max(spread + 3, Math.round(matrix.size * 0.28))

  buildLandmark(matrix, columns, center, center, seedText)
  buildSetbackTower(matrix, columns, center - spread, center - spread, seedText)
  buildTwinTowers(matrix, columns, center - spread, center + spread, seedText)
  buildSlab(matrix, columns, center + spread, center - spread, true, seedText)
  buildCrownedTower(matrix, columns, center + spread, center + spread, seedText)
  buildPodiumTower(matrix, columns, center - outer, center, true)
  buildPodiumTower(matrix, columns, center, center + outer, false)
  buildSetbackTower(matrix, columns, center, center - outer, seedText)
  buildTerrace(matrix, columns, center + outer, center)
  buildNeedleTower(matrix, columns, center - Math.round(outer * 0.72), center + Math.round(outer * 0.18))
  buildZiggurat(matrix, columns, center + Math.round(outer * 0.7), center - Math.round(outer * 0.15))
  buildSkybridgeGate(matrix, columns, center - Math.round(spread * 0.42), center - Math.round(outer * 0.7))

  const infill = [
    [center - Math.round(spread * 0.48), center - Math.round(spread * 0.16), 13],
    [center - Math.round(spread * 0.33), center + Math.round(spread * 0.5), 11],
    [center + Math.round(spread * 0.44), center + Math.round(spread * 0.08), 14],
    [center + Math.round(spread * 0.22), center - Math.round(spread * 0.52), 10],
    [center - Math.round(spread * 0.08), center + Math.round(spread * 0.62), 12],
    [center + Math.round(spread * 0.6), center + Math.round(spread * 0.5), 9],
    [center - Math.round(spread * 0.62), center + Math.round(spread * 0.08), 10],
    [center + Math.round(spread * 0.56), center - Math.round(spread * 0.58), 11],
  ] as const

  for (let index = 0; index < infill.length; index += 1) {
    const [row, col, peak] = infill[index]
    const vertical = index % 2 === 0
    registerRect(matrix, columns, row, col, vertical ? 1 : 2, vertical ? 2 : 1, (cell, dr, dc) => {
      const ring = Math.max(Math.abs(dr), Math.abs(dc))
      return peak - ring + Math.round(localNoise(seedText, cell.row, cell.col, `infill-${index}`))
    }, index % 3 === 0 ? 'setback' : 'tower', 4)
  }

  for (const column of columns.values()) {
    buildUrbanColumn(voxels, column, matrix.size, seedText)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }

  let streetCount = 0
  for (const cell of matrix.cells) {
    if (columns.has(cellKey(cell.row, cell.col))) continue
    const role = streetRole(cell, center, spread, outer)
    if (!role) continue

    // Roads may cross both dark and light QR cells. pushProjectedColumn preserves
    // that polarity on the visible surface, so asphalt/sidewalk remains a coherent
    // material system without forcing the street network back to black-and-white.
    const material: VoxelKind = role === 'lane' ? 'stone' : 'plaster'
    pushProjectedColumn(voxels, cell, matrix.size, 1, 1, material, random)
    lifted.add(cellKey(cell.row, cell.col))
    streetCount += 1
  }

  return finalizeSculpture(matrix, voxels, 'city', 'City', lifted, `DENSE SKYLINE / ART-DECO LANDMARK + RING ROAD + 4 BOULEVARD SPOKES / ${columns.size} BUILT CELLS + ${streetCount} STREET CELLS`, 'display-plaque')
}
