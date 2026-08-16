import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectedCapKind,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

type FinderScene = 'gate' | 'garden' | 'bell'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::temple::${salt}::${row}:${col}`) % 10000) / 10000
}

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function finderScene(cell: QRCell, size: number): FinderScene | null {
  if (cell.row <= 7 && cell.col <= 7) return 'gate'
  if (cell.row <= 7 && cell.col >= size - 8) return 'garden'
  if (cell.row >= size - 8 && cell.col <= 7) return 'bell'
  return null
}

function finderCenter(cell: QRCell, size: number): { row: number; col: number } | null {
  if (cell.row <= 7 && cell.col <= 7) return { row: 3, col: 3 }
  if (cell.row <= 7 && cell.col >= size - 8) return { row: 3, col: size - 4 }
  if (cell.row >= size - 8 && cell.col <= 7) return { row: size - 4, col: 3 }
  return null
}

function finderRing(cell: QRCell, size: number): number {
  const center = finderCenter(cell, size)
  if (!center) return 4
  return Math.max(Math.abs(cell.row - center.row), Math.abs(cell.col - center.col))
}

function chooseMainAnchor(matrix: QRMatrixData, seedText: string): QRCell | undefined {
  const center = (matrix.size - 1) / 2
  return [...matrix.cells]
    .filter((cell) => cell.zone === 'data')
    .sort((a, b) => {
      const score = (cell: QRCell): number => (
        Math.hypot(cell.row - center, cell.col - center)
        - (cell.dark ? 0.24 : 0)
        - localNoise(seedText, cell.row, cell.col, 'anchor') * 0.12
      )
      return score(a) - score(b)
    })[0]
}

function mainHallCells(matrix: QRMatrixData, anchor: QRCell): QRCell[] {
  return matrix.cells.filter((cell) => (
    cell.zone === 'data'
    && Math.abs(cell.row - anchor.row) <= 1
    && Math.abs(cell.col - anchor.col) <= 3
  ))
}

function hallHeight(cell: QRCell, anchor: QRCell, seedText: string): number {
  const rowOffset = Math.abs(cell.row - anchor.row)
  const colOffset = Math.abs(cell.col - anchor.col)
  const noise = localNoise(seedText, cell.row, cell.col, 'hall-height')
  const ridge = colOffset <= 1 ? 1 : 0
  const edge = colOffset >= 3 ? 1 : 0
  return Math.max(5, 8 + ridge - rowOffset * 2 - edge + Math.round(noise * 0.8))
}

function hallBodyKind(level: number, topLevel: number): VoxelKind {
  if (level >= topLevel - 2) return 'primary'
  if (level <= 2) return 'stone'
  if (level % 3 === 0) return 'plaster'
  return 'wood'
}

function pushHallColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  cell: QRCell,
  matrixSize: number,
  anchor: QRCell,
  seedText: string,
): void {
  const topLevel = hallHeight(cell, anchor, seedText)

  for (let level = 1; level <= topLevel; level += 1) {
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      level === topLevel ? projectedCapKind(cell) : hallBodyKind(level, topLevel),
      (localNoise(seedText, cell.row, cell.col, `hall-${level}`) * 0.58 + level * 0.051) % 1,
    )
  }
}

function buildFinderScenes(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const scene = finderScene(cell, matrix.size)
    const ring = finderRing(cell, matrix.size)
    if (!scene) continue

    let topLevel = 1
    let bodyKind: VoxelKind = 'stone'

    if (scene === 'gate') {
      topLevel = cell.dark
        ? ring <= 1 ? 8 : ring <= 3 ? 6 : 3
        : ring <= 1 ? 5 : ring <= 3 ? 4 : 2
      bodyKind = cell.dark ? 'wood' : 'plaster'
    } else if (scene === 'garden') {
      topLevel = cell.dark
        ? ring <= 1 ? 5 : ring <= 3 ? 3 : 2
        : ring <= 1 ? 2 : 1
      bodyKind = cell.dark ? 'stone' : 'water'
    } else {
      topLevel = cell.dark
        ? ring <= 1 ? 10 : ring <= 3 ? 6 : 3
        : ring <= 1 ? 5 : ring <= 3 ? 3 : 2
      bodyKind = cell.dark ? 'wood' : 'stone'
    }

    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, bodyKind, random)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

function buildTempleAxes(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'timing')) {
    const horizontal = cell.row === 6
    const topLevel = horizontal
      ? cell.dark ? 4 : 3
      : cell.dark ? 2 : 1
    const bodyKind: VoxelKind = horizontal
      ? cell.dark ? 'wood' : 'plaster'
      : 'stone'

    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, bodyKind, random)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

export function generateTemple(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'temple')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 2,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  buildFinderScenes(voxels, matrix, random, lifted)
  buildTempleAxes(voxels, matrix, random, lifted)

  const anchor = chooseMainAnchor(matrix, seedText)
  if (!anchor) {
    return finalizeSculpture(
      matrix,
      voxels,
      'temple',
      'Temple',
      lifted,
      'GATE / WATER GARDEN / BELL PAVILION / TEMPLE AXES',
      'courtyard-pad',
    )
  }

  const hallCells = mainHallCells(matrix, anchor)
  const hallKeys = new Set(hallCells.map((cell) => cellKey(cell.row, cell.col)))

  // The main hall is deliberately broad and horizontal. Light and dark cells share
  // the same architectural mass, while their scanner-facing roof caps preserve QR polarity.
  for (const cell of hallCells) {
    pushHallColumn(voxels, cell, matrix.size, anchor, seedText)
    lifted.add(cellKey(cell.row, cell.col))
  }

  const gardenSide = localNoise(seedText, anchor.row, anchor.col, 'garden-side') > 0.5 ? 1 : -1

  // A side water court uses scanner-light data cells as shallow water. Dark cells
  // inside the same court become stepping stones or lantern bases instead of being excluded.
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data') continue
    const key = cellKey(cell.row, cell.col)
    if (hallKeys.has(key)) continue

    const dr = Math.abs(cell.row - anchor.row)
    const signedDc = (cell.col - anchor.col) * gardenSide
    const inWaterCourt = dr <= 3 && signedDc >= 3 && signedDc <= 7

    if (inWaterCourt) {
      if (!cell.dark && localNoise(seedText, cell.row, cell.col, 'water') > 0.32) {
        const topLevel = localNoise(seedText, cell.row, cell.col, 'water-height') > 0.84 ? 2 : 1
        pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'water', random)
        lifted.add(key)
        continue
      }

      if (cell.dark && localNoise(seedText, cell.row, cell.col, 'stepping-stone') > 0.72) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
        lifted.add(key)
        continue
      }
    }

    const d = distance(cell, anchor)

    if (!cell.dark) {
      const courtyard = d >= 3.2
        && d <= Math.max(7, matrix.size * 0.25)
        && localNoise(seedText, cell.row, cell.col, 'courtyard') > 0.86
      if (courtyard) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'stone', random)
        lifted.add(key)
      }
      continue
    }

    const lantern = d >= 4
      && d <= Math.max(8, matrix.size * 0.3)
      && localNoise(seedText, cell.row, cell.col, 'lantern') > 0.965
    if (lantern) {
      const topLevel = 3 + Math.floor(localNoise(seedText, cell.row, cell.col, 'lantern-height') * 3)
      pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'wood', random)
      lifted.add(key)
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'temple',
    'Temple',
    lifted,
    'HORIZONTAL MAIN HALL / GATE / WATER GARDEN / BELL PAVILION / CORRIDORS',
    'courtyard-pad',
  )
}
