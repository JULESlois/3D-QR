import type { AppUiController } from './app-ui'
import type { PresentationController } from './presentation'
import {
  notifyProjectionViewChanged,
  type ProjectionView,
} from './projection-view'
import type { QrBuildController } from './qr-build-controller'
import type { SculptureController } from './sculpture-state'
import type { StyleId } from './styles'
import type { ViewTransitionController } from './view-transition'
import type { VoxelMeshController } from './voxel-mesh'

export interface AppNavigationControllerContext {
  readonly sculpture: SculptureController
  readonly voxelMeshes: VoxelMeshController
  readonly viewTransitions: ViewTransitionController
  readonly ui: Pick<AppUiController, 'updateStyle' | 'updateProjection'>
  readonly presentation: Pick<PresentationController, 'applyTransform'>
  readonly rebuild: QrBuildController['rebuild']
  readonly getInputValue: () => string
  readonly isBusy: () => boolean
}

export interface AppNavigationController {
  updateStyleCopy(): void
  setMode(next: ProjectionView): void
  requestStyle(nextStyleId: StyleId): void
}

export function createAppNavigationController(
  context: AppNavigationControllerContext,
): AppNavigationController {
  const {
    sculpture,
    voxelMeshes,
    viewTransitions,
    ui,
    presentation,
    rebuild,
    getInputValue,
    isBusy,
  } = context

  function updateStyleCopy(): void {
    ui.updateStyle(sculpture.styleId, viewTransitions.view)
  }

  function setMode(next: ProjectionView): void {
    const previous = viewTransitions.view
    voxelMeshes.setScannerFacing(next === 'qr')
    viewTransitions.setView(next)
    ui.updateProjection(sculpture.styleId, next)
    if (previous !== next) notifyProjectionViewChanged(next)
  }

  function requestStyle(nextStyleId: StyleId): void {
    if (isBusy() || nextStyleId === sculpture.styleId) return

    sculpture.setStyle(nextStyleId)
    updateStyleCopy()
    rebuild(getInputValue())
    presentation.applyTransform()
  }

  return { updateStyleCopy, setMode, requestStyle }
}
