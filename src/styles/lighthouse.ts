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

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
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

function waveHeight(cell: QRCell, seedText: string): number {
  if (cell.zone === 'finder') return 1
  if (cell.zone === 'timing') return 1

  const seed = (hashString(`${seedText}::wave::${cell.row}:${cell.col}`) % 1000) / 1000
  const wave = Math.sin(cell.row * 0.83 + cell.col * 0.31)
    + Math.cos(cell.col * 0.71 - cell.row * 0.27)
    + (seed - 0.5) * 0.9

  return wave > 0.55 ? 2 : 1
}

function towerKind(level: number, topLevel: number): VoxelKind {
  if (level === topLevel) return 'qr-top'

  const belowTop = topLevel - level

  // Give the beacon a distinct lantern room and gallery band instead of letting
  // the upper shaft dissolve into a generic pale voxel column.
  if (belowTop <= 2) return 'glass'
  if (belowTop === 3) return 'primary'

  // Classic lighthouse paint bands are deliberately aligned by absolute height
  // across the whole tapered footprint. The silhouette stays identical in QR
  // view because only interior voxel material changes; scanner caps are untouched.
  const stripePhase = Math.floor((level - 1) / 2)
  return stripePhase % 2 === 1 ? 'primary' : 'plaster'
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
  const lifted = new Set<string>()

  // Scanner-light cells are real scene geometry now: a shallow blue sea with a
  // deterministic one/two-voxel wave field. In QR view their caps remain light.
  for (const cell of matrix.cells) {
    if (cell.dark) continue
    const topLevel = waveHeight(cell, seedText)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'water', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Dark finder modules become three low reef/breakwater structures instead of
  // remaining a printed-looking corner pattern on the harbor floor.
  for (const module of matrix.darkModules.filter((cell) => cell.zone === 'finder')) {
    const topLevel = ((module.row + module.col) % 4 === 0) ? 2 : 1
    pushProjectedColumn(voxels, module, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(cellKey(module.row, module.col))
  }

  const dataModules = matrix.darkModules.filter((module) => module.role === 'data')
  const anchor = [...dataModules].sort((a, b) => {
    const aCenter = Math.hypot(a.row - center, a.col - center)
    const bCenter = Math.hypot(b.row - center, b.col - center)
    const aScore = aCenter - adjacencyScore(a, dataModules) * 1.2
    const bScore = bCenter - adjacencyScore(b, dataModules) * 1.2
    return aScore - bScore
  })[0]

  if (!anchor) {
    return finalizeSculpture(
      matrix,
      voxels,
      'lighthouse',
      'Lighthouse',
      lifted,
      'WAVE FIELD / FINDER REEFS / HARBOR PAD',
      'courtyard-pad',
    )
  }

  const nearby = [...dataModules]
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(8, Math.max(4, Math.round(matrix.size * 0.2))))

  const towerModules = nearby.slice(0, Math.min(5, nearby.length))
  const islandModules = dataModules
    .filter((module) => distance(module, anchor) <= Math.max(3.2, matrix.size * 0.13))
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(18, dataModules.length))

  const towerKeys = new Set(towerModules.map((module) => cellKey(module.row, module.col)))

  for (const module of islandModules) {
    if (towerKeys.has(cellKey(module.row, module.col))) continue
    const topLevel = random() > 0.72 ? 3 : 2
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
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        towerKind(level, topLevel),
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
    'SCANNER-LIGHT WAVES / FINDER REEFS / STRIPED BEACON / GLASS LANTERN',
    'courtyard-pad',
  )
}
