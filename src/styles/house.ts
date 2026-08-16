import type { QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

export function generateHouse(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'house')
  const { random, center } = context
  const voxels = createBaseVoxels(context)

  const candidates = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = Math.abs((module.col - center) / Math.max(1, matrix.size * 0.31))
    const nz = Math.abs((module.row - center) / Math.max(1, matrix.size * 0.24))
    return nx <= 1.03 && nz <= 1.05
  })

  const modules = candidates.length >= 26
    ? candidates
    : matrix.darkModules
        .filter((module) => module.role === 'data')
        .sort((a, b) => {
          const da = (a.row - center) ** 2 + (a.col - center) ** 2
          const db = (b.row - center) ** 2 + (b.col - center) ** 2
          return da - db
        })
        .slice(0, Math.max(26, Math.min(90, matrix.darkModules.length)))

  const lifted = new Set(modules.map((module) => cellKey(module.row, module.col)))
  const wallHeight = Math.round(Math.max(5, Math.min(8, matrix.size * 0.17)))
  const roofRise = Math.round(Math.max(3, Math.min(6, matrix.size * 0.13)))

  const doorModule = [...modules].sort((a, b) => {
    const aScore = Math.abs(a.col - center) + Math.abs(a.row - (center + matrix.size * 0.16))
    const bScore = Math.abs(b.col - center) + Math.abs(b.row - (center + matrix.size * 0.16))
    return aScore - bScore
  })[0]

  const chimneyModule = [...modules].sort((a, b) => {
    const aScore = Math.abs(a.col - (center - matrix.size * 0.17)) + Math.abs(a.row - (center - matrix.size * 0.13))
    const bScore = Math.abs(b.col - (center - matrix.size * 0.17)) + Math.abs(b.row - (center - matrix.size * 0.13))
    return aScore - bScore
  })[0]

  for (const module of modules) {
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.31)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.24)
    const roofProfile = Math.max(0, 1 - Math.abs(nx))
    const topLevel = wallHeight + Math.max(1, Math.round(roofProfile * roofRise))
    const isDoor = module === doorModule
    const isChimney = module === chimneyModule

    for (let level = 1; level <= topLevel; level += 1) {
      let kind: VoxelKind
      if (level === topLevel) kind = 'qr-top'
      else if (isDoor && level <= Math.min(4, wallHeight)) kind = 'wood'
      else if (level <= wallHeight) kind = 'plaster'
      else kind = 'primary'

      pushVoxel(voxels, module, matrix.size, level, kind, (random() + level * 0.07 + nz * 0.08) % 1)
    }

    if (isChimney) {
      for (let level = topLevel + 1; level <= topLevel + 2; level += 1) {
        pushVoxel(
          voxels,
          module,
          matrix.size,
          level,
          level === topLevel + 2 ? 'qr-top' : 'stone',
          random(),
        )
      }
    }
  }

  return finalizeSculpture(matrix, voxels, 'house', 'House', lifted, 'GABLE / CHIMNEY')
}
