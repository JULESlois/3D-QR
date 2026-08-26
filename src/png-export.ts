import { requestProjectionView, type ProjectionView } from './projection-view'

const exportButtonElement = document.querySelector<HTMLButtonElement>('#export-png')
const stageCanvasElement = document.querySelector<HTMLCanvasElement>('#stage canvas')
const meta = document.querySelector<HTMLElement>('#qr-meta')

if (!exportButtonElement || !stageCanvasElement) {
  throw new Error('PNG export requires #export-png and the stage canvas.')
}

const exportButton = exportButtonElement
const stageCanvas = stageCanvasElement

const PANEL_SIZE = 1024
const MODE_SETTLE_MS = 2600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForMode(mode: ProjectionView): Promise<void> {
  if (document.body.dataset.mode === mode) return

  requestProjectionView(mode)

  const deadline = performance.now() + 1200
  while (document.body.dataset.mode !== mode) {
    if (performance.now() >= deadline) {
      throw new Error(`Could not enter ${mode.toUpperCase()} view for PNG export.`)
    }
    await sleep(40)
  }

  // body[data-mode] changes immediately, while the sculpture continues rotating.
  // Match the browser QR smoke's settle window so each panel captures its final pose.
  await sleep(MODE_SETTLE_MS)
}

function drawPanel(mode: ProjectionView): HTMLCanvasElement {
  const panel = document.createElement('canvas')
  panel.width = PANEL_SIZE
  panel.height = PANEL_SIZE
  const context = panel.getContext('2d')
  if (!context) throw new Error('2D canvas is unavailable for PNG export.')

  const css = getComputedStyle(document.documentElement)
  const backgroundVariable = mode === 'qr' ? '--paper-clean' : '--paper'
  const background = css.getPropertyValue(backgroundVariable).trim() || '#f2f0e7'
  context.fillStyle = background
  context.fillRect(0, 0, PANEL_SIZE, PANEL_SIZE)

  const sourceWidth = Math.max(1, stageCanvas.width)
  const sourceHeight = Math.max(1, stageCanvas.height)
  const scale = Math.min(PANEL_SIZE / sourceWidth, PANEL_SIZE / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const x = (PANEL_SIZE - width) / 2
  const y = (PANEL_SIZE - height) / 2
  context.drawImage(stageCanvas, x, y, width, height)

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

async function exportPngPair(): Promise<void> {
  if (exportButton.disabled) return

  const initialMode: ProjectionView = document.body.dataset.mode === 'qr' ? 'qr' : 'art'
  const initialLabel = exportButton.textContent || 'EXPORT PNG'
  const initialMeta = meta?.textContent ?? ''
  const controls = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'))
  const priorDisabled = controls.map((control) => control.disabled)
  const priorPointerEvents = stageCanvas.style.pointerEvents

  exportButton.textContent = 'CAPTURING…'
  exportButton.setAttribute('aria-busy', 'true')
  document.body.dataset.pngExporting = 'true'
  controls.forEach((control) => { control.disabled = true })
  // PNG capture temporarily owns the Art/QR presentation state. Explicit projection
  // commands still work while pointer interaction is locked, so user clicks cannot race
  // either capture pose.
  stageCanvas.style.pointerEvents = 'none'

  try {
    await waitForMode('art')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const art = drawPanel('art')

    await waitForMode('qr')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const qr = drawPanel('qr')

    const pair = composePair(art, qr)
    const blob = await canvasToBlob(pair)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `3d-qr-${safeSegment(document.body.dataset.style ?? '')}-art-qr.png`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)

    exportButton.textContent = 'EXPORTED ✓'
    if (meta) meta.textContent = `PNG EXPORTED · ${pair.width}×${pair.height} · ART + QR`
    document.dispatchEvent(new CustomEvent('png-export-complete', {
      detail: { width: pair.width, height: pair.height, bytes: blob.size },
    }))
    await sleep(900)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PNG export error'
    exportButton.textContent = 'EXPORT FAILED'
    if (meta) meta.textContent = `PNG EXPORT ERROR · ${message}`
    await sleep(1200)
  } finally {
    if (document.body.dataset.mode !== initialMode) {
      requestProjectionView(initialMode)
      await sleep(MODE_SETTLE_MS)
    }

    controls.forEach((control, index) => { control.disabled = priorDisabled[index] })
    stageCanvas.style.pointerEvents = priorPointerEvents
    exportButton.removeAttribute('aria-busy')
    exportButton.textContent = initialLabel
    delete document.body.dataset.pngExporting
    if (meta && !meta.textContent?.startsWith('PNG EXPORT')) meta.textContent = initialMeta
  }
}

exportButton.addEventListener('click', () => {
  void exportPngPair()
})
