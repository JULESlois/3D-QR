import * as THREE from 'three'
import './styles.css'
import { CELL_SIZE, type SculptureBuild, type SculptureVoxel } from './sculpture'
import { PALETTES, isPaletteKey, type PaletteKey } from './palettes'
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

const sculptureRoot = new THREE.Group()
scene.add(sculptureRoot)

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
const voxelSize = CELL_SIZE * 0.91

const woodColors = ['#563b2d', '#6d4b34', '#815b3a'].map((value) => new THREE.Color(value))
const stoneColors = ['#6f746d', '#85897e', '#a09d8d', '#5d655f'].map((value) => new THREE.Color(value))
const plasterColors = ['#d8cbb4', '#e7dbc5', '#c9b99e', '#eee6d8'].map((value) => new THREE.Color(value))
const glassColors = ['#5e8790', '#83a7aa', '#496f78'].map((value) => new THREE.Color(value))
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

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function indexedColor(colors: readonly THREE.Color[], phase: number, target: THREE.Color): THREE.Color {
  const index = Math.min(colors.length - 1, Math.floor(clamp01(phase) * colors.length))
  return target.copy(colors[index])
}

function indexedHexColor(colors: readonly string[], phase: number, target: THREE.Color): THREE.Color {
  const index = Math.min(colors.length - 1, Math.floor(clamp01(phase) * colors.length))
  return target.set(colors[index])
}

function colorForVoxel(voxel: SculptureVoxel, target: THREE.Color): THREE.Color {
  const palette = PALETTES[paletteKey]
  const appearance = getStyle(styleId).appearance

  switch (voxel.kind) {
    case 'floor-light':
      return target.set(appearance.baseLight)
    case 'floor-dark':
      return indexedHexColor(appearance.baseDark, voxel.colorPhase, target)
    case 'wood':
      return indexedColor(woodColors, voxel.colorPhase, target)
    case 'stone':
      return indexedColor(stoneColors, voxel.colorPhase, target)
    case 'plaster':
      return indexedColor(plasterColors, voxel.colorPhase, target)
    case 'glass':
      return indexedColor(glassColors, voxel.colorPhase, target)
    case 'qr-top':
      return target.set(appearance.qrTop === 'palette' ? palette.qrDark : appearance.qrTop)
    case 'primary':
    default: {
      const index = Math.min(palette.colors.length - 1, Math.floor(clamp01(voxel.colorPhase) * palette.colors.length))
      return target.set(palette.colors[index])
    }
  }
}

function applyPalette(): void {
  if (voxelMesh && currentBuild) {
    for (let i = 0; i < currentBuild.voxels.length; i += 1) {
      colorForVoxel(currentBuild.voxels[i], tempColor)
      voxelMesh.setColorAt(i, tempColor)
    }
    if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true
  }

  const palette = PALETTES[paletteKey]
  const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
  document.documentElement.style.setProperty('--accent', accent)
  paletteButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.palette === paletteKey)
  })
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

    disposeVoxelMesh()
    currentBuild = build

    const mesh = new THREE.InstancedMesh(voxelGeometry, voxelMaterial, build.voxels.length)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.frustumCulled = false

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
    meta.textContent = `QR V${matrix.version} · ${matrix.size}×${matrix.size} · ${style.label.toUpperCase()} ${build.liftedModuleCount} · BASE D${build.baseDarkCount}/L${build.baseLightCount} · ${style.projectionLabel}${detail}`
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
    : 'CLICK TO ROTATE · ONE SCULPTURE / MULTIPLE PROJECTION STRATEGIES'
  document.body.dataset.mode = showQr ? 'qr' : 'art'
}

function toggleMode(): void {
  setMode(currentView === 'art' ? 'qr' : 'art')
}

modeToggle.addEventListener('click', toggleMode)
renderer.domElement.addEventListener('click', toggleMode)

styleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.style
    if (!requested || !isStyleId(requested) || requested === styleId) return

    styleId = requested
    paletteKey = getStyle(styleId).defaultPalette
    updateStyleCopy()
    applyPalette()
    rebuild(input.value)
  })
})

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return
    paletteKey = requested
    applyPalette()
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

  if (reducedMotion) {
    rotationProgress = targetRotationProgress
  } else {
    rotationProgress += (targetRotationProgress - rotationProgress) * (1 - Math.exp(-4.9 * delta))
    if (Math.abs(targetRotationProgress - rotationProgress) < 0.00015) {
      rotationProgress = targetRotationProgress
    }
  }

  const eased = smootherstep(rotationProgress)
  sculptureRoot.quaternion.slerpQuaternions(artQuaternion, qrQuaternion, eased)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
