import * as THREE from 'three'
import type { DarkModule, ModuleRole } from './qr'

export const QR_SPACING = 0.168
export const QR_MODULE_SCALE = QR_SPACING * 1.015

export interface LeafLayout {
  qrPosition: THREE.Vector3
  treePosition: THREE.Vector3
  treeRotation: THREE.Quaternion
  treeScale: THREE.Vector3
  colorPhase: number
  windPhase: number
  windStrength: number
  role: ModuleRole
  morphDelay: number
}

interface CanopyLobe {
  center: THREE.Vector3
  scale: THREE.Vector3
}

const CROWN_LOBES: CanopyLobe[] = [
  { center: new THREE.Vector3(0, 2.52, 0), scale: new THREE.Vector3(1.2, 0.88, 1.08) },
  { center: new THREE.Vector3(-1.32, 2.18, 0.08), scale: new THREE.Vector3(1.0, 0.68, 0.9) },
  { center: new THREE.Vector3(1.32, 2.22, 0.02), scale: new THREE.Vector3(1.02, 0.7, 0.92) },
  { center: new THREE.Vector3(-0.16, 2.18, 1.18), scale: new THREE.Vector3(0.95, 0.68, 0.86) },
  { center: new THREE.Vector3(0.14, 2.28, -1.16), scale: new THREE.Vector3(0.94, 0.72, 0.86) },
  { center: new THREE.Vector3(-0.72, 3.2, -0.16), scale: new THREE.Vector3(0.88, 0.72, 0.8) },
  { center: new THREE.Vector3(0.78, 3.14, 0.1), scale: new THREE.Vector3(0.9, 0.74, 0.82) },
  { center: new THREE.Vector3(0, 3.68, 0), scale: new THREE.Vector3(0.7, 0.54, 0.66) },
]

const FINDER_ANCHORS = {
  topLeft: {
    center: new THREE.Vector3(-1.08, 3.2, 0.5),
    rotation: new THREE.Euler(-0.35, 0.45, -0.18),
  },
  topRight: {
    center: new THREE.Vector3(1.12, 3.06, -0.3),
    rotation: new THREE.Euler(-0.18, -0.62, 0.16),
  },
  bottomLeft: {
    center: new THREE.Vector3(-0.08, 2.08, 1.3),
    rotation: new THREE.Euler(0.52, 0.14, 0.34),
  },
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

function randomPointInUnitSphere(random: () => number): THREE.Vector3 {
  const theta = random() * Math.PI * 2
  const z = random() * 2 - 1
  const radial = Math.sqrt(Math.max(0, 1 - z * z))
  const radius = Math.pow(random(), 0.5)

  return new THREE.Vector3(
    Math.cos(theta) * radial * radius,
    z * radius,
    Math.sin(theta) * radial * radius,
  )
}

function finderTreePosition(module: DarkModule, qrSize: number, random: () => number): THREE.Vector3 {
  let anchor = FINDER_ANCHORS.topLeft
  let localRow = module.row
  let localCol = module.col

  if (module.row <= 6 && module.col >= qrSize - 7) {
    anchor = FINDER_ANCHORS.topRight
    localCol = module.col - (qrSize - 7)
  } else if (module.row >= qrSize - 7 && module.col <= 6) {
    anchor = FINDER_ANCHORS.bottomLeft
    localRow = module.row - (qrSize - 7)
  }

  const local = new THREE.Vector3(
    (localCol - 3) * 0.125,
    (3 - localRow) * 0.125,
    (random() - 0.5) * 0.17,
  )
  local.applyEuler(anchor.rotation)

  return anchor.center.clone().add(local)
}

function timingTreePosition(module: DarkModule, qrSize: number, random: () => number): THREE.Vector3 {
  if (module.row === 6) {
    const u = THREE.MathUtils.clamp((module.col - 8) / Math.max(1, qrSize - 17), 0, 1)
    return new THREE.Vector3(
      THREE.MathUtils.lerp(-1.55, 1.52, u),
      2.52 + Math.sin(u * Math.PI) * 0.42,
      -0.5 + Math.sin(u * Math.PI * 2) * 0.24 + (random() - 0.5) * 0.05,
    )
  }

  const u = THREE.MathUtils.clamp((module.row - 8) / Math.max(1, qrSize - 17), 0, 1)
  return new THREE.Vector3(
    -0.5 + Math.sin(u * Math.PI) * 0.28,
    THREE.MathUtils.lerp(1.55, 3.42, u),
    0.68 - u * 0.72 + Math.sin(u * Math.PI * 1.5) * 0.16 + (random() - 0.5) * 0.05,
  )
}

function dataTreePosition(module: DarkModule, random: () => number): THREE.Vector3 {
  const lobe = CROWN_LOBES[Math.floor(random() * CROWN_LOBES.length)]
  const local = randomPointInUnitSphere(random).multiply(lobe.scale)
  const treePosition = lobe.center.clone().add(local)

  treePosition.x += Math.sin(treePosition.y * 2.45 + module.row * 0.31) * 0.07
  treePosition.z += Math.cos(treePosition.x * 1.9 + module.col * 0.27) * 0.06
  if (treePosition.y < 1.42) treePosition.y = 1.42 + random() * 0.22

  return treePosition
}

export function buildLeafLayouts(
  modules: DarkModule[],
  qrSize: number,
  seedText: string,
): LeafLayout[] {
  const random = mulberry32(hashString(seedText))
  const center = (qrSize - 1) / 2

  return modules.map((module, i) => {
    const qrPosition = new THREE.Vector3(
      (module.col - center) * QR_SPACING,
      (center - module.row) * QR_SPACING,
      0,
    )

    const treePosition = module.role === 'finder'
      ? finderTreePosition(module, qrSize, random)
      : module.role === 'timing'
        ? timingTreePosition(module, qrSize, random)
        : dataTreePosition(module, random)

    const rotationRange = module.role === 'finder' ? 0.52 : module.role === 'timing' ? 0.75 : 1.25
    const treeRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (random() - 0.5) * rotationRange,
        random() * Math.PI * 2,
        (random() - 0.5) * rotationRange,
      ),
    )

    let treeScale: THREE.Vector3
    if (module.role === 'finder') {
      const scale = 0.195 + random() * 0.035
      treeScale = new THREE.Vector3(scale * 1.05, scale * 0.7, scale * 0.9)
    } else if (module.role === 'timing') {
      const scale = 0.145 + random() * 0.025
      treeScale = new THREE.Vector3(scale * 1.18, scale * 0.48, scale * 0.76)
    } else {
      const radial = Math.hypot(treePosition.x, treePosition.z)
      const edgeBias = THREE.MathUtils.clamp(radial / 2.45, 0, 1)
      const baseScale = 0.16 + random() * 0.075 - edgeBias * 0.018
      treeScale = new THREE.Vector3(
        baseScale * (0.92 + random() * 0.42),
        baseScale * (0.54 + random() * 0.3),
        baseScale * (0.72 + random() * 0.4),
      )
    }

    const heightPhase = THREE.MathUtils.clamp((treePosition.y - 1.4) / 3.0, 0, 1)
    const roleColorBias = module.role === 'finder' ? 0.12 : module.role === 'timing' ? 0.58 : 0
    const morphDelay = module.role === 'timing'
      ? 0
      : module.role === 'finder'
        ? 0.08 + random() * 0.05
        : 0.13 + random() * 0.19

    return {
      qrPosition,
      treePosition,
      treeRotation,
      treeScale,
      colorPhase: (heightPhase * 0.4 + random() * 0.46 + roleColorBias + i / Math.max(1, modules.length) * 0.06) % 1,
      windPhase: random() * Math.PI * 2,
      windStrength: module.role === 'finder' ? 0.34 + random() * 0.42 : module.role === 'timing' ? 0.22 + random() * 0.32 : 0.45 + random() * 0.9,
      role: module.role,
      morphDelay,
    }
  })
}
