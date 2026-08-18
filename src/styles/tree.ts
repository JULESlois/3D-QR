import type { DarkModule, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  projectionToneForCell,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

type CrownSample = {
  dome: number
  lobe: number
}

const crownLobes = [
  { x: -0.34, z: 0.08, rx: 0.72, rz: 0.74, rise: 0.94 },
  { x: 0.34, z: 0.02, rx: 0.7, rz: 0.72, rise: 0.9 },
  { x: 0.02, z: -0.34, rx: 0.64, rz: 0.66, rise: 1.08 },
  { x: 0.02, z: 0.36, rx: 0.68, rz: 0.62, rise: 0.86 },
] as const

function sampleCrown(module: DarkModule, center: number, size: number): CrownSample {
  const nx = (module.col - center) / Math.max(1, size * 0.34)
  const nz = (module.row - center) / Math.max(1, size * 0.3)
  let bestDome = 0
  let bestLobe = 0

  crownLobes.forEach((lobe, index) => {
    const dx = (nx - lobe.x) / lobe.rx
    const dz = (nz - lobe.z) / lobe.rz
    const distanceSquared = dx * dx + dz * dz
    if (distanceSquared > 1) return

    const dome = Math.sqrt(Math.max(0, 1 - distanceSquared)) * lobe.rise
    if (dome > bestDome) {
      bestDome = dome
      bestLobe = index
    }
  })

  return { dome: bestDome, lobe: bestLobe }
}

function pickTrunkModules(modules: DarkModule[], center: number): DarkModule[] {
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

  return picked
}

function rootStrength(module: DarkModule, trunks: DarkModule[]): number {
  let best = 0

  for (const trunk of trunks) {
    const dr = module.row - trunk.row
    const dc = module.col - trunk.col
    const distance = Math.hypot(dr, dc)
    if (distance > 4.2) continue

    const axisBias = distance <= 0.001
      ? 1
      : 0.68 + (Math.max(Math.abs(dr), Math.abs(dc)) / distance) * 0.32
    const falloff = Math.max(0, 1 - distance / 4.2)
    best = Math.max(best, falloff * axisBias)
  }

  return best
}

function branchStrength(
  module: DarkModule,
  trunks: DarkModule[],
  sample: CrownSample,
  center: number,
  size: number,
): number {
  if (trunks.length === 0) return 0

  const lobe = crownLobes[sample.lobe]
  const targetRow = center + lobe.z * size * 0.3
  const targetCol = center + lobe.x * size * 0.34
  let best = 0

  for (const trunk of trunks) {
    const vx = targetCol - trunk.col
    const vz = targetRow - trunk.row
    const lengthSquared = Math.max(0.001, vx * vx + vz * vz)
    const wx = module.col - trunk.col
    const wz = module.row - trunk.row
    const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSquared))
    const closestCol = trunk.col + vx * t
    const closestRow = trunk.row + vz * t
    const distance = Math.hypot(module.col - closestCol, module.row - closestRow)
    const taper = 1 - t * 0.45
    best = Math.max(best, Math.max(0, 1 - distance / 1.55) * taper)
  }

  return best
}

export function generateTree(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'tree')
  const { random, center } = context
  const voxels = createBaseVoxels(context, { mode: 'full-pad' })

  const canopyCandidates = matrix.darkModules.filter((module) => (
    module.role === 'data' && sampleCrown(module, center, matrix.size).dome > 0
  ))

  const canopyModules = canopyCandidates.length >= 34
    ? canopyCandidates
    : matrix.darkModules.filter((module) => {
        if (module.role !== 'data') return false
        const nx = (module.col - center) / Math.max(1, matrix.size * 0.4)
        const nz = (module.row - center) / Math.max(1, matrix.size * 0.35)
        return nx * nx + nz * nz <= 1.18
      })

  const lifted = new Set(canopyModules.map((module) => cellKey(module.row, module.col)))
  const trunks = pickTrunkModules(canopyModules, center)
  const trunkKeys = new Set(trunks.map((module) => cellKey(module.row, module.col)))
  const baseLevel = Math.round(Math.max(8, Math.min(14, matrix.size * 0.29)))
  const crownRise = Math.round(Math.max(7, Math.min(13, matrix.size * 0.27)))

  for (const module of canopyModules) {
    const key = cellKey(module.row, module.col)
    const sample = sampleCrown(module, center, matrix.size)
    const dome = sample.dome > 0
      ? sample.dome
      : Math.max(0.18, 1 - Math.hypot(module.row - center, module.col - center) / (matrix.size * 0.45))
    const topLevel = Math.max(
      baseLevel,
      Math.round(baseLevel + dome * crownRise + (random() - 0.5) * 2.2),
    )
    const crownThickness = 3 + Math.floor(random() * 3)
    const crownStart = Math.max(7, topLevel - crownThickness + 1)
    const branch = branchStrength(module, trunks, sample, center, matrix.size)
    const root = rootStrength(module, trunks)
    const isTrunk = trunkKeys.has(key)

    if (isTrunk) {
      for (let level = 1; level < crownStart; level += 1) {
        pushVoxel(voxels, module, matrix.size, level, 'wood', level / Math.max(1, crownStart))
      }
    } else {
      if (root > 0.18) {
        const rootTop = Math.min(crownStart - 1, Math.max(1, Math.round(1 + root * 5)))
        for (let level = 1; level <= rootTop; level += 1) {
          pushVoxel(
            voxels,
            module,
            matrix.size,
            level,
            'wood',
            (root * 0.63 + level * 0.081) % 1,
          )
        }
      }

      if (branch > 0.42) {
        const branchTop = Math.min(crownStart - 1, Math.round(4 + branch * Math.max(3, crownStart - 5)))
        const branchBase = Math.max(4, branchTop - (branch > 0.7 ? 3 : 2))
        for (let level = branchBase; level <= branchTop; level += 1) {
          pushVoxel(voxels, module, matrix.size, level, 'wood', (branch + level * 0.07) % 1)
        }
      }
    }

    for (let level = crownStart; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        'primary',
        (random() * 0.52 + dome * 0.34 + sample.lobe * 0.11 + level * 0.031) % 1,
        level === topLevel ? projectionToneForCell(module) : undefined,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'tree',
    'Tree',
    lifted,
    'CLUSTERED CROWN / BUTTRESSED ROOT FLARE / BRANCHING TRUNK / FULL GRASS PAD',
    'full-pad',
  )
}
