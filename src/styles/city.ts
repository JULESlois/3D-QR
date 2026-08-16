import type { DarkModule, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

type BuildingArchetype = 'landmark' | 'tower' | 'midrise' | 'slab' | 'terrace'

const CARDINAL_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::city::${salt}::${row}:${col}`) % 10000) / 10000
}

function distance(a: DarkModule, b: DarkModule): number {
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

function roadFrontage(matrix: QRMatrixData, module: DarkModule): number {
  let count = 0

  for (const [dr, dc] of CARDINAL_OFFSETS) {
    const row = module.row + dr
    const col = module.col + dc

    if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) {
      count += 1
      continue
    }

    if (!matrix.cells[row * matrix.size + col].dark) count += 1
  }

  return count
}

function chooseLandmark(
  matrix: QRMatrixData,
  modules: readonly DarkModule[],
  dataByKey: ReadonlyMap<string, DarkModule>,
  center: number,
  seedText: string,
): DarkModule | undefined {
  return [...modules].sort((a, b) => {
    const score = (module: DarkModule): number => (
      centrality(module, center, matrix.size) * 2.25
      + dataDensity(module, dataByKey) * 0.55
      + roadFrontage(matrix, module) * 0.28
      + localNoise(seedText, module.row, module.col, 'landmark') * 0.22
    )
    return score(b) - score(a)
  })[0]
}

function chooseAnchors(
  matrix: QRMatrixData,
  modules: readonly DarkModule[],
  dataByKey: ReadonlyMap<string, DarkModule>,
  center: number,
  seedText: string,
  landmark: DarkModule,
): DarkModule[] {
  const targetCount = Math.max(9, Math.min(18, Math.round(modules.length * 0.07)))
  const minSpacing = matrix.size >= 41 ? 2.6 : 2.25
  const landmarkKey = cellKey(landmark.row, landmark.col)

  const ranked = modules
    .filter((module) => cellKey(module.row, module.col) !== landmarkKey)
    .sort((a, b) => {
      const score = (module: DarkModule): number => (
        centrality(module, center, matrix.size) * 1.35
        + dataDensity(module, dataByKey) * 0.5
        + roadFrontage(matrix, module) * 0.42
        + localNoise(seedText, module.row, module.col, 'anchor') * 1.1
      )
      return score(b) - score(a)
    })

  const anchors: DarkModule[] = [landmark]

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
  landmarkKey: string,
): BuildingArchetype {
  if (cellKey(module.row, module.col) === landmarkKey) return 'landmark'

  const density = dataDensity(module, dataByKey)
  const frontage = roadFrontage(matrix, module)
  const core = centrality(module, center, matrix.size)
  const noise = localNoise(seedText, module.row, module.col, 'type')

  if (core > 0.46 && density >= 4 && noise > 0.5) return 'tower'
  if (frontage >= 2 && density >= 3 && noise > 0.34) return 'slab'
  if (frontage >= 2 && noise > 0.62) return 'terrace'
  return 'midrise'
}

function footprintLimit(archetype: BuildingArchetype): number {
  switch (archetype) {
    case 'landmark': return 4
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
    case 'landmark':
      return Math.max(9, Math.round(14 - d * 3 + noise * 1.5))
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
    case 'landmark':
      if (level === topLevel - 3) return 'primary'
      return level % 3 === 0 ? 'glass' : 'stone'
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
  const { center } = context
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 2,
    foundationKind: 'foundation',
  })

  const modules = matrix.darkModules.filter((module) => module.role === 'data')
  const lifted = new Set<string>()

  if (modules.length === 0) {
    return finalizeSculpture(matrix, voxels, 'city', 'City', lifted, 'WHITE ROAD NETWORK / OPEN BLOCKS', 'display-plaque')
  }

  const dataByKey = new Map(modules.map((module) => [cellKey(module.row, module.col), module]))
  const landmark = chooseLandmark(matrix, modules, dataByKey, center, seedText) ?? modules[0]
  const anchors = chooseAnchors(matrix, modules, dataByKey, center, seedText, landmark)
  const reservedAnchors = new Set(anchors.map((module) => cellKey(module.row, module.col)))
  const claimed = new Set<string>()
  const landmarkKey = cellKey(landmark.row, landmark.col)
  let buildingCount = 0

  for (const anchor of anchors) {
    const archetype = chooseArchetype(matrix, anchor, dataByKey, center, seedText, landmarkKey)
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
    `${buildingCount} BUILDINGS / ${lifted.size} LOT CELLS / WHITE ROAD NETWORK`,
    'display-plaque',
  )
}
