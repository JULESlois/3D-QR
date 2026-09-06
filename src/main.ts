import './styles.css'
import { bindAppInteractions } from './app-interactions'
import { bindExportControls } from './export-controls'
import { createPresentationController } from './presentation'
import { createRenderRuntime } from './render-runtime'
import { createVoxelMeshController } from './voxel-mesh'
import { createPaletteController } from './palette-controller'
import { createPaletteTransitionController } from './palette-transition'
import { createQrBuildController } from './qr-build-controller'
import { createSculptureController } from './sculpture-state'
import { bindShareState } from './share-state'
import { createViewTransitionController } from './view-transition'
import { createAppUiController } from './app-ui'
import { createAppNavigationController } from './app-navigation-controller'
import { createAppRenderController } from './app-render-controller'

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

const { rebuild } = createQrBuildController({
  stage,
  meta,
  sculpture,
  voxelMeshes,
  palette,
  presentation,
})

const navigation = createAppNavigationController({
  sculpture,
  voxelMeshes,
  viewTransitions,
  ui,
  presentation,
  rebuild,
  getInputValue: () => input.value,
  isBusy: () => isExporting,
})

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
  setView: navigation.setMode,
  requestStyle: navigation.requestStyle,
  requestPalette: palette.request,
  rebuild,
})

const renderController = createAppRenderController({
  stage,
  runtime,
  presentation,
  sculpture,
  palette,
  viewTransitions,
})

renderController.start()
navigation.updateStyleCopy()
palette.apply()
rebuild(input.value)
navigation.setMode('art')
bindShareState()
