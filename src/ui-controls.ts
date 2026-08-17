const controlPanel = document.querySelector<HTMLElement>('.control-panel')
const disclosure = document.querySelector<HTMLDetailsElement>('.description-disclosure')
const summary = disclosure?.querySelector<HTMLElement>('summary') ?? null

const transitionStyle = document.createElement('style')
transitionStyle.textContent = `
  .control-panel {
    max-height: 720px;
    overflow: hidden;
    transform-origin: left bottom;
    transition:
      width 340ms cubic-bezier(.22,.72,.22,1),
      max-height 340ms cubic-bezier(.22,.72,.22,1),
      padding 300ms cubic-bezier(.22,.72,.22,1),
      background-color 260ms ease,
      box-shadow 260ms ease,
      backdrop-filter 300ms ease;
  }

  .control-panel > :not(.control-copy),
  .control-copy-heading,
  .description-body {
    transition:
      opacity 180ms ease,
      transform 300ms cubic-bezier(.22,.72,.22,1),
      visibility 0s linear 0s;
  }

  .description-disclosure > summary {
    transition:
      width 340ms cubic-bezier(.22,.72,.22,1),
      height 340ms cubic-bezier(.22,.72,.22,1),
      grid-template-columns 340ms cubic-bezier(.22,.72,.22,1),
      gap 300ms ease,
      background-color 260ms ease,
      box-shadow 260ms ease;
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

  body[data-controls='collapsed'] .control-panel > :not(.control-copy) {
    opacity: 0;
    visibility: hidden;
    transform: translateY(10px);
    pointer-events: none;
    transition-delay: 0s, 0s, 180ms;
  }

  body[data-controls='collapsed'] .control-copy-heading,
  body[data-controls='collapsed'] .description-body {
    opacity: 0;
    visibility: hidden;
    transform: translateY(7px);
    pointer-events: none;
    transition-delay: 0s, 0s, 180ms;
  }

  body[data-controls='expanded'] .control-panel > :not(.control-copy),
  body[data-controls='expanded'] .control-copy-heading,
  body[data-controls='expanded'] .description-body {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    transition-delay: 100ms, 0s, 0s;
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

  body[data-controls='collapsed'] .description-toggle::before {
    content: '+';
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
    .description-disclosure > summary {
      transition: none !important;
    }
  }
`
document.head.appendChild(transitionStyle)

let collapsed = document.body.dataset.controls === 'collapsed'

function syncControlPanelState(): void {
  if (!controlPanel || !disclosure || !summary) return

  // Keep the native details content mounted so the whole card can animate.
  // The immersive state is represented by body[data-controls] instead.
  disclosure.open = true
  document.body.dataset.controls = collapsed ? 'collapsed' : 'expanded'
  controlPanel.setAttribute(
    'aria-label',
    collapsed ? 'QR controls, collapsed' : 'QR controls',
  )
  summary.setAttribute(
    'aria-label',
    collapsed ? 'Show QR controls' : 'Hide QR controls for immersive view',
  )
  summary.setAttribute('aria-expanded', String(!collapsed))
}

if (disclosure && summary) {
  disclosure.open = true
  summary.addEventListener('click', (event) => {
    event.preventDefault()
    collapsed = !collapsed
    syncControlPanelState()
  })
  syncControlPanelState()
}
