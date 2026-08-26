import { getPalette, isPaletteKey, type PaletteKey } from './palettes'
import { getStyle, type StyleId } from './styles'
import type { ProjectionView } from './projection-view'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Required UI element is missing: ${selector}`)
  return element
}

function swatchBackground(colors: readonly string[]): string {
  return `linear-gradient(135deg, ${colors.join(', ')})`
}

export interface AppUiController {
  readonly input: HTMLInputElement
  readonly meta: HTMLElement
  readonly styleRow: HTMLElement
  readonly styleButtons: HTMLButtonElement[]
  readonly paletteButtons: HTMLButtonElement[]
  readonly exportGifButton: HTMLButtonElement
  readonly exportPngButton: HTMLButtonElement
  readonly copyShareLinkButton: HTMLButtonElement
  updatePalette(styleId: StyleId, paletteKey: PaletteKey): void
  updateStyle(styleId: StyleId, view: ProjectionView): void
  updateProjection(styleId: StyleId, view: ProjectionView): void
  setExportBusy(busy: boolean, pointerSurface: HTMLElement): void
}

export function createAppUiController(): AppUiController {
  const input = requiredElement<HTMLInputElement>('#qr-input')
  const meta = requiredElement<HTMLElement>('#qr-meta')
  const modeReadout = requiredElement<HTMLElement>('#mode-readout')
  const stageHint = requiredElement<HTMLElement>('#stage-hint')
  const eyebrow = requiredElement<HTMLElement>('#style-eyebrow')
  const headline = requiredElement<HTMLElement>('#style-headline')
  const lede = requiredElement<HTMLElement>('#style-lede')
  const specimen = requiredElement<HTMLElement>('#style-specimen')
  const paletteLabel = requiredElement<HTMLElement>('.palette-control > .palette-label')
  const styleRow = requiredElement<HTMLElement>('.style-row')
  const styleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-style]'))
  const paletteButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-palette]'))
  const exportGifButton = requiredElement<HTMLButtonElement>('#export-gif')
  const exportPngButton = requiredElement<HTMLButtonElement>('#export-png')
  const copyShareLinkButton = requiredElement<HTMLButtonElement>('#copy-share-link')
  const exportActionButtons = [exportGifButton, exportPngButton, copyShareLinkButton]
  const exportControls: Array<HTMLButtonElement | HTMLInputElement> = [
    ...exportActionButtons,
    input,
    ...styleButtons,
    ...paletteButtons,
  ]
  let busySnapshot: Map<HTMLButtonElement | HTMLInputElement, boolean> | null = null
  let ariaBusySnapshot: Map<HTMLButtonElement, string | null> | null = null
  let pointerEventsSnapshot: string | null = null

  function updatePalette(styleId: StyleId, paletteKey: PaletteKey): void {
    const style = getStyle(styleId)
    const palette = getPalette(styleId, paletteKey)
    const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
    document.documentElement.style.setProperty('--accent', accent)
    paletteLabel.textContent = `SURFACE / ${palette.label.toUpperCase()}`

    paletteButtons.forEach((button) => {
      const requested = button.dataset.palette
      if (!requested || !isPaletteKey(requested)) return

      const option = getPalette(styleId, requested)
      button.classList.toggle('is-active', requested === paletteKey)
      button.style.background = swatchBackground(option.swatch)
      button.setAttribute('aria-label', `${style.label} palette: ${option.label}`)
      button.title = option.label
    })
  }

  function updateProjection(styleId: StyleId, view: ProjectionView): void {
    const showQr = view === 'qr'
    const style = getStyle(styleId)
    modeReadout.textContent = showQr
      ? `QR / ${style.projectionLabel}`
      : `${style.label.toUpperCase()} / ISOMETRIC`
    stageHint.textContent = showQr
      ? `CLICK TO RETURN · ${style.specimen}`
      : 'CLICK TO ROTATE · FULL-SCENE QR POLARITY / SAME PROJECTION'
    document.body.dataset.mode = view
  }

  function updateStyle(styleId: StyleId, view: ProjectionView): void {
    const style = getStyle(styleId)
    eyebrow.textContent = style.eyebrow
    headline.textContent = style.headline
    lede.textContent = style.description
    specimen.textContent = style.specimen
    styleButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.style === styleId)
    })
    document.body.dataset.style = styleId
    updateProjection(styleId, view)
  }

  function setExportBusy(busy: boolean, pointerSurface: HTMLElement): void {
    if (busy) {
      if (!busySnapshot) {
        busySnapshot = new Map(exportControls.map((control) => [control, control.disabled]))
        ariaBusySnapshot = new Map(
          exportActionButtons.map((button) => [button, button.getAttribute('aria-busy')]),
        )
        pointerEventsSnapshot = pointerSurface.style.pointerEvents
      }
      for (const control of exportControls) control.disabled = true
      for (const button of exportActionButtons) button.setAttribute('aria-busy', 'true')
      pointerSurface.style.pointerEvents = 'none'
      return
    }

    if (busySnapshot) {
      for (const [control, disabled] of busySnapshot) control.disabled = disabled
      busySnapshot = null
    }
    if (ariaBusySnapshot) {
      for (const [button, ariaBusy] of ariaBusySnapshot) {
        if (ariaBusy === null) button.removeAttribute('aria-busy')
        else button.setAttribute('aria-busy', ariaBusy)
      }
      ariaBusySnapshot = null
    }
    if (pointerEventsSnapshot !== null) {
      pointerSurface.style.pointerEvents = pointerEventsSnapshot
      pointerEventsSnapshot = null
    }
  }

  return {
    input,
    meta,
    styleRow,
    styleButtons,
    paletteButtons,
    exportGifButton,
    exportPngButton,
    copyShareLinkButton,
    updatePalette,
    updateStyle,
    updateProjection,
    setExportBusy,
  }
}
