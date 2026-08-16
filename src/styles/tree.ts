import type { DarkModule, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

function pickTrunkModules(modules: DarkModule[], center: number): Set<string> {
  const sorted = [...modules].sort((a, b) => {
    const da = (a.row - center) ** 2 + (a.col - center) ** 2
    const db = (b.row - center) ** 2 + (b.col - center) ** 2
    return da - db
  })

  const picked: DarkModule[] = []
  for (const module of sorted) {
    if (picked.every((candidate) => Math.hypot(candidate.row - module.row, candidate.col - module.col) >= 1.45)) {
      picked.push(module)
    }
    if (picked.length >= 2) break
  }

  if (picked.length < 2) {
    for (const module of sorted) {
      if (!picked.includes(module)) picked.push(module)
      if (picked.length >= 2) break
    }
  }

  return new Set(picked.map((module) => cellKey(module.row, module.col)))
}

export function generateTree(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'tree')
  const { random, center } = context
  const voxels = createBaseVoxels(context, { mode: 'full-pad' })

  const canopyCandidates = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.29)
    return nx * nx + nz * nz <= 1.04 + (random() - 0.5) * 0.3
  })

  const canopyModules = canopyCandidates.length >= 34
    ? canopyCandidates
    : matrix.darkModules.filter((module) => {
        if (module.role !== 'data') return false
        const nx = (module.col - center) / Math.max(1, matrix.size * 0.4)
        const nz = (module.row - center) / Math.max(1, matrix.size * 0.35)
        return nx * nx + nz * nz <= 1.18
      })

  const lifted = new Set(canopyModules.map((module) => cellKey(module.row, module.col)))
  const trunkKeys = pickTrunkModules(canopyModules, center)
  const baseLevel = Math.round(Math.max(9, Math.min(15, matrix.size * 0.32)))
  const crownRise = Math.round(Math.max(6, Math.min(12, matrix.size * 0.25)))

  for (const module of canopyModules) {
    const key = cellKey(module.row, module.col)
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.29)
    const radialSquared = Math.min(1, nx * nx + nz * nz)
    const dome = Math.sqrt(Math.max(0, 1 - radialSquared))
    const topLevel = Math.max(
      baseLevel,
      Math.round(baseLevel + dome * crownRise + (random() - 0.5) * 2.8),
    )
    const crownThickness = 3 + Math.floor(random() * 3)
    const crownStart = Math.max(7, topLevel - crownThickness + 1)

    if (trunkKeys.has(key)) {
      for (let level = 1; level < crownStart; level += 1) {
        pushVoxel(voxels, module, matrix.size, level, 'wood', level / Math.max(1, crownStart))
      }
    }

    for (let level = crownStart; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : 'primary',
        (random() * 0.62 + dome * 0.3 + level * 0.037) % 1,
      )
    }
  }

  return finalizeSculpture(matrix, voxels, 'tree', 'Tree', lifted, 'FULL GRASS PAD', 'full-pad')
}
