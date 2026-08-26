import * as THREE from 'three'
import type { ProjectionView } from './projection-view'
import type { SculptureBuild } from './sculpture'

export interface PresentationController {
  artQuaternion: THREE.Quaternion
  qrQuaternion: THREE.Quaternion
  applyTransform: (lift?: number, scaleFactor?: number, flipY?: number) => void
  setView: (view: ProjectionView) => void
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

  let view: ProjectionView = 'art'
  let composedScale = 1
  let artX = 0
  let artY = 0

  const applyTransform = (lift = 0, scaleFactor = 1, flipY = 0): void => {
    // Art view deliberately offsets the sculpture away from the controls. Scanner view
    // instead centers the complete projection footprint so all four quiet-zone edges stay
    // inside the orthographic viewport, including on square/mobile layouts.
    const x = view === 'qr' ? 0 : artX
    const y = view === 'qr' ? 0 : artY
    presentationGroup.position.set(x, y + lift, 0)
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

    artX = aspect > 1.45 ? 1.85 : aspect > 1.15 ? 1.25 : 0
    artY = aspect > 1.15 ? 0.42 : 1.05

    if (applyImmediately) applyTransform()
  }

  return {
    artQuaternion,
    qrQuaternion,
    applyTransform,
    setView(next) {
      view = next
      applyTransform()
    },
    updateComposition,
  }
}
