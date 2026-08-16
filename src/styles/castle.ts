import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushProjectedColumn,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::castle-v2::${salt}::${row}:${col}`) % 10000) / 10000
}

function finderProfile(cell: QRCell, size: number): { row: number; col: number; severity: number; bias: number } | null {
  if (cell.row <= 7 && cell.col <= 7) return { row: 3, col: 3, severity: 0.18, bias: 1 }
  if (cell.row <= 7 && cell.col >= size - 8) return { row: 3, col: size - 4, severity: 0.42, bias: 0 }
  if (cell.row >= size - 8 && cell.col <= 7) return { row: size - 4, col: 3, severity: 0.58, bias: -1 }
  return null
}

function buildBrokenFinderBastions(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const profile = finderProfile(cell, matrix.size)
    if (!profile) continue

    const ring = Math.max(Math.abs(cell.row - profile.row), Math.abs(cell.col - profile.col))
    const survival = localNoise(seedText, cell.row, cell.col, 'bastion-survival')
    const chip = localNoise(seedText, cell.row, cell.col, 'bastion-chip')

    if (cell.dark) {
      const threshold = profile.severity + (ring === 2 ? 0.08 : 0)
      if (survival < threshold) continue

      const baseHeight = ring <= 1 ? 8 : ring <= 3 ? 6 : 3
      const topLevel = Math.max(2, baseHeight + profile.bias - Math.floor(chip * (3 + profile.severity * 3)))
      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
      continue
    }

    // Pale finder cells only survive as occasional broken wall-walks and exposed
    // floors, leaving visible gaps instead of creating three complete tower masses.
    if (survival > 0.82 + profile.severity * 0.08) {
      const topLevel = ring <= 2 ? 2 : 1
      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildBrokenTimingWalls(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'timing')) {
    const survival = localNoise(seedText, cell.row, cell.col, 'wall-survival')
    if (cell.dark) {
      if (survival < 0.36) continue
      const topLevel = 3 + Math.floor(localNoise(seedText, cell.row, cell.col, 'wall-height') * 3)
      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    } else if (survival > 0.83) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
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

  buildBrokenFinderBastions(voxels, matrix, seedText, random, lifted)
  buildBrokenTimingWalls(voxels, matrix, seedText, random, lifted)

  // Light cells become sparse rubble, collapsed wall walks and pale exposed court
  // surfaces rather than a uniformly raised courtyard.
  for (const cell of matrix.cells) {
    if (cell.dark || cell.zone !== 'data') continue
    const nx = Math.abs((cell.col - center) / Math.max(1, matrix.size * 0.36))
    const nz = Math.abs((cell.row - center) / Math.max(1, matrix.size * 0.36))
    const rubble = localNoise(seedText, cell.row, cell.col, 'rubble')
    if (nx <= 0.9 && nz <= 0.9 && rubble > 0.9) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, rubble > 0.97 ? 2 : 1, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const modules = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = Math.abs((module.col - center) / Math.max(1, matrix.size * 0.34))
    const nz = Math.abs((module.row - center) / Math.max(1, matrix.size * 0.34))
    return nx <= 1.04 && nz <= 1.04
  })

  const wallLevel = Math.round(Math.max(4, Math.min(7, matrix.size * 0.14)))
  const keepLevel = wallLevel + Math.round(Math.max(4, Math.min(7, matrix.size * 0.13)))

  for (const module of modules) {
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.34)
    const ax = Math.abs(nx)
    const az = Math.abs(nz)
    const isKeep = ax < 0.34 && az < 0.34
    const isWall = ax > 0.68 || az > 0.68
    const damage = localNoise(seedText, module.row, module.col, 'fortress-damage')

    // Broken perimeter walls may collapse all the way back to the QR floor. The
    // central keep stays comparatively intact and becomes the sole dominant mass.
    if (isWall && !isKeep && damage < 0.28) continue

    let topLevel = isKeep
      ? keepLevel - Math.floor(damage * 2)
      : isWall
        ? Math.max(3, wallLevel - Math.floor(damage * 3))
        : 2 + Math.floor(localNoise(seedText, module.row, module.col, 'court-block') * 3)

    if (isKeep && ((module.row + module.col) & 1) === 0) topLevel += 1
    lifted.add(cellKey(module.row, module.col))

    for (let level = 1; level <= topLevel; level += 1) {
      const upperBand = level >= topLevel - 1
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : upperBand && isKeep ? 'primary' : 'stone',
        (random() * 0.68 + level * 0.041 + damage * 0.15) % 1,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'castle',
    'Castle',
    lifted,
    'CENTRAL KEEP / 3 UNEVEN RUINED BASTIONS / BROKEN TIMING WALLS / RUBBLE COURT',
    'stone-plinth',
  )
}
