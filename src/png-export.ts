import * as THREE from 'three'
import type { SculptureBuild } from './sculpture'
import { createExportSceneSnapshot } from './export-scene'

const PANEL_SIZE = 1024
const EXPORT_VIEW_HEIGHT = 10.6

export interface PngExportContext {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  presentationGroup: THREE.Group
  sculptureRoot: THREE.Group
  artQuaternion: THREE.Quaternion
  qrQuaternion: THREE.Quaternion
  build: SculptureBuild
  styleId: string
  button: HTMLButtonElement
  meta: HTMLElement
  setBusy: (busy: boolean) => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Browser could not encode the PNG image.'))
    }, 'image/png')
  })
}

function safeSegment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return normalized.replace(/^-+|-+$/g, '') || 'scene'
}

function createExportRenderer(source: THREE.WebGLRenderer): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(PANEL_SIZE, PANEL_SIZE, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = source.toneMappingExposure
  return renderer
}

function createExportCamera(camera: THREE.OrthographicCamera): THREE.OrthographicCamera {
  const exportCamera = camera.clone()
  exportCamera.top = EXPORT_VIEW_HEIGHT / 2
  exportCamera.bottom = -EXPORT_VIEW_HEIGHT / 2
  exportCamera.left = -EXPORT_VIEW_HEIGHT / 2
  exportCamera.right = EXPORT_VIEW_HEIGHT / 2
  exportCamera.updateProjectionMatrix()
  return exportCamera
}

function renderPanel(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  exportSculptureRoot: THREE.Group,
  quaternion: THREE.Quaternion,
  background: string,
): HTMLCanvasElement {
  exportSculptureRoot.quaternion.copy(quaternion)
  renderer.setClearColor(new THREE.Color(background), 1)
  renderer.render(scene, camera)

  const panel = document.createElement('canvas')
  panel.width = PANEL_SIZE
  panel.height = PANEL_SIZE
  const context = panel.getContext('2d')
  if (!context) throw new Error('2D canvas is unavailable for PNG export.')
  context.drawImage(renderer.domElement, 0, 0, PANEL_SIZE, PANEL_SIZE)
  return panel
}

function composePair(art: HTMLCanvasElement, qr: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = PANEL_SIZE * 2
  output.height = PANEL_SIZE
  const context = output.getContext('2d')
  if (!context) throw new Error('2D canvas is unavailable for PNG composition.')

  context.drawImage(art, 0, 0)
  context.drawImage(qr, PANEL_SIZE, 0)
  return output
}

export async function exportPngPair(context: PngExportContext): Promise<void> {
  const {
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    artQuaternion,
    qrQuaternion,
    build,
    styleId,
    button,
    meta,
    setBusy,
  } = context

  if (button.disabled) return

  const initialLabel = button.textContent || 'PNG ×2'
  const initialMeta = meta.textContent

  button.textContent = 'CAPTURING…'
  document.body.dataset.pngExporting = 'true'
  setBusy(true)

  let exportRenderer: THREE.WebGLRenderer | null = null

  try {
    const exportSnapshot = createExportSceneSnapshot(scene, presentationGroup, sculptureRoot)
    exportRenderer = createExportRenderer(renderer)
    const exportCamera = createExportCamera(camera)
    const css = getComputedStyle(document.documentElement)
    const paper = css.getPropertyValue('--paper').trim() || '#f2f0e7'
    const paperClean = css.getPropertyValue('--paper-clean').trim() || '#f8f8f5'
    const exportScale = Math.min(1.08, 8.35 / build.footprint)

    exportSnapshot.presentationGroup.position.set(0, 0.42, 0)
    exportSnapshot.presentationGroup.scale.setScalar(exportScale)
    exportSnapshot.presentationGroup.rotation.set(0, 0, 0)

    const art = renderPanel(
      exportRenderer,
      exportSnapshot.scene,
      exportCamera,
      exportSnapshot.sculptureRoot,
      artQuaternion,
      paper,
    )
    const qr = renderPanel(
      exportRenderer,
      exportSnapshot.scene,
      exportCamera,
      exportSnapshot.sculptureRoot,
      qrQuaternion,
      paperClean,
    )
    const pair = composePair(art, qr)
    const blob = await canvasToBlob(pair)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `3d-qr-${safeSegment(styleId)}-art-qr.png`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)

    button.textContent = 'EXPORTED ✓'
    meta.textContent = `PNG EXPORTED · ${pair.width}×${pair.height} · ART + QR`
    document.dispatchEvent(new CustomEvent('png-export-complete', {
      detail: { width: pair.width, height: pair.height, bytes: blob.size },
    }))
    await sleep(900)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PNG export error'
    button.textContent = 'EXPORT FAILED'
    meta.textContent = `PNG EXPORT ERROR · ${message}`
    await sleep(1200)
  } finally {
    exportRenderer?.dispose()
    setBusy(false)
    button.textContent = initialLabel
    delete document.body.dataset.pngExporting
    if (!meta.textContent?.startsWith('PNG EXPORT')) meta.textContent = initialMeta
  }
}
