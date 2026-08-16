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
  voxels: SculptureVoxel[]
  footprint: number
  maxHeight: number
  pivotY: number
  liftedModuleCount: number
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

export function createBaseVoxels(context: GenerationContext): SculptureVoxel[] {
  const { matrix, random, center } = context
  const voxels: SculptureVoxel[] = []

  for (let row = -QUIET_ZONE; row < matrix.size + QUIET_ZONE; row += 1) {
    for (let col = -QUIET_ZONE; col < matrix.size + QUIET_ZONE; col += 1) {
      const inside = row >= 0 && row < matrix.size && col >= 0 && col < matrix.size
      const cell = inside ? matrix.cells[row * matrix.size + col] : null

      voxels.push({
        x: (col - center) * CELL_SIZE,
        y: 0,
        z: (row - center) * CELL_SIZE,
        row,
        col,
        kind: cell?.dark ? 'floor-dark' : 'floor-light',
        colorPhase: cell?.dark ? random() : 0,
      })
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
    if (voxel.y <= 0) continue

    if (voxel.row < 0 || voxel.row >= matrix.size || voxel.col < 0 || voxel.col >= matrix.size) {
      throw new Error('Style generator placed elevated geometry inside the quiet zone.')
    }

    const cell = matrix.cells[voxel.row * matrix.size + voxel.col]
    if (!cell.dark) {
      throw new Error(`Style generator occluded light QR module ${voxel.row}:${voxel.col}.`)
    }

    const key = cellKey(voxel.row, voxel.col)
    const existing = topByColumn.get(key)
    if (!existing || voxel.y > existing.y) topByColumn.set(key, voxel)
  }

  for (const top of topByColumn.values()) {
    if (top.kind !== 'qr-top') {
      throw new Error(`Elevated QR column ${top.row}:${top.col} is missing a scanner-dark cap.`)
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
): SculptureBuild {
  validateProjectionInvariant(voxels, matrix)

  let maxHeight = CELL_SIZE
  for (const voxel of voxels) maxHeight = Math.max(maxHeight, voxel.y + CELL_SIZE)

  return {
    styleId,
    styleLabel,
    detail,
    voxels,
    footprint: (matrix.size + QUIET_ZONE * 2) * CELL_SIZE,
    maxHeight,
    pivotY: maxHeight * 0.44,
    liftedModuleCount: liftedModules.size,
    groundDarkCount: matrix.darkModules.length - liftedModules.size,
  }
}
