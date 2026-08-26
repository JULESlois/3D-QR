import * as THREE from 'three'
import './styles.css'
import { isPaletteKey, type PaletteKey } from './palettes'
import { isStyleId, type StyleId } from './styles'
import { exportRevealGif } from './gif-export'
import { createPresentationController } from './presentation'
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
import { createAppUiController } from './app-ui'

const ui = createAppUiController()
const {
  stage,
  input,
  meta,
  styleRow,
  styleButtons,
  paletteButtons,
  exportGifButton,
} = ui

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
  ui.updatePalette(sculpture.styleId, sculpture.paletteKey)
}

function setExportUiBusy(busy: boolean): void {
  isExporting = busy
  ui.setExportBusy(busy)
  renderer.domElement.style.pointerEvents = busy ? 'none' : ''
}

function updateStyleCopy(): void {
  ui.updateStyle(sculpture.styleId)
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
  ui.updateProjection(sculpture.styleId, next)
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
  ui.updatePalette(sculpture.styleId, sculpture.paletteKey)

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
  renderer.setSize(width, height, false)
  presentation.updateComposition(width, height, sculpture.build, true)
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
  const delta = clock.getDelta()
  const now = performance.now()

  paletteTransitions.update(voxelMeshes.mesh, now)
  presentation.applyTransform()
  viewTransitions.update(delta)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
