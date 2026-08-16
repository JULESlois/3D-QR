import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import './styles.css'
import { buildLeafLayouts, QR_MODULE_SCALE, QR_SPACING, type LeafLayout } from './layout'
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
scene.fog = new THREE.Fog(0xf2f0e7, 10.5, 22)

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
camera.position.set(7.25, 5.05, 8.7)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.35, 0)
controls.enableDamping = true
controls.dampingFactor = 0.055
controls.enablePan = false
controls.minDistance = 5.7
controls.maxDistance = 14.5
controls.minPolarAngle = 0.48
controls.maxPolarAngle = 1.58
controls.autoRotate = true
controls.autoRotateSpeed = 0.34
controls.addEventListener('start', () => {
  controls.autoRotate = false
})

scene.add(new THREE.HemisphereLight(0xfffbef, 0x66766d, 1.75))

const keyLight = new THREE.DirectionalLight(0xfff1dc, 3.25)
keyLight.position.set(5.3, 8.2, 5.8)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(1536, 1536)
keyLight.shadow.camera.left = -7
keyLight.shadow.camera.right = 7
keyLight.shadow.camera.top = 7
keyLight.shadow.camera.bottom = -7
keyLight.shadow.camera.near = 0.1
keyLight.shadow.camera.far = 25
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xffc8d8, 0.68)
fillLight.position.set(-5, 4, 4)
scene.add(fillLight)

const rimLight = new THREE.DirectionalLight(0xb9d7ff, 1.25)
rimLight.position.set(-5.5, 3.2, -6)
scene.add(rimLight)

const sculpture = new THREE.Group()
scene.add(sculpture)

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: 0x654a39,
  roughness: 0.91,
  metalness: 0,
  transparent: true,
})

const veinMaterial = new THREE.MeshStandardMaterial({
  color: 0xef7f9f,
  roughness: 0.72,
  metalness: 0.02,
  emissive: 0x2a1118,
  emissiveIntensity: 0.18,
  transparent: true,
  opacity: 0.72,
})

function curvedBranch(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material = trunkMaterial,
  segments = 28,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.56)
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 7, false)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const trunk = new THREE.Group()
trunk.add(curvedBranch([
  new THREE.Vector3(-0.08, -1.92, 0.03),
  new THREE.Vector3(0.08, -0.7, -0.05),
  new THREE.Vector3(-0.07, 0.62, 0.04),
  new THREE.Vector3(0.05, 1.72, 0),
  new THREE.Vector3(-0.02, 2.56, -0.04),
], 0.285))
trunk.add(curvedBranch([
  new THREE.Vector3(-0.02, 0.42, 0),
  new THREE.Vector3(-0.44, 1.08, 0.08),
  new THREE.Vector3(-1.12, 1.72, 0.05),
  new THREE.Vector3(-1.62, 2.18, 0.02),
], 0.13))
trunk.add(curvedBranch([
  new THREE.Vector3(0.02, 0.62, 0),
  new THREE.Vector3(0.43, 1.2, -0.02),
  new THREE.Vector3(1.04, 1.72, 0.06),
  new THREE.Vector3(1.54, 2.18, 0.02),
], 0.125))
trunk.add(curvedBranch([
  new THREE.Vector3(-0.01, 0.88, 0.01),
  new THREE.Vector3(-0.12, 1.35, 0.42),
  new THREE.Vector3(-0.18, 1.78, 0.96),
  new THREE.Vector3(-0.2, 2.3, 1.34),
], 0.105))
trunk.add(curvedBranch([
  new THREE.Vector3(0.01, 0.96, -0.01),
  new THREE.Vector3(0.12, 1.42, -0.42),
  new THREE.Vector3(0.14, 1.88, -0.94),
  new THREE.Vector3(0.12, 2.38, -1.3),
], 0.1))
trunk.add(curvedBranch([
  new THREE.Vector3(0, 1.55, 0),
  new THREE.Vector3(-0.28, 2.08, -0.04),
  new THREE.Vector3(-0.62, 2.75, -0.12),
  new THREE.Vector3(-0.78, 3.34, -0.15),
], 0.09))
trunk.add(curvedBranch([
  new THREE.Vector3(0.02, 1.58, 0),
  new THREE.Vector3(0.3, 2.12, 0.05),
  new THREE.Vector3(0.63, 2.7, 0.1),
  new THREE.Vector3(0.84, 3.28, 0.12),
], 0.086))
sculpture.add(trunk)

const signalVeins = new THREE.Group()
signalVeins.add(curvedBranch([
  new THREE.Vector3(-1.48, 2.48, -0.48),
  new THREE.Vector3(-0.72, 2.72, -0.31),
  new THREE.Vector3(0.02, 2.93, -0.5),
  new THREE.Vector3(0.76, 2.76, -0.36),
  new THREE.Vector3(1.48, 2.5, -0.5),
], 0.026, veinMaterial, 36))
signalVeins.add(curvedBranch([
  new THREE.Vector3(-0.48, 1.58, 0.68),
  new THREE.Vector3(-0.34, 2.03, 0.49),
  new THREE.Vector3(-0.3, 2.5, 0.25),
  new THREE.Vector3(-0.42, 3.02, 0.05),
  new THREE.Vector3(-0.5, 3.4, -0.02),
], 0.024, veinMaterial, 32))
sculpture.add(signalVeins)

const groundMaterial = new THREE.ShadowMaterial({ color: 0x18201a, opacity: 0.12, transparent: true })
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), groundMaterial)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1.93
ground.receiveShadow = true
scene.add(ground)

function createRadialTexture(centerAlpha = 0.34): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, `rgba(255, 255, 255, ${centerAlpha})`)
  gradient.addColorStop(0.35, `rgba(255, 255, 255, ${centerAlpha * 0.42})`)
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const groundGlowMaterial = new THREE.MeshBasicMaterial({
  map: createRadialTexture(0.46),
  color: 0x28372b,
  transparent: true,
  opacity: 0.23,
  depthWrite: false,
  toneMapped: false,
})
const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.3), groundGlowMaterial)
groundGlow.rotation.x = -Math.PI / 2
groundGlow.position.set(0, -1.91, 0.2)
groundGlow.renderOrder = -2
scene.add(groundGlow)

const auraMaterial = new THREE.SpriteMaterial({
  map: createRadialTexture(0.62),
  color: 0xef7f9f,
  transparent: true,
  opacity: 0.085,
  depthWrite: false,
  toneMapped: false,
})
const canopyAura = new THREE.Sprite(auraMaterial)
canopyAura.position.set(0, 2.35, -1.7)
canopyAura.scale.set(7.1, 7.1, 1)
scene.add(canopyAura)

function createDustField(): THREE.Points {
  const count = 128
  const positions = new Float32Array(count * 3)

  for (let i = 0; i < count; i += 1) {
    const a = Math.sin((i + 1) * 12.9898) * 43758.5453
    const b = Math.sin((i + 1) * 37.719) * 14321.271
    const c = Math.sin((i + 1) * 78.233) * 9127.417
    const rx = a - Math.floor(a)
    const ry = b - Math.floor(b)
    const rz = c - Math.floor(c)
    positions[i * 3] = (rx - 0.5) * 9.5
    positions[i * 3 + 1] = -0.6 + ry * 6.5
    positions[i * 3 + 2] = (rz - 0.5) * 7.2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  })
  return new THREE.Points(geometry, material)
}

const dust = createDustField()
scene.add(dust)
const dustMaterial = dust.material as THREE.PointsMaterial

const qrBackingMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  toneMapped: false,
})
const qrBacking = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), qrBackingMaterial)
qrBacking.position.z = -0.075
qrBacking.renderOrder = 0
scene.add(qrBacking)

const leafMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.56,
  metalness: 0.012,
  clearcoat: 0.22,
  clearcoatRoughness: 0.72,
  transparent: true,
  opacity: 1,
})

const qrMaterial = new THREE.MeshBasicMaterial({
  color: 0x25181e,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  toneMapped: false,
})

const dummy = new THREE.Object3D()
const identityQuaternion = new THREE.Quaternion()
const tempPosition = new THREE.Vector3()
const tempQuaternion = new THREE.Quaternion()
const tempWindQuaternion = new THREE.Quaternion()
const tempScale = new THREE.Vector3()
const tempColor = new THREE.Color()
const tempTarget = new THREE.Vector3()
const upAxis = new THREE.Vector3(0, 1, 0)
const flatLeafScale = new THREE.Vector3(QR_MODULE_SCALE, QR_MODULE_SCALE, QR_MODULE_SCALE * 0.28)
const qrTarget = new THREE.Vector3(0, 0, 0)
const qrCameraPosition = new THREE.Vector3(0, 0, 9)
const treeCameraPosition = camera.position.clone()
const treeCameraTarget = controls.target.clone()

let paletteKey: PaletteKey = 'blossom'
let leafMesh: THREE.InstancedMesh | null = null
let qrMesh: THREE.InstancedMesh | null = null
let layouts: LeafLayout[] = []
let treeColors: THREE.Color[] = []
let qrSize = 21
let qrVersion = 1
let morph = 0
let targetMorph = 0
let dirtyInstances = true
let rebuildTimer = 0

function saturate(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smoothstep(value: number): number {
  const t = saturate(value)
  return t * t * (3 - 2 * t)
}

function getTreeColor(layout: LeafLayout, index: number): THREE.Color {
  const palette = PALETTES[paletteKey]
  const offset = Math.floor(layout.colorPhase * palette.colors.length)
  const roleShift = layout.role === 'finder' ? 1 : layout.role === 'timing' ? palette.colors.length - 1 : 0
  return new THREE.Color(palette.colors[(index + offset + roleShift) % palette.colors.length])
}

function applyPalette(): void {
  const palette = PALETTES[paletteKey]
  treeColors = layouts.map(getTreeColor)
  qrMaterial.color.set(palette.qrDark)

  const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
  const accentColor = new THREE.Color(accent)
  veinMaterial.color.copy(accentColor)
  veinMaterial.emissive.copy(accentColor).multiplyScalar(0.16)
  auraMaterial.color.copy(accentColor)
  document.documentElement.style.setProperty('--accent', accent)
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
  qrCameraPosition.set(0, 0, Math.max(5.7, distance * 1.13))
}

function disposeMeshes(): void {
  if (leafMesh) {
    sculpture.remove(leafMesh)
    leafMesh.geometry.dispose()
    leafMesh = null
  }
  if (qrMesh) {
    sculpture.remove(qrMesh)
    qrMesh.geometry.dispose()
    qrMesh = null
  }
}

function buildQrMesh(): void {
  if (!qrMesh) return

  for (let i = 0; i < layouts.length; i += 1) {
    dummy.position.copy(layouts[i].qrPosition)
    dummy.position.z = 0.018
    dummy.quaternion.copy(identityQuaternion)
    dummy.scale.set(QR_MODULE_SCALE, QR_MODULE_SCALE, 1)
    dummy.updateMatrix()
    qrMesh.setMatrixAt(i, dummy.matrix)
  }
  qrMesh.instanceMatrix.needsUpdate = true
}

function rebuild(value: string): void {
  const content = value.trim()
  if (!content) {
    meta.textContent = 'ENTER A URL OR TEXT TO GROW A QR TREE.'
    return
  }

  try {
    const matrix = createQRMatrix(content)
    qrSize = matrix.size
    qrVersion = matrix.version
    layouts = buildLeafLayouts(matrix.darkModules, matrix.size, content)

    disposeMeshes()

    const leafGeometry = new RoundedBoxGeometry(1, 1, 1, 3, 0.12)
    leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, layouts.length)
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    leafMesh.castShadow = true
    leafMesh.receiveShadow = true
    leafMesh.frustumCulled = false
    leafMesh.renderOrder = 1
    sculpture.add(leafMesh)

    const qrGeometry = new THREE.PlaneGeometry(1, 1)
    qrMesh = new THREE.InstancedMesh(qrGeometry, qrMaterial, layouts.length)
    qrMesh.frustumCulled = false
    qrMesh.renderOrder = 3
    qrMesh.visible = morph > 0.78
    sculpture.add(qrMesh)

    applyPalette()
    buildQrMesh()
    updateQrCameraDistance()

    const backingSize = qrExtent()
    qrBacking.scale.set(backingSize, backingSize, 1)

    const finderCount = matrix.darkModules.filter((module) => module.role === 'finder').length
    const timingCount = matrix.darkModules.filter((module) => module.role === 'timing').length
    meta.textContent = `QR V${qrVersion} · ${qrSize}×${qrSize} · F${finderCount} / T${timingCount} / D${layouts.length - finderCount - timingCount}`
    dirtyInstances = true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown QR error'
    meta.textContent = `QR ERROR · ${message}`
  }
}

function updateTreeInstances(elapsed: number): void {
  if (!leafMesh) return

  for (let i = 0; i < layouts.length; i += 1) {
    const layout = layouts[i]
    const localMorph = saturate((morph - layout.morphDelay) / Math.max(0.001, 1 - layout.morphDelay))
    const t = smoothstep(localMorph)
    const organic = 1 - t

    const sway = Math.sin(elapsed * 0.72 + layout.windPhase) * 0.045 * layout.windStrength * organic
    const lift = Math.sin(elapsed * 0.46 + layout.windPhase * 1.7) * 0.018 * organic

    tempPosition.lerpVectors(layout.treePosition, layout.qrPosition, t)

    const flightArc = Math.sin(t * Math.PI)
    const roleArc = layout.role === 'finder' ? 0.24 : layout.role === 'timing' ? 0.09 : 0.17
    tempPosition.y += flightArc * roleArc * 0.42
    tempPosition.z += flightArc * roleArc * Math.sin(layout.windPhase) * 1.35

    tempPosition.x += sway
    tempPosition.y += lift
    tempPosition.z += Math.cos(elapsed * 0.58 + layout.windPhase) * 0.028 * layout.windStrength * organic

    tempQuaternion.slerpQuaternions(layout.treeRotation, identityQuaternion, t)
    tempWindQuaternion.setFromAxisAngle(upAxis, sway * 1.4)
    tempQuaternion.multiply(tempWindQuaternion)

    tempScale.lerpVectors(layout.treeScale, flatLeafScale, t)
    const breathe = 1 + Math.sin(elapsed * 0.82 + layout.windPhase) * 0.025 * organic
    tempScale.multiplyScalar(breathe)

    dummy.position.copy(tempPosition)
    dummy.quaternion.copy(tempQuaternion)
    dummy.scale.copy(tempScale)
    dummy.updateMatrix()
    leafMesh.setMatrixAt(i, dummy.matrix)

    tempColor.copy(treeColors[i])
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
  modeToggleLabel.textContent = showQr ? 'GROW TREE' : 'REVEAL QR'
  modeReadout.textContent = showQr ? 'QR / READABLE' : 'TREE / LIVING'
  stageHint.textContent = showQr ? 'CLICK CANVAS TO REGROW' : 'DRAG TO ORBIT · CLICK TO FOLD'
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
    applyPalette()
  })
})

input.addEventListener('input', () => {
  window.clearTimeout(rebuildTimer)
  meta.textContent = 'RESEEDING SCULPTURE…'
  rebuildTimer = window.setTimeout(() => rebuild(input.value), 180)
})

let pointerStart: { x: number; y: number } | null = null
renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
  pointerStart = { x: event.clientX, y: event.clientY }
})
renderer.domElement.addEventListener('pointerup', (event: PointerEvent) => {
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
setMode('tree')
applyPalette()

const clock = new THREE.Clock()

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05)
  const elapsed = clock.elapsedTime
  const previousMorph = morph
  morph += (targetMorph - morph) * (1 - Math.exp(-5.1 * delta))

  if (Math.abs(targetMorph - morph) < 0.0002) morph = targetMorph
  if (Math.abs(previousMorph - morph) > 0.00001) dirtyInstances = true

  const t = smoothstep(morph)
  const qrReveal = smoothstep((t - 0.78) / 0.22)
  const organicOpacity = 1 - smoothstep(t / 0.64)
  const veinOpacity = 1 - smoothstep(t / 0.78)

  leafMaterial.opacity = 1 - qrReveal
  qrMaterial.opacity = smoothstep((t - 0.82) / 0.18)
  qrBackingMaterial.opacity = Math.pow(t, 2.35) * 0.995
  qrBacking.visible = morph > 0.01

  if (leafMesh) {
    leafMesh.visible = leafMaterial.opacity > 0.012
    leafMesh.castShadow = t < 0.7
  }
  if (qrMesh) qrMesh.visible = qrMaterial.opacity > 0.01

  trunkMaterial.opacity = organicOpacity
  trunk.visible = organicOpacity > 0.01

  veinMaterial.opacity = 0.72 * veinOpacity
  signalVeins.visible = veinMaterial.opacity > 0.01

  groundMaterial.opacity = 0.12 * organicOpacity
  ground.visible = organicOpacity > 0.01
  groundGlowMaterial.opacity = 0.23 * organicOpacity
  groundGlow.visible = organicOpacity > 0.01
  auraMaterial.opacity = 0.085 * organicOpacity
  canopyAura.visible = organicOpacity > 0.01
  dustMaterial.opacity = 0.25 * organicOpacity
  dust.visible = organicOpacity > 0.01
  dust.rotation.y += delta * 0.012
  dust.position.y = Math.sin(elapsed * 0.18) * 0.035

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

  if (morph < 0.999 || dirtyInstances) updateTreeInstances(elapsed)
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
