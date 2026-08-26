import * as THREE from 'three'
import './styles.css'
import type { SculptureBuild } from './sculpture'
import { getPalette, isPaletteKey, type PaletteKey } from './palettes'
import { createQRMatrix } from './qr'
import { getStyle, isStyleId, type StyleId } from './styles'
import { exportRevealGif } from './gif-export'
import { createPresentationController } from './presentation'
import { createVoxelMeshController } from './voxel-mesh'
import {
  applyPaletteColorBuffer,
  computePaletteColors,
} from './palette-rendering'
import { createPaletteTransitionController } from './palette-transition'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Required UI element is missing: ${selector}`)
  return element
}

const stage = requiredElement<HTMLElement>('#stage')
const input = requiredElement<HTMLInputElement>('#qr-input')
const meta = requiredElement<HTMLElement>('#qr-meta')
const modeToggle = requiredElement<HTMLButtonElement>('#mode-toggle')
const modeToggleLabel = requiredElement<HTMLElement>('#mode-toggle-label')
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

const scene = new THREE.Scene()
const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50)
camera.position.set(0, 0, 20)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.domElement.style.cursor = 'pointer'
stage.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xfff8e9, 0x6f786a, 2.1))

const keyLight = new THREE.DirectionalLight(0xffead5, 3.0)
keyLight.position.set(-4.5, 6.5, 10)
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xc8ddff, 0.7)
fillLight.position.set(5, 2, 8)
scene.add(fillLight)

const presentationGroup = new THREE.Group()
scene.add(presentationGroup)

const sculptureRoot = new THREE.Group()
presentationGroup.add(sculptureRoot)

const presentation = createPresentationController(camera, presentationGroup, sculptureRoot)
const voxelMeshes = createVoxelMeshController(sculptureRoot)
const paletteTransitions = createPaletteTransitionController()

let styleId: StyleId = 'tree'
let paletteKey: PaletteKey = getStyle(styleId).defaultPalette
let currentBuild: SculptureBuild | null = null
let rebuildTimer = 0
let rotationProgress = 0
let targetRotationProgress = 0
let currentView: 'art' | 'qr' = 'art'
let isExporting = false

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

type StyleTransition = {
  nextStyleId: StyleId
  nextPaletteKey: PaletteKey
  startedAt: number
  duration: number
  swapped: boolean
}

let styleTransition: StyleTransition | null = null
let queuedStyleId: StyleId | null = null

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function swatchBackground(colors: readonly string[]): string {
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

function updatePaletteUi(): void {
  const style = getStyle(styleId)
  const palette = getPalette(styleId, paletteKey)
  const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
  document.documentElement.style.setProperty('--accent', accent)
  paletteLabel.textContent = `SURFACE / ${palette.label.toUpperCase()}`

  paletteButtons.forEach((button) => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return

    const option = getPalette(styleId, requested)
    button.classList.toggle('is-active', requested === paletteKey)
    button.style.background = swatchBackground(option.swatch)
    button.setAttribute('aria-label', `${style.label} palette: ${option.label}`)
    button.title = option.label
  })
}

function applyPalette(): void {
  paletteTransitions.cancel()
  const voxelMesh = voxelMeshes.mesh
  if (voxelMesh && currentBuild) {
    applyPaletteColorBuffer(
      voxelMesh,
      currentBuild,
      computePaletteColors(currentBuild, styleId, paletteKey),
    )
  }
  updatePaletteUi()
}

function setExportUiBusy(busy: boolean): void {
  isExporting = busy
  exportGifButton.disabled = busy
  exportGifButton.setAttribute('aria-busy', String(busy))
  modeToggle.disabled = busy
  input.disabled = busy
  for (const button of styleButtons) button.disabled = busy
  for (const button of paletteButtons) button.disabled = busy
  renderer.domElement.style.pointerEvents = busy ? 'none' : ''
}

function updateStyleCopy(): void {
  const style = getStyle(styleId)
  eyebrow.textContent = style.eyebrow
  headline.textContent = style.headline
  lede.textContent = style.description
  specimen.textContent = style.specimen
  styleButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.style === styleId)
  })
  document.body.dataset.style = styleId
  setMode(currentView)
}

function rebuild(value: string): void {
  const content = value.trim()
  if (!content) {
    meta.textContent = 'ENTER A URL OR TEXT TO BUILD A QR SCULPTURE.'
    return
  }

  try {
    const matrix = createQRMatrix(content)
    const style = getStyle(styleId)
    const build = style.generate(matrix, content)

    paletteTransitions.cancel()
    currentBuild = build
    voxelMeshes.replace(build, style.appearance.voxelFill)

    applyPalette()
    presentation.updateComposition(
      stage.clientWidth,
      stage.clientHeight,
      currentBuild,
      !styleTransition,
    )

    const detail = build.detail ? ` · ${build.detail}` : ''
    meta.textContent = `QR V${matrix.version} · ${matrix.size}×${matrix.size} · ${style.label.toUpperCase()} ${build.liftedModuleCount} · PAD D${build.baseDarkCount}/L${build.baseLightCount} · F${build.foundationVoxelCount} · ${style.projectionLabel}${detail}`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown QR error'
    meta.textContent = `QR ERROR · ${message}`
  }
}

function setMode(next: 'art' | 'qr'): void {
  currentView = next
  const showQr = next === 'qr'
  const style = getStyle(styleId)
  targetRotationProgress = showQr ? 1 : 0

  modeToggle.setAttribute('aria-pressed', String(showQr))
  modeToggleLabel.textContent = showQr ? `BACK TO ${style.label.toUpperCase()}` : 'VIEW QR'
  modeReadout.textContent = showQr ? `QR / ${style.projectionLabel}` : `${style.label.toUpperCase()} / ISOMETRIC`
  stageHint.textContent = showQr
    ? `CLICK TO RETURN · ${style.specimen}`
    : 'CLICK TO ROTATE · FULL-SCENE QR POLARITY / SAME PROJECTION'
  document.body.dataset.mode = showQr ? 'qr' : 'art'
}

function toggleMode(): void {
  if (isExporting) return
  setMode(currentView === 'art' ? 'qr' : 'art')
}

function switchStyleImmediately(nextStyleId: StyleId): void {
  styleId = nextStyleId
  paletteKey = getStyle(styleId).defaultPalette
  updateStyleCopy()
  rebuild(input.value)
}

function requestStyleTransition(nextStyleId: StyleId): void {
  if (isExporting || nextStyleId === styleId) return

  queuedStyleId = null
  styleTransition = null
  switchStyleImmediately(nextStyleId)
  presentation.applyTransform()
}

function requestPaletteTransition(nextPaletteKey: PaletteKey): void {
  if (isExporting || nextPaletteKey === paletteKey || styleTransition) return

  const voxelMesh = voxelMeshes.mesh
  paletteKey = nextPaletteKey
  updatePaletteUi()

  if (!currentBuild || !voxelMesh || reducedMotion) {
    applyPalette()
    return
  }

  const to = computePaletteColors(currentBuild, styleId, paletteKey)
  if (!paletteTransitions.start(voxelMesh, currentBuild, to)) {
    applyPaletteColorBuffer(voxelMesh, currentBuild, to)
  }
}

modeToggle.addEventListener('click', toggleMode)
exportGifButton.addEventListener('click', () => {
  if (isExporting) return

  if (styleTransition) {
    const exportTarget = queuedStyleId ?? styleTransition.nextStyleId
    styleTransition = null
    queuedStyleId = null
    switchStyleImmediately(exportTarget)
    presentation.applyTransform()
  }

  if (!currentBuild) return

  void exportRevealGif({
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    artQuaternion: presentation.artQuaternion,
    qrQuaternion: presentation.qrQuaternion,
    build: currentBuild,
    styleId,
    button: exportGifButton,
    meta,
    setBusy: setExportUiBusy,
    pauseAnimation: () => renderer.setAnimationLoop(null),
    resumeAnimation: () => renderer.setAnimationLoop(animate),
  })
})
renderer.domElement.addEventListener('click', toggleMode)

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
  renderer.setSize(width, height, false)
  presentation.updateComposition(width, height, currentBuild, !styleTransition)
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(stage)
resize()
updateStyleCopy()
applyPalette()
rebuild(input.value)
setMode('art')

const clock = new THREE.Clock()

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05)
  const now = performance.now()

  if (reducedMotion) {
    rotationProgress = targetRotationProgress
  } else {
    rotationProgress += (targetRotationProgress - rotationProgress) * (1 - Math.exp(-4.9 * delta))
    if (Math.abs(targetRotationProgress - rotationProgress) < 0.00015) {
      rotationProgress = targetRotationProgress
    }
  }

  paletteTransitions.update(voxelMeshes.mesh, now)

  presentation.applyTransform()

  const eased = smootherstep(rotationProgress)
  sculptureRoot.quaternion.slerpQuaternions(
    presentation.artQuaternion,
    presentation.qrQuaternion,
    eased,
  )
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
