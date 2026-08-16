import type { QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

export function generateCastle(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'castle')
  const { random, center } = context
  const voxels = createBaseVoxels(context, { mode: 'dark-only' })

  const modules = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = Math.abs((module.col - center) / Math.max(1, matrix.size * 0.34))
    const nz = Math.abs((module.row - center) / Math.max(1, matrix.size * 0.34))
    return nx <= 1.04 && nz <= 1.04
  })

  const lifted = new Set(modules.map((module) => cellKey(module.row, module.col)))
  const wallLevel = Math.round(Math.max(5, Math.min(8, matrix.size * 0.16)))
  const towerLevel = wallLevel + Math.round(Math.max(4, Math.min(7, matrix.size * 0.13)))
  const keepLevel = wallLevel + Math.round(Math.max(2, Math.min(5, matrix.size * 0.09)))

  for (const module of modules) {
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.34)
    const ax = Math.abs(nx)
    const az = Math.abs(nz)

    const isCornerTower = ax > 0.58 && az > 0.58
    const isWall = ax > 0.72 || az > 0.72
    const isKeep = ax < 0.34 && az < 0.34
    const crenellation = ((module.row + module.col) & 1) === 0 ? 1 : 0

    let topLevel = isCornerTower
      ? towerLevel + crenellation
      : isKeep
        ? keepLevel + crenellation
        : isWall
          ? wallLevel + crenellation
          : Math.max(3, wallLevel - 2)

    if (random() > 0.86 && (isCornerTower || isKeep)) topLevel += 1

    for (let level = 1; level <= topLevel; level += 1) {
      const upperBand = level >= topLevel - 1
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : upperBand && isCornerTower ? 'primary' : 'stone',
        (random() * 0.7 + level * 0.043 + ax * 0.08 + az * 0.08) % 1,
      )
    }
  }

  return finalizeSculpture(matrix, voxels, 'castle', 'Castle', lifted, 'STONE QR FIELD / NO LIGHT PAD', 'dark-field')
}
