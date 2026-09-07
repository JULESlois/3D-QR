import type { AppUiController } from './app-ui'
import { bindExportControls } from './export-controls'
import type { PresentationController } from './presentation'
import type { RenderRuntime } from './render-runtime'
import type { SculptureController } from './sculpture-state'

export interface AppExportController {
  isBusy(): boolean
  start(finishPaletteTransition: () => void): void
}

export interface AppExportControllerContext {
  readonly ui: Pick<
    AppUiController,
    'exportGifButton' | 'exportPngButton' | 'meta' | 'setExportBusy'
  >
  readonly runtime: Pick<
    RenderRuntime,
    'scene' | 'camera' | 'renderer' | 'presentationGroup' | 'sculptureRoot'
  >
  readonly presentation: Pick<PresentationController, 'artQuaternion' | 'qrQuaternion'>
  readonly sculpture: Pick<SculptureController, 'build' | 'styleId'>
}

export function createAppExportController(
  context: AppExportControllerContext,
): AppExportController {
  const { ui, runtime, presentation, sculpture } = context
  let busy = false
  let started = false

  function isBusy(): boolean {
    return busy
  }

  function setBusy(nextBusy: boolean): void {
    busy = nextBusy
    ui.setExportBusy(nextBusy, runtime.renderer.domElement)
  }

  function start(finishPaletteTransition: () => void): void {
    if (started) return
    started = true

    bindExportControls({
      exportGifButton: ui.exportGifButton,
      exportPngButton: ui.exportPngButton,
      meta: ui.meta,
      scene: runtime.scene,
      camera: runtime.camera,
      renderer: runtime.renderer,
      presentationGroup: runtime.presentationGroup,
      sculptureRoot: runtime.sculptureRoot,
      artQuaternion: presentation.artQuaternion,
      qrQuaternion: presentation.qrQuaternion,
      getBuild: () => sculpture.build,
      getStyleId: () => sculpture.styleId,
      isBusy,
      finishPaletteTransition,
      setBusy,
    })
  }

  return { isBusy, start }
}
