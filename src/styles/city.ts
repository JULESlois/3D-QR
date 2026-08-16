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
  const centerTower = [...modules].sort((a, b) => {
    const da = (a.row - center) ** 2 + (a.col - center) ** 2
    const db = (b.row - center) ** 2 + (b.col - center) ** 2
    return da - db
  })[0]

  for (const module of modules) {
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.5)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.5)
    const radial = Math.min(1, Math.hypot(nx, nz))
    const centrality = 1 - radial
    const avenue = module !== centerTower
      && (module.row % 5 === 0 || module.col % 5 === 0)
      && random() < 0.72

    if (avenue) continue

    let topLevel = 2 + Math.floor(random() * 4) + Math.round(centrality * 5)
    if (module === centerTower) topLevel = Math.max(topLevel, 13)
    else if (random() > 0.93) topLevel += 4
    topLevel = Math.max(2, Math.min(14, topLevel))

    lifted.add(cellKey(module.row, module.col))

    const facadeKind: VoxelKind = topLevel >= 9
      ? 'glass'
      : random() > 0.5
        ? 'stone'
        : 'primary'

    for (let level = 1; level <= topLevel; level += 1) {
      let kind: VoxelKind
      if (level === topLevel) kind = 'qr-top'
      else if (topLevel >= 6 && level % 3 === 0) kind = 'glass'
      else kind = facadeKind

      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        kind,
        (random() * 0.54 + level * 0.047 + centrality * 0.22) % 1,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'city',
    'City',
    lifted,
    'SKYLINE / AVENUES / CENTRAL TOWER',
    'display-plaque',
  )
}
