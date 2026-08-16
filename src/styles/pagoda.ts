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

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::pagoda::${salt}::${row}:${col}`) % 10000) / 10000
}

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function finderCenter(cell: QRCell, size: number): { row: number; col: number } | null {
  if (cell.row <= 7 && cell.col <= 7) return { row: 3, col: 3 }
  if (cell.row <= 7 && cell.col >= size - 8) return { row: 3, col: size - 4 }
  if (cell.row >= size - 8 && cell.col <= 7) return { row: size - 4, col: 3 }
  return null
}

function pavilionHeight(cell: QRCell, size: number): number {
  const center = finderCenter(cell, size)
  if (!center) return cell.dark ? 4 : 2

  const ring = Math.max(Math.abs(cell.row - center.row), Math.abs(cell.col - center.col))

  if (cell.dark) {
    if (ring <= 1) return 9
    if (ring <= 3) return 6
    return 3
  }

  if (ring <= 1) return 5
  if (ring <= 3) return 4
  return 2
}

function chooseMainAnchor(matrix: QRMatrixData, seedText: string): QRCell | undefined {
  const center = (matrix.size - 1) / 2
  const dataCells = matrix.cells.filter((cell) => cell.zone === 'data')

  return [...dataCells].sort((a, b) => {
    const score = (cell: QRCell): number => (
      Math.hypot(cell.row - center, cell.col - center)
      - (cell.dark ? 0.45 : 0)
      - localNoise(seedText, cell.row, cell.col, 'anchor') * 0.18
    )
    return score(a) - score(b)
  })[0]
}

function pagodaFootprint(matrix: QRMatrixData, anchor: QRCell): QRCell[] {
  return matrix.cells.filter((cell) => (
    cell.zone === 'data'
    && Math.abs(cell.row - anchor.row) <= 2
    && Math.abs(cell.col - anchor.col) <= 2
  ))
}

function pagodaHeight(cell: QRCell, anchor: QRCell, seedText: string): number {
  const ring = Math.max(Math.abs(cell.row - anchor.row), Math.abs(cell.col - anchor.col))
  const noise = localNoise(seedText, cell.row, cell.col, 'height')

  if (ring === 0) return 15
  if (ring === 1) return 10 + Math.round(noise * 2)
  return 6 + Math.round(noise * 2)
}

function pagodaBodyKind(level: number, topLevel: number, ring: number): VoxelKind {
  const nearTop = level >= topLevel - 1
  const eaveBand = level > 1 && (level % 4 === 0 || nearTop)

  if (eaveBand) return 'primary'
  if (ring === 0 || level % 3 === 1) return 'wood'
  return 'plaster'
}

function pushPagodaColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  cell: QRCell,
  matrixSize: number,
  anchor: QRCell,
  seedText: string,
): number {
  const topLevel = pagodaHeight(cell, anchor, seedText)
  const ring = Math.max(Math.abs(cell.row - anchor.row), Math.abs(cell.col - anchor.col))

  for (let level = 1; level <= topLevel; level += 1) {
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      level === topLevel ? projectedCapKind(cell) : pagodaBodyKind(level, topLevel, ring),
      (localNoise(seedText, cell.row, cell.col, `level-${level}`) * 0.62 + level * 0.047) % 1,
    )
  }

  return topLevel
}

export function generatePagoda(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'pagoda')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 1,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  // The three QR finder structures become secondary gate/pavilion complexes.
  // Both polarities rise, but each column keeps its original scanner-facing cap.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const topLevel = pavilionHeight(cell, matrix.size)
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      topLevel,
      cell.dark ? 'wood' : 'plaster',
      random,
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Timing cells read as an ordered covered corridor / approach path in art view.
  // Dark cells act as taller timber posts; light cells become lower pale walkways.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'timing')) {
    const topLevel = cell.dark ? 4 : 2
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      topLevel,
      cell.dark ? 'wood' : 'stone',
      random,
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  const anchor = chooseMainAnchor(matrix, seedText)
  if (!anchor) {
    return finalizeSculpture(
      matrix,
      voxels,
      'pagoda',
      'Pagoda',
      lifted,
      'FINDER PAVILIONS / TIMING CORRIDORS',
      'courtyard-pad',
    )
  }

  const footprint = pagodaFootprint(matrix, anchor)
  const footprintKeys = new Set(footprint.map((cell) => cellKey(cell.row, cell.col)))

  // One coherent five-by-five-ish main pagoda intentionally crosses light and dark
  // data cells. Its stepped height field creates stacked eaves in isometric view.
  for (const cell of footprint) {
    pushPagodaColumn(voxels, cell, matrix.size, anchor, seedText)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Scanner-light data cells around the pagoda become gravel courts and stone steps.
  // They remain intentionally sparse so the main vertical silhouette stays legible.
  for (const cell of matrix.cells) {
    if (cell.dark || cell.zone !== 'data') continue
    const key = cellKey(cell.row, cell.col)
    if (footprintKeys.has(key)) continue

    const d = distance(cell, anchor)
    const court = d >= 2.8
      && d <= Math.max(5.2, matrix.size * 0.19)
      && localNoise(seedText, cell.row, cell.col, 'court') > 0.76

    if (!court) continue

    const topLevel = localNoise(seedText, cell.row, cell.col, 'court-height') > 0.84 ? 2 : 1
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(key)
  }

  // A few dark data cells outside the main tower become lantern/pavilion accents.
  for (const cell of matrix.cells) {
    if (!cell.dark || cell.zone !== 'data') continue
    const key = cellKey(cell.row, cell.col)
    if (footprintKeys.has(key)) continue

    const d = distance(cell, anchor)
    const accent = d >= 3.5
      && d <= Math.max(7, matrix.size * 0.27)
      && localNoise(seedText, cell.row, cell.col, 'lantern') > 0.93

    if (!accent) continue

    const topLevel = 3 + Math.floor(localNoise(seedText, cell.row, cell.col, 'lantern-height') * 3)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'wood', random)
    lifted.add(key)
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'pagoda',
    'Pagoda',
    lifted,
    'MIXED-POLARITY MAIN PAGODA / FINDER PAVILIONS / TIMING CORRIDORS',
    'courtyard-pad',
  )
}
