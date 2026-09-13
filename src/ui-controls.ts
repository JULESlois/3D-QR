import { GIF_EXPORT_STATUS_EVENT, type GifExportStatus } from './export-status'
import { STYLES, type StyleId } from './styles'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Required UI element is missing: ${selector}`)
  return element
}

const controlPanel = requiredElement<HTMLElement>('.control-panel')
const exportButton = requiredElement<HTMLButtonElement>('#export-gif')

// The scene window and dock are part of the static page contract. Failing fast here keeps
// ui-controls.ts focused on behavior instead of silently rebuilding missing page structure.
const sceneWindow = requiredElement<HTMLElement>('.scene-window')
requiredElement<HTMLElement>('.scene-dock')

// The final control DOM is static in index.html. ui-controls.ts only owns behavior.
const panelToggle = requiredElement<HTMLButtonElement>('.panel-collapse-toggle')
const panelRestoreToggle = requiredElement<HTMLButtonElement>('.panel-restore-toggle')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const panelFoldXMs = 300
const panelFoldYMs = 240
const sceneOutMs = 360
const sceneInMs = 460

type ControlPhase = 'expanded' | 'closing-x' | 'closing-y' | 'collapsed' | 'opening-y' | 'opening-x'
type ControlShape = 'full' | 'line' | 'point'
type SceneDirection = 'prev' | 'next'

let phase: ControlPhase = document.body.dataset.controls === 'collapsed' ? 'collapsed' : 'expanded'
let controlShape: ControlShape = phase === 'collapsed' ? 'point' : 'full'
let phaseTimer = 0
let sceneTimer = 0
let arrowTimer = 0
let exportOverlayTimer = 0
let sceneChanging = false

function clearPhaseTimer(): void {
  window.clearTimeout(phaseTimer)
  phaseTimer = 0
}

function captureExpandedPanelSize(): void {
  const rect = controlPanel.getBoundingClientRect()
  if (rect.width > 0) controlPanel.style.setProperty('--controls-expanded-width', `${rect.width}px`)
  if (rect.height > 0) controlPanel.style.setProperty('--controls-expanded-height', `${rect.height}px`)
}

function releaseExpandedPanelSize(): void {
  controlPanel.style.removeProperty('--controls-expanded-width')
  controlPanel.style.removeProperty('--controls-expanded-height')
}

function syncControlPanelState(): void {
  document.body.dataset.controlsPhase = phase
  document.body.dataset.controlsShape = controlShape

  const collapsedIntent = phase !== 'expanded'
  controlPanel.setAttribute(
    'aria-label',
    collapsedIntent ? 'QR controls, collapsing or collapsed' : 'QR controls',
  )
  panelToggle.setAttribute(
    'aria-label',
    collapsedIntent ? 'QR controls are folding' : 'Hide QR controls for immersive view',
  )
  panelToggle.setAttribute('aria-expanded', String(!collapsedIntent))

  const available = phase === 'collapsed'
  panelRestoreToggle.setAttribute('aria-hidden', String(!available))
  panelRestoreToggle.tabIndex = available ? 0 : -1
}

function finishCollapsed(): void {
  document.body.dataset.controls = 'collapsed'
  controlShape = 'point'
  phase = 'collapsed'
  syncControlPanelState()
}

function finishExpanded(): void {
  document.body.dataset.controls = 'expanded'
  controlShape = 'full'
  phase = 'expanded'
  syncControlPanelState()
  releaseExpandedPanelSize()
}

function collapseControls(): void {
  clearPhaseTimer()
  captureExpandedPanelSize()

  if (reducedMotion) {
    controlShape = 'point'
    finishCollapsed()
    return
  }

  document.body.dataset.controls = 'expanded'
  controlShape = 'line'
  phase = 'closing-x'
  syncControlPanelState()

  phaseTimer = window.setTimeout(() => {
    controlShape = 'point'
    phase = 'closing-y'
    syncControlPanelState()
    phaseTimer = window.setTimeout(finishCollapsed, panelFoldYMs)
  }, panelFoldXMs)
}

function expandControls(): void {
  clearPhaseTimer()

  if (reducedMotion) {
    controlShape = 'full'
    finishExpanded()
    return
  }

  document.body.dataset.controls = 'expanded'
  controlShape = 'line'
  phase = 'opening-y'
  syncControlPanelState()

  phaseTimer = window.setTimeout(() => {
    controlShape = 'full'
    phase = 'opening-x'
    syncControlPanelState()
    phaseTimer = window.setTimeout(finishExpanded, panelFoldXMs)
  }, panelFoldYMs)
}

panelToggle.addEventListener('click', () => {
  if (phase !== 'expanded') return
  collapseControls()
})
panelRestoreToggle.addEventListener('click', () => {
  if (phase !== 'collapsed') return
  expandControls()
})
syncControlPanelState()

const scenePrevButton = requiredElement<HTMLButtonElement>('.scene-arrow-prev')
const sceneNextButton = requiredElement<HTMLButtonElement>('.scene-arrow-next')
const sceneCurrentLabel = requiredElement<HTMLElement>('.scene-current-label')

function currentSceneIndex(): number {
  const styleId = document.body.dataset.style
  const index = STYLES.findIndex((style) => style.id === styleId)
  return index >= 0 ? index : 0
}

function sceneButtonFor(styleId: StyleId): HTMLButtonElement {
  return requiredElement<HTMLButtonElement>(`.scene-options [data-style="${styleId}"]`)
}

function syncSceneStepper(): void {
  const index = currentSceneIndex()
  const current = STYLES[index]
  const previous = STYLES[(index - 1 + STYLES.length) % STYLES.length]
  const next = STYLES[(index + 1) % STYLES.length]

  sceneCurrentLabel.textContent = current.label.toUpperCase()
  scenePrevButton.setAttribute('aria-label', `Previous scene: ${previous.label}`)
  sceneNextButton.setAttribute('aria-label', `Next scene: ${next.label}`)
}

function isAppBusy(): boolean {
  return document.body.dataset.exportBusy === 'true'
}

function syncSceneDisabledState(): void {
  const appBusy = isAppBusy()
  scenePrevButton.disabled = sceneChanging || appBusy
  sceneNextButton.disabled = sceneChanging || appBusy
}

function pulseArrow(direction: SceneDirection): void {
  if (reducedMotion) return
  const button = direction === 'next' ? sceneNextButton : scenePrevButton

  window.clearTimeout(arrowTimer)
  button.dataset.pressed = 'true'
  arrowTimer = window.setTimeout(() => {
    delete button.dataset.pressed
  }, 130)
}

function settleSceneWindow(): void {
  window.clearTimeout(sceneTimer)
  sceneTimer = 0
  sceneChanging = false

  delete sceneWindow.dataset.scenePhase
  delete sceneWindow.dataset.sceneDirection

  syncSceneStepper()
  syncSceneDisabledState()
}

function changeSceneBy(delta: number): void {
  if (STYLES.length < 2 || sceneChanging || isAppBusy()) return

  const fromIndex = currentSceneIndex()
  const targetIndex = (fromIndex + delta + STYLES.length) % STYLES.length
  const target = STYLES[targetIndex]
  if (!target || target.id === document.body.dataset.style) return

  const direction: SceneDirection = delta > 0 ? 'next' : 'prev'
  pulseArrow(direction)

  if (reducedMotion) {
    sceneButtonFor(target.id).click()
    syncSceneStepper()
    return
  }

  sceneChanging = true
  syncSceneDisabledState()
  sceneWindow.dataset.sceneDirection = direction
  sceneWindow.dataset.scenePhase = 'out'

  // The complete visible page leaves first. Scene text, model and panel geometry therefore
  // never rebind or reflow in front of the user.
  sceneTimer = window.setTimeout(() => {
    sceneButtonFor(target.id).click()
    syncSceneStepper()

    // Reposition the newly bound page to the opposite side without animation.
    sceneWindow.dataset.scenePhase = 'pre-in'
    void sceneWindow.offsetWidth

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sceneWindow.dataset.scenePhase = 'in'
        sceneTimer = window.setTimeout(settleSceneWindow, sceneInMs)
      })
    })
  }, sceneOutMs)
}

scenePrevButton.addEventListener('click', () => changeSceneBy(-1))
sceneNextButton.addEventListener('click', () => changeSceneBy(1))

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
    || target.closest('[contenteditable="true"]') !== null
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (isTextEditingTarget(event.target)) return
  if (sceneChanging || isAppBusy()) return

  event.preventDefault()
  changeSceneBy(event.key === 'ArrowRight' ? 1 : -1)
})

const busyObserver = new MutationObserver(syncSceneDisabledState)
busyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-export-busy'] })

syncSceneStepper()
syncSceneDisabledState()

// Export progress markup is part of the static page shell; this controller only updates
// state while main.ts remains the GIF encoder owner.
const exportOverlay = requiredElement<HTMLElement>('.export-overlay')
const exportTitle = requiredElement<HTMLElement>('#export-overlay-title')
const exportDetail = requiredElement<HTMLElement>('#export-overlay-detail')
const exportProgressBar = requiredElement<HTMLElement>('.export-progress-bar')
const exportPercent = requiredElement<HTMLElement>('.export-percent')

function setExportProgress(progress: number): void {
  const normalized = Math.max(0, Math.min(1, progress))
  exportProgressBar.style.setProperty('--export-progress', String(normalized))
  exportPercent.textContent = `${Math.round(normalized * 100)}%`
}

function showExportOverlay(): void {
  window.clearTimeout(exportOverlayTimer)
  exportTitle.textContent = 'Preparing reveal.'
  exportDetail.textContent = 'Building the animation frames.'
  setExportProgress(0)
  exportOverlay.dataset.open = 'true'
  exportOverlay.setAttribute('aria-hidden', 'false')
  requestAnimationFrame(() => exportOverlay.focus({ preventScroll: true }))
}

function hideExportOverlay(delay = 0): void {
  window.clearTimeout(exportOverlayTimer)
  exportOverlayTimer = window.setTimeout(() => {
    delete exportOverlay.dataset.open
    exportOverlay.setAttribute('aria-hidden', 'true')
    exportButton.focus({ preventScroll: true })
  }, delay)
}

function handleGifExportStatus(status: GifExportStatus): void {
  if (status.phase === 'preparing') {
    showExportOverlay()
    return
  }

  if (status.phase === 'encoding') {
    exportTitle.textContent = 'Rendering reveal.'
    exportDetail.textContent = 'Encoding the sculpture-to-QR loop.'
    setExportProgress(status.progress)
    return
  }

  if (status.phase === 'complete') {
    exportTitle.textContent = 'GIF ready.'
    exportDetail.textContent = 'The download has started.'
    setExportProgress(1)
    hideExportOverlay(850)
    return
  }

  exportTitle.textContent = 'Export failed.'
  exportDetail.textContent = status.message
  setExportProgress(0)
  hideExportOverlay(1700)
}

document.addEventListener(GIF_EXPORT_STATUS_EVENT, (event) => {
  handleGifExportStatus((event as CustomEvent<GifExportStatus>).detail)
})