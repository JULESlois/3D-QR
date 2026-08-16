import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushProjectedColumn,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

function finderCenter(cell: QRCell, size: number): { row: number; col: number } | null {
  if (cell.row <= 7 && cell.col <= 7) return { row: 3, col: 3 }
  if (cell.row <= 7 && cell.col >= size - 8) return { row: 3, col: size - 4 }
  if (cell.row >= size - 8 && cell.col <= 7) return { row: size - 4, col: 3 }
  return null
}

function finderTowerHeight(cell: QRCell, size: number): number {
  const center = finderCenter(cell, size)
  if (!center) return cell.dark ? 5 : 3

  const ring = Math.max(Math.abs(cell.row - center.row), Math.abs(cell.col - center.col))

  if (cell.dark) {
    if (ring <= 1) return 11
    if (ring <= 3) return 8
    return 5
  }

  if (ring <= 1) return 7
  if (ring <= 3) return 6
  return 4
}

export function generateCastle(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'castle')
  const { random, center } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 2,
    thickness: 3,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  // Each finder becomes a complete watchtower complex. Both light and dark cells
  // rise as masonry; only the cap polarity differs, so the finder pattern survives
  // exactly in QR view while reading as a tiered tower in art view.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const topLevel = finderTowerHeight(cell, matrix.size)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Timing modules become crenellated connector walls. Light timing cells are lower
  // pale wall-walks, dark timing cells are higher battlements.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'timing')) {
    const topLevel = cell.dark ? 5 : 3
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Some central light data cells rise into pale courtyard terraces instead of
  // remaining a perfectly flat QR plate.
  for (const cell of matrix.cells) {
    if (cell.dark || cell.zone !== 'data') continue
    const nx = Math.abs((cell.col - center) / Math.max(1, matrix.size * 0.36))
    const nz = Math.abs((cell.row - center) / Math.max(1, matrix.size * 0.36))
    if (nx <= 0.72 && nz <= 0.72 && random() > 0.54) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const modules = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = Math.abs((module.col - center) / Math.max(1, matrix.size * 0.34))
    const nz = Math.abs((module.row - center) / Math.max(1, matrix.size * 0.34))
    return nx <= 1.04 && nz <= 1.04
  })

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
    lifted.add(cellKey(module.row, module.col))

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

  return finalizeSculpture(
    matrix,
    voxels,
    'castle',
    'Castle',
    lifted,
    '3 FINDER WATCHTOWERS / TIMING WALLS / COURTYARD TERRACES',
    'stone-plinth',
  )
}
