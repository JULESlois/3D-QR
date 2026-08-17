const controlPanel = document.querySelector<HTMLElement>('.control-panel')
const disclosure = document.querySelector<HTMLDetailsElement>('.description-disclosure')
const summary = disclosure?.querySelector<HTMLElement>('summary') ?? null

const transitionStyle = document.createElement('style')
transitionStyle.textContent = `
  /* Palette tuning is intentionally dormant for now. Scene defaults remain active. */
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

  /*
   * Never animate text while its containing width is changing. Text only fades;
   * the card morph happens in a separate phase after it is fully transparent.
   */
  .control-panel > :not(.control-copy),
  .control-copy-heading,
  .description-body {
    transition: opacity 130ms ease;
  }

  .description-disclosure > summary {
    transition:
      width 320ms cubic-bezier(.22,.72,.22,1),
      height 320ms cubic-bezier(.22,.72,.22,1),
      grid-template-columns 320ms cubic-bezier(.22,.72,.22,1),
      gap 260ms ease,
      background-color 220ms ease,
      box-shadow 220ms ease;
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

  /* Opacity-only masthead motion avoids glyph raster jitter as well. */
  .masthead {
    transform: none !important;
    transition: opacity 160ms ease !important;
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
  }

  @media (prefers-reduced-motion: reduce) {
    .control-panel,
    .control-panel > :not(.control-copy),
    .control-copy-heading,
    .description-body,
    .description-disclosure > summary,
    .masthead {
      transition: none !important;
    }
  }
`
document.head.appendChild(transitionStyle)

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const contentFadeMs = 140
const panelMorphMs = 330

type ControlPhase = 'expanded' | 'closing' | 'collapsed' | 'opening'
let phase: ControlPhase = document.body.dataset.controls === 'collapsed' ? 'collapsed' : 'expanded'
let phaseTimer = 0

function clearPhaseTimer(): void {
  window.clearTimeout(phaseTimer)
  phaseTimer = 0
}

function syncControlPanelState(): void {
  if (!controlPanel || !disclosure || !summary) return

  // Keep details open so its children remain mounted throughout the card morph.
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
  document.body.dataset.controls = 'collapsed'
  syncControlPanelState()
}

function finishExpanded(): void {
  phase = 'expanded'
  document.body.dataset.controls = 'expanded'
  syncControlPanelState()
}

function collapseControls(): void {
  clearPhaseTimer()

  if (reducedMotion) {
    finishCollapsed()
    return
  }

  // Phase 1: keep the panel geometry fixed and fade text/controls to zero.
  document.body.dataset.controls = 'expanded'
  phase = 'closing'
  syncControlPanelState()

  // Phase 2: only after text is invisible may the panel width/height morph.
  phaseTimer = window.setTimeout(() => {
    finishCollapsed()
  }, contentFadeMs)
}

function expandControls(): void {
  clearPhaseTimer()

  if (reducedMotion) {
    finishExpanded()
    return
  }

  // Phase 1: expand an empty card. Hidden text never participates visibly in reflow.
  document.body.dataset.controls = 'expanded'
  phase = 'opening'
  syncControlPanelState()

  // Phase 2: reveal text only after panel dimensions have settled.
  phaseTimer = window.setTimeout(() => {
    finishExpanded()
  }, panelMorphMs)
}

if (disclosure && summary) {
  disclosure.open = true
  syncControlPanelState()

  summary.addEventListener('click', (event) => {
    event.preventDefault()

    if (phase === 'expanded' || phase === 'opening') {
      collapseControls()
    } else {
      expandControls()
    }
  })
}
