import * as THREE from 'three'
import type { DarkModule } from './qr'

export const QR_SPACING = 0.168
export const QR_MODULE_SCALE = QR_SPACING * 1.015

export interface LeafLayout {
  qrPosition: THREE.Vector3
  treePosition: THREE.Vector3
  treeRotation: THREE.Quaternion
  treeScale: number
  colorPhase: number
}

const CROWN_LOBES = [
  new THREE.Vector3(0, 2.35, 0),
  new THREE.Vector3(-1.25, 2.05, 0.15),
  new THREE.Vector3(1.25, 2.05, 0.1),
  new THREE.Vector3(0.05, 2.05, 1.15),
  new THREE.Vector3(-0.1, 2.15, -1.15),
  new THREE.Vector3(-0.72, 3.15, -0.2),
  new THREE.Vector3(0.82, 3.05, 0.15),
]

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
  const radius = Math.cbrt(random())

  return new THREE.Vector3(
    Math.cos(theta) * radial * radius,
    z * radius,
    Math.sin(theta) * radial * radius,
  )
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

    const lobe = CROWN_LOBES[(Math.floor(random() * CROWN_LOBES.length) + i) % CROWN_LOBES.length]
    const local = randomPointInUnitSphere(random)
    const lobeScale = 0.88 + random() * 0.52

    local.x *= 1.12 * lobeScale
    local.y *= 0.86 * lobeScale
    local.z *= 1.05 * lobeScale

    const treePosition = lobe.clone().add(local)
    treePosition.x += Math.sin(treePosition.y * 2.2 + i * 0.11) * 0.08

    const treeRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (random() - 0.5) * Math.PI,
        random() * Math.PI * 2,
        (random() - 0.5) * Math.PI,
      ),
    )

    return {
      qrPosition,
      treePosition,
      treeRotation,
      treeScale: 0.16 + random() * 0.115,
      colorPhase: (random() + i / Math.max(1, modules.length)) % 1,
    }
  })
}
