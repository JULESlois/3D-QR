const controlPanel = document.querySelector<HTMLElement>('.control-panel')
const controlCopy = document.querySelector<HTMLElement>('.control-copy')
const disclosure = document.querySelector<HTMLDetailsElement>('.description-disclosure')
const summary = disclosure?.querySelector<HTMLElement>('summary') ?? null
const styleRow = document.querySelector<HTMLElement>('.style-row')
const sceneButtons = styleRow
  ? Array.from(styleRow.querySelectorAll<HTMLButtonElement>('[data-style]'))
  : []
const modeToggle = document.querySelector<HTMLButtonElement>('#mode-toggle')
const footerActions = modeToggle?.parentElement ?? null

// Canvas click already owns the art/QR toggle. Keep the detached button reference alive
// for main.ts, but remove the duplicate visible control from the panel.
modeToggle?.remove()
footerActions?.classList.add('footer-actions')

const transitionStyle = document.createElement('style')
transitionStyle.textContent = `
  /* Palette tuning remains dormant; every scene still applies its own default palette. */
  .palette-control {
    display: none !important;
  }

  .control-panel {
    max-height: 720px;
    overflow: hidden;
    transform-origin: left bottom;
    transition:
      width 320ms cubic-bezier(.22,.72,.22,1),
      max-height 320ms cubic-bezier(.22,.72,.22,1),
      padding 300ms cubic-bezier(.22,.72,.22,1),
      background-color 220ms ease,
      box-shadow 220ms ease,
      backdrop-filter 260ms ease;
  }

  /* Text never remains visible while the panel geometry is moving. */
  .control-panel > :not(.control-copy),
  .control-copy-heading,
  .description-body {
    transition: opacity 120ms ease;
  }

  body[data-controls-phase='closing'] .control-panel > :not(.control-copy),
  body[data-controls-phase='opening'] .control-panel > :not(.control-copy),
  body[data-controls-phase='collapsed'] .control-panel > :not(.control-copy),
  body[data-controls-phase='closing'] .control-copy-heading,
  body[data-controls-phase='opening'] .control-copy-heading,
  body[data-controls-phase='collapsed'] .control-copy-heading,
  body[data-controls-phase='closing'] .description-body,
  body[data-controls-phase='opening'] .description-body,
  body[data-controls-phase='collapsed'] .description-body {
    opacity: 0;
    pointer-events: none;
  }

  body[data-controls-phase='expanded'] .control-panel > :not(.control-copy),
  body[data-controls-phase='expanded'] .control-copy-heading,
  body[data-controls-phase='expanded'] .description-body {
    opacity: 1;
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

  body[data-controls='collapsed'] .description-disclosure,
  body[data-controls='collapsed'] .control-copy {
    width: 44px;
    height: 44px;
    margin: 0;
  }

  body[data-controls='collapsed'] .description-disclosure > summary {
    width: 44px;
    height: 44px;
    grid-template-columns: 0 44px;
    gap: 0;
    overflow: hidden;
    place-items: center;
    background: color-mix(in srgb, var(--paper-clean) 90%, transparent);
    box-shadow: 0 10px 28px rgba(32, 35, 31, .09);
    backdrop-filter: blur(14px) saturate(.9);
    -webkit-backdrop-filter: blur(14px) saturate(.9);
  }

  body[data-controls='collapsed'] .description-disclosure > summary > span:first-child {
    min-width: 0;
    overflow: hidden;
    pointer-events: none;
  }

  body[data-controls='collapsed'] .description-toggle {
    width: 44px;
    height: 44px;
    margin: 0;
    border-color: rgba(32, 35, 31, .28);
    color: rgba(32, 35, 31, .72);
    background: transparent;
  }

  body[data-controls='collapsed'] .description-toggle::before,
  body[data-controls-phase='opening'] .description-toggle::before {
    content: '+';
  }

  body[data-controls-phase='expanded'] .description-toggle::before,
  body[data-controls-phase='closing'] .description-toggle::before {
    content: '−';
  }

  .masthead {
    transform: none !important;
    transition: opacity 120ms ease !important;
  }

  body[data-controls-phase='closing'] .masthead,
  body[data-controls-phase='opening'] .masthead,
  body[data-controls-phase='collapsed'] .masthead {
    opacity: 0;
    pointer-events: none;
  }

  body[data-controls-phase='expanded'] .masthead {
    opacity: 1;
  }

  /* Scene text swaps: fade out, change copy while invisible, then morph height. */
  .control-copy {
    overflow: hidden;
    transition: height 260ms cubic-bezier(.22,.72,.22,1);
  }

  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='out']
    .description-disclosure > summary > span:first-child,
  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='height']
    .description-disclosure > summary > span:first-child,
  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='out'] .description-body,
  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='height'] .description-body {
    opacity: 0;
  }

  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='in']
    .description-disclosure > summary > span:first-child,
  body[data-controls-phase='expanded'] .control-copy[data-scene-phase='in'] .description-body {
    opacity: 1;
  }

  /* Replace the twelve-chip grid with a compact cyclic scene stepper. */
  .style-row.scene-stepper {
    display: grid !important;
    grid-template-columns: 42px minmax(0, 1fr) 42px !important;
    align-items: stretch !important;
    gap: 7px !important;
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
    border: 1px solid rgba(32,35,31,.2);
    background: transparent;
    color: rgba(32,35,31,.64);
    cursor: pointer;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 15px;
    line-height: 1;
    transition: border-color 150ms ease, color 150ms ease, background-color 150ms ease;
    touch-action: manipulation;
  }

  .scene-arrow:hover,
  .scene-arrow:focus-visible {
    border-color: rgba(32,35,31,.58);
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    outline: 0;
  }

  .scene-arrow:disabled {
    cursor: default;
    opacity: .34;
  }

  .scene-current {
    min-width: 0;
    min-height: 38px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-top: 1px solid rgba(32,35,31,.18);
    border-bottom: 1px solid rgba(32,35,31,.18);
    overflow: hidden;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  .scene-current-label {
    min-width: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .12em;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: opacity 110ms ease;
  }

  .scene-current-count {
    color: rgba(32,35,31,.38);
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: .08em;
    white-space: nowrap;
  }

  .scene-current[data-changing='true'] .scene-current-label {
    opacity: 0;
  }

  .footer-actions {
    display: block !important;
  }

  .footer-actions > .style-chip {
    width: 100%;
  }

  @media (max-width: 760px) {
    body[data-controls='collapsed'] .control-panel {
      left: 12px;
      right: auto;
      bottom: max(12px, env(safe-area-inset-bottom));
      width: 48px;
      max-height: 48px;
    }

    body[data-controls='collapsed'] .description-disclosure,
    body[data-controls='collapsed'] .control-copy,
    body[data-controls='collapsed'] .description-disclosure > summary,
    body[data-controls='collapsed'] .description-toggle {
      width: 48px;
      height: 48px;
    }

    body[data-controls='collapsed'] .description-disclosure > summary {
      grid-template-columns: 0 48px;
    }

    .style-row.scene-stepper {
      grid-template-columns: 44px minmax(0, 1fr) 44px !important;
    }

    .scene-arrow,
    .scene-current {
      min-height: 42px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .control-panel,
    .control-panel > :not(.control-copy),
    .control-copy,
    .control-copy-heading,
    .description-body,
    .description-disclosure > summary,
    .masthead,
    .scene-current-label {
      transition: none !important;
    }
  }
`
document.head.appendChild(transitionStyle)

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const contentFadeMs = 120
const panelMorphMs = 340
const sceneFadeMs = 120
const sceneHeightMs = 270

type ControlPhase = 'expanded' | 'closing' | 'collapsed' | 'opening'
let phase: ControlPhase = document.body.dataset.controls === 'collapsed' ? 'collapsed' : 'expanded'
let phaseTimer = 0
let sceneTimer = 0
let sceneHeightTimer = 0
let sceneFadeInTimer = 0
let sceneChanging = false

function clearPhaseTimer(): void {
  window.clearTimeout(phaseTimer)
  phaseTimer = 0
}

function clearSceneTimers(): void {
  window.clearTimeout(sceneTimer)
  window.clearTimeout(sceneHeightTimer)
  window.clearTimeout(sceneFadeInTimer)
  sceneTimer = 0
  sceneHeightTimer = 0
  sceneFadeInTimer = 0
}

function syncControlPanelState(): void {
  if (!controlPanel || !disclosure || !summary) return

  // Keep details open so content remains measurable while the card itself morphs.
  disclosure.open = true
  document.body.dataset.controlsPhase = phase

  const collapsedIntent = phase === 'collapsed' || phase === 'closing'
  controlPanel.setAttribute(
    'aria-label',
    collapsedIntent ? 'QR controls, collapsed' : 'QR controls',
  )
  summary.setAttribute(
    'aria-label',
    collapsedIntent ? 'Show QR controls' : 'Hide QR controls for immersive view',
  )
  summary.setAttribute('aria-expanded', String(!collapsedIntent))
}

function finishCollapsed(): void {
  phase = 'collapsed'
  syncControlPanelState()
}

function finishExpanded(): void {
  phase = 'expanded'
  syncControlPanelState()
}

function collapseControls(): void {
  clearPhaseTimer()

  if (reducedMotion) {
    document.body.dataset.controls = 'collapsed'
    finishCollapsed()
    return
  }

  // 1. Fade every piece of content completely out at the full panel size.
  document.body.dataset.controls = 'expanded'
  phase = 'closing'
  syncControlPanelState()

  // 2. Only once content is invisible do we start shrinking the card.
  phaseTimer = window.setTimeout(() => {
    document.body.dataset.controls = 'collapsed'
    syncControlPanelState()

    // 3. Mark the state settled only after geometry has finished moving.
    phaseTimer = window.setTimeout(() => {
      finishCollapsed()
    }, panelMorphMs)
  }, contentFadeMs)
}

function expandControls(): void {
  clearPhaseTimer()

  if (reducedMotion) {
    document.body.dataset.controls = 'expanded'
    finishExpanded()
    return
  }

  // 1. Expand an empty card. No text is visible while its available width changes.
  document.body.dataset.controls = 'expanded'
  phase = 'opening'
  syncControlPanelState()

  // 2. Reveal content only after the card has completely reached its final geometry.
  phaseTimer = window.setTimeout(() => {
    finishExpanded()
  }, panelMorphMs)
}

if (disclosure && summary) {
  disclosure.open = true
  syncControlPanelState()

  summary.addEventListener('click', (event) => {
    event.preventDefault()

    // Keep one deterministic animation timeline instead of reversing mid-layout.
    if (phase === 'opening' || phase === 'closing') return

    if (phase === 'expanded') {
      collapseControls()
    } else {
      expandControls()
    }
  })
}

let scenePrevButton: HTMLButtonElement | null = null
let sceneNextButton: HTMLButtonElement | null = null
let sceneCurrent: HTMLElement | null = null
let sceneCurrentLabel: HTMLElement | null = null
let sceneCurrentCount: HTMLElement | null = null

function currentSceneIndex(): number {
  const styleId = document.body.dataset.style
  const index = sceneButtons.findIndex((button) => button.dataset.style === styleId)
  return index >= 0 ? index : 0
}

function syncSceneStepper(): void {
  if (!sceneCurrentLabel || !sceneCurrentCount || sceneButtons.length === 0) return

  const index = currentSceneIndex()
  const current = sceneButtons[index]
  const previous = sceneButtons[(index - 1 + sceneButtons.length) % sceneButtons.length]
  const next = sceneButtons[(index + 1) % sceneButtons.length]

  sceneCurrentLabel.textContent = current.textContent?.trim() || current.dataset.style?.toUpperCase() || 'SCENE'
  sceneCurrentCount.textContent = `${String(index + 1).padStart(2, '0')} / ${String(sceneButtons.length).padStart(2, '0')}`
  scenePrevButton?.setAttribute('aria-label', `Previous scene: ${previous.textContent?.trim() || 'previous'}`)
  sceneNextButton?.setAttribute('aria-label', `Next scene: ${next.textContent?.trim() || 'next'}`)
}

function syncSceneDisabledState(): void {
  const appBusy = sceneButtons.some((button) => button.disabled)
  if (scenePrevButton) scenePrevButton.disabled = sceneChanging || appBusy
  if (sceneNextButton) sceneNextButton.disabled = sceneChanging || appBusy
}

function settleSceneCopy(): void {
  clearSceneTimers()
  sceneChanging = false
  if (controlCopy) {
    controlCopy.style.height = ''
    controlCopy.style.transition = ''
    delete controlCopy.dataset.scenePhase
  }
  if (sceneCurrent) delete sceneCurrent.dataset.changing
  syncSceneStepper()
  syncSceneDisabledState()
}

function changeSceneBy(delta: number): void {
  if (!controlCopy || sceneButtons.length < 2 || sceneChanging) return
  if (sceneButtons.some((button) => button.disabled)) return

  const fromIndex = currentSceneIndex()
  const targetIndex = (fromIndex + delta + sceneButtons.length) % sceneButtons.length
  const target = sceneButtons[targetIndex]
  if (!target || target.dataset.style === document.body.dataset.style) return

  if (reducedMotion || phase !== 'expanded') {
    target.click()
    syncSceneStepper()
    return
  }

  sceneChanging = true
  syncSceneDisabledState()
  sceneCurrent?.setAttribute('data-changing', 'true')

  const oldHeight = controlCopy.getBoundingClientRect().height
  controlCopy.style.height = `${oldHeight}px`
  controlCopy.dataset.scenePhase = 'out'

  // 1. Old copy disappears at its original, stable height.
  sceneTimer = window.setTimeout(() => {
    // 2. Trigger the real, existing scene button while text is invisible.
    // main.ts updates the model, body[data-style], title and description synchronously.
    target.click()
    syncSceneStepper()

    // Measure the new natural height without letting that temporary layout reach paint.
    // This works in both directions, including a long description changing to a shorter one.
    controlCopy.style.transition = 'none'
    controlCopy.style.height = 'auto'
    const newHeight = controlCopy.getBoundingClientRect().height
    controlCopy.style.height = `${oldHeight}px`
    void controlCopy.offsetHeight
    controlCopy.style.transition = ''
    controlCopy.dataset.scenePhase = 'height'

    // 3. Smooth only the container height; no visible glyph is being reflowed here.
    requestAnimationFrame(() => {
      controlCopy.style.height = `${newHeight}px`
    })

    sceneHeightTimer = window.setTimeout(() => {
      controlCopy.style.height = ''
      controlCopy.dataset.scenePhase = 'in'
      if (sceneCurrent) delete sceneCurrent.dataset.changing

      // 4. New copy fades in only after its final height has settled.
      sceneFadeInTimer = window.setTimeout(() => {
        settleSceneCopy()
      }, sceneFadeMs)
    }, sceneHeightMs)
  }, sceneFadeMs)
}

if (styleRow && sceneButtons.length > 0) {
  const options = document.createElement('div')
  options.className = 'scene-options'
  options.hidden = true
  for (const button of sceneButtons) options.appendChild(button)

  scenePrevButton = document.createElement('button')
  scenePrevButton.type = 'button'
  scenePrevButton.className = 'scene-arrow scene-arrow-prev'
  scenePrevButton.textContent = '←'

  sceneNextButton = document.createElement('button')
  sceneNextButton.type = 'button'
  sceneNextButton.className = 'scene-arrow scene-arrow-next'
  sceneNextButton.textContent = '→'

  sceneCurrent = document.createElement('div')
  sceneCurrent.className = 'scene-current'
  sceneCurrent.setAttribute('role', 'status')
  sceneCurrent.setAttribute('aria-live', 'polite')

  sceneCurrentLabel = document.createElement('span')
  sceneCurrentLabel.className = 'scene-current-label'
  sceneCurrentCount = document.createElement('span')
  sceneCurrentCount.className = 'scene-current-count'
  sceneCurrent.append(sceneCurrentLabel, sceneCurrentCount)

  styleRow.classList.add('scene-stepper')
  styleRow.replaceChildren(scenePrevButton, sceneCurrent, sceneNextButton, options)

  scenePrevButton.addEventListener('click', () => changeSceneBy(-1))
  sceneNextButton.addEventListener('click', () => changeSceneBy(1))

  const busyObserver = new MutationObserver(syncSceneDisabledState)
  for (const button of sceneButtons) {
    busyObserver.observe(button, { attributes: true, attributeFilter: ['disabled'] })
  }

  syncSceneStepper()
  syncSceneDisabledState()
}
