import * as THREE from 'three'
import './styles.css'
import { buildVoxelSculpture, CELL_SIZE, type SculptureBuild, type SculptureVoxel } from './layout'
import { PALETTES, isPaletteKey, type PaletteKey } from './palettes'
import { createQRMatrix } from './qr'

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

const treeQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.76, -0.7, 0.035, 'XYZ'),
)
const qrQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, 0, 0, 'XYZ'),
)
sculptureRoot.quaternion.copy(treeQuaternion)

const voxelGeometry = new THREE.BoxGeometry(1, 1, 1)
const voxelMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.86,
  metalness: 0.015,
})
const voxelSize = CELL_SIZE * 0.91

const groundLight = new THREE.Color('#ece7d8')
const groundDark = [
  new THREE.Color('#315d43'),
  new THREE.Color('#466f49'),
  new THREE.Color('#5d7e50'),
  new THREE.Color('#738e58'),
]
const trunkColors = [
  new THREE.Color('#563b2d'),
  new THREE.Color('#6d4b34'),
  new THREE.Color('#815b3a'),
]
const tempColor = new THREE.Color()
const dummy = new THREE.Object3D()

let paletteKey: PaletteKey = 'blossom'
let voxelMesh: THREE.InstancedMesh | null = null
let currentBuild: SculptureBuild | null = null
let rebuildTimer = 0
let rotationProgress = 0
let targetRotationProgress = 0
let currentView: 'tree' | 'qr' = 'tree'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function colorForVoxel(voxel: SculptureVoxel, target: THREE.Color): THREE.Color {
  const palette = PALETTES[paletteKey]

  switch (voxel.kind) {
    case 'floor-light':
      return target.copy(groundLight)
    case 'floor-dark': {
      const index = Math.min(groundDark.length - 1, Math.floor(voxel.colorPhase * groundDark.length))
      return target.copy(groundDark[index])
    }
    case 'trunk': {
      const index = Math.min(trunkColors.length - 1, Math.floor(voxel.colorPhase * trunkColors.length))
      return target.copy(trunkColors[index])
    }
    case 'canopy-top':
      return target.set(palette.qrDark)
    case 'canopy':
    default: {
      const index = Math.min(palette.colors.length - 1, Math.floor(voxel.colorPhase * palette.colors.length))
      return target.set(palette.colors[index])
    }
  }
}

function applyPalette(): void {
  if (!voxelMesh || !currentBuild) return

  for (let i = 0; i < currentBuild.voxels.length; i += 1) {
    colorForVoxel(currentBuild.voxels[i], tempColor)
    voxelMesh.setColorAt(i, tempColor)
  }

  if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true

  const palette = PALETTES[paletteKey]
  const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
  document.documentElement.style.setProperty('--accent', accent)
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

function rebuild(value: string): void {
  const content = value.trim()
  if (!content) {
    meta.textContent = 'ENTER A URL OR TEXT TO GROW A QR SCULPTURE.'
    return
  }

  try {
    const matrix = createQRMatrix(content)
    const build = buildVoxelSculpture(matrix, content)

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

    meta.textContent = `QR V${matrix.version} · ${matrix.size}×${matrix.size} · TREE ${build.treeModuleCount} / GROUND ${build.groundDarkCount}`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown QR error'
    meta.textContent = `QR ERROR · ${message}`
  }
}

function setMode(next: 'tree' | 'qr'): void {
  currentView = next
  const showQr = next === 'qr'
  targetRotationProgress = showQr ? 1 : 0

  modeToggle.setAttribute('aria-pressed', String(showQr))
  modeToggleLabel.textContent = showQr ? 'BACK TO TREE' : 'VIEW QR'
  modeReadout.textContent = showQr ? 'QR / SAME VOXELS' : 'TREE / ISOMETRIC'
  stageHint.textContent = showQr
    ? 'CLICK TO RETURN · TREE + GROUND = QR'
    : 'CLICK TO ROTATE · ONE SCULPTURE / TWO VIEWS'
}

function toggleMode(): void {
  setMode(currentView === 'tree' ? 'qr' : 'tree')
}

modeToggle.addEventListener('click', toggleMode)
renderer.domElement.addEventListener('click', toggleMode)

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return

    paletteKey = requested
    paletteButtons.forEach((candidate) => {
      candidate.classList.toggle('is-active', candidate === button)
    })
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
rebuild(input.value)
setMode('tree')

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
  sculptureRoot.quaternion.slerpQuaternions(treeQuaternion, qrQuaternion, eased)

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
