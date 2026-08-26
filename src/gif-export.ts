import * as THREE from 'three'
import type { SculptureBuild } from './sculpture'
import { createExportSceneSnapshot } from './export-scene'

const EXPORT_SIZE = 512
const EXPORT_FPS = 18
const EXPORT_FRAME_COUNT = 54
const EXPORT_TITLE = 'Export a looping sculpture-to-QR reveal'

export interface GifExportContext {
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

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function smootherstep(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
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

function showExportFeedback(button: HTMLButtonElement, label: string, title: string): void {
  button.textContent = label
  button.title = title
  window.setTimeout(() => {
    button.textContent = 'EXPORT GIF'
    button.title = EXPORT_TITLE
  }, 2200)
}

export async function exportRevealGif(context: GifExportContext): Promise<void> {
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

  const previousMeta = meta.textContent

  setBusy(true)
  button.textContent = 'PREPARING…'
  button.title = 'Preparing GIF export'

  let exportRenderer: THREE.WebGLRenderer | null = null
  let feedback: { label: string; title: string } | null = null

  try {
    const exportSnapshot = createExportSceneSnapshot(scene, presentationGroup, sculptureRoot)
    const { GIFEncoder, quantize, applyPalette } = await loadGifEncoder()
    const frameDelay = Math.round(1000 / EXPORT_FPS)
    const gif = GIFEncoder()

    exportRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    exportRenderer.setPixelRatio(1)
    exportRenderer.setSize(EXPORT_SIZE, EXPORT_SIZE, false)
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
    captureCanvas.width = EXPORT_SIZE
    captureCanvas.height = EXPORT_SIZE
    const captureContext = captureCanvas.getContext('2d', { willReadFrequently: true })
    if (!captureContext) throw new Error('Canvas capture is unavailable in this browser')

    const exportScale = Math.min(1.08, 8.35 / build.footprint)
    exportSnapshot.presentationGroup.position.set(0, 0.42, 0)
    exportSnapshot.presentationGroup.scale.setScalar(exportScale)
    exportSnapshot.presentationGroup.rotation.set(0, 0, 0)

    for (let frame = 0; frame < EXPORT_FRAME_COUNT; frame += 1) {
      const progress = frame / (EXPORT_FRAME_COUNT - 1)
      const revealProgress = smootherstep(revealRotationProgress(progress))
      exportSnapshot.sculptureRoot.quaternion.slerpQuaternions(
        artQuaternion,
        qrQuaternion,
        revealProgress,
      )

      exportRenderer.render(exportSnapshot.scene, exportCamera)
      captureContext.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
      captureContext.drawImage(exportRenderer.domElement, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
      const pixels = captureContext.getImageData(0, 0, EXPORT_SIZE, EXPORT_SIZE).data
      const palette = quantize(pixels, 192)
      const indexed = applyPalette(pixels, palette)
      gif.writeFrame(indexed, EXPORT_SIZE, EXPORT_SIZE, {
        palette,
        delay: frameDelay,
        repeat: 0,
      })

      const percent = Math.round(((frame + 1) / EXPORT_FRAME_COUNT) * 100)
      button.textContent = `GIF ${percent}%`
      meta.textContent = `ENCODING REVEAL · ${percent}% · ${EXPORT_SIZE}×${EXPORT_SIZE} · ${EXPORT_FPS} FPS`

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
    anchor.download = `3d-qr-${styleId}-reveal.gif`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)

    meta.textContent = `GIF EXPORTED · ${EXPORT_SIZE}×${EXPORT_SIZE} · ${EXPORT_FPS} FPS · ${(EXPORT_FRAME_COUNT / EXPORT_FPS).toFixed(1)}S LOOP`
    feedback = { label: 'EXPORTED ✓', title: 'GIF saved' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export error'
    meta.textContent = `GIF EXPORT ERROR · ${message}`
    feedback = { label: 'EXPORT FAILED', title: message }
  } finally {
    exportRenderer?.dispose()
    setBusy(false)

    if (feedback) showExportFeedback(button, feedback.label, feedback.title)
    else {
      button.textContent = 'EXPORT GIF'
      button.title = EXPORT_TITLE
    }

    if (!meta.textContent?.startsWith('GIF ')) meta.textContent = previousMeta
  }
}
