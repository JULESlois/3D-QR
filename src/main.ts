import './styles.css'
import { getPalette, isPaletteKey, type PaletteKey } from './palettes'
import { getStyle, isStyleId, type StyleId } from './styles'
import { exportRevealGif } from './gif-export'
import { exportPngPair } from './png-export'
import { createPresentationController } from './presentation'
import { createRenderRuntime } from './render-runtime'
import { createVoxelMeshController } from './voxel-mesh'
import {
  applyPaletteColorBuffer,
  computePaletteColors,
} from './palette-rendering'
import { createPaletteTransitionController } from './palette-transition'
import {
  PROJECTION_VIEW_REQUEST_EVENT,
  isProjectionView,
  type ProjectionView,
  type ProjectionViewRequestDetail,
} from './projection-view'
import { createSculptureController } from './sculpture-state'
import { createViewTransitionController } from './view-transition'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Required UI element is missing: ${selector}`)
  return element
}

const stage = requiredElement<HTMLElement>('#stage')
const input = requiredElement<HTMLInputElement>('#qr-input')
const meta = requiredElement<HTMLElement>('#qr-meta')
const modeReadout = requiredElement<HTMLElement>('#mode-readout')
const stageHint = requiredElement<HTMLElement>('#stage-hint')
const eyebrow = requiredElement<HTMLElement>('#style-eyebrow')
const headline = requiredElement<HTMLElement>('#style-headline')
const lede = requiredElement<HTMLElement>('#style-lede')
const specimen = requiredElement<HTMLElement>('#style-specimen')
const paletteLabel = requiredElement<HTMLElement>('.palette-control > .palette-label')
const styleRow = requiredElement<HTMLElement>('.style-row')
const styleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-style]'))
const paletteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-palette]'))
const exportGifButton = requiredElement<HTMLButtonElement>('#export-gif')
const exportPngButton = requiredElement<HTMLButtonElement>('#export-png')
const copyShareLinkButton = requiredElement<HTMLButtonElement>('#copy-share-link')

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
const paletteTransitions = createPaletteTransitionController()
const sculpture = createSculptureController('tree')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const viewTransitions = createViewTransitionController(
  sculptureRoot,
  presentation.artQuaternion,
  presentation.qrQuaternion,
  reducedMotion,
)

let rebuildTimer = 0
let isExporting = false

function swatchBackground(colors: readonly string[]): string {
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

function updatePaletteUi(): void {
  const style = getStyle(sculpture.styleId)
  const palette = getPalette(sculpture.styleId, sculpture.paletteKey)
  const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
  document.documentElement.style.setProperty('--accent', accent)
  paletteLabel.textContent = `SURFACE / ${palette.label.toUpperCase()}`

  paletteButtons.forEach((button) => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return

    const option = getPalette(sculpture.styleId, requested)
    button.classList.toggle('is-active', requested === sculpture.paletteKey)
    button.style.background = swatchBackground(option.swatch)
    button.setAttribute('aria-label', `${style.label} palette: ${option.label}`)
    button.title = option.label
  })
}

function applyPalette(): void {
  paletteTransitions.cancel()
  const voxelMesh = voxelMeshes.mesh
  const build = sculpture.build
  if (voxelMesh && build) {
    applyPaletteColorBuffer(
      voxelMesh,
      build,
      computePaletteColors(build, sculpture.styleId, sculpture.paletteKey),
    )
  }
  updatePaletteUi()
}

function setExportUiBusy(busy: boolean): void {
  isExporting = busy
  for (const button of [exportGifButton, exportPngButton, copyShareLinkButton]) {
    button.disabled = busy
    button.setAttribute('aria-busy', String(busy))
  }
  input.disabled = busy
  for (const button of styleButtons) button.disabled = busy
  for (const button of paletteButtons) button.disabled = busy
  renderer.domElement.style.pointerEvents = busy ? 'none' : ''
}

function updateStyleCopy(): void {
  const style = getStyle(sculpture.styleId)
  eyebrow.textContent = style.eyebrow
  headline.textContent = style.headline
  lede.textContent = style.description
  specimen.textContent = style.specimen
  styleButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.style === sculpture.styleId)
  })
  document.body.dataset.style = sculpture.styleId
  setMode(viewTransitions.view)
}

function rebuild(value: string): void {
  const content = value.trim()
  if (!content) {
    meta.textContent = 'ENTER A URL OR TEXT TO BUILD A QR SCULPTURE.'
    return
  }

  try {
    const { matrix, style, build } = sculpture.rebuild(content)

    paletteTransitions.cancel()
    voxelMeshes.replace(build, style.appearance.voxelFill)

    applyPalette()
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
  viewTransitions.setView(next)
  const showQr = next === 'qr'
  const style = getStyle(sculpture.styleId)

  modeReadout.textContent = showQr ? `QR / ${style.projectionLabel}` : `${style.label.toUpperCase()} / ISOMETRIC`
  stageHint.textContent = showQr
    ? `CLICK TO RETURN · ${style.specimen}`
    : 'CLICK TO ROTATE · FULL-SCENE QR POLARITY / SAME PROJECTION'
  document.body.dataset.mode = showQr ? 'qr' : 'art'
}

function toggleMode(): void {
  if (isExporting) return
  setMode(viewTransitions.view === 'art' ? 'qr' : 'art')
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

function requestPaletteTransition(nextPaletteKey: PaletteKey): void {
  if (isExporting || nextPaletteKey === sculpture.paletteKey) return

  const voxelMesh = voxelMeshes.mesh
  sculpture.setPalette(nextPaletteKey)
  updatePaletteUi()

  const build = sculpture.build
  if (!build || !voxelMesh || reducedMotion) {
    applyPalette()
    return
  }

  const to = computePaletteColors(build, sculpture.styleId, sculpture.paletteKey)
  if (!paletteTransitions.start(voxelMesh, build, to)) {
    applyPaletteColorBuffer(voxelMesh, build, to)
  }
}

exportGifButton.addEventListener('click', () => {
  const build = sculpture.build
  if (isExporting || !build) return

  void exportRevealGif({
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    artQuaternion: presentation.artQuaternion,
    qrQuaternion: presentation.qrQuaternion,
    build,
    styleId: sculpture.styleId,
    button: exportGifButton,
    meta,
    setBusy: setExportUiBusy,
    pauseAnimation: () => renderer.setAnimationLoop(null),
    resumeAnimation: () => renderer.setAnimationLoop(animate),
  })
})

exportPngButton.addEventListener('click', () => {
  const build = sculpture.build
  if (isExporting || !build) return

  void exportPngPair({
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    artQuaternion: presentation.artQuaternion,
    qrQuaternion: presentation.qrQuaternion,
    build,
    styleId: sculpture.styleId,
    button: exportPngButton,
    meta,
    setBusy: setExportUiBusy,
    pauseAnimation: () => renderer.setAnimationLoop(null),
    resumeAnimation: () => renderer.setAnimationLoop(animate),
  })
})

renderer.domElement.addEventListener('click', toggleMode)

document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT, (event) => {
  const request = event as CustomEvent<ProjectionViewRequestDetail>
  if (!request.detail || !isProjectionView(request.detail.view)) return
  setMode(request.detail.view)
})

styleRow.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('[data-style]')
  if (!button || button.disabled || !styleRow.contains(button)) return
  const requested = button.dataset.style
  if (!requested || !isStyleId(requested)) return
  requestStyleTransition(requested)
})

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return
    requestPaletteTransition(requested)
  })
})

input.addEventListener('input', () => {
  if (isExporting) return
  window.clearTimeout(rebuildTimer)
  meta.textContent = 'REBUILDING VOXEL FIELD…'
  rebuildTimer = window.setTimeout(() => rebuild(input.value), 180)
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
applyPalette()
rebuild(input.value)
setMode('art')

function animate(): void {
  const delta = clock.getDelta()
  const now = performance.now()

  paletteTransitions.update(voxelMeshes.mesh, now)
  presentation.applyTransform()
  viewTransitions.update(delta)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
