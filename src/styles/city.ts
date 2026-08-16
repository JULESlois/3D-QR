import type { DarkModule, QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushProjectedColumn,
  pushVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

type BuildingArchetype = 'tower' | 'midrise' | 'slab' | 'terrace'

const CARDINAL_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::city::${salt}::${row}:${col}`) % 10000) / 10000
}

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function centrality(module: DarkModule, center: number, size: number): number {
  const nx = (module.col - center) / Math.max(1, size * 0.5)
  const nz = (module.row - center) / Math.max(1, size * 0.5)
  return 1 - Math.min(1, Math.hypot(nx, nz))
}

function dataDensity(module: DarkModule, dataByKey: ReadonlyMap<string, DarkModule>): number {
  let count = 0
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      if (dataByKey.has(cellKey(module.row + dr, module.col + dc))) count += 1
    }
  }
  return count
}

function lightFrontage(matrix: QRMatrixData, module: DarkModule): number {
  let count = 0

  for (const [dr, dc] of CARDINAL_OFFSETS) {
    const row = module.row + dr
    const col = module.col + dc
    if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) continue
    if (!matrix.cells[row * matrix.size + col].dark) count += 1
  }

  return count
}

function chooseMegablockAnchor(
  matrix: QRMatrixData,
  modules: readonly DarkModule[],
  dataByKey: ReadonlyMap<string, DarkModule>,
  center: number,
  seedText: string,
): DarkModule | undefined {
  return [...modules].sort((a, b) => {
    const score = (module: DarkModule): number => (
      centrality(module, center, matrix.size) * 2.4
      + dataDensity(module, dataByKey) * 0.58
      + lightFrontage(matrix, module) * 0.18
      + localNoise(seedText, module.row, module.col, 'mega') * 0.2
    )
    return score(b) - score(a)
  })[0]
}

function megablockCells(matrix: QRMatrixData, anchor: DarkModule): QRCell[] {
  return matrix.cells.filter((cell) => (
    cell.zone === 'data'
    && Math.abs(cell.row - anchor.row) <= 1
    && Math.abs(cell.col - anchor.col) <= 1
  ))
}

function chooseAnchors(
  matrix: QRMatrixData,
  modules: readonly DarkModule[],
  dataByKey: ReadonlyMap<string, DarkModule>,
  center: number,
  seedText: string,
  megablockAnchor: DarkModule,
): DarkModule[] {
  const targetCount = Math.max(7, Math.min(13, Math.round(modules.length * 0.05)))
  const minSpacing = matrix.size >= 41 ? 3.0 : 2.6

  const ranked = modules
    .filter((module) => distance(module, megablockAnchor) >= 3.2)
    .sort((a, b) => {
      const score = (module: DarkModule): number => (
        centrality(module, center, matrix.size) * 1.15
        + dataDensity(module, dataByKey) * 0.42
        + lightFrontage(matrix, module) * 0.34
        + localNoise(seedText, module.row, module.col, 'anchor') * 1.18
      )
      return score(b) - score(a)
    })

  const anchors: DarkModule[] = []

  for (const candidate of ranked) {
    if (anchors.every((anchor) => distance(anchor, candidate) >= minSpacing)) {
      anchors.push(candidate)
    }
    if (anchors.length >= targetCount) break
  }

  return anchors
}

function chooseArchetype(
  matrix: QRMatrixData,
  module: DarkModule,
  dataByKey: ReadonlyMap<string, DarkModule>,
  center: number,
  seedText: string,
): BuildingArchetype {
  const density = dataDensity(module, dataByKey)
  const frontage = lightFrontage(matrix, module)
  const core = centrality(module, center, matrix.size)
  const noise = localNoise(seedText, module.row, module.col, 'type')

  if (core > 0.42 && density >= 4 && noise > 0.56) return 'tower'
  if (frontage >= 2 && density >= 3 && noise > 0.38) return 'slab'
  if (frontage >= 2 && noise > 0.65) return 'terrace'
  return 'midrise'
}

function footprintLimit(archetype: BuildingArchetype): number {
  switch (archetype) {
    case 'slab': return 3
    case 'terrace': return 3
    case 'tower': return 2
    case 'midrise':
    default: return 2
  }
}

function collectFootprint(
  anchor: DarkModule,
  archetype: BuildingArchetype,
  dataByKey: ReadonlyMap<string, DarkModule>,
  claimed: Set<string>,
  reservedAnchors: ReadonlySet<string>,
  seedText: string,
): DarkModule[] {
  const anchorKey = cellKey(anchor.row, anchor.col)
  if (claimed.has(anchorKey)) return []

  const cells: DarkModule[] = [anchor]
  claimed.add(anchorKey)

  const candidates = CARDINAL_OFFSETS
    .map(([dr, dc]) => dataByKey.get(cellKey(anchor.row + dr, anchor.col + dc)))
    .filter((module): module is DarkModule => Boolean(module))
    .filter((module) => {
      const key = cellKey(module.row, module.col)
      return !claimed.has(key) && (!reservedAnchors.has(key) || key === anchorKey)
    })
    .sort((a, b) => {
      const alignmentPenalty = (module: DarkModule): number => {
        if (archetype === 'slab') return module.row === anchor.row ? 0 : 1
        if (archetype === 'terrace') return module.col === anchor.col ? 0 : 1
        return 0
      }
      const score = (module: DarkModule): number => (
        alignmentPenalty(module)
        + localNoise(seedText, module.row, module.col, 'footprint') * 0.45
      )
      return score(a) - score(b)
    })

  for (const candidate of candidates) {
    if (cells.length >= footprintLimit(archetype)) break
    const key = cellKey(candidate.row, candidate.col)
    claimed.add(key)
    cells.push(candidate)
  }

  return cells
}

function buildingHeight(
  archetype: BuildingArchetype,
  anchor: DarkModule,
  module: DarkModule,
  index: number,
  seedText: string,
): number {
  const noise = localNoise(seedText, module.row, module.col, 'height')
  const d = distance(anchor, module)

  switch (archetype) {
    case 'tower':
      return Math.max(7, Math.round(10 - d * 1.6 + noise * 1.5))
    case 'midrise':
      return 5 + Math.floor(noise * 3)
    case 'slab':
      return 4 + Math.floor(noise * 2)
    case 'terrace':
      return Math.max(3, 5 - index + Math.floor(noise * 2))
  }
}

function facadeKind(
  archetype: BuildingArchetype,
  level: number,
  topLevel: number,
  seedText: string,
  module: DarkModule,
): VoxelKind {
  if (level === topLevel) return 'qr-top'

  const noise = localNoise(seedText, module.row, module.col, 'facade')

  switch (archetype) {
    case 'tower':
      return level % 2 === 0 ? 'glass' : 'stone'
    case 'slab':
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'terrace':
      return level === 2 && noise > 0.46 ? 'primary' : 'plaster'
    case 'midrise':
    default:
      if (level % 3 === 0) return 'glass'
      return noise > 0.5 ? 'stone' : 'plaster'
  }
}

export function generateCity(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'city')
  const { random, center } = context
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 2,
    foundationKind: 'foundation',
  })

  const modules = matrix.darkModules.filter((module) => module.role === 'data')
  const lifted = new Set<string>()

  if (modules.length === 0) {
    return finalizeSculpture(matrix, voxels, 'city', 'City', lifted, 'URBAN PLAZA / OPEN STREET PLAN', 'display-plaque')
  }

  const dataByKey = new Map(modules.map((module) => [cellKey(module.row, module.col), module]))
  const megaAnchor = chooseMegablockAnchor(matrix, modules, dataByKey, center, seedText) ?? modules[0]
  const megaCells = megablockCells(matrix, megaAnchor)
  const antennaCell = megaCells
    .filter((cell) => !cell.dark)
    .sort((a, b) => (
      localNoise(seedText, b.row, b.col, 'antenna')
      - localNoise(seedText, a.row, a.col, 'antenna')
    ))[0]

  // A single coherent megabuilding is allowed to cross both dark and light QR cells.
  // Its roof cells keep their original polarity, so scanner view still sees the exact QR.
  for (const cell of megaCells) {
    const d = Math.max(Math.abs(cell.row - megaAnchor.row), Math.abs(cell.col - megaAnchor.col))
    const noise = localNoise(seedText, cell.row, cell.col, 'mega-height')
    let topLevel = Math.max(8, Math.round(13 - d * 2.4 + noise * 1.4))
    if (cell === antennaCell) topLevel = 16

    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      topLevel,
      topLevel >= 12 ? 'glass' : 'stone',
      random,
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Nearby scanner-light cells become raised civic plazas rather than every light cell
  // being interpreted as a road. They remain pale from the QR axis.
  for (const cell of matrix.cells) {
    if (cell.dark || cell.zone !== 'data') continue
    if (megaCells.some((mega) => mega.row === cell.row && mega.col === cell.col)) continue
    const d = distance(cell, megaAnchor)
    const plaza = d >= 2.2 && d <= 5.2 && localNoise(seedText, cell.row, cell.col, 'plaza') > 0.83
    if (!plaza) continue

    pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'plaster', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  const anchors = chooseAnchors(matrix, modules, dataByKey, center, seedText, megaAnchor)
  const reservedAnchors = new Set(anchors.map((module) => cellKey(module.row, module.col)))
  const claimed = new Set(
    megaCells
      .filter((cell): cell is DarkModule => cell.dark)
      .map((cell) => cellKey(cell.row, cell.col)),
  )
  let buildingCount = megaCells.length > 0 ? 1 : 0

  for (const anchor of anchors) {
    const archetype = chooseArchetype(matrix, anchor, dataByKey, center, seedText)
    const footprint = collectFootprint(anchor, archetype, dataByKey, claimed, reservedAnchors, seedText)
    if (footprint.length === 0) continue

    buildingCount += 1

    for (let index = 0; index < footprint.length; index += 1) {
      const module = footprint[index]
      const topLevel = buildingHeight(archetype, anchor, module, index, seedText)
      lifted.add(cellKey(module.row, module.col))

      for (let level = 1; level <= topLevel; level += 1) {
        pushVoxel(
          voxels,
          module,
          matrix.size,
          level,
          facadeKind(archetype, level, topLevel, seedText, module),
          (localNoise(seedText, module.row, module.col, 'phase') * 0.62 + level * 0.043) % 1,
        )
      }
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'city',
    'City',
    lifted,
    `${buildingCount} BUILDINGS / MIXED-POLARITY MEGABLOCK / LIGHT PLAZAS`,
    'display-plaque',
  )
}
