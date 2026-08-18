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

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
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

function buildDrawbridgeApproach(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
): void {
  const center = Math.round((matrix.size - 1) / 2)
  const startRow = center + Math.max(2, Math.round(matrix.size * 0.1))
  const bridgeEnd = center + Math.max(5, Math.round(matrix.size * 0.24))
  const approachEnd = Math.min(matrix.size - 2, center + Math.max(8, Math.round(matrix.size * 0.36)))

  for (let row = startRow; row <= approachEnd; row += 1) {
    const onBridge = row <= bridgeEnd
    for (let dc = -1; dc <= 1; dc += 1) {
      const cell = getCell(matrix, row, center + dc)
      if (!cell || cell.zone !== 'data') continue

      // A three-module timber deck projects straight out of the recessed gatehouse.
      // It hands off to a lower stone causeway, giving the fortress a strong front axis
      // in isometric view without changing the QR column footprint.
      pushProjectedColumn(
        voxels,
        cell,
        matrix.size,
        1,
        onBridge ? 2 : 1,
        onBridge ? 'wood' : 'stone',
        random,
      )
      lifted.add(cellKey(cell.row, cell.col))
    }

    // Broken side rails make the near half read as a drawbridge rather than a generic path.
    // The alternating gaps keep the ruin language and avoid creating two solid parallel walls.
    if (onBridge && (row - startRow) % 3 !== 1) {
      for (const dc of [-2, 2]) {
        const rail = getCell(matrix, row, center + dc)
        if (!rail || rail.zone !== 'data') continue
        pushProjectedColumn(voxels, rail, matrix.size, 1, 3, 'wood', random)
        lifted.add(cellKey(rail.row, rail.col))
      }
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

    // The keep is shaped as a recognizable gatehouse instead of a single cuboid:
    // four corner turrets rise above a lower roof, while the near face dips in the
    // middle to suggest a recessed gate framed by two taller gate towers.
    const isCornerTurret = isKeep && ax > 0.19 && az > 0.19
    const isFrontGate = isKeep && nz > 0.16 && ax < 0.11
    const isGateTower = isKeep && nz > 0.15 && ax >= 0.11 && ax < 0.28
    const isKeepEdge = isKeep && (ax > 0.27 || az > 0.27)

    // Broken perimeter walls may collapse all the way back to the QR floor. The
    // central keep stays comparatively intact and becomes the sole dominant mass.
    if (isWall && !isKeep && damage < 0.28) continue

    let topLevel = isKeep
      ? keepLevel - 2 - Math.floor(damage * 2)
      : isWall
        ? Math.max(3, wallLevel - Math.floor(damage * 3))
        : 2 + Math.floor(localNoise(seedText, module.row, module.col, 'court-block') * 3)

    if (isCornerTurret) topLevel = keepLevel + 2 - Math.floor(damage * 2)
    else if (isGateTower) topLevel = keepLevel + 1 - Math.floor(damage * 2)
    else if (isFrontGate) topLevel = Math.max(wallLevel + 1, keepLevel - 4)
    else if (isKeepEdge && ((module.row + module.col) & 1) === 0) topLevel += 2

    lifted.add(cellKey(module.row, module.col))

    for (let level = 1; level <= topLevel; level += 1) {
      const crownBand = level >= topLevel - 1
      const towerAccent = isCornerTurret || isGateTower || (isKeepEdge && crownBand)
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : towerAccent ? 'primary' : 'stone',
        (random() * 0.68 + level * 0.041 + damage * 0.15) % 1,
      )
    }
  }

  buildDrawbridgeApproach(voxels, matrix, random, lifted)

  return finalizeSculpture(
    matrix,
    voxels,
    'castle',
    'Castle',
    lifted,
    'RECESSED GATEHOUSE / TIMBER DRAWBRIDGE / BROKEN RAILS / 4 CORNER TURRETS / 3 RUINED BASTIONS / RUBBLE COURT',
    'stone-plinth',
  )
}
