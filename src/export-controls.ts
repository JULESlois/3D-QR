import * as THREE from 'three'
import { exportRevealGif } from './gif-export'
import { exportPngPair } from './png-export'
import type { SculptureBuild } from './sculpture'
import { getStyle, type StyleId } from './styles'

export interface ExportControlsContext {
  exportGifButton: HTMLButtonElement
  exportPngButton: HTMLButtonElement
  meta: HTMLElement
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  presentationGroup: THREE.Group
  sculptureRoot: THREE.Group
  artQuaternion: THREE.Quaternion
  qrQuaternion: THREE.Quaternion
  getBuild: () => SculptureBuild | null
  getStyleId: () => StyleId
  isBusy: () => boolean
  finishPaletteTransition: () => void
  setBusy: (busy: boolean) => void
}

type ExportState = {
  build: SculptureBuild
  styleId: StyleId
}

function prepareExport(context: ExportControlsContext): ExportState | null {
  if (context.isBusy()) return null

  const build = context.getBuild()
  if (!build) return null

  context.finishPaletteTransition()
  return { build, styleId: context.getStyleId() }
}

export function bindExportControls(context: ExportControlsContext): void {
  const {
    exportGifButton,
    exportPngButton,
    meta,
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    artQuaternion,
    qrQuaternion,
    setBusy,
  } = context

  exportGifButton.addEventListener('click', () => {
    const state = prepareExport(context)
    if (!state) return

    void exportRevealGif({
      scene,
      camera,
      renderer,
      presentationGroup,
      sculptureRoot,
      artQuaternion,
      qrQuaternion,
      build: state.build,
      styleId: state.styleId,
      button: exportGifButton,
      meta,
      setBusy,
    })
  })

  exportPngButton.addEventListener('click', () => {
    const state = prepareExport(context)
    if (!state) return

    void exportPngPair({
      scene,
      camera,
      renderer,
      presentationGroup,
      sculptureRoot,
      artQuaternion,
      qrQuaternion,
      build: state.build,
      voxelFill: getStyle(state.styleId).appearance.voxelFill,
      styleId: state.styleId,
      button: exportPngButton,
      meta,
      setBusy,
    })
  })
}
