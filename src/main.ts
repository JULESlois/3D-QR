import './styles.css'
import type { StyleId } from './styles'
import { bindAppInteractions } from './app-interactions'
import { bindExportControls } from './export-controls'
import { createPresentationController } from './presentation'
import { createRenderRuntime } from './render-runtime'
import { createVoxelMeshController } from './voxel-mesh'
import { createPaletteController } from './palette-controller'
import { createPaletteTransitionController } from './palette-transition'
import type { ProjectionView } from './projection-view'
import { createSculptureController } from './sculpture-state'
import { createViewTransitionController } from './view-transition'
import { createAppUiController } from './app-ui'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Required UI element is missing: ${selector}`)
  return element
}

const stage = requiredElement<HTMLElement>('#stage')
const ui = createAppUiController()
const {
  input,
  meta,
  styleRow,
  paletteButtons,
  exportGifButton,
  exportPngButton,
} = ui

const runtime = createRenderRuntime(stage)
const {
  scene,
  camera,
  renderer,
  presentationGroup,
  sculptureRoot,
  clock,
} = runtime
const presentation = createPresentationController(camera, presentationGroup, sculptureRoot)
const voxelMeshes = createVoxelMeshController(sculptureRoot)
const sculpture = createSculptureController('tree')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const palette = createPaletteController({
  voxelMeshes,
  transitions: createPaletteTransitionController(),
  reducedMotion,
  getBuild: () => sculpture.build,
  getStyleId: () => sculpture.styleId,
  getPaletteKey: () => sculpture.paletteKey,
  setPaletteKey: (paletteKey) => sculpture.setPalette(paletteKey),
  updateUi: (styleId, paletteKey) => ui.updatePalette(styleId, paletteKey),
  isBusy: () => isExporting,
})
const viewTransitions = createViewTransitionController(
  sculptureRoot,
  presentation.artQuaternion,
  presentation.qrQuaternion,
  reducedMotion,
)

let isExporting = false

function setExportUiBusy(busy: boolean): void {
  isExporting = busy
  ui.setExportBusy(busy, renderer.domElement)
}

function updateStyleCopy(): void {
  ui.updateStyle(sculpture.styleId, viewTransitions.view)
}

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

function setMode(next: ProjectionView): void {
  voxelMeshes.setScannerFacing(next === 'qr')
  viewTransitions.setView(next)
  ui.updateProjection(sculpture.styleId, next)
}

function switchStyleImmediately(nextStyleId: StyleId): void {
  sculpture.setStyle(nextStyleId)
  updateStyleCopy()
  rebuild(input.value)
}

function requestStyleTransition(nextStyleId: StyleId): void {
  if (isExporting || nextStyleId === sculpture.styleId) return

  switchStyleImmediately(nextStyleId)
  presentation.applyTransform()
}

bindExportControls({
  exportGifButton,
  exportPngButton,
  meta,
  scene,
  camera,
  renderer,
  presentationGroup,
  sculptureRoot,
  artQuaternion: presentation.artQuaternion,
  qrQuaternion: presentation.qrQuaternion,
  getBuild: () => sculpture.build,
  getStyleId: () => sculpture.styleId,
  isBusy: () => isExporting,
  finishPaletteTransition: () => {
    palette.finish()
  },
  setBusy: setExportUiBusy,
})

bindAppInteractions({
  pointerSurface: renderer.domElement,
  input,
  meta,
  styleRow,
  paletteButtons,
  isBusy: () => isExporting,
  getView: () => viewTransitions.view,
  setView: setMode,
  requestStyle: requestStyleTransition,
  requestPalette: palette.request,
  rebuild,
})

function resize(): void {
  const width = Math.max(1, stage.clientWidth)
  const height = Math.max(1, stage.clientHeight)
  runtime.resize(width, height)
  presentation.updateComposition(width, height, sculpture.build, true)
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(stage)
resize()
updateStyleCopy()
palette.apply()
rebuild(input.value)
setMode('art')

function animate(): void {
  const delta = clock.getDelta()
  const now = performance.now()

  palette.update(now)
  presentation.applyTransform()
  viewTransitions.update(delta)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
