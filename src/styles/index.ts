import type { QRMatrixData } from '../qr'
import type { SculptureBuild } from '../sculpture'
import type { PaletteKey } from '../palettes'
import { generateTree } from './tree'
import { generateHouse } from './house'
import { generateCastle } from './castle'
import { generateGlyph } from './glyph'

export type StyleId = 'tree' | 'house' | 'castle' | 'glyph'

export interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  qrTop: 'palette' | string
}

export interface StyleDefinition {
  id: StyleId
  label: string
  eyebrow: string
  headline: string
  description: string
  specimen: string
  projectionLabel: string
  defaultPalette: PaletteKey
  appearance: StyleAppearance
  generate: (matrix: QRMatrixData, seedText: string) => SculptureBuild
}

export const STYLES: readonly StyleDefinition[] = [
  {
    id: 'tree',
    label: 'Tree',
    eyebrow: 'VOXEL QR SCULPTURE / TREE',
    headline: 'Grow the code.',
    description: 'The tree keeps a complete lawn-like QR plate. Dark modules rise into the canopy while the full physical quiet zone remains part of the sculpture.',
    specimen: 'TREE + FULL LAWN = QR',
    projectionLabel: 'FULL PAD',
    defaultPalette: 'blossom',
    appearance: {
      baseLight: '#ece7d8',
      baseDark: ['#315d43', '#466f49', '#5d7e50', '#738e58'],
      qrTop: 'palette',
    },
    generate: generateTree,
  },
  {
    id: 'house',
    label: 'House',
    eyebrow: 'VOXEL QR SCULPTURE / HOUSE',
    headline: 'Build the code.',
    description: 'The house sits on a compact warm courtyard instead of a full lawn. Outside the site, only sparse dark QR pavers remain; empty page space supplies the light modules.',
    specimen: 'HOUSE + SITE TILES = QR',
    projectionLabel: 'SITE WINDOW',
    defaultPalette: 'ginkgo',
    appearance: {
      baseLight: '#eadfc9',
      baseDark: ['#8f664a', '#a97852', '#bc895d', '#755643'],
      qrTop: '#5a342d',
    },
    generate: generateHouse,
  },
  {
    id: 'castle',
    label: 'Castle',
    eyebrow: 'VOXEL QR SCULPTURE / CASTLE',
    headline: 'Fortify the code.',
    description: 'The castle removes the light-colored board completely. Only scanner-dark stone pixels form the court and the keep rises from them, making the QR footprint itself part of the masonry.',
    specimen: 'CASTLE + STONE FIELD = QR',
    projectionLabel: 'DARK FIELD',
    defaultPalette: 'summer',
    appearance: {
      baseLight: '#f2f0e7',
      baseDark: ['#46504d', '#58615c', '#687069', '#363f3d'],
      qrTop: '#303936',
    },
    generate: generateCastle,
  },
  {
    id: 'glyph',
    label: 'Glyph',
    eyebrow: 'VOXEL QR SCULPTURE / GLYPH',
    headline: 'Sign the code.',
    description: 'There is no QR floor at all. Every dark module is one part of the sculpture: low columns preserve the symbol while selected columns rise to reveal a 5×7 alphanumeric relief.',
    specimen: 'WHOLE GLYPH FIELD = QR',
    projectionLabel: 'OBJECT ONLY',
    defaultPalette: 'spectrum',
    appearance: {
      baseLight: '#f2f0e7',
      baseDark: ['#3d3745', '#51485d', '#60546a'],
      qrTop: '#292432',
    },
    generate: generateGlyph,
  },
]

export function isStyleId(value: string): value is StyleId {
  return STYLES.some((style) => style.id === value)
}

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES.find((style) => style.id === id) ?? STYLES[0]
}
