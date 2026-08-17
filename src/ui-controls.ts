const controlPanel = document.querySelector<HTMLElement>('.control-panel')
const disclosure = document.querySelector<HTMLDetailsElement>('.description-disclosure')
const styleRow = document.querySelector<HTMLElement>('.style-row')
const styleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-style]'))

function syncControlPanelState(): void {
  if (!controlPanel || !disclosure) return

  const collapsed = !disclosure.open
  document.body.dataset.controls = collapsed ? 'collapsed' : 'expanded'
  controlPanel.setAttribute(
    'aria-label',
    collapsed ? 'QR controls, collapsed' : 'QR controls',
  )

  const summary = disclosure.querySelector<HTMLElement>('summary')
  summary?.setAttribute(
    'aria-label',
    collapsed ? 'Show QR controls' : 'Hide QR controls for immersive view',
  )
}

if (disclosure) {
  disclosure.addEventListener('toggle', syncControlPanelState)
  syncControlPanelState()
}

// Scene swaps intentionally animate through a midpoint before the model changes.
// Reflect the user's requested scene immediately so the picker never feels like
// a missed click while that animation is still running.
styleRow?.addEventListener(
  'click',
  (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest<HTMLButtonElement>('[data-style]')
    if (!button || button.disabled || !styleRow.contains(button)) return

    for (const candidate of styleButtons) {
      candidate.classList.toggle('is-active', candidate === button)
    }
  },
  { capture: true },
)
