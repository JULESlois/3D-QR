import * as THREE from 'three'

export type ProjectionView = 'art' | 'qr'

export interface ViewTransitionController {
  readonly view: ProjectionView
  setView: (next: ProjectionView) => void
  update: (delta: number) => void
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function createViewTransitionController(
  sculptureRoot: THREE.Object3D,
  artQuaternion: THREE.Quaternion,
  qrQuaternion: THREE.Quaternion,
  reducedMotion: boolean,
): ViewTransitionController {
  let view: ProjectionView = 'art'
  let progress = 0
  let targetProgress = 0

  const applyQuaternion = (): void => {
    sculptureRoot.quaternion.slerpQuaternions(
      artQuaternion,
      qrQuaternion,
      smootherstep(progress),
    )
  }

  return {
    get view() {
      return view
    },

    setView(next) {
      view = next
      targetProgress = next === 'qr' ? 1 : 0
      if (reducedMotion) {
        progress = targetProgress
        applyQuaternion()
      }
    },

    update(delta) {
      if (reducedMotion) {
        progress = targetProgress
      } else {
        const clampedDelta = Math.min(delta, 0.05)
        progress += (targetProgress - progress) * (1 - Math.exp(-4.9 * clampedDelta))
        if (Math.abs(targetProgress - progress) < 0.00015) {
          progress = targetProgress
        }
      }
      applyQuaternion()
    },
  }
}
