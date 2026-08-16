export type PaletteKey = 'blossom' | 'summer' | 'ginkgo' | 'spectrum'

export interface PaletteDefinition {
  label: string
  colors: string[]
  qrDark: string
}

export const PALETTES: Record<PaletteKey, PaletteDefinition> = {
  blossom: {
    label: 'Blossom',
    colors: ['#f8dce2', '#efb2c0', '#dc7894', '#f5c8d2', '#d996aa', '#f0e3dc', '#c86f92'],
    qrDark: '#a1416c',
  },
  summer: {
    label: 'Summer',
    colors: ['#d1e1aa', '#a8c98b', '#79a86a', '#b8d49a', '#5e915a', '#dfe8bf', '#8db77a'],
    qrDark: '#315f3e',
  },
  ginkgo: {
    label: 'Ginkgo',
    colors: ['#f7e5a6', '#efcf65', '#d2a23a', '#f4d77c', '#ba8730', '#e1b84b', '#efe0a0'],
    qrDark: '#755719',
  },
  spectrum: {
    label: 'Spectrum',
    colors: ['#d96f87', '#e69a67', '#d7bc59', '#78aa76', '#65a4ad', '#6d83bd', '#9d72ad', '#cf799c'],
    qrDark: '#3d4965',
  },
}

export function isPaletteKey(value: string): value is PaletteKey {
  return value in PALETTES
}
