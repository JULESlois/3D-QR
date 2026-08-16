export type PaletteKey = 'blossom' | 'summer' | 'ginkgo' | 'spectrum'

export interface PaletteDefinition {
  label: string
  colors: string[]
  qrDark: string
}

export const PALETTES: Record<PaletteKey, PaletteDefinition> = {
  blossom: {
    label: 'Blossom',
    colors: ['#ff9eb5', '#f6b0c4', '#ef7f9f', '#ffd1dc', '#d86286'],
    qrDark: '#3e1d29',
  },
  summer: {
    label: 'Summer',
    colors: ['#8fbf69', '#5e954d', '#b7d57f', '#4d7e45', '#9fcf72'],
    qrDark: '#17331c',
  },
  ginkgo: {
    label: 'Ginkgo',
    colors: ['#f6cb4f', '#ddb134', '#ffd96b', '#c79523', '#efbd39'],
    qrDark: '#3d2e0a',
  },
  spectrum: {
    label: 'Spectrum',
    colors: ['#e65f7b', '#f2a65a', '#e7cf55', '#75b86b', '#55a9c9', '#7676d8', '#b06ac8'],
    qrDark: '#191b26',
  },
}

export function isPaletteKey(value: string): value is PaletteKey {
  return value in PALETTES
}
