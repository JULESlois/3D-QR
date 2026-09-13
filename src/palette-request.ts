import { isPaletteKey, type PaletteKey } from './palettes'

export const PALETTE_REQUEST_EVENT = 'palette-request'
export const PALETTE_CHANGE_EVENT = 'palette-change'

export interface PaletteRequestDetail {
  paletteKey: PaletteKey
}

export function isPaletteRequestDetail(value: unknown): value is PaletteRequestDetail {
  if (!value || typeof value !== 'object' || !('paletteKey' in value)) return false
  const paletteKey = (value as { paletteKey?: unknown }).paletteKey
  return typeof paletteKey === 'string' && isPaletteKey(paletteKey)
}

export function requestPalette(paletteKey: PaletteKey): void {
  document.dispatchEvent(new CustomEvent<PaletteRequestDetail>(PALETTE_REQUEST_EVENT, {
    detail: { paletteKey },
  }))
}

export function notifyPaletteChanged(paletteKey: PaletteKey): void {
  document.dispatchEvent(new CustomEvent<PaletteRequestDetail>(PALETTE_CHANGE_EVENT, {
    detail: { paletteKey },
  }))
}
