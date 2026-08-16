import * as THREE from 'three'
import type { DarkModule } from './qr'

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
}

interface CanopyLobe {
  center: THREE.Vector3
  scale: THREE.Vector3
}

const CROWN_LOBES: CanopyLobe[] = [
  { center: new THREE.Vector3(0, 2.5, 0), scale: new THREE.Vector3(1.18, 0.9, 1.08) },
  { center: new THREE.Vector3(-1.32, 2.2, 0.06), scale: new THREE.Vector3(1.04, 0.7, 0.9) },
  { center: new THREE.Vector3(1.34, 2.23, 0.02), scale: new THREE.Vector3(1.06, 0.72, 0.92) },
  { center: new THREE.Vector3(-0.18, 2.2, 1.2), scale: new THREE.Vector3(0.98, 0.72, 0.88) },
  { center: new THREE.Vector3(0.12, 2.28, -1.18), scale: new THREE.Vector3(0.96, 0.76, 0.88) },
  { center: new THREE.Vector3(-0.72, 3.22, -0.15), scale: new THREE.Vector3(0.9, 0.76, 0.82) },
  { center: new THREE.Vector3(0.78, 3.16, 0.12), scale: new THREE.Vector3(0.92, 0.78, 0.84) },
  { center: new THREE.Vector3(0, 3.72, 0), scale: new THREE.Vector3(0.72, 0.58, 0.68) },
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
  const radius = Math.pow(random(), 0.5)

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

    const lobe = CROWN_LOBES[Math.floor(random() * CROWN_LOBES.length)]
    const local = randomPointInUnitSphere(random).multiply(lobe.scale)
    const treePosition = lobe.center.clone().add(local)

    // Break the obvious spherical silhouette while preserving a stable, readable crown.
    treePosition.x += Math.sin(treePosition.y * 2.45 + module.row * 0.31) * 0.07
    treePosition.z += Math.cos(treePosition.x * 1.9 + module.col * 0.27) * 0.06
    if (treePosition.y < 1.42) treePosition.y = 1.42 + random() * 0.22

    const treeRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (random() - 0.5) * 1.25,
        random() * Math.PI * 2,
        (random() - 0.5) * 1.15,
      ),
    )

    const edgeBias = THREE.MathUtils.clamp(local.length() / 1.6, 0, 1)
    const baseScale = 0.16 + random() * 0.075 - edgeBias * 0.018
    const treeScale = new THREE.Vector3(
      baseScale * (0.92 + random() * 0.42),
      baseScale * (0.54 + random() * 0.3),
      baseScale * (0.72 + random() * 0.4),
    )

    const heightPhase = THREE.MathUtils.clamp((treePosition.y - 1.4) / 3.0, 0, 1)

    return {
      qrPosition,
      treePosition,
      treeRotation,
      treeScale,
      colorPhase: (heightPhase * 0.46 + random() * 0.54 + i / Math.max(1, modules.length) * 0.08) % 1,
      windPhase: random() * Math.PI * 2,
      windStrength: 0.45 + random() * 0.9,
    }
  })
}
