import type { DarkModule, QRMatrixData } from './qr'

export const CELL_SIZE = 0.245
export const QUIET_ZONE = 4

export type VoxelKind =
  | 'floor-light'
  | 'floor-dark'
  | 'primary'
  | 'qr-top'
  | 'wood'
  | 'stone'
  | 'plaster'
  | 'glass'

export type ProjectionStrategy = 'full-pad' | 'site-window' | 'dark-field' | 'object-only'
export type BaseFieldMode = 'full-pad' | 'symbol-pad' | 'dark-only' | 'window' | 'none'

export interface BaseFieldProfile {
  mode: BaseFieldMode
  quietZone?: number
  window?: {
    centerRow?: number
    centerCol?: number
    halfRows: number
    halfCols: number
  }
}

export interface SculptureVoxel {
  x: number
  y: number
  z: number
  row: number
  col: number
  kind: VoxelKind
  colorPhase: number
}

export interface SculptureBuild {
  styleId: string
  styleLabel: string
  detail?: string
  projection: ProjectionStrategy
  voxels: SculptureVoxel[]
  footprint: number
  maxHeight: number
  pivotY: number
  liftedModuleCount: number
  baseDarkCount: number
  baseLightCount: number
  /** @deprecated Use baseDarkCount. Kept for compatibility with older UI code. */
  groundDarkCount: number
}

export interface GenerationContext {
  matrix: QRMatrixData
  seedText: string
  center: number
  random: () => number
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createSeededRandom(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createGenerationContext(
  matrix: QRMatrixData,
  seedText: string,
  styleId: string,
): GenerationContext {
  return {
    matrix,
    seedText,
    center: (matrix.size - 1) / 2,
    random: createSeededRandom(hashString(`${seedText}::${styleId}`)),
  }
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function positionForCell(row: number, col: number, matrixSize: number): { x: number; z: number } {
  const center = (matrixSize - 1) / 2
  return {
    x: (col - center) * CELL_SIZE,
    z: (row - center) * CELL_SIZE,
  }
}

function baseVoxel(
  context: GenerationContext,
  row: number,
  col: number,
  kind: 'floor-light' | 'floor-dark',
): SculptureVoxel {
  const { center, random } = context
  return {
    x: (col - center) * CELL_SIZE,
    y: 0,
    z: (row - center) * CELL_SIZE,
    row,
    col,
    kind,
    colorPhase: kind === 'floor-dark' ? random() : 0,
  }
}

export function createBaseVoxels(
  context: GenerationContext,
  profile: BaseFieldProfile = { mode: 'full-pad' },
): SculptureVoxel[] {
  const { matrix } = context
  const voxels: SculptureVoxel[] = []

  if (profile.mode === 'none') return voxels

  if (profile.mode === 'dark-only') {
    for (const module of matrix.darkModules) {
      voxels.push(baseVoxel(context, module.row, module.col, 'floor-dark'))
    }
    return voxels
  }

  if (profile.mode === 'window') {
    const window = profile.window
    if (!window) throw new Error('Window base mode requires window bounds.')

    const centerRow = window.centerRow ?? (matrix.size - 1) / 2
    const centerCol = window.centerCol ?? (matrix.size - 1) / 2

    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) {
        const cell = matrix.cells[row * matrix.size + col]
        const insideWindow = Math.abs(row - centerRow) <= window.halfRows
          && Math.abs(col - centerCol) <= window.halfCols

        // The local site keeps both light and dark cells. Outside it, only real dark
        // QR modules remain as sparse pavers so empty page background supplies light cells.
        if (insideWindow || cell.dark) {
          voxels.push(baseVoxel(context, row, col, cell.dark ? 'floor-dark' : 'floor-light'))
        }
      }
    }
    return voxels
  }

  const quietZone = profile.mode === 'full-pad' ? (profile.quietZone ?? QUIET_ZONE) : 0
  const start = profile.mode === 'full-pad' ? -quietZone : 0
  const end = profile.mode === 'full-pad' ? matrix.size + quietZone : matrix.size

  for (let row = start; row < end; row += 1) {
    for (let col = start; col < end; col += 1) {
      const inside = row >= 0 && row < matrix.size && col >= 0 && col < matrix.size
      const cell = inside ? matrix.cells[row * matrix.size + col] : null
      voxels.push(baseVoxel(context, row, col, cell?.dark ? 'floor-dark' : 'floor-light'))
    }
  }

  return voxels
}

export function pushVoxel(
  voxels: SculptureVoxel[],
  module: DarkModule,
  matrixSize: number,
  level: number,
  kind: VoxelKind,
  colorPhase: number,
): void {
  const { x, z } = positionForCell(module.row, module.col, matrixSize)
  voxels.push({
    x,
    y: level * CELL_SIZE,
    z,
    row: module.row,
    col: module.col,
    kind,
    colorPhase,
  })
}

export function pushSolidColumn(
  voxels: SculptureVoxel[],
  module: DarkModule,
  matrixSize: number,
  fromLevel: number,
  toLevel: number,
  bodyKind: VoxelKind,
  random: () => number,
  capKind: VoxelKind = 'qr-top',
): void {
  const start = Math.max(1, Math.floor(fromLevel))
  const end = Math.max(start, Math.floor(toLevel))

  for (let level = start; level <= end; level += 1) {
    pushVoxel(
      voxels,
      module,
      matrixSize,
      level,
      level === end ? capKind : bodyKind,
      (random() * 0.72 + level * 0.041) % 1,
    )
  }
}

function validateProjectionInvariant(voxels: SculptureVoxel[], matrix: QRMatrixData): void {
  const topByColumn = new Map<string, SculptureVoxel>()

  for (const voxel of voxels) {
    const inside = voxel.row >= 0
      && voxel.row < matrix.size
      && voxel.col >= 0
      && voxel.col < matrix.size

    if (!inside) {
      if (voxel.y !== 0 || voxel.kind !== 'floor-light') {
        throw new Error('Only scanner-light base voxels may occupy the quiet zone.')
      }
      continue
    }

    const cell = matrix.cells[voxel.row * matrix.size + voxel.col]
    if (!cell.dark && (voxel.y > 0 || voxel.kind !== 'floor-light')) {
      throw new Error(`Style generator occluded light QR module ${voxel.row}:${voxel.col}.`)
    }

    const key = cellKey(voxel.row, voxel.col)
    const existing = topByColumn.get(key)
    if (!existing || voxel.y > existing.y) topByColumn.set(key, voxel)
  }

  for (const cell of matrix.cells) {
    const top = topByColumn.get(cellKey(cell.row, cell.col))

    if (cell.dark) {
      if (!top) {
        throw new Error(`Style generator omitted dark QR module ${cell.row}:${cell.col}.`)
      }
      if (top.kind !== 'floor-dark' && top.kind !== 'qr-top') {
        throw new Error(`QR column ${cell.row}:${cell.col} is missing a scanner-dark top surface.`)
      }
    } else if (top && top.kind !== 'floor-light') {
      throw new Error(`Light QR module ${cell.row}:${cell.col} projects as a dark surface.`)
    }
  }
}

export function finalizeSculpture(
  matrix: QRMatrixData,
  voxels: SculptureVoxel[],
  styleId: string,
  styleLabel: string,
  liftedModules: ReadonlySet<string>,
  detail?: string,
  projection: ProjectionStrategy = 'full-pad',
): SculptureBuild {
  validateProjectionInvariant(voxels, matrix)

  let maxHeight = CELL_SIZE
  let baseDarkCount = 0
  let baseLightCount = 0

  for (const voxel of voxels) {
    maxHeight = Math.max(maxHeight, voxel.y + CELL_SIZE)
    if (voxel.y === 0 && voxel.kind === 'floor-dark') baseDarkCount += 1
    if (voxel.y === 0 && voxel.kind === 'floor-light') baseLightCount += 1
  }

  // Even styles with no physical quiet-zone plate need composition space around the
  // machine-readable projection so the page background can act as the quiet zone.
  const projectionFootprint = (matrix.size + QUIET_ZONE * 2) * CELL_SIZE

  return {
    styleId,
    styleLabel,
    detail,
    projection,
    voxels,
    footprint: projectionFootprint,
    maxHeight,
    pivotY: maxHeight * 0.44,
    liftedModuleCount: liftedModules.size,
    baseDarkCount,
    baseLightCount,
    groundDarkCount: baseDarkCount,
  }
}
