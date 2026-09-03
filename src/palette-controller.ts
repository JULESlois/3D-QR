import type { PaletteKey } from './palettes'
import {
  applyPaletteColorBuffer,
  computePaletteColors,
} from './palette-rendering'
import type { PaletteTransitionController } from './palette-transition'
import type { SculptureBuild } from './sculpture'
import type { StyleId } from './styles'
import type { VoxelMeshController } from './voxel-mesh'

export interface PaletteControllerContext {
  readonly voxelMeshes: VoxelMeshController
  readonly transitions: PaletteTransitionController
  readonly reducedMotion: boolean
  getBuild(): SculptureBuild | null
  getStyleId(): StyleId
  getPaletteKey(): PaletteKey
  setPaletteKey(paletteKey: PaletteKey): void
  updateUi(styleId: StyleId, paletteKey: PaletteKey): void
  isBusy(): boolean
}

export interface PaletteController {
  apply(): void
  request(paletteKey: PaletteKey): void
  cancel(): void
  finish(): boolean
  update(now: number): void
}

export function createPaletteController(context: PaletteControllerContext): PaletteController {
  const {
    voxelMeshes,
    transitions,
    reducedMotion,
    getBuild,
    getStyleId,
    getPaletteKey,
    setPaletteKey,
    updateUi,
    isBusy,
  } = context

  function apply(): void {
    transitions.cancel()
    const voxelMesh = voxelMeshes.mesh
    const build = getBuild()
    const styleId = getStyleId()
    const paletteKey = getPaletteKey()

    if (voxelMesh && build) {
      applyPaletteColorBuffer(
        voxelMesh,
        build,
        computePaletteColors(build, styleId, paletteKey),
      )
    }
    updateUi(styleId, paletteKey)
  }

  function request(nextPaletteKey: PaletteKey): void {
    if (isBusy() || nextPaletteKey === getPaletteKey()) return

    const voxelMesh = voxelMeshes.mesh
    setPaletteKey(nextPaletteKey)
    const styleId = getStyleId()
    const paletteKey = getPaletteKey()
    updateUi(styleId, paletteKey)

    const build = getBuild()
    if (!build || !voxelMesh || reducedMotion) {
      apply()
      return
    }

    const to = computePaletteColors(build, styleId, paletteKey)
    if (!transitions.start(voxelMesh, build, to)) {
      applyPaletteColorBuffer(voxelMesh, build, to)
    }
  }

  return {
    apply,
    request,
    cancel: () => transitions.cancel(),
    finish: () => transitions.finish(voxelMeshes.mesh),
    update: (now) => transitions.update(voxelMeshes.mesh, now),
  }
}
