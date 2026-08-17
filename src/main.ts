import * as THREE from 'three'
import './styles.css'
import { CELL_SIZE, type SculptureBuild, type SculptureVoxel } from './sculpture'
import { getPalette, isPaletteKey, type PaletteKey } from './palettes'
import { createQRMatrix } from './qr'
import { getStyle, isStyleId, type StyleId } from './styles'

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
const panelFooter = requiredElement<HTMLElement>('.panel-footer')

const exportGifTitle = 'Export a looping sculpture-to-QR reveal'
const exportGifButton = document.createElement('button')
exportGifButton.type = 'button'
exportGifButton.className = 'style-chip'
exportGifButton.textContent = 'EXPORT GIF'
exportGifButton.title = exportGifTitle
exportGifButton.setAttribute('aria-label', 'Export reveal as GIF')
exportGifButton.style.minHeight = '38px'
exportGifButton.style.minWidth = '92px'
exportGifButton.style.paddingInline = '11px'

const footerActions = document.createElement('div')
footerActions.style.display = 'flex'
footerActions.style.alignItems = 'stretch'
footerActions.style.justifyContent = 'flex-end'
footerActions.style.gap = '8px'
footerActions.style.width = '100%'
footerActions.append(exportGifButton, modeToggle)
panelFooter.append(footerActions)
modeToggle.style.flex = '1 1 auto'
modeToggle.style.width = 'auto'

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

const artQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.76, -0.7, 0.035, 'XYZ'),
)
const qrQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
)
sculptureRoot.quaternion.copy(artQuaternion)

const voxelGeometry = new THREE.BoxGeometry(1, 1, 1)
const voxelMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.86,
  metalness: 0.015,
})

const fallbackWood = ['#563b2d', '#6d4b34', '#815b3a'] as const
const fallbackStone = ['#6f746d', '#85897e', '#a09d8d', '#5d655f'] as const
const fallbackPlaster = ['#d8cbb4', '#e7dbc5', '#c9b99e', '#eee6d8'] as const
const fallbackGlass = ['#5e8790', '#83a7aa', '#496f78'] as const
const tempColor = new THREE.Color()
const dummy = new THREE.Object3D()

let styleId: StyleId = 'tree'
let paletteKey: PaletteKey = getStyle(styleId).defaultPalette
let voxelMesh: THREE.InstancedMesh | null = null
let currentBuild: SculptureBuild | null = null
let rebuildTimer = 0
let exportFeedbackTimer = 0
let rotationProgress = 0
let targetRotationProgress = 0
let currentView: 'art' | 'qr' = 'art'
let composedScale = 1
let composedX = 0
let composedY = 0
let isExporting = false

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

type PaletteTransition = {
  from: Float32Array
  to: Float32Array
  delays: Float32Array
  startedAt: number
  duration: number
}

type StyleTransition = {
  nextStyleId: StyleId
  nextPaletteKey: PaletteKey
  startedAt: number
  duration: number
  swapped: boolean
}

let paletteTransition: PaletteTransition | null = null
let styleTransition: StyleTransition | null = null
let queuedStyleId: StyleId | null = null

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function indexedHexColor(colors: readonly string[], phase: number, target: THREE.Color): THREE.Color {
  const index = Math.min(colors.length - 1, Math.floor(clamp01(phase) * colors.length))
  return target.set(colors[index])
}

function colorForVoxel(voxel: SculptureVoxel, target: THREE.Color): THREE.Color {
  const palette = getPalette(styleId, paletteKey)
  const appearance = getStyle(styleId).appearance
  const baseLight = palette.baseLight ?? appearance.baseLight

  switch (voxel.kind) {
    case 'floor-light':
      return target.set(baseLight)
    case 'floor-dark':
      return indexedHexColor(palette.baseDark ?? appearance.baseDark, voxel.colorPhase, target)
    case 'light-top':
      return target.set(palette.lightTop ?? appearance.lightTop ?? baseLight)
    case 'water': {
      const colors = palette.water ?? appearance.water
      return colors
        ? indexedHexColor(colors, voxel.colorPhase, target)
        : target.set(baseLight)
    }
    case 'crystal':
      return indexedHexColor(
        palette.crystal ?? appearance.crystal ?? palette.glass ?? fallbackGlass,
        voxel.colorPhase,
        target,
      )
    case 'foundation':
      return indexedHexColor(palette.foundation ?? appearance.foundation, voxel.colorPhase, target)
    case 'wood':
      return indexedHexColor(palette.wood ?? fallbackWood, voxel.colorPhase, target)
    case 'stone':
      return indexedHexColor(palette.stone ?? fallbackStone, voxel.colorPhase, target)
    case 'plaster':
      return indexedHexColor(palette.plaster ?? fallbackPlaster, voxel.colorPhase, target)
    case 'glass':
      return indexedHexColor(palette.glass ?? fallbackGlass, voxel.colorPhase, target)
    case 'qr-top':
      return target.set(palette.qrDark)
    case 'primary':
    default:
      return indexedHexColor(palette.colors, voxel.colorPhase, target)
  }
}

function swatchBackground(colors: readonly string[]): string {
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

function computePaletteColors(build: SculptureBuild): Float32Array {
  const buffer = new Float32Array(build.voxels.length * 3)
  for (let i = 0; i < build.voxels.length; i += 1) {
    colorForVoxel(build.voxels[i], tempColor)
    const offset = i * 3
    buffer[offset] = tempColor.r
    buffer[offset + 1] = tempColor.g
    buffer[offset + 2] = tempColor.b
  }
  return buffer
}

function applyColorBuffer(buffer: Float32Array): void {
  if (!voxelMesh || !currentBuild) return
  for (let i = 0; i < currentBuild.voxels.length; i += 1) {
    const offset = i * 3
    tempColor.setRGB(buffer[offset], buffer[offset + 1], buffer[offset + 2])
    voxelMesh.setColorAt(i, tempColor)
  }
  if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true
}

function captureCurrentColors(): Float32Array | null {
  const attribute = voxelMesh?.instanceColor
  if (!attribute) return null
  return Float32Array.from(attribute.array as ArrayLike<number>)
}

function createPaletteDelays(build: SculptureBuild): Float32Array {
  const delays = new Float32Array(build.voxels.length)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const voxel of build.voxels) {
    const coordinate = voxel.x + voxel.z * 0.72 + (voxel.y - build.pivotY) * 0.24
    min = Math.min(min, coordinate)
    max = Math.max(max, coordinate)
  }

  const span = Math.max(0.0001, max - min)
  for (let i = 0; i < build.voxels.length; i += 1) {
    const voxel = build.voxels[i]
    const coordinate = voxel.x + voxel.z * 0.72 + (voxel.y - build.pivotY) * 0.24
    delays[i] = clamp01((coordinate - min) / span)
  }

  return delays
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
  paletteTransition = null
  if (voxelMesh && currentBuild) {
    applyColorBuffer(computePaletteColors(currentBuild))
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

function showExportFeedback(label: string, title: string): void {
  window.clearTimeout(exportFeedbackTimer)
  exportGifButton.textContent = label
  exportGifButton.title = title
  exportFeedbackTimer = window.setTimeout(() => {
    exportGifButton.textContent = 'EXPORT GIF'
    exportGifButton.title = exportGifTitle
  }, 2200)
}

function revealRotationProgress(progress: number): number {
  if (progress < 0.12) return 0
  if (progress < 0.42) return (progress - 0.12) / 0.3
  if (progress < 0.62) return 1
  if (progress < 0.92) return 1 - (progress - 0.62) / 0.3
  return 0
}

async function loadGifEncoder() {
  return import('gifenc')
}

async function exportRevealGif(): Promise<void> {
  if (isExporting) return

  if (styleTransition) {
    const exportTarget = queuedStyleId ?? styleTransition.nextStyleId
    styleTransition = null
    queuedStyleId = null
    switchStyleImmediately(exportTarget)
    applyPresentationTransform()
  }

  if (!currentBuild) return

  const exportBuild = currentBuild
  const exportStyleId = styleId
  const previousMeta = meta.textContent
  const savedQuaternion = sculptureRoot.quaternion.clone()
  const savedPosition = presentationGroup.position.clone()
  const savedScale = presentationGroup.scale.clone()
  const savedPresentationQuaternion = presentationGroup.quaternion.clone()

  window.clearTimeout(exportFeedbackTimer)
  exportFeedbackTimer = 0
  setExportUiBusy(true)
  exportGifButton.textContent = 'PREPARING…'
  exportGifButton.title = 'Preparing GIF export'
  renderer.setAnimationLoop(null)

  let exportRenderer: THREE.WebGLRenderer | null = null
  let feedback: { label: string; title: string } | null = null

  try {
    const { GIFEncoder, quantize, applyPalette } = await loadGifEncoder()
    const size = 512
    const fps = 18
    const frameCount = 54
    const frameDelay = Math.round(1000 / fps)
    const gif = GIFEncoder()

    exportRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    exportRenderer.setPixelRatio(1)
    exportRenderer.setSize(size, size, false)
    exportRenderer.outputColorSpace = THREE.SRGBColorSpace
    exportRenderer.toneMapping = THREE.ACESFilmicToneMapping
    exportRenderer.toneMappingExposure = renderer.toneMappingExposure

    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    exportRenderer.setClearColor(new THREE.Color(paper || '#f2f0e7'), 1)

    const exportCamera = camera.clone()
    const viewHeight = 10.6
    exportCamera.top = viewHeight / 2
    exportCamera.bottom = -viewHeight / 2
    exportCamera.left = -viewHeight / 2
    exportCamera.right = viewHeight / 2
    exportCamera.updateProjectionMatrix()

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = size
    captureCanvas.height = size
    const captureContext = captureCanvas.getContext('2d', { willReadFrequently: true })
    if (!captureContext) throw new Error('Canvas capture is unavailable in this browser')

    const exportScale = Math.min(1.08, 8.35 / exportBuild.footprint)
    presentationGroup.position.set(0, 0.42, 0)
    presentationGroup.scale.setScalar(exportScale)
    presentationGroup.rotation.set(0, 0, 0)

    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frame / (frameCount - 1)
      const revealProgress = smootherstep(revealRotationProgress(progress))
      sculptureRoot.quaternion.slerpQuaternions(artQuaternion, qrQuaternion, revealProgress)

      exportRenderer.render(scene, exportCamera)
      captureContext.clearRect(0, 0, size, size)
      captureContext.drawImage(exportRenderer.domElement, 0, 0, size, size)
      const pixels = captureContext.getImageData(0, 0, size, size).data
      const palette = quantize(pixels, 192)
      const indexed = applyPalette(pixels, palette)
      gif.writeFrame(indexed, size, size, {
        palette,
        delay: frameDelay,
        repeat: 0,
      })

      const percent = Math.round(((frame + 1) / frameCount) * 100)
      exportGifButton.textContent = `GIF ${percent}%`
      meta.textContent = `ENCODING REVEAL · ${percent}% · ${size}×${size} · ${fps} FPS`

      if (frame % 2 === 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }

    gif.finish()
    const output = gif.bytes()
    const outputCopy = new Uint8Array(output)
    const blob = new Blob([outputCopy.buffer], { type: 'image/gif' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `3d-qr-${exportStyleId}-reveal.gif`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)

    meta.textContent = `GIF EXPORTED · ${size}×${size} · ${fps} FPS · ${(frameCount / fps).toFixed(1)}S LOOP`
    feedback = { label: 'EXPORTED ✓', title: 'GIF saved' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export error'
    meta.textContent = `GIF EXPORT ERROR · ${message}`
    feedback = { label: 'EXPORT FAILED', title: message }
  } finally {
    sculptureRoot.quaternion.copy(savedQuaternion)
    presentationGroup.position.copy(savedPosition)
    presentationGroup.scale.copy(savedScale)
    presentationGroup.quaternion.copy(savedPresentationQuaternion)
    exportRenderer?.dispose()
    setExportUiBusy(false)
    renderer.setAnimationLoop(animate)

    if (feedback) {
      showExportFeedback(feedback.label, feedback.title)
    } else {
      exportGifButton.textContent = 'EXPORT GIF'
      exportGifButton.title = exportGifTitle
    }

    if (!meta.textContent?.startsWith('GIF ')) {
      meta.textContent = previousMeta
    }
  }
}

function applyPresentationTransform(lift = 0, scaleFactor = 1, flipY = 0): void {
  presentationGroup.position.set(composedX, composedY + lift, 0)
  presentationGroup.scale.setScalar(composedScale * scaleFactor)
  presentationGroup.rotation.set(0, flipY, 0)
}

function updateComposition(): void {
  const width = Math.max(1, stage.clientWidth)
  const height = Math.max(1, stage.clientHeight)
  const aspect = width / height
  const viewHeight = aspect < 0.72 ? 14.4 : aspect < 1 ? 11.8 : 9.8

  camera.top = viewHeight / 2
  camera.bottom = -viewHeight / 2
  camera.left = -(viewHeight * aspect) / 2
  camera.right = (viewHeight * aspect) / 2
  camera.updateProjectionMatrix()

  if (currentBuild) {
    const availableWidth = viewHeight * aspect
    const targetFootprint = aspect < 0.72
      ? Math.max(5.5, Math.min(7.0, availableWidth * 0.86))
      : aspect < 1
        ? 7.35
        : 8.25
    composedScale = Math.min(1.08, targetFootprint / currentBuild.footprint)
  } else {
    composedScale = 1
  }

  composedX = aspect > 1.45 ? 1.85 : aspect > 1.15 ? 1.25 : 0
  composedY = aspect > 1.15 ? 0.42 : 1.05

  if (!styleTransition) applyPresentationTransform()
}

function disposeVoxelMesh(): void {
  if (!voxelMesh) return
  sculptureRoot.remove(voxelMesh)
  voxelMesh = null
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

    paletteTransition = null
    disposeVoxelMesh()
    currentBuild = build

    const mesh = new THREE.InstancedMesh(voxelGeometry, voxelMaterial, build.voxels.length)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.frustumCulled = false
    const voxelSize = CELL_SIZE * style.appearance.voxelFill

    for (let i = 0; i < build.voxels.length; i += 1) {
      const voxel = build.voxels[i]
      dummy.position.set(voxel.x, voxel.y - build.pivotY, voxel.z)
      dummy.quaternion.identity()
      dummy.scale.set(voxelSize, voxelSize, voxelSize)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    voxelMesh = mesh
    sculptureRoot.add(mesh)

    applyPalette()
    updateComposition()

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

  // Directional slide motion is owned by ui-controls.ts around this synchronous swap.
  // Keep the Three.js presentation transform stable so no scale/lift/rotation competes with it.
  queuedStyleId = null
  styleTransition = null
  switchStyleImmediately(nextStyleId)
  applyPresentationTransform()
}

function requestPaletteTransition(nextPaletteKey: PaletteKey): void {
  if (isExporting || nextPaletteKey === paletteKey || styleTransition) return

  const from = captureCurrentColors()
  paletteKey = nextPaletteKey
  updatePaletteUi()

  if (!currentBuild || !voxelMesh || reducedMotion) {
    applyPalette()
    return
  }

  const to = computePaletteColors(currentBuild)
  if (!from || from.length !== to.length) {
    applyColorBuffer(to)
    paletteTransition = null
    return
  }

  paletteTransition = {
    from,
    to,
    delays: createPaletteDelays(currentBuild),
    startedAt: performance.now(),
    duration: 520,
  }
}

modeToggle.addEventListener('click', toggleMode)
exportGifButton.addEventListener('click', () => {
  void exportRevealGif()
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
  updateComposition()
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

  if (paletteTransition && voxelMesh?.instanceColor) {
    const rawProgress = clamp01((now - paletteTransition.startedAt) / paletteTransition.duration)
    const colors = voxelMesh.instanceColor.array as Float32Array
    const delaySpan = 0.34
    const activeSpan = 1 - delaySpan

    for (let i = 0; i < paletteTransition.delays.length; i += 1) {
      const localProgress = clamp01(
        (rawProgress - paletteTransition.delays[i] * delaySpan) / activeSpan,
      )
      const eased = smootherstep(localProgress)
      const offset = i * 3
      colors[offset] = THREE.MathUtils.lerp(paletteTransition.from[offset], paletteTransition.to[offset], eased)
      colors[offset + 1] = THREE.MathUtils.lerp(paletteTransition.from[offset + 1], paletteTransition.to[offset + 1], eased)
      colors[offset + 2] = THREE.MathUtils.lerp(paletteTransition.from[offset + 2], paletteTransition.to[offset + 2], eased)
    }

    voxelMesh.instanceColor.needsUpdate = true
    if (rawProgress >= 1) paletteTransition = null
  }

  applyPresentationTransform()

  const eased = smootherstep(rotationProgress)
  sculptureRoot.quaternion.slerpQuaternions(artQuaternion, qrQuaternion, eased)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)