import * as THREE from 'three'
import type { SculptureBuild } from './sculpture'
import {
  capturePaletteColors,
  createPaletteDelays,
} from './palette-rendering'

type PaletteTransition = {
  from: Float32Array
  to: Float32Array
  delays: Float32Array
  startedAt: number
  duration: number
}

export interface PaletteTransitionController {
  readonly active: boolean
  cancel(): void
  start(
    mesh: THREE.InstancedMesh,
    build: SculptureBuild,
    to: Float32Array,
    startedAt?: number,
  ): boolean
  update(mesh: THREE.InstancedMesh | null, now: number): void
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function createPaletteTransitionController(
  duration = 520,
  delaySpan = 0.34,
): PaletteTransitionController {
  let transition: PaletteTransition | null = null

  return {
    get active() {
      return transition !== null
    },

    cancel() {
      transition = null
    },

    start(mesh, build, to, startedAt = performance.now()) {
      const from = capturePaletteColors(mesh)
      if (!from || from.length !== to.length) {
        transition = null
        return false
      }

      transition = {
        from,
        to,
        delays: createPaletteDelays(build),
        startedAt,
        duration,
      }
      return true
    },

    update(mesh, now) {
      if (!transition || !mesh?.instanceColor) return

      const rawProgress = clamp01((now - transition.startedAt) / transition.duration)
      const colors = mesh.instanceColor.array as Float32Array
      const activeSpan = 1 - delaySpan

      for (let i = 0; i < transition.delays.length; i += 1) {
        const localProgress = clamp01(
          (rawProgress - transition.delays[i] * delaySpan) / activeSpan,
        )
        const eased = smootherstep(localProgress)
        const offset = i * 3
        colors[offset] = THREE.MathUtils.lerp(transition.from[offset], transition.to[offset], eased)
        colors[offset + 1] = THREE.MathUtils.lerp(transition.from[offset + 1], transition.to[offset + 1], eased)
        colors[offset + 2] = THREE.MathUtils.lerp(transition.from[offset + 2], transition.to[offset + 2], eased)
      }

      mesh.instanceColor.needsUpdate = true
      if (rawProgress >= 1) transition = null
    },
  }
}
