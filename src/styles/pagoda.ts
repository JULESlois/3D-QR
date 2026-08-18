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

    // The two lowest eaves extend as cross-shaped cardinal wings. A fourth-ring
    // lip makes the first roof visibly wider than the tower body in isometric view,
    // while clipped corners prevent the footprint from becoming a square pyramid.
    if (ring === 3) return dr <= 1 || dc <= 1
    if (ring === 4) return dr === 0 || dc === 0
    return false
  })
}

function pagodaHeight(cell: QRCell, anchor: QRCell, seedText: string): number {
  const dr = Math.abs(cell.row - anchor.row)
  const dc = Math.abs(cell.col - anchor.col)
  const ring = Math.max(dr, dc)
  const noise = localNoise(seedText, cell.row, cell.col, 'height')

  // A tall central mast plus successively broader lower roofs produces a much more
  // recognizable pagoda silhouette than a smooth stepped pyramid. The height gaps
  // are intentionally large enough that each eave remains legible from the art camera.
  if (ring === 0) return 22
  if (ring === 1) return 17 + Math.round(noise)

  if (ring === 2) {
    const face = dr <= 1 || dc <= 1
    return face ? 13 : 11
  }

  if (ring === 3) return 8
  return 5
}

function pagodaBodyKind(level: number, topLevel: number, ring: number): VoxelKind {
  const nearTop = level >= topLevel - 1

  // Four repeated dark roof bands visually separate the storeys. The central mast
  // remains timber, while pale plaster infill keeps the tower from reading as one
  // monolithic dark block.
  const eaveBand = level === 5 || level === 9 || level === 13 || level === 17 || nearTop
  if (eaveBand) return 'primary'
  if (ring === 0 || level % 4 === 1) return 'wood'
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
  const tone = projectionToneForCell(cell)

  for (let level = 1; level <= topLevel; level += 1) {
    let kind = pagodaBodyKind(level, topLevel, ring)

    // The central column becomes a narrow timber finial above the upper roof. This
    // creates the characteristic vertical needle/so-rin silhouette without adding
    // any geometry outside the QR column or changing its projected polarity.
    if (ring === 0 && level >= 18) {
      kind = level >= 21 ? 'primary' : 'wood'
    }

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

  // The hero tower now has four clearly separated eave bands, a wide cross-shaped
  // first roof, progressively tighter upper storeys and a tall central finial.
  // Every visible top remains on its original QR column with the original polarity.
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
    'FOUR-EAVE HERO PAGODA / CENTRAL FINIAL / LOW FINDER PAVILIONS / TIMING CORRIDORS',
    'courtyard-pad',
  )
}
