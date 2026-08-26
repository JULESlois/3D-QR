import * as THREE from 'three'
import type { SculptureBuild } from './sculpture'

export interface PresentationController {
  artQuaternion: THREE.Quaternion
  qrQuaternion: THREE.Quaternion
  applyTransform: (lift?: number, scaleFactor?: number, flipY?: number) => void
  updateComposition: (
    width: number,
    height: number,
    build: SculptureBuild | null,
    applyImmediately?: boolean,
  ) => void
}

export function createPresentationController(
  camera: THREE.OrthographicCamera,
  presentationGroup: THREE.Group,
  sculptureRoot: THREE.Group,
): PresentationController {
  const artQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.76, -0.7, 0.035, 'XYZ'),
  )
  const qrQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
  )
  sculptureRoot.quaternion.copy(artQuaternion)

  let composedScale = 1
  let composedX = 0
  let composedY = 0

  const applyTransform = (lift = 0, scaleFactor = 1, flipY = 0): void => {
    presentationGroup.position.set(composedX, composedY + lift, 0)
    presentationGroup.scale.setScalar(composedScale * scaleFactor)
    presentationGroup.rotation.set(0, flipY, 0)
  }

  const updateComposition = (
    width: number,
    height: number,
    build: SculptureBuild | null,
    applyImmediately = true,
  ): void => {
    const safeWidth = Math.max(1, width)
    const safeHeight = Math.max(1, height)
    const aspect = safeWidth / safeHeight
    const viewHeight = aspect < 0.72 ? 14.4 : aspect < 1 ? 11.8 : 9.8

    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.left = -(viewHeight * aspect) / 2
    camera.right = (viewHeight * aspect) / 2
    camera.updateProjectionMatrix()

    if (build) {
      const availableWidth = viewHeight * aspect
      const targetFootprint = aspect < 0.72
        ? Math.max(5.5, Math.min(7.0, availableWidth * 0.86))
        : aspect < 1
          ? 7.35
          : 8.25
      composedScale = Math.min(1.08, targetFootprint / build.footprint)
    } else {
      composedScale = 1
    }

    composedX = aspect > 1.45 ? 1.85 : aspect > 1.15 ? 1.25 : 0
    composedY = aspect > 1.15 ? 0.42 : 1.05

    if (applyImmediately) applyTransform()
  }

  return {
    artQuaternion,
    qrQuaternion,
    applyTransform,
    updateComposition,
  }
}
