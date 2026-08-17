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
const styleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-style]'))
const paletteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-palette]'))

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
let rotationProgress = 0
let targetRotationProgress = 0
let currentView: 'art' | 'qr' = 'art'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

type PaletteTransition = {
  from: Float32Array
  to: Float32Array
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

function buildPaletteBuffer(): Float32Array | null {
  if (!currentBuild) return null
  const buffer = new Float32Array(currentBuild.voxels.length * 3)
  for (let i = 0; i < currentBuild.voxels.length; i += 1) {
    colorForVoxel(currentBuild.voxels[i], tempColor)
    const offset = i * 3
    buffer[offset] = tempColor.r
    buffer[offset + 1] = tempColor.g
    buffer[offset + 2] = tempColor.b
  }
  return buffer
}

function capturePaletteBuffer(): Float32Array | null {
  if (!voxelMesh?.instanceColor) return null
  return new Float32Array(voxelMesh.instanceColor.array as ArrayLike<number>)
}

function applyPaletteBuffer(buffer: Float32Array): void {
  if (!voxelMesh || !currentBuild) return
  for (let i = 0; i < currentBuild.voxels.length; i += 1) {
    const offset = i * 3
    tempColor.setRGB(buffer[offset], buffer[offset + 1], buffer[offset + 2])
    voxelMesh.setColorAt(i, tempColor)
  }
  if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true
}

function updatePaletteChrome(): void {
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

function applyPalette(animateColors = false): void {
  const target = buildPaletteBuffer()
  updatePaletteChrome()

  if (!target) return
  if (!animateColors || reducedMotion || !voxelMesh) {
    paletteTransition = null
    applyPaletteBuffer(target)
    return
  }

  const from = capturePaletteBuffer()
  if (!from || from.length !== target.length) {
    paletteTransition = null
    applyPaletteBuffer(target)
    return
  }

  paletteTransition = {
    from,
    to: target,
    startedAt: performance.now(),
    duration: 380,
  }
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
    const scale = Math.min(1.08, targetFootprint / currentBuild.footprint)
    sculptureRoot.scale.setScalar(scale)
  }

  sculptureRoot.position.x = aspect > 1.45 ? 1.85 : aspect > 1.15 ? 1.25 : 0
  sculptureRoot.position.y = aspect > 1.15 ? 0.42 : 1.05
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
  setMode(currentView === 'art' ? 'qr' : 'art')
}

function resetPresentationTransform(): void {
  presentationGroup.position.set(0, 0, 0)
  presentationGroup.scale.setScalar(1)
  presentationGroup.rotation.set(0, 0, 0)
}

function swapStyleTransition(): void {
  if (!styleTransition || styleTransition.swapped) return
  styleTransition.swapped = true
  styleId = styleTransition.nextStyleId
  paletteKey = styleTransition.nextPaletteKey
  updateStyleCopy()
  rebuild(input.value)
}

function requestStyleTransition(nextStyleId: StyleId): void {
  if (nextStyleId === styleId && !styleTransition) return

  if (styleTransition) {
    swapStyleTransition()
    styleTransition = null
    resetPresentationTransform()
  }

  if (reducedMotion) {
    styleId = nextStyleId
    paletteKey = getStyle(styleId).defaultPalette
    updateStyleCopy()
    rebuild(input.value)
    return
  }

  styleTransition = {
    nextStyleId,
    nextPaletteKey: getStyle(nextStyleId).defaultPalette,
    startedAt: performance.now(),
    duration: 620,
    swapped: false,
  }
}

function requestPaletteTransition(nextPaletteKey: PaletteKey): void {
  if (nextPaletteKey === paletteKey) return

  if (styleTransition) {
    swapStyleTransition()
    styleTransition = null
    resetPresentationTransform()
  }

  paletteKey = nextPaletteKey
  applyPalette(true)
}

modeToggle.addEventListener('click', toggleMode)
renderer.domElement.addEventListener('click', toggleMode)

styleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.style
    if (!requested || !isStyleId(requested)) return
    requestStyleTransition(requested)
  })
})

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return
    requestPaletteTransition(requested)
  })
})

input.addEventListener('input', () => {
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
    const t = clamp01((now - paletteTransition.startedAt) / paletteTransition.duration)
    const easedPalette = smootherstep(t)
    const colors = voxelMesh.instanceColor.array as Float32Array
    for (let i = 0; i < colors.length; i += 1) {
      colors[i] = THREE.MathUtils.lerp(paletteTransition.from[i], paletteTransition.to[i], easedPalette)
    }
    voxelMesh.instanceColor.needsUpdate = true
    if (t >= 1) paletteTransition = null
  }

  if (styleTransition) {
    const t = clamp01((now - styleTransition.startedAt) / styleTransition.duration)
    if (!styleTransition.swapped && t >= 0.5) swapStyleTransition()

    const envelope = Math.sin(Math.PI * t)
    presentationGroup.position.y = envelope * 0.66
    presentationGroup.scale.setScalar(1 - envelope * 0.09)
    presentationGroup.rotation.z = Math.sin(Math.PI * 2 * t) * 0.065

    if (t >= 1) {
      styleTransition = null
      resetPresentationTransform()
    }
  }

  const eased = smootherstep(rotationProgress)
  sculptureRoot.quaternion.slerpQuaternions(artQuaternion, qrQuaternion, eased)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
