const appShell = document.querySelector<HTMLElement>('.app-shell')
const stage = document.querySelector<HTMLElement>('#stage')
const controlPanel = document.querySelector<HTMLElement>('.control-panel')
const styleRow = document.querySelector<HTMLElement>('.style-row')
const sceneButtons = styleRow
  ? Array.from(styleRow.querySelectorAll<HTMLButtonElement>('[data-style]'))
  : []
const modeToggle = document.querySelector<HTMLButtonElement>('#mode-toggle')
const footerActions = modeToggle?.parentElement ?? null
const exportButton = footerActions?.querySelector<HTMLButtonElement>('.style-chip') ?? null

// Canvas click already owns the sculpture / QR reveal. Keep main.ts' reference alive,
// but remove the duplicate visible button from the control surface.
modeToggle?.remove()
footerActions?.classList.add('footer-actions')

// Treat the visible sculpture and its controls as one carousel page. The persistent scene
// dock is detached below, so only artwork and its explanation leave the viewport.
let sceneWindow = appShell?.querySelector<HTMLElement>('.scene-window') ?? null
if (!sceneWindow && appShell && stage && controlPanel) {
  sceneWindow = document.createElement('div')
  sceneWindow.className = 'scene-window'
  appShell.insertBefore(sceneWindow, stage)
  sceneWindow.append(stage, controlPanel)
}

// Scene navigation belongs to the viewport, not to the sliding scene page. Detaching the
// original row keeps main.ts' button references intact while preventing scene changes from
// carrying the selector off-screen.
let sceneDock: HTMLElement | null = appShell?.querySelector<HTMLElement>('.scene-dock') ?? null
if (!sceneDock && appShell && styleRow) {
  sceneDock = document.createElement('nav')
  sceneDock.className = 'scene-dock'
  sceneDock.setAttribute('aria-label', 'Scene selector')
  appShell.append(sceneDock)
  sceneDock.append(styleRow)
}

// The final control DOM is static in index.html. ui-controls.ts only owns behavior.
const panelToggle = document.querySelector<HTMLButtonElement>('.panel-collapse-toggle')
const panelRestoreToggle = document.querySelector<HTMLButtonElement>('.panel-restore-toggle')

const transitionStyle = document.createElement('style')
transitionStyle.textContent = `
  .scene-dock {
    position: fixed;
    z-index: 40;
    top: max(14px, env(safe-area-inset-top));
    left: 50%;
    width: min(360px, calc(100vw - 120px));
    padding: 3px 5px;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--paper-clean) 78%, transparent);
    backdrop-filter: blur(12px) saturate(.86);
    -webkit-backdrop-filter: blur(12px) saturate(.86);
    pointer-events: auto;
  }

  .scene-dock button {
    border: 0 !important;
    box-shadow: none !important;
    outline: 0 !important;
    -webkit-tap-highlight-color: transparent;
  }

  .scene-dock button:focus-visible {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  /* One full viewport page owns both the artwork and the explanation card. */
  .scene-window {
    position: absolute;
    z-index: 1;
    inset: 0;
    overflow: hidden;
    background: var(--paper);
    transform: translate3d(0, 0, 0);
    will-change: transform;
    transition:
      transform 460ms cubic-bezier(.16, 1, .3, 1),
      background-color 420ms ease;
  }

  body[data-mode='qr'] .scene-window {
    background: var(--paper-clean);
  }

  .scene-window[data-scene-phase='out'] {
    transition-duration: 360ms, 420ms;
    transition-timing-function: cubic-bezier(.55, .08, .35, 1), ease;
    pointer-events: none;
  }

  .scene-window[data-scene-direction='next'][data-scene-phase='out'] {
    transform: translate3d(-100%, 0, 0);
  }

  .scene-window[data-scene-direction='prev'][data-scene-phase='out'] {
    transform: translate3d(100%, 0, 0);
  }

  .scene-window[data-scene-direction='next'][data-scene-phase='pre-in'] {
    transform: translate3d(100%, 0, 0);
    transition: none !important;
    pointer-events: none;
  }

  .scene-window[data-scene-direction='prev'][data-scene-phase='pre-in'] {
    transform: translate3d(-100%, 0, 0);
    transition: none !important;
    pointer-events: none;
  }

  .scene-window[data-scene-phase='in'] {
    transform: translate3d(0, 0, 0);
    transition-duration: 460ms, 420ms;
    transition-timing-function: cubic-bezier(.16, 1, .3, 1), ease;
    pointer-events: none;
  }

  /* Scene copy is now a compact specimen caption rather than a giant disclosure title. */
  .control-copy {
    position: relative;
    min-width: 0;
    padding-right: 42px;
  }

  .scene-copy {
    position: relative;
    min-width: 0;
    padding-left: 12px;
  }

  .scene-copy::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    width: 2px;
    height: 34px;
    background: var(--accent);
  }

  .scene-copy .eyebrow {
    display: block !important;
    margin: 0 0 6px;
    color: rgba(32, 35, 31, .42);
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: .14em;
    line-height: 1.2;
  }

  .scene-copy .control-copy-heading {
    display: block;
    max-width: 22ch;
    margin: 0;
    font-size: clamp(29px, 3.25vw, 43px);
    font-weight: 570;
    letter-spacing: -.045em;
    line-height: .98;
  }

  .scene-copy .lede {
    display: block !important;
    max-width: 36rem;
    margin: 10px 0 0;
    color: rgba(32, 35, 31, .55);
    font-size: 10px;
    line-height: 1.55;
  }

  /* No control uses a framed button treatment. Focus / hover rely on motion and tone. */
  .control-panel button {
    border: 0 !important;
    box-shadow: none !important;
    outline: 0 !important;
    -webkit-tap-highlight-color: transparent;
  }

  .control-panel button:focus-visible {
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .panel-collapse-toggle {
    position: absolute;
    top: 0;
    right: 0;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: rgba(32, 35, 31, .46);
    background: transparent;
    cursor: pointer;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 18px;
    line-height: 1;
    transition: color 150ms ease, transform 180ms cubic-bezier(.22,.72,.22,1);
  }

  .panel-collapse-toggle::before {
    content: '−' !important;
  }

  .panel-collapse-toggle:hover,
  .panel-collapse-toggle:focus-visible {
    color: var(--ink);
    transform: translateY(-1px);
    background: transparent;
  }

  /* Panel disclosure keeps the old immersive semantics but with deterministic staging. */
  .control-panel {
    max-height: 760px;
    overflow: hidden;
    transform-origin: left bottom;
    transition:
      width 300ms cubic-bezier(.22,.72,.22,1),
      height 240ms cubic-bezier(.22,.72,.22,1),
      max-height 240ms cubic-bezier(.22,.72,.22,1),
      padding 300ms cubic-bezier(.22,.72,.22,1),
      background-color 220ms ease,
      box-shadow 220ms ease,
      backdrop-filter 260ms ease;
  }

  .scene-copy,
  .control-panel > :not(.control-copy),
  .masthead {
    transition:
      opacity 180ms ease,
      transform 200ms cubic-bezier(.22,.72,.22,1);
  }

  body[data-controls-phase='closing'] .scene-copy,
  body[data-controls-phase='opening'] .scene-copy,
  body[data-controls-phase='collapsed'] .scene-copy,
  body[data-controls-phase='closing'] .control-panel > :not(.control-copy),
  body[data-controls-phase='opening'] .control-panel > :not(.control-copy),
  body[data-controls-phase='collapsed'] .control-panel > :not(.control-copy) {
    opacity: 0;
    transform: translateX(-18px);
    pointer-events: none;
  }

  body[data-controls-phase='expanded'] .scene-copy,
  body[data-controls-phase='expanded'] .control-panel > :not(.control-copy) {
    opacity: 1;
    transform: translateX(0);
  }

  body[data-controls-phase='closing'] .masthead,
  body[data-controls-phase='opening'] .masthead,
  body[data-controls-phase='collapsed'] .masthead {
    opacity: 0;
    transform: translateY(-8px);
    pointer-events: none;
  }

  body[data-controls-phase='expanded'] .masthead {
    opacity: 1;
    transform: translateY(0);
  }

  body[data-controls='collapsed'] .control-panel {
    left: 28px;
    right: auto;
    bottom: 28px;
    width: 44px;
    max-height: 44px;
    padding: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  body[data-controls='collapsed'][data-mode='qr'] .control-panel {
    background: transparent;
    box-shadow: none;
  }

  body[data-controls='collapsed'] .control-copy {
    width: 44px;
    height: 44px;
    padding: 0;
  }

  body[data-controls='collapsed'] .panel-collapse-toggle {
    position: absolute;
    inset: 0;
    width: 44px;
    height: 44px;
    color: rgba(32, 35, 31, .68);
    background: color-mix(in srgb, var(--paper-clean) 90%, transparent);
    backdrop-filter: blur(14px) saturate(.9);
    -webkit-backdrop-filter: blur(14px) saturate(.9);
  }

  body[data-controls='collapsed'] .panel-collapse-toggle::before,
  body[data-controls-phase='opening'] .panel-collapse-toggle::before {
    content: '+' !important;
  }

  /* Two-axis immersive fold: full card -> left vertical line -> bottom-left point.
     Because left/bottom stay fixed, width loss travels right-to-left and height loss
     travels top-to-bottom. Expansion uses the exact reverse sequence. */
  body[data-controls-shape='full'] .control-panel {
    width: var(--controls-expanded-width, min(455px, calc(100vw - 56px))) !important;
    height: var(--controls-expanded-height, auto) !important;
    max-height: none !important;
  }

  body[data-controls-shape='line'] .control-panel,
  body[data-controls-shape='point'] .control-panel {
    padding: 0 !important;
    background: color-mix(in srgb, var(--ink) 46%, transparent) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  body[data-controls-shape='line'] .control-panel {
    width: 5px !important;
    height: var(--controls-expanded-height, 300px) !important;
    max-height: none !important;
  }

  body[data-controls-shape='point'] .control-panel {
    width: 5px !important;
    height: 5px !important;
    max-height: 5px !important;
  }

  body[data-controls-phase='closing-x'] .control-panel > *,
  body[data-controls-phase='closing-y'] .control-panel > *,
  body[data-controls-phase='collapsed'] .control-panel > *,
  body[data-controls-phase='opening-y'] .control-panel > *,
  body[data-controls-phase='opening-x'] .control-panel > * {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  .panel-restore-toggle {
    position: fixed;
    z-index: 45;
    left: 8px;
    bottom: 8px;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    -webkit-tap-highlight-color: transparent;
  }

  body[data-controls-phase='collapsed'] .panel-restore-toggle {
    opacity: 1;
    pointer-events: auto;
  }

  .panel-restore-toggle:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--ink) 42%, transparent);
    outline-offset: -8px;
  }

  /* Compact, borderless scene stepper. The scene count has intentionally been removed. */
  .style-row.scene-stepper {
    display: grid !important;
    grid-template-columns: 38px minmax(0, 1fr) 38px !important;
    align-items: center !important;
    gap: 4px !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    touch-action: manipulation !important;
  }

  .scene-options {
    display: none !important;
  }

  .scene-arrow {
    appearance: none;
    min-width: 0;
    min-height: 38px;
    padding: 0;
    background: transparent;
    color: rgba(32,35,31,.44);
    cursor: pointer;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 17px;
    line-height: 1;
    transition: color 150ms ease, transform 130ms cubic-bezier(.22,.72,.22,1);
    touch-action: manipulation;
  }

  .scene-arrow:hover,
  .scene-arrow:focus-visible {
    color: var(--ink);
    background: transparent !important;
  }

  .scene-arrow-prev[data-pressed='true'] {
    transform: translateX(-5px);
  }

  .scene-arrow-next[data-pressed='true'] {
    transform: translateX(5px);
  }

  .scene-arrow:disabled {
    cursor: default;
    opacity: .26;
  }

  .scene-current {
    min-width: 0;
    min-height: 38px;
    display: grid;
    place-items: center;
    overflow: hidden;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .scene-current-label {
    min-width: 0;
    overflow: hidden;
    color: rgba(32, 35, 31, .78);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .15em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer-actions {
    display: block !important;
  }

  .footer-actions > .style-chip {
    width: 100%;
    min-height: 38px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    color: rgba(32, 35, 31, .72);
    border: 0 !important;
  }

  .footer-actions > .style-chip:hover,
  .footer-actions > .style-chip:focus-visible {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 11%, transparent) !important;
    transform: translateY(-1px);
  }

  /* Blocking export dialog: progress belongs to the task, not to a mutating button label. */
  .export-overlay {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    visibility: hidden;
    opacity: 0;
    background: rgba(242, 240, 231, .72);
    backdrop-filter: blur(18px) saturate(.82);
    -webkit-backdrop-filter: blur(18px) saturate(.82);
    transition: opacity 180ms ease, visibility 0s linear 180ms;
  }

  .export-overlay[data-open='true'] {
    visibility: visible;
    opacity: 1;
    transition: opacity 180ms ease;
  }

  .export-dialog {
    width: min(420px, calc(100vw - 40px));
    padding: 26px 28px 24px;
    background: rgba(248, 248, 245, .96);
    box-shadow: 0 24px 72px rgba(32, 35, 31, .12);
    transform: translateY(14px);
    transition: transform 240ms cubic-bezier(.16, 1, .3, 1);
  }

  .export-overlay[data-open='true'] .export-dialog {
    transform: translateY(0);
  }

  .export-kicker,
  .export-detail,
  .export-percent {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .export-kicker {
    margin: 0 0 9px;
    color: rgba(32, 35, 31, .42);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .14em;
  }

  .export-title {
    margin: 0;
    font-size: clamp(27px, 4vw, 38px);
    font-weight: 570;
    letter-spacing: -.045em;
    line-height: 1;
  }

  .export-detail {
    min-height: 1.5em;
    margin: 12px 0 20px;
    color: rgba(32, 35, 31, .52);
    font-size: 9px;
    line-height: 1.5;
  }

  .export-progress-track {
    position: relative;
    height: 2px;
    overflow: hidden;
    background: rgba(32, 35, 31, .12);
  }

  .export-progress-bar {
    position: absolute;
    inset: 0;
    background: var(--ink);
    transform: scaleX(var(--export-progress, 0));
    transform-origin: left center;
    transition: transform 160ms linear;
  }

  .export-percent {
    margin-top: 9px;
    color: rgba(32, 35, 31, .44);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .1em;
    text-align: right;
  }

  @media (max-width: 760px) {
    .scene-dock {
      top: max(8px, env(safe-area-inset-top));
      width: calc(100vw - 24px);
      padding-inline: 2px;
    }

    .panel-restore-toggle {
      left: 0;
      bottom: max(0px, env(safe-area-inset-bottom));
      width: 48px;
      height: 48px;
    }

    .scene-copy .control-copy-heading {
      max-width: 18ch;
      font-size: clamp(25px, 8vw, 32px);
    }

    .scene-copy .lede {
      margin-top: 8px;
      font-size: 9.5px;
      line-height: 1.48;
    }

    body[data-controls='collapsed'] .control-panel {
      left: 12px;
      right: auto;
      bottom: max(12px, env(safe-area-inset-bottom));
      width: 48px;
      max-height: 48px;
    }

    body[data-controls='collapsed'] .control-copy,
    body[data-controls='collapsed'] .panel-collapse-toggle {
      width: 48px;
      height: 48px;
    }

    .style-row.scene-stepper {
      grid-template-columns: 44px minmax(0, 1fr) 44px !important;
    }

    .scene-arrow,
    .scene-current {
      min-height: 42px;
    }

    .export-dialog {
      padding: 23px 22px 21px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-window,
    .scene-dock,
    .control-panel,
    .scene-copy,
    .control-panel > :not(.control-copy),
    .masthead,
    .panel-collapse-toggle,
    .panel-restore-toggle,
    .scene-arrow,
    .export-overlay,
    .export-dialog,
    .export-progress-bar {
      transition: none !important;
    }
  }
`
document.head.appendChild(transitionStyle)

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
  if (!controlPanel) return
  const rect = controlPanel.getBoundingClientRect()
  if (rect.width > 0) controlPanel.style.setProperty('--controls-expanded-width', `${rect.width}px`)
  if (rect.height > 0) controlPanel.style.setProperty('--controls-expanded-height', `${rect.height}px`)
}

function releaseExpandedPanelSize(): void {
  if (!controlPanel) return
  controlPanel.style.removeProperty('--controls-expanded-width')
  controlPanel.style.removeProperty('--controls-expanded-height')
}

function syncControlPanelState(): void {
  document.body.dataset.controlsPhase = phase
  document.body.dataset.controlsShape = controlShape

  const collapsedIntent = phase !== 'expanded'
  if (controlPanel && panelToggle) {
    controlPanel.setAttribute(
      'aria-label',
      collapsedIntent ? 'QR controls, collapsing or collapsed' : 'QR controls',
    )
    panelToggle.setAttribute(
      'aria-label',
      collapsedIntent ? 'QR controls are folding' : 'Hide QR controls for immersive view',
    )
    panelToggle.setAttribute('aria-expanded', String(!collapsedIntent))
  }

  if (panelRestoreToggle) {
    const available = phase === 'collapsed'
    panelRestoreToggle.setAttribute('aria-hidden', String(!available))
    panelRestoreToggle.tabIndex = available ? 0 : -1
  }
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

panelToggle?.addEventListener('click', () => {
  if (phase !== 'expanded') return
  collapseControls()
})
panelRestoreToggle?.addEventListener('click', () => {
  if (phase !== 'collapsed') return
  expandControls()
})
syncControlPanelState()

const scenePrevButton = styleRow?.querySelector<HTMLButtonElement>('.scene-arrow-prev') ?? null
const sceneNextButton = styleRow?.querySelector<HTMLButtonElement>('.scene-arrow-next') ?? null
const sceneCurrentLabel = styleRow?.querySelector<HTMLElement>('.scene-current-label') ?? null

function currentSceneIndex(): number {
  const styleId = document.body.dataset.style
  const index = sceneButtons.findIndex((button) => button.dataset.style === styleId)
  return index >= 0 ? index : 0
}

function syncSceneStepper(): void {
  if (!sceneCurrentLabel || sceneButtons.length === 0) return

  const index = currentSceneIndex()
  const current = sceneButtons[index]
  const previous = sceneButtons[(index - 1 + sceneButtons.length) % sceneButtons.length]
  const next = sceneButtons[(index + 1) % sceneButtons.length]

  sceneCurrentLabel.textContent = current.textContent?.trim() || current.dataset.style?.toUpperCase() || 'SCENE'
  scenePrevButton?.setAttribute('aria-label', `Previous scene: ${previous.textContent?.trim() || 'previous'}`)
  sceneNextButton?.setAttribute('aria-label', `Next scene: ${next.textContent?.trim() || 'next'}`)
}

function syncSceneDisabledState(): void {
  const appBusy = sceneButtons.some((button) => button.disabled)
  if (scenePrevButton) scenePrevButton.disabled = sceneChanging || appBusy
  if (sceneNextButton) sceneNextButton.disabled = sceneChanging || appBusy
}

function pulseArrow(direction: SceneDirection): void {
  if (reducedMotion) return
  const button = direction === 'next' ? sceneNextButton : scenePrevButton
  if (!button) return

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

  if (sceneWindow) {
    delete sceneWindow.dataset.scenePhase
    delete sceneWindow.dataset.sceneDirection
  }

  syncSceneStepper()
  syncSceneDisabledState()
}

function changeSceneBy(delta: number): void {
  if (sceneButtons.length < 2 || sceneChanging) return
  if (sceneButtons.some((button) => button.disabled)) return

  const fromIndex = currentSceneIndex()
  const targetIndex = (fromIndex + delta + sceneButtons.length) % sceneButtons.length
  const target = sceneButtons[targetIndex]
  if (!target || target.dataset.style === document.body.dataset.style) return

  const direction: SceneDirection = delta > 0 ? 'next' : 'prev'
  pulseArrow(direction)

  if (reducedMotion || !sceneWindow) {
    target.click()
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
    target.click()
    syncSceneStepper()

    // Reposition the newly bound page to the opposite side without animation.
    if (!sceneWindow) return
    sceneWindow.dataset.scenePhase = 'pre-in'
    void sceneWindow.offsetWidth

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!sceneWindow) return
        sceneWindow.dataset.scenePhase = 'in'
        sceneTimer = window.setTimeout(settleSceneWindow, sceneInMs)
      })
    })
  }, sceneOutMs)
}

if (scenePrevButton && sceneNextButton && sceneCurrentLabel && sceneButtons.length > 0) {
  scenePrevButton.addEventListener('click', () => changeSceneBy(-1))
  sceneNextButton.addEventListener('click', () => changeSceneBy(1))

  const busyObserver = new MutationObserver(syncSceneDisabledState)
  for (const button of sceneButtons) {
    busyObserver.observe(button, { attributes: true, attributeFilter: ['disabled'] })
  }

  syncSceneStepper()
  syncSceneDisabledState()
}

// Export progress uses a blocking modal layer. main.ts remains the encoder owner; this UI
// observes its existing button state so the export pipeline itself stays untouched.
const exportOverlay = document.createElement('div')
exportOverlay.className = 'export-overlay'
exportOverlay.setAttribute('role', 'dialog')
exportOverlay.setAttribute('aria-modal', 'true')
exportOverlay.setAttribute('aria-labelledby', 'export-overlay-title')
exportOverlay.setAttribute('aria-describedby', 'export-overlay-detail')
exportOverlay.setAttribute('aria-hidden', 'true')
exportOverlay.tabIndex = -1

const exportDialog = document.createElement('div')
exportDialog.className = 'export-dialog'

const exportKicker = document.createElement('p')
exportKicker.className = 'export-kicker'
exportKicker.textContent = 'GIF EXPORT'

const exportTitle = document.createElement('h2')
exportTitle.className = 'export-title'
exportTitle.id = 'export-overlay-title'
exportTitle.textContent = 'Preparing reveal.'

const exportDetail = document.createElement('p')
exportDetail.className = 'export-detail'
exportDetail.id = 'export-overlay-detail'
exportDetail.textContent = 'Building the animation frames.'

const exportProgressTrack = document.createElement('div')
exportProgressTrack.className = 'export-progress-track'
exportProgressTrack.setAttribute('aria-hidden', 'true')
const exportProgressBar = document.createElement('div')
exportProgressBar.className = 'export-progress-bar'
exportProgressTrack.append(exportProgressBar)

const exportPercent = document.createElement('div')
exportPercent.className = 'export-percent'
exportPercent.textContent = '0%'

exportDialog.append(exportKicker, exportTitle, exportDetail, exportProgressTrack, exportPercent)
exportOverlay.append(exportDialog)
document.body.append(exportOverlay)

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
    exportButton?.focus({ preventScroll: true })
  }, delay)
}

function syncExportOverlayFromButton(): void {
  if (!exportButton) return
  const label = exportButton.textContent?.trim() ?? ''

  if (label.startsWith('PREPARING')) {
    showExportOverlay()
    return
  }

  const progressMatch = label.match(/^GIF\s+(\d+)%$/)
  if (progressMatch) {
    exportTitle.textContent = 'Rendering reveal.'
    exportDetail.textContent = 'Encoding the sculpture-to-QR loop.'
    setExportProgress(Number(progressMatch[1]) / 100)
    return
  }

  if (label.startsWith('EXPORTED')) {
    exportTitle.textContent = 'GIF ready.'
    exportDetail.textContent = 'The download has started.'
    setExportProgress(1)
    hideExportOverlay(850)
    return
  }

  if (label.startsWith('EXPORT FAILED')) {
    exportTitle.textContent = 'Export failed.'
    exportDetail.textContent = exportButton.title || 'The GIF encoder could not finish this export.'
    setExportProgress(0)
    hideExportOverlay(1700)
    return
  }

  if (label === 'EXPORT GIF' && !exportButton.disabled && exportOverlay.dataset.open === 'true') {
    hideExportOverlay(120)
  }
}

if (exportButton) {
  exportButton.addEventListener('click', showExportOverlay)
  const exportObserver = new MutationObserver(syncExportOverlayFromButton)
  exportObserver.observe(exportButton, {
    attributes: true,
    attributeFilter: ['disabled', 'title'],
    childList: true,
    characterData: true,
    subtree: true,
  })
}
