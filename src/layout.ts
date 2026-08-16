import type { DarkModule, QRMatrixData } from './qr'

export const CELL_SIZE = 0.245
export const QUIET_ZONE = 4

export type VoxelKind =
  | 'floor-light'
  | 'floor-dark'
  | 'trunk'
  | 'canopy'
  | 'canopy-top'

export interface SculptureVoxel {
  x: number
  y: number
  z: number
  kind: VoxelKind
  colorPhase: number
}

export interface SculptureBuild {
  voxels: SculptureVoxel[]
  footprint: number
  maxHeight: number
  pivotY: number
  treeModuleCount: number
  groundDarkCount: number
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function pickTrunkModules(modules: DarkModule[], center: number): Set<string> {
  const sorted = [...modules].sort((a, b) => {
    const da = (a.row - center) ** 2 + (a.col - center) ** 2
    const db = (b.row - center) ** 2 + (b.col - center) ** 2
    return da - db
  })

  const picked: DarkModule[] = []
  for (const module of sorted) {
    if (picked.every((candidate) => Math.hypot(candidate.row - module.row, candidate.col - module.col) >= 1.45)) {
      picked.push(module)
    }
    if (picked.length >= 2) break
  }

  if (picked.length < 2) {
    for (const module of sorted) {
      if (!picked.includes(module)) picked.push(module)
      if (picked.length >= 2) break
    }
  }

  return new Set(picked.map((module) => cellKey(module.row, module.col)))
}

export function buildVoxelSculpture(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const random = mulberry32(hashString(seedText))
  const voxels: SculptureVoxel[] = []
  const center = (matrix.size - 1) / 2

  const canopyCandidates = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false

    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.29)
    const ellipse = nx * nx + nz * nz
    const irregularEdge = 1.04 + (random() - 0.5) * 0.3
    return ellipse <= irregularEdge
  })

  // Very small / low-density symbols still need a readable tree crown.
  const canopyModules = canopyCandidates.length >= 34
    ? canopyCandidates
    : matrix.darkModules.filter((module) => {
        if (module.role !== 'data') return false
        const nx = (module.col - center) / Math.max(1, matrix.size * 0.4)
        const nz = (module.row - center) / Math.max(1, matrix.size * 0.35)
        return nx * nx + nz * nz <= 1.18
      })

  const canopyKeys = new Set(canopyModules.map((module) => cellKey(module.row, module.col)))
  const trunkKeys = pickTrunkModules(canopyModules, center)

  for (let row = -QUIET_ZONE; row < matrix.size + QUIET_ZONE; row += 1) {
    for (let col = -QUIET_ZONE; col < matrix.size + QUIET_ZONE; col += 1) {
      const inside = row >= 0 && row < matrix.size && col >= 0 && col < matrix.size
      const cell = inside ? matrix.cells[row * matrix.size + col] : null
      const x = (col - center) * CELL_SIZE
      const z = (row - center) * CELL_SIZE

      voxels.push({
        x,
        y: 0,
        z,
        kind: cell?.dark ? 'floor-dark' : 'floor-light',
        colorPhase: cell?.dark ? random() : 0,
      })
    }
  }

  let maxHeight = CELL_SIZE
  const baseLevel = Math.round(Math.max(9, Math.min(15, matrix.size * 0.32)))
  const crownRise = Math.round(Math.max(6, Math.min(12, matrix.size * 0.25)))

  for (const module of canopyModules) {
    const key = cellKey(module.row, module.col)
    const nx = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const nz = (module.row - center) / Math.max(1, matrix.size * 0.29)
    const radialSquared = Math.min(1, nx * nx + nz * nz)
    const dome = Math.sqrt(Math.max(0, 1 - radialSquared))
    const topLevel = Math.max(
      baseLevel,
      Math.round(baseLevel + dome * crownRise + (random() - 0.5) * 2.8),
    )
    const crownThickness = 3 + Math.floor(random() * 3)
    const crownStart = Math.max(7, topLevel - crownThickness + 1)
    const x = (module.col - center) * CELL_SIZE
    const z = (module.row - center) * CELL_SIZE

    if (trunkKeys.has(key)) {
      for (let level = 1; level < crownStart; level += 1) {
        voxels.push({
          x,
          y: level * CELL_SIZE,
          z,
          kind: 'trunk',
          colorPhase: level / Math.max(1, crownStart),
        })
      }
    }

    for (let level = crownStart; level <= topLevel; level += 1) {
      const isTop = level === topLevel
      voxels.push({
        x,
        y: level * CELL_SIZE,
        z,
        kind: isTop ? 'canopy-top' : 'canopy',
        colorPhase: (random() * 0.62 + dome * 0.3 + level * 0.037) % 1,
      })
    }

    maxHeight = Math.max(maxHeight, topLevel * CELL_SIZE)
  }

  return {
    voxels,
    footprint: (matrix.size + QUIET_ZONE * 2) * CELL_SIZE,
    maxHeight,
    pivotY: maxHeight * 0.46,
    treeModuleCount: canopyModules.length,
    groundDarkCount: matrix.darkModules.length - canopyModules.length,
  }
}
