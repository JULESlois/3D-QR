import type { DarkModule, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

function distance(a: DarkModule, b: DarkModule): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function adjacencyScore(module: DarkModule, modules: readonly DarkModule[]): number {
  let score = 0
  for (const candidate of modules) {
    if (candidate === module) continue
    const dr = Math.abs(candidate.row - module.row)
    const dc = Math.abs(candidate.col - module.col)
    if (dr <= 1 && dc <= 1) score += 1
  }
  return score
}

export function generateLighthouse(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'lighthouse')
  const { random, center } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 3,
    thickness: 2,
    foundationKind: 'foundation',
  })

  const dataModules = matrix.darkModules.filter((module) => module.role === 'data')
  const anchor = [...dataModules].sort((a, b) => {
    const aCenter = Math.hypot(a.row - center, a.col - center)
    const bCenter = Math.hypot(b.row - center, b.col - center)
    const aScore = aCenter - adjacencyScore(a, dataModules) * 1.2
    const bScore = bCenter - adjacencyScore(b, dataModules) * 1.2
    return aScore - bScore
  })[0]

  if (!anchor) {
    return finalizeSculpture(matrix, voxels, 'lighthouse', 'Lighthouse', new Set(), 'HARBOR PAD', 'courtyard-pad')
  }

  const nearby = [...dataModules]
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(8, Math.max(4, Math.round(matrix.size * 0.2))))

  const towerModules = nearby.slice(0, Math.min(5, nearby.length))
  const islandModules = dataModules
    .filter((module) => distance(module, anchor) <= Math.max(3.2, matrix.size * 0.13))
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(18, dataModules.length))

  const lifted = new Set<string>()
  const towerKeys = new Set(towerModules.map((module) => cellKey(module.row, module.col)))

  for (const module of islandModules) {
    if (towerKeys.has(cellKey(module.row, module.col))) continue
    const topLevel = random() > 0.72 ? 2 : 1
    lifted.add(cellKey(module.row, module.col))

    for (let level = 1; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : 'stone',
        (random() * 0.6 + level * 0.08) % 1,
      )
    }
  }

  for (let i = 0; i < towerModules.length; i += 1) {
    const module = towerModules[i]
    const d = distance(module, anchor)
    const topLevel = i === 0
      ? 13
      : Math.max(8, 11 - Math.round(d * 1.8))

    lifted.add(cellKey(module.row, module.col))

    for (let level = 1; level <= topLevel; level += 1) {
      let kind: VoxelKind
      if (level === topLevel) kind = 'qr-top'
      else if (level >= topLevel - 2) kind = 'glass'
      else if (level === topLevel - 3) kind = 'primary'
      else kind = 'plaster'

      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        kind,
        (random() * 0.48 + level * 0.052 + d * 0.07) % 1,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'lighthouse',
    'Lighthouse',
    lifted,
    'BEACON / ROCK ISLAND / HARBOR PAD',
    'courtyard-pad',
  )
}
