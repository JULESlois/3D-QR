import './palette-defaults'
import type { DarkModule, QRCell, QRMatrixData } from './qr'

export const CELL_SIZE = 0.245
export const QUIET_ZONE = 4

export type VoxelKind =
  | 'floor-light'
  | 'floor-dark'
  /** @deprecated Scanner polarity belongs in projectionTone; generated builds reject this tag. */
  | 'light-top'
  | 'foundation'
  | 'primary'
  /** @deprecated Scanner polarity belongs in projectionTone; generated builds reject this tag. */
  | 'qr-top'
  | 'wood'
  | 'stone'
  | 'plaster'
  | 'glass'
  | 'water'
  | 'crystal'

export type ProjectionTone = 'dark' | 'light'

export type ProjectionStrategy =
  | 'full-pad'
  | 'courtyard-pad'
  | 'stone-plinth'
  | 'display-plaque'
  | 'mineral-slab'
  | 'free-standing-glyph'
export type BaseFieldMode = 'full-pad' | 'symbol-pad' | 'dark-only' | 'window' | 'none'

export interface BaseFieldProfile {
  mode: BaseFieldMode
  quietZone?: number
  /** Total platform thickness in voxel layers, including the scanner-facing top layer. */
  thickness?: number
  foundationKind?: VoxelKind
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
  /**
   * QR polarity of this visible surface. It deliberately does not replace material kind:
   * water stays water, stone stays stone, foliage stays primary, etc. The paired scene
   * palettes use this tone to select a darker or lighter variant of the same material.
   */
  projectionTone?: ProjectionTone
}

export interface SculptureBuild {
  styleId: string
  styleLabel: string
  detail?: string
  projection: ProjectionStrategy
  voxels: SculptureVoxel[]
  /** Scanner-safe composition footprint, including an implied four-module quiet zone. */
  footprint: number
  /** Physical X/Z footprint of geometry that actually exists. */
  physicalFootprint: number
  maxHeight: number
  pivotY: number
  liftedModuleCount: number
  baseDarkCount: number
  baseLightCount: number
  foundationVoxelCount: number
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

export function projectionToneForCell(cell: Pick<QRCell, 'dark'>): ProjectionTone {
  return cell.dark ? 'dark' : 'light'
}

/**
 * @deprecated Function-zone height caps are no longer part of the QR projection contract.
 * Kept temporarily so older scene generators can migrate without breaking; callers should
 * treat zone metadata as composition information rather than a scanner-height restriction.
 */
export function maxProjectionLevelForCell(_cell: Pick<QRCell, 'zone'>): number | undefined {
  return undefined
}

function toneBiasedColorPhase(colorPhase: number, tone: ProjectionTone): number {
  const phase = Math.max(0, Math.min(0.999999, colorPhase))
  return tone === 'dark'
    ? phase * 0.5
    : 0.5 + phase * 0.5
}

function makeBaseVoxel(
  context: GenerationContext,
  row: number,
  col: number,
  y: number,
  kind: VoxelKind,
): SculptureVoxel {
  const { center, random } = context
  const projectionTone = kind === 'floor-dark'
    ? 'dark'
    : kind === 'floor-light'
      ? 'light'
      : undefined
  const rawPhase = kind === 'floor-light' ? 0 : random()

  return {
    x: (col - center) * CELL_SIZE,
    y,
    z: (row - center) * CELL_SIZE,
    row,
    col,
    kind,
    colorPhase: projectionTone ? toneBiasedColorPhase(rawPhase, projectionTone) : rawPhase,
    projectionTone,
  }
}

export function createBaseVoxels(
  context: GenerationContext,
  profile: BaseFieldProfile = { mode: 'full-pad' },
): SculptureVoxel[] {
  const { matrix } = context
  const voxels: SculptureVoxel[] = []
  const thickness = Math.max(1, Math.floor(profile.thickness ?? 1))
  const foundationKind = profile.foundationKind ?? 'foundation'

  if (profile.mode === 'none') return voxels

  const addBaseCell = (row: number, col: number, kind: 'floor-light' | 'floor-dark'): void => {
    voxels.push(makeBaseVoxel(context, row, col, 0, kind))
    for (let layer = 1; layer < thickness; layer += 1) {
      voxels.push(makeBaseVoxel(context, row, col, -layer * CELL_SIZE, foundationKind))
    }
  }

  if (profile.mode === 'dark-only') {
    for (const module of matrix.darkModules) {
      addBaseCell(module.row, module.col, 'floor-dark')
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

        if (insideWindow || cell.dark) {
          addBaseCell(row, col, cell.dark ? 'floor-dark' : 'floor-light')
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
      addBaseCell(row, col, cell?.dark ? 'floor-dark' : 'floor-light')
    }
  }

  return voxels
}

export function pushCellVoxel(
  voxels: SculptureVoxel[],
  cell: Pick<QRCell, 'row' | 'col'>,
  matrixSize: number,
  level: number,
  kind: VoxelKind,
  colorPhase: number,
  projectionTone?: ProjectionTone,
): void {
  const { x, z } = positionForCell(cell.row, cell.col, matrixSize)
  voxels.push({
    x,
    y: level * CELL_SIZE,
    z,
    row: cell.row,
    col: cell.col,
    kind,
    colorPhase: projectionTone ? toneBiasedColorPhase(colorPhase, projectionTone) : colorPhase,
    projectionTone,
  })
}

export function pushVoxel(
  voxels: SculptureVoxel[],
  module: DarkModule,
  matrixSize: number,
  level: number,
  kind: VoxelKind,
  colorPhase: number,
  projectionTone?: ProjectionTone,
): void {
  pushCellVoxel(voxels, module, matrixSize, level, kind, colorPhase, projectionTone)
}

export function pushProjectedColumn(
  voxels: SculptureVoxel[],
  cell: QRCell,
  matrixSize: number,
  fromLevel: number,
  toLevel: number,
  bodyKind: VoxelKind,
  random: () => number,
): void {
  const start = Math.max(1, Math.floor(fromLevel))
  const end = Math.max(start, Math.floor(toLevel))
  const tone = projectionToneForCell(cell)

  for (let level = start; level <= end; level += 1) {
    pushCellVoxel(
      voxels,
      cell,
      matrixSize,
      level,
      bodyKind,
      (random() * 0.72 + level * 0.041) % 1,
      level === end ? tone : undefined,
    )
  }
}

export function pushSolidColumn(
  voxels: SculptureVoxel[],
  module: DarkModule,
  matrixSize: number,
  fromLevel: number,
  toLevel: number,
  bodyKind: VoxelKind,
  random: () => number,
  capKind: VoxelKind = bodyKind,
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
      level === end ? 'dark' : undefined,
    )
  }
}

function isLegacyScannerCap(kind: VoxelKind): kind is 'qr-top' | 'light-top' {
  return kind === 'qr-top' || kind === 'light-top'
}

function canonicalizeVoxelOccupancy(voxels: SculptureVoxel[]): SculptureVoxel[] {
  const occupied = new Map<string, SculptureVoxel>()

  for (const voxel of voxels) {
    const level = Math.round(voxel.y / CELL_SIZE)
    const key = `${voxel.row}:${voxel.col}:${level}`
    const existing = occupied.get(key)

    if (!existing) {
      occupied.set(key, voxel)
      continue
    }

    const existingTone = existing.projectionTone
    const incomingTone = voxel.projectionTone

    if (existingTone && incomingTone && existingTone !== incomingTone) {
      throw new Error(
        `Conflicting projection tones occupy QR column ${voxel.row}:${voxel.col}, level ${level}.`,
      )
    }

    // A scanner-facing surface wins an overlap, but it keeps its semantic material.
    // Ordinary body geometry still uses the later-builder-wins rule.
    if (incomingTone || !existingTone) occupied.set(key, voxel)
  }

  return Array.from(occupied.values())
}

function validateProjectionInvariant(voxels: SculptureVoxel[], matrix: QRMatrixData): void {
  const topByColumn = new Map<string, SculptureVoxel>()

  for (const voxel of voxels) {
    if (isLegacyScannerCap(voxel.kind)) {
      throw new Error(
        `Legacy scanner-cap material ${voxel.kind} reached final geometry at ${voxel.row}:${voxel.col}; preserve the semantic material and set projectionTone instead.`,
      )
    }

    const inside = voxel.row >= 0
      && voxel.row < matrix.size
      && voxel.col >= 0
      && voxel.col < matrix.size

    // Keep the external quiet zone conservative. Inside the QR symbol both light
    // and dark cells may rise into semantic geometry; only their visible tone matters.
    if (!inside && voxel.y > 0) {
      throw new Error('Elevated geometry may not occupy the QR quiet zone.')
    }

    const key = cellKey(voxel.row, voxel.col)
    const existing = topByColumn.get(key)
    if (!existing || voxel.y > existing.y) topByColumn.set(key, voxel)
  }

  for (const cell of matrix.cells) {
    const top = topByColumn.get(cellKey(cell.row, cell.col))

    if (!top) {
      if (cell.dark) {
        throw new Error(`Style generator omitted dark QR module ${cell.row}:${cell.col}.`)
      }
      continue
    }

    const expectedTone = projectionToneForCell(cell)
    if (top.projectionTone !== expectedTone) {
      throw new Error(
        `QR column ${cell.row}:${cell.col} exposes ${top.kind} with ${top.projectionTone ?? 'no'} projection tone; expected ${expectedTone}.`,
      )
    }
  }

  for (const top of topByColumn.values()) {
    const inside = top.row >= 0
      && top.row < matrix.size
      && top.col >= 0
      && top.col < matrix.size

    if (!inside && (top.kind !== 'floor-light' || top.projectionTone !== 'light')) {
      throw new Error('The visible surface of a physical quiet-zone platform must remain light floor material.')
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
  const canonicalVoxels = canonicalizeVoxelOccupancy(voxels)
  validateProjectionInvariant(canonicalVoxels, matrix)

  let maxHeight = CELL_SIZE
  let baseDarkCount = 0
  let baseLightCount = 0
  let foundationVoxelCount = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const voxel of canonicalVoxels) {
    maxHeight = Math.max(maxHeight, voxel.y + CELL_SIZE)
    minX = Math.min(minX, voxel.x)
    maxX = Math.max(maxX, voxel.x)
    minZ = Math.min(minZ, voxel.z)
    maxZ = Math.max(maxZ, voxel.z)
    if (voxel.y === 0 && voxel.kind === 'floor-dark') baseDarkCount += 1
    if (voxel.y === 0 && voxel.kind === 'floor-light') baseLightCount += 1
    if (voxel.y < 0) foundationVoxelCount += 1
  }

  const projectionFootprint = (matrix.size + QUIET_ZONE * 2) * CELL_SIZE
  const physicalFootprint = Number.isFinite(minX)
    ? Math.max(maxX - minX, maxZ - minZ) + CELL_SIZE
    : matrix.size * CELL_SIZE

  return {
    styleId,
    styleLabel,
    detail,
    projection,
    voxels: canonicalVoxels,
    footprint: projectionFootprint,
    physicalFootprint,
    maxHeight,
    pivotY: maxHeight * 0.44,
    liftedModuleCount: liftedModules.size,
    baseDarkCount,
    baseLightCount,
    foundationVoxelCount,
    groundDarkCount: baseDarkCount,
  }
}
