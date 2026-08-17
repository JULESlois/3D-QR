import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushProjectedColumn,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function seededCellNoise(cell: Pick<QRCell, 'row' | 'col'>, seedText: string): number {
  return (hashString(`${seedText}::mountain::${cell.row}:${cell.col}`) % 1000) / 999
}

function peakInfluence(
  row: number,
  col: number,
  peakRow: number,
  peakCol: number,
  radius: number,
  sharpness = 1.35,
): number {
  const distance = Math.hypot(row - peakRow, col - peakCol)
  return Math.pow(clamp01(1 - distance / Math.max(0.001, radius)), sharpness)
}

function distanceToSegment(
  row: number,
  col: number,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): number {
  const deltaRow = endRow - startRow
  const deltaCol = endCol - startCol
  const lengthSquared = deltaRow * deltaRow + deltaCol * deltaCol
  if (lengthSquared <= 0.0001) return Math.hypot(row - startRow, col - startCol)

  const projection = clamp01(
    ((row - startRow) * deltaRow + (col - startCol) * deltaCol) / lengthSquared,
  )
  const nearestRow = startRow + deltaRow * projection
  const nearestCol = startCol + deltaCol * projection
  return Math.hypot(row - nearestRow, col - nearestCol)
}

function terrainHeight(cell: QRCell, matrix: QRMatrixData, seedText: string): number {
  const center = (matrix.size - 1) / 2
  const span = Math.max(1, matrix.size - 1)
  const phase = cell.col / span

  // Build one unmistakable alpine massif rather than a generic smooth heightmap:
  // a tall rear-right summit, a lower left companion peak and a narrow connecting
  // ridge create the main silhouette, while a deep foreground valley separates
  // the mass from the low foothills.
  const mainPeakRow = center - matrix.size * 0.12
  const mainPeakCol = center + matrix.size * 0.13
  const secondaryPeakRow = center - matrix.size * 0.03
  const secondaryPeakCol = center - matrix.size * 0.2

  const mainPeak = peakInfluence(
    cell.row,
    cell.col,
    mainPeakRow,
    mainPeakCol,
    Math.max(4.0, matrix.size * 0.25),
    1.55,
  )
  const secondaryPeak = peakInfluence(
    cell.row,
    cell.col,
    secondaryPeakRow,
    secondaryPeakCol,
    Math.max(3.6, matrix.size * 0.23),
    1.45,
  )

  const ridgeDistance = distanceToSegment(
    cell.row,
    cell.col,
    secondaryPeakRow,
    secondaryPeakCol,
    mainPeakRow,
    mainPeakCol,
  )
  const summitRidge = clamp01(
    1 - ridgeDistance / Math.max(1.8, matrix.size * 0.075),
  )

  // Add a second, oblique shoulder so the mountain reads asymmetrically in the
  // isometric camera instead of collapsing into one centered cone.
  const shoulderLine = center
    - matrix.size * 0.18
    + Math.sin(phase * Math.PI * 1.15 + 0.55) * matrix.size * 0.075
  const shoulder = clamp01(
    1 - Math.abs(cell.row - shoulderLine) / Math.max(2.2, matrix.size * 0.12),
  )

  // A curved foreground valley cuts a visible notch across the massif. This
  // makes the two peaks and their saddle legible without changing QR polarity.
  const valleyLine = center
    + matrix.size * 0.2
    + Math.sin(phase * Math.PI * 1.35 + 0.2) * matrix.size * 0.055
  const valley = clamp01(
    1 - Math.abs(cell.row - valleyLine) / Math.max(1.25, matrix.size * 0.05),
  )

  const edgeDistance = Math.min(
    cell.row,
    cell.col,
    matrix.size - 1 - cell.row,
    matrix.size - 1 - cell.col,
  )
  const edgeFeather = 0.32 + clamp01(edgeDistance / Math.max(2, matrix.size * 0.14)) * 0.68

  const noise = seededCellNoise(cell, seedText)
  const jagged = (noise - 0.5) * 1.8
  const leeSlope = clamp01(
    1 - Math.hypot(
      cell.row - (center + matrix.size * 0.08),
      cell.col - (center + matrix.size * 0.24),
    ) / Math.max(3.2, matrix.size * 0.31),
  )

  const relief = (
    mainPeak * 10.8
    + secondaryPeak * 7.3
    + summitRidge * 3.2
    + shoulder * 2.0
    + leeSlope * 1.9
    + jagged
  ) * edgeFeather - valley * 4.2

  let height = Math.max(1, Math.min(14, 1 + Math.round(relief)))

  // Finder regions remain low foothills so they never become three competing
  // corner monuments. Timing cells also stay subordinate to the mountain ridge.
  if (cell.zone === 'finder') height = Math.min(height, 3)
  if (cell.zone === 'timing') height = Math.min(height, 4)

  return height
}

function terrainKind(cell: QRCell, height: number): VoxelKind {
  if (!cell.dark && cell.zone === 'data' && height <= 1) return 'water'
  if (height >= 10) return 'plaster'
  if (height >= 7) return 'stone'
  return 'primary'
}

export function generateMountain(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'mountain')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 3,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  // Every symbol cell participates in one continuous relief surface. Side walls
  // carry forest / rock / snow materials, while pushProjectedColumn() restores
  // the exact scanner polarity on the visible top face of every QR cell.
  for (const cell of matrix.cells) {
    const height = terrainHeight(cell, matrix, seedText)
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      height,
      terrainKind(cell, height),
      random,
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'mountain',
    'Mountain',
    lifted,
    'TWIN ALPINE SUMMITS / CONNECTING RIDGE / CUT VALLEY',
    'full-pad',
  )
}
