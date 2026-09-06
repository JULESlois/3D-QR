import type { PaletteController } from './palette-controller'
import type { PresentationController } from './presentation'
import type { SculptureController } from './sculpture-state'
import type { VoxelMeshController } from './voxel-mesh'

export interface QrBuildControllerContext {
  readonly stage: HTMLElement
  readonly meta: HTMLElement
  readonly sculpture: SculptureController
  readonly voxelMeshes: VoxelMeshController
  readonly palette: PaletteController
  readonly presentation: PresentationController
}

export interface QrBuildController {
  rebuild(value: string): void
}

export function createQrBuildController(context: QrBuildControllerContext): QrBuildController {
  const {
    stage,
    meta,
    sculpture,
    voxelMeshes,
    palette,
    presentation,
  } = context

  function rebuild(value: string): void {
    const content = value.trim()
    if (!content) {
      meta.textContent = 'ENTER A URL OR TEXT TO BUILD A QR SCULPTURE.'
      return
    }

    try {
      const { matrix, style, build } = sculpture.rebuild(content)

      palette.cancel()
      voxelMeshes.replace(build, style.appearance.voxelFill)
      palette.apply()
      presentation.updateComposition(
        stage.clientWidth,
        stage.clientHeight,
        build,
        true,
      )

      const detail = build.detail ? ` · ${build.detail}` : ''
      meta.textContent = `QR V${matrix.version} · ${matrix.size}×${matrix.size} · ${style.label.toUpperCase()} ${build.liftedModuleCount} · PAD D${build.baseDarkCount}/L${build.baseLightCount} · F${build.foundationVoxelCount} · ${style.projectionLabel}${detail}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown QR error'
      meta.textContent = `QR ERROR · ${message}`
    }
  }

  return { rebuild }
}
