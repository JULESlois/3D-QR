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

function meltwaterInfluence(cell: Pick<QRCell, 'row' | 'col'>, matrix: QRMatrixData): number {
  const center = (matrix.size - 1) / 2
  const upperRow = center - matrix.size * 0.035
  const upperCol = center + matrix.size * 0.115
  const bendRow = center + matrix.size * 0.095
  const bendCol = center + matrix.size * 0.045
  const lowerRow = center + matrix.size * 0.31
  const lowerCol = center - matrix.size * 0.075
  const width = Math.max(0.78, matrix.size * 0.028)

  const upperDistance = distanceToSegment(
    cell.row,
    cell.col,
    upperRow,
    upperCol,
    bendRow,
    bendCol,
  )
  const lowerDistance = distanceToSegment(
    cell.row,
    cell.col,
    bendRow,
    bendCol,
    lowerRow,
    lowerCol,
  )

  return clamp01(1 - Math.min(upperDistance, lowerDistance) / width)
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

  // Windward snow builds a narrow cornice immediately above the summit ridge,
  // while the opposite side is cut back into a steep exposed rock face. The
  // stepped height contrast reads as a sharp alpine crest from the art camera
  // without introducing any non-QR geometry or unsupported overhangs.
  const crestSide = clamp01(
    0.5 + (mainPeakRow - cell.row) / Math.max(1.4, matrix.size * 0.08),
  )
  const cornice = summitRidge * crestSide
  const cliffSide = clamp01(
    0.42 + (cell.col - mainPeakCol) / Math.max(1.6, matrix.size * 0.1),
  )
  const cliffFace = mainPeak * cliffSide * (0.55 + summitRidge * 0.45)

  // A narrow meltwater gorge leaves the glacial bowl below the main summit, cuts
  // diagonally through the exposed face, then bends toward the foreground valley.
  // The carve is intentionally strongest on the main massif so it reads as a real
  // ravine instead of a decorative blue stripe painted over an unchanged heightmap.
  const meltwater = meltwaterInfluence(cell, matrix)
  const downstream = clamp01(
    (cell.row - (center - matrix.size * 0.06)) / Math.max(1, matrix.size * 0.34),
  )
  const gorgeCut = meltwater * (1.35 + mainPeak * 2.7 + downstream * 0.9)

  const relief = (
    mainPeak * 10.8
    + secondaryPeak * 7.3
    + summitRidge * 3.2
    + shoulder * 2.0
    + leeSlope * 1.9
    + cornice * 2.35
    + jagged
  ) * edgeFeather - valley * 4.2 - cliffFace * 2.65 - gorgeCut

  let height = Math.max(1, Math.min(14, 1 + Math.round(relief)))

  // Finder regions remain low foothills so they never become three competing
  // corner monuments. Timing cells also stay subordinate to the mountain ridge.
  if (cell.zone === 'finder') height = Math.min(height, 3)
  if (cell.zone === 'timing') height = Math.min(height, 4)

  return height
}

function terrainKind(
  cell: QRCell,
  height: number,
  matrix: QRMatrixData,
  seedText: string,
): VoxelKind {
  if (!cell.dark && cell.zone === 'data' && height <= 1) return 'water'

  const center = (matrix.size - 1) / 2
  const phase = cell.col / Math.max(1, matrix.size - 1)
  const noise = seededCellNoise(cell, `${seedText}::material`)
  const meltwater = meltwaterInfluence(cell, matrix)
  const belowGlacialBowl = cell.row >= center - matrix.size * 0.055

  // The carved channel becomes a genuine material feature: dark and light QR cells
  // both use the paired water ramp, so the stream can remain blue while preserving
  // scanner polarity. The shoulders stay exposed stone to frame the cascade.
  if (cell.zone === 'data' && belowGlacialBowl && meltwater > 0.56 && height <= 9) {
    return 'water'
  }
  if (cell.zone === 'data' && belowGlacialBowl && meltwater > 0.22 && height >= 4) {
    return 'stone'
  }

  // Keep snow concentrated on the upper windward face instead of painting every
  // high voxel white. A wavering snowline plus exposed vertical scars produces
  // three readable material bands: wooded foothill, rock wall and snow cap.
  const snowLine = 8.35
    + Math.sin(phase * Math.PI * 2.1 + 0.45) * 0.8
    + (cell.row - center) / Math.max(10, matrix.size) * 1.25
  const windward = cell.col <= center + matrix.size * 0.2
  if (height >= snowLine && (windward || noise > 0.36)) return 'plaster'

  const rockScar = Math.sin(cell.row * 0.72 + cell.col * 0.31) * 0.5 + 0.5
  if (height >= 6 && (rockScar > 0.34 || !windward)) return 'stone'
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
  // carry forest / rock / snow / meltwater materials, while pushProjectedColumn()
  // restores the exact scanner polarity on the visible top face of every QR cell.
  for (const cell of matrix.cells) {
    const height = terrainHeight(cell, matrix, seedText)
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      height,
      terrainKind(cell, height, matrix, seedText),
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
    'TWIN ALPINE SUMMITS / GLACIAL BOWL / MELTWATER GORGE / ROCK FACE / CUT VALLEY',
    'full-pad',
  )
}
