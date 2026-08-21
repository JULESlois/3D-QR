import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectionToneForCell,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::pagoda-v2::${salt}::${row}:${col}`) % 10000) / 10000
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
  if (!center) return cell.dark ? 3 : 1

  const ring = Math.max(Math.abs(cell.row - center.row), Math.abs(cell.col - center.col))

  // Finder structures stay deliberately subordinate to the hero pagoda. Their
  // stepped profile suggests low gate pavilions without competing as three towers.
  if (cell.dark) {
    if (ring <= 1) return 6
    if (ring <= 3) return 4
    return 2
  }

  if (ring <= 1) return 3
  if (ring <= 3) return 2
  return 1
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
  return matrix.cells.filter((cell) => {
    if (cell.zone !== 'data') return false

    const dr = Math.abs(cell.row - anchor.row)
    const dc = Math.abs(cell.col - anchor.col)
    const ring = Math.max(dr, dc)

    if (ring <= 2) return true

    // The lowest eave extends farthest along the cardinal axes, with clipped
    // corners so the footprint reads as a hip roof instead of a square pyramid.
    if (ring === 3) return dr <= 1 || dc <= 1
    if (ring === 4) return dr === 0 || dc === 0
    return false
  })
}

interface PagodaLayer {
  level: number
  kind: VoxelKind
}

function pagodaColumnLayers(cell: QRCell, anchor: QRCell): PagodaLayer[] {
  const dr = Math.abs(cell.row - anchor.row)
  const dc = Math.abs(cell.col - anchor.col)
  const ring = Math.max(dr, dc)
  const cardinal = dr === 0 || dc === 0
  const layers = new Map<number, VoxelKind>()

  const fill = (from: number, to: number, kind: VoxelKind | ((level: number) => VoxelKind)): void => {
    for (let level = from; level <= to; level += 1) {
      layers.set(level, typeof kind === 'function' ? kind(level) : kind)
    }
  }

  const timberStorey = (level: number): VoxelKind => level % 3 === 1 ? 'wood' : 'plaster'

  if (ring === 0) {
    // The central spine remains continuous: it visually supports every roof and
    // becomes the narrow timber finial above the fourth storey.
    fill(1, 4, timberStorey)
    fill(5, 6, 'primary')
    fill(7, 8, timberStorey)
    fill(9, 10, 'primary')
    fill(11, 12, timberStorey)
    fill(13, 14, 'primary')
    fill(15, 16, timberStorey)
    fill(17, 17, 'primary')
    fill(18, 20, 'wood')
    fill(21, 22, 'primary')
  } else {
    // Lower posts exist only where they contribute to a believable structural
    // rhythm. The roof slabs themselves are deliberately separated by open air,
    // preventing the old stepped-pyramid mass from returning in isometric view.
    if (ring === 1 || (ring === 2 && cardinal)) fill(1, 4, timberStorey)
    if (ring <= 3 || (ring === 4 && cardinal)) fill(5, ring === 4 ? 5 : 6, 'primary')

    if (ring === 1 || (ring === 2 && cardinal)) fill(7, 8, timberStorey)
    if (ring <= 2) fill(9, 10, 'primary')

    if (ring === 1 || (ring === 2 && cardinal)) fill(11, 12, timberStorey)
    if (ring <= 2) fill(13, 14, 'primary')

    if (ring === 1) {
      fill(15, 16, timberStorey)
      fill(17, 17, 'primary')
    }
  }

  return [...layers.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, kind]) => ({ level, kind }))
}

function pushPagodaColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  cell: QRCell,
  matrixSize: number,
  anchor: QRCell,
  seedText: string,
): number {
  const layers = pagodaColumnLayers(cell, anchor)
  const topLevel = layers.at(-1)?.level ?? 0
  const tone = projectionToneForCell(cell)

  for (const { level, kind } of layers) {
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      kind,
      (localNoise(seedText, cell.row, cell.col, `level-${level}`) * 0.62 + level * 0.047) % 1,
      level === topLevel ? tone : undefined,
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

  // The three QR finder structures become low gate/pavilion complexes. Both
  // polarities rise, but they stay below the first major pagoda eave.
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
  // Dark cells act as taller timber posts; light cells become lower stone walkways.
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
      'LOW FINDER PAVILIONS / TIMING CORRIDORS',
      'courtyard-pad',
    )
  }

  const footprint = pagodaFootprint(matrix, anchor)
  const footprintKeys = new Set(footprint.map((cell) => cellKey(cell.row, cell.col)))

  // The hero tower uses real separated eave slabs: a wide clipped lower hip roof,
  // progressively tighter upper roofs, timber/plaster storeys and a central finial.
  // The open bands between roofs preserve the pagoda silhouette from oblique views.
  for (const cell of footprint) {
    pushPagodaColumn(voxels, cell, matrix.size, anchor, seedText)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Scanner-light data cells around the pagoda become sparse gravel courts and steps.
  for (const cell of matrix.cells) {
    if (cell.dark || cell.zone !== 'data') continue
    const key = cellKey(cell.row, cell.col)
    if (footprintKeys.has(key)) continue

    const d = distance(cell, anchor)
    const court = d >= 4.5
      && d <= Math.max(7.0, matrix.size * 0.23)
      && localNoise(seedText, cell.row, cell.col, 'court') > 0.82

    if (!court) continue

    const topLevel = localNoise(seedText, cell.row, cell.col, 'court-height') > 0.86 ? 2 : 1
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(key)
  }

  // Sparse dark accents become lantern posts around the outer court, kept short so
  // they reinforce scale without competing with the vertical hero silhouette.
  for (const cell of matrix.cells) {
    if (!cell.dark || cell.zone !== 'data') continue
    const key = cellKey(cell.row, cell.col)
    if (footprintKeys.has(key)) continue

    const d = distance(cell, anchor)
    const accent = d >= 5.0
      && d <= Math.max(8.0, matrix.size * 0.29)
      && localNoise(seedText, cell.row, cell.col, 'lantern') > 0.955

    if (!accent) continue

    const topLevel = 3 + Math.floor(localNoise(seedText, cell.row, cell.col, 'lantern-height') * 2)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'wood', random)
    lifted.add(key)
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'pagoda',
    'Pagoda',
    lifted,
    'SEPARATED FOUR-EAVE PAGODA / OPEN STOREY BANDS / CENTRAL FINIAL / LOW FINDER PAVILIONS',
    'courtyard-pad',
  )
}
