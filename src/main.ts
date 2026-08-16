import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './styles.css'
import { buildLeafLayouts, QR_MODULE_SCALE, QR_SPACING, type LeafLayout } from './layout'
import { PALETTES, isPaletteKey, type PaletteKey } from './palettes'
import { createQRMatrix } from './qr'

const stage = document.querySelector<HTMLElement>('#stage')
const input = document.querySelector<HTMLInputElement>('#qr-input')
const meta = document.querySelector<HTMLElement>('#qr-meta')
const modeToggle = document.querySelector<HTMLButtonElement>('#mode-toggle')
const modeToggleLabel = document.querySelector<HTMLElement>('#mode-toggle-label')
const modeReadout = document.querySelector<HTMLElement>('#mode-readout')
const stageHint = document.querySelector<HTMLElement>('#stage-hint')
const paletteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-palette]'))

if (!stage || !input || !meta || !modeToggle || !modeToggleLabel || !modeReadout || !stageHint) {
  throw new Error('Required UI elements are missing')
}

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
camera.position.set(7.4, 5.2, 8.6)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.35, 0)
controls.enableDamping = true
controls.dampingFactor = 0.055
controls.enablePan = false
controls.minDistance = 5.5
controls.maxDistance = 15
controls.autoRotate = true
controls.autoRotateSpeed = 0.38
controls.addEventListener('start', () => {
  controls.autoRotate = false
})

scene.add(new THREE.HemisphereLight(0xfffbef, 0x697b72, 2.05))

const keyLight = new THREE.DirectionalLight(0xfff5e6, 3.4)
keyLight.position.set(5, 8, 6)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(1024, 1024)
keyLight.shadow.camera.left = -7
keyLight.shadow.camera.right = 7
keyLight.shadow.camera.top = 7
keyLight.shadow.camera.bottom = -7
keyLight.shadow.camera.near = 0.1
keyLight.shadow.camera.far = 24
scene.add(keyLight)

const rimLight = new THREE.DirectionalLight(0xbfd5ff, 1.15)
rimLight.position.set(-6, 3, -5)
scene.add(rimLight)

const sculpture = new THREE.Group()
scene.add(sculpture)

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: 0x74533d,
  roughness: 0.92,
  metalness: 0,
  transparent: true,
})

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.Mesh {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const geometry = new THREE.CylinderGeometry(radius * 0.62, radius, length, 7, 1)
  const mesh = new THREE.Mesh(geometry, trunkMaterial)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const trunk = new THREE.Group()
trunk.add(cylinderBetween(new THREE.Vector3(0, -1.9, 0), new THREE.Vector3(0.02, 1.62, 0), 0.37))
trunk.add(cylinderBetween(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(-1.28, 1.92, 0.18), 0.17))
trunk.add(cylinderBetween(new THREE.Vector3(0, 0.72, 0), new THREE.Vector3(1.22, 1.98, -0.02), 0.16))
trunk.add(cylinderBetween(new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0.02, 2.05, 1.04), 0.14))
trunk.add(cylinderBetween(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(-0.1, 2.12, -1.0), 0.13))
sculpture.add(trunk)

const groundMaterial = new THREE.ShadowMaterial({ color: 0x1a211d, opacity: 0.13, transparent: true })
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), groundMaterial)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.92
ground.receiveShadow = true
scene.add(ground)

const qrBackingMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
})
const qrBacking = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), qrBackingMaterial)
qrBacking.position.z = -0.12
qrBacking.renderOrder = -1
scene.add(qrBacking)

const dummy = new THREE.Object3D()
const identityQuaternion = new THREE.Quaternion()
const tempPosition = new THREE.Vector3()
const tempQuaternion = new THREE.Quaternion()
const tempColor = new THREE.Color()
const tempTarget = new THREE.Vector3()
const qrTarget = new THREE.Vector3(0, 0, 0)
const qrCameraPosition = new THREE.Vector3(0, 0, 9)
const treeCameraPosition = camera.position.clone()
const treeCameraTarget = controls.target.clone()

let paletteKey: PaletteKey = 'blossom'
let leafMesh: THREE.InstancedMesh | null = null
let layouts: LeafLayout[] = []
let treeColors: THREE.Color[] = []
let qrSize = 21
let qrVersion = 1
let morph = 0
let targetMorph = 0
let dirtyInstances = true
let rebuildTimer = 0

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

function getTreeColor(layout: LeafLayout, index: number): THREE.Color {
  const palette = PALETTES[paletteKey]
  const offset = Math.floor(layout.colorPhase * palette.colors.length)
  return new THREE.Color(palette.colors[(index + offset) % palette.colors.length])
}

function refreshTreeColors(): void {
  treeColors = layouts.map(getTreeColor)
  dirtyInstances = true
}

function qrExtent(): number {
  return (qrSize + 8) * QR_SPACING
}

function updateQrCameraDistance(): void {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const limitingFov = Math.min(verticalFov, horizontalFov)
  const distance = (qrExtent() * 0.5) / Math.tan(limitingFov / 2)
  qrCameraPosition.set(0, 0, Math.max(5.5, distance * 1.16))
}

function disposeLeafMesh(): void {
  if (!leafMesh) return
  sculpture.remove(leafMesh)
  leafMesh.geometry.dispose()
  if (Array.isArray(leafMesh.material)) {
    leafMesh.material.forEach((material) => material.dispose())
  } else {
    leafMesh.material.dispose()
  }
  leafMesh = null
}

function rebuild(value: string): void {
  const content = value.trim()
  if (!content) {
    meta.textContent = 'Enter a URL or text to grow a QR tree.'
    return
  }

  try {
    const matrix = createQRMatrix(content)
    qrSize = matrix.size
    qrVersion = matrix.version
    layouts = buildLeafLayouts(matrix.darkModules, matrix.size, content)

    disposeLeafMesh()

    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.025,
    })

    leafMesh = new THREE.InstancedMesh(geometry, material, layouts.length)
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    leafMesh.castShadow = true
    leafMesh.receiveShadow = true
    leafMesh.frustumCulled = false
    leafMesh.renderOrder = 1
    sculpture.add(leafMesh)

    refreshTreeColors()
    updateQrCameraDistance()

    const backingSize = qrExtent()
    qrBacking.scale.set(backingSize, backingSize, 1)
    meta.textContent = `QR V${qrVersion} · ${qrSize}×${qrSize} · ${layouts.length} DARK MODULES`
    dirtyInstances = true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown QR error'
    meta.textContent = `QR ERROR · ${message}`
  }
}

function updateInstances(): void {
  if (!leafMesh) return

  const t = smoothstep(THREE.MathUtils.clamp(morph, 0, 1))
  const qrColor = new THREE.Color(PALETTES[paletteKey].qrDark)

  for (let i = 0; i < layouts.length; i += 1) {
    const layout = layouts[i]

    tempPosition.lerpVectors(layout.treePosition, layout.qrPosition, t)
    tempQuaternion.slerpQuaternions(layout.treeRotation, identityQuaternion, t)

    dummy.position.copy(tempPosition)
    dummy.quaternion.copy(tempQuaternion)
    dummy.scale.setScalar(THREE.MathUtils.lerp(layout.treeScale, QR_MODULE_SCALE, t))
    dummy.updateMatrix()
    leafMesh.setMatrixAt(i, dummy.matrix)

    tempColor.copy(treeColors[i]).lerp(qrColor, t)
    leafMesh.setColorAt(i, tempColor)
  }

  leafMesh.instanceMatrix.needsUpdate = true
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
  dirtyInstances = false
}

function setMode(next: 'tree' | 'qr'): void {
  const showQr = next === 'qr'

  if (showQr && targetMorph === 0) {
    treeCameraPosition.copy(camera.position)
    treeCameraTarget.copy(controls.target)
  }

  targetMorph = showQr ? 1 : 0
  modeToggle.setAttribute('aria-pressed', String(showQr))
  modeToggleLabel.textContent = showQr ? 'SHOW TREE' : 'SHOW QR'
  modeReadout.textContent = showQr ? 'QR MODE' : 'TREE MODE'
  stageHint.textContent = showQr ? 'CLICK CANVAS TO GROW TREE' : 'DRAG TO ORBIT · CLICK CANVAS TO MORPH'
  document.body.dataset.mode = showQr ? 'qr' : 'tree'
}

function toggleMode(): void {
  setMode(targetMorph > 0.5 ? 'tree' : 'qr')
}

modeToggle.addEventListener('click', toggleMode)

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const requested = button.dataset.palette
    if (!requested || !isPaletteKey(requested)) return

    paletteKey = requested
    paletteButtons.forEach((candidate) => {
      candidate.classList.toggle('is-active', candidate === button)
    })
    refreshTreeColors()
  })
})

input.addEventListener('input', () => {
  window.clearTimeout(rebuildTimer)
  meta.textContent = 'REGENERATING…'
  rebuildTimer = window.setTimeout(() => rebuild(input.value), 180)
})

let pointerStart: { x: number; y: number } | null = null
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY }
})
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart) return
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  pointerStart = null
  if (distance < 5) toggleMode()
})
renderer.domElement.addEventListener('pointercancel', () => {
  pointerStart = null
})

function resize(): void {
  const { clientWidth, clientHeight } = stage
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / Math.max(1, clientHeight)
  camera.updateProjectionMatrix()
  updateQrCameraDistance()
}

const resizeObserver = new ResizeObserver(resize)
resizeObserver.observe(stage)
resize()
rebuild(input.value)

const clock = new THREE.Clock()

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05)
  const previousMorph = morph
  morph += (targetMorph - morph) * (1 - Math.exp(-5.8 * delta))

  if (Math.abs(targetMorph - morph) < 0.0002) morph = targetMorph
  if (Math.abs(previousMorph - morph) > 0.00001) dirtyInstances = true

  const t = smoothstep(morph)
  qrBackingMaterial.opacity = Math.pow(t, 2.5) * 0.985
  qrBacking.visible = morph > 0.01

  const organicOpacity = 1 - THREE.MathUtils.clamp(morph * 1.75, 0, 1)
  trunkMaterial.opacity = organicOpacity
  trunk.visible = organicOpacity > 0.01
  groundMaterial.opacity = 0.13 * organicOpacity
  ground.visible = organicOpacity > 0.01

  if (morph > 0.001 || targetMorph === 1) {
    controls.enabled = false
    camera.position.lerpVectors(treeCameraPosition, qrCameraPosition, t)
    tempTarget.lerpVectors(treeCameraTarget, qrTarget, t)
    controls.target.copy(tempTarget)
    camera.lookAt(tempTarget)
  } else {
    controls.enabled = true
    controls.update()
    treeCameraPosition.copy(camera.position)
    treeCameraTarget.copy(controls.target)
  }

  if (dirtyInstances) updateInstances()
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
