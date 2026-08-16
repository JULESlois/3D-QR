export type PaletteKey = 'blossom' | 'summer' | 'ginkgo' | 'spectrum'

export interface PaletteDefinition {
  label: string
  colors: string[]
  qrDark: string
}

export const PALETTES: Record<PaletteKey, PaletteDefinition> = {
  blossom: {
    label: 'Blossom',
    colors: ['#f8dce2', '#efb2c0', '#dc7894', '#f5c8d2', '#be607e', '#f0e3dc', '#d996aa'],
    qrDark: '#351923',
  },
  summer: {
    label: 'Summer',
    colors: ['#c5d99b', '#91ba76', '#5f915a', '#acd083', '#477a4d', '#d8e2ac', '#76a665'],
    qrDark: '#142d19',
  },
  ginkgo: {
    label: 'Ginkgo',
    colors: ['#f6e2a0', '#efcc5c', '#ce9d30', '#f8d978', '#aa7b25', '#dfb844', '#eee0a3'],
    qrDark: '#372807',
  },
  spectrum: {
    label: 'Spectrum',
    colors: ['#d95f78', '#e99561', '#d7ba50', '#72aa6f', '#589ea9', '#6479b9', '#9b6ab0', '#cf7298'],
    qrDark: '#171922',
  },
}

export function isPaletteKey(value: string): value is PaletteKey {
  return value in PALETTES
}
