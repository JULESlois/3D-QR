import type { PaletteController } from './palette-controller'
import type { PresentationController } from './presentation'
import type { RenderRuntime } from './render-runtime'
import type { SculptureController } from './sculpture-state'
import type { ViewTransitionController } from './view-transition'

export interface AppRenderController {
  start(): void
}

export interface AppRenderControllerContext {
  readonly stage: HTMLElement
  readonly runtime: Pick<RenderRuntime, 'scene' | 'camera' | 'renderer' | 'clock' | 'resize'>
  readonly presentation: Pick<PresentationController, 'updateComposition' | 'applyTransform'>
  readonly sculpture: Pick<SculptureController, 'build'>
  readonly palette: Pick<PaletteController, 'update'>
  readonly viewTransitions: Pick<ViewTransitionController, 'update'>
}

export function createAppRenderController(
  context: AppRenderControllerContext,
): AppRenderController {
  const {
    stage,
    runtime,
    presentation,
    sculpture,
    palette,
    viewTransitions,
  } = context
  const { scene, camera, renderer, clock } = runtime
  let started = false

  function resize(): void {
    const width = Math.max(1, stage.clientWidth)
    const height = Math.max(1, stage.clientHeight)
    runtime.resize(width, height)
    presentation.updateComposition(width, height, sculpture.build, true)
  }

  function animate(): void {
    const delta = clock.getDelta()
    const now = performance.now()

    palette.update(now)
    presentation.applyTransform()
    viewTransitions.update(delta)
    renderer.render(scene, camera)
  }

  function start(): void {
    if (started) return
    started = true

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)
    resize()
    renderer.setAnimationLoop(animate)
  }

  return { start }
}
