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

function terrainHeight(cell: QRCell, matrix: QRMatrixData, seedText: string): number {
  const center = (matrix.size - 1) / 2
  const span = Math.max(1, matrix.size - 1)
  const phase = cell.col / span

  // The dominant ridge sweeps sideways across the symbol rather than centering
  // three independent peaks on the finder regions.
  const ridgeLine = center
    - Math.sin(phase * Math.PI * 1.65 - 0.35) * matrix.size * 0.09
  const ridgeDistance = Math.abs(cell.row - ridgeLine)
  const ridge = clamp01(1 - ridgeDistance / Math.max(2.4, matrix.size * 0.21))

  const summitDistance = Math.hypot(
    cell.row - (center - matrix.size * 0.08),
    cell.col - (center + matrix.size * 0.1),
  )
  const summit = clamp01(1 - summitDistance / Math.max(3.4, matrix.size * 0.25))

  const shoulderDistance = Math.hypot(
    cell.row - (center + matrix.size * 0.16),
    cell.col - (center - matrix.size * 0.2),
  )
  const shoulder = clamp01(1 - shoulderDistance / Math.max(3.2, matrix.size * 0.28))

  const valleyLine = center
    + matrix.size * 0.23
    + Math.sin(phase * Math.PI * 1.2 + 0.4) * matrix.size * 0.045
  const valley = clamp01(
    1 - Math.abs(cell.row - valleyLine) / Math.max(1.3, matrix.size * 0.055),
  )

  const edgeDistance = Math.min(
    cell.row,
    cell.col,
    matrix.size - 1 - cell.row,
    matrix.size - 1 - cell.col,
  )
  const edgeFeather = 0.42 + clamp01(edgeDistance / Math.max(2, matrix.size * 0.13)) * 0.58
  const noise = seededCellNoise(cell, seedText)

  const relief = (
    ridge * 5.5
    + summit * 5.0
    + shoulder * 2.6
    + noise * 1.65
  ) * edgeFeather - valley * 2.7

  let height = Math.max(1, Math.min(12, 1 + Math.round(relief)))

  // Finder regions read as low alpine foothills and lakes instead of turning
  // into the same three-corner tower grammar used by older scene types.
  if (cell.zone === 'finder') height = Math.min(height, 3)
  if (cell.zone === 'timing') height = Math.min(height, 4)

  return height
}

function terrainKind(cell: QRCell, height: number): VoxelKind {
  if (!cell.dark && cell.zone === 'data' && height <= 1) return 'water'
  if (height >= 9) return 'plaster'
  if (height >= 6) return 'stone'
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

  // Every symbol cell participates in one continuous relief surface. The side
  // walls carry forest / rock / snow materials, while the highest cap preserves
  // the original scanner polarity through pushProjectedColumn().
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
    'FULL-MATRIX RELIEF / LOW FINDER FOOTHILLS / ALPINE RIDGE',
    'full-pad',
  )
}
