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
  readonly stage: HTMLElement
  readonly input: HTMLInputElement
  readonly meta: HTMLElement
  readonly styleRow: HTMLElement
  readonly styleButtons: HTMLButtonElement[]
  readonly paletteButtons: HTMLButtonElement[]
  readonly exportGifButton: HTMLButtonElement
  readonly exportPngButton: HTMLButtonElement
  readonly copyShareLinkButton: HTMLButtonElement
  updatePalette(styleId: StyleId, paletteKey: PaletteKey): void
  updateStyle(styleId: StyleId): void
  updateProjection(styleId: StyleId, view: ProjectionView): void
  setExportBusy(busy: boolean): void
}

export function createAppUiController(): AppUiController {
  const stage = requiredElement<HTMLElement>('#stage')
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

  function updatePalette(styleId: StyleId, paletteKey: PaletteKey): void {
    const style = getStyle(styleId)
    const palette = getPalette(styleId, paletteKey)
    const accent = palette.colors[Math.min(2, palette.colors.length - 1)]
    document.documentElement.style.setProperty('--accent', accent)
    paletteLabel.textContent = `SURFACE / ${palette.label.toUpperCase()}`

    for (const button of paletteButtons) {
      const requested = button.dataset.palette
      if (!requested || !isPaletteKey(requested)) continue

      const option = getPalette(styleId, requested)
      button.classList.toggle('is-active', requested === paletteKey)
      button.style.background = swatchBackground(option.swatch)
      button.setAttribute('aria-label', `${style.label} palette: ${option.label}`)
      button.title = option.label
    }
  }

  function updateStyle(styleId: StyleId): void {
    const style = getStyle(styleId)
    eyebrow.textContent = style.eyebrow
    headline.textContent = style.headline
    lede.textContent = style.description
    specimen.textContent = style.specimen
    for (const button of styleButtons) {
      button.classList.toggle('is-active', button.dataset.style === styleId)
    }
    document.body.dataset.style = styleId
  }

  function updateProjection(styleId: StyleId, view: ProjectionView): void {
    const style = getStyle(styleId)
    const showQr = view === 'qr'
    modeReadout.textContent = showQr
      ? `QR / ${style.projectionLabel}`
      : `${style.label.toUpperCase()} / ISOMETRIC`
    stageHint.textContent = showQr
      ? `CLICK TO RETURN · ${style.specimen}`
      : 'CLICK TO ROTATE · FULL-SCENE QR POLARITY / SAME PROJECTION'
    document.body.dataset.mode = view
  }

  function setExportBusy(busy: boolean): void {
    for (const button of [exportGifButton, exportPngButton, copyShareLinkButton]) {
      button.disabled = busy
      button.setAttribute('aria-busy', String(busy))
    }
    input.disabled = busy
    for (const button of styleButtons) button.disabled = busy
    for (const button of paletteButtons) button.disabled = busy
  }

  return {
    stage,
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
