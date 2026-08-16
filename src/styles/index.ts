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
  foundation: readonly string[]
  qrTop: 'palette' | string
  /** Fraction of a QR cell occupied by each voxel. Smaller values expose more grid gap. */
  voxelFill: number
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
    description: 'The original landscape treatment: a broad lawn-like QR plate with the full physical quiet zone. Dark modules rise into the canopy while the ground remains part of the composition.',
    specimen: 'TREE + FULL LAWN = QR',
    projectionLabel: 'FULL LAWN',
    defaultPalette: 'blossom',
    appearance: {
      baseLight: '#ece7d8',
      baseDark: ['#315d43', '#466f49', '#5d7e50', '#738e58'],
      foundation: ['#d8d0bb', '#c8bea7'],
      qrTop: 'palette',
      voxelFill: 0.91,
    },
    generate: generateTree,
  },
  {
    id: 'house',
    label: 'House',
    eyebrow: 'VOXEL QR SCULPTURE / HOUSE',
    headline: 'Build the code.',
    description: 'The house sits on a compact two-layer courtyard pad with only a one-module physical border. Warm ceramic tiles replace the tree lawn while the page supplies the remaining scanner quiet zone.',
    specimen: 'HOUSE + COURTYARD = QR',
    projectionLabel: 'COURTYARD PAD',
    defaultPalette: 'ginkgo',
    appearance: {
      baseLight: '#efe3cb',
      baseDark: ['#7a5140', '#8f6047', '#a46d4c', '#6a473c'],
      foundation: ['#b58b68', '#9e765c', '#c29b77'],
      qrTop: '#57362f',
      voxelFill: 0.94,
    },
    generate: generateHouse,
  },
  {
    id: 'castle',
    label: 'Castle',
    eyebrow: 'VOXEL QR SCULPTURE / CASTLE',
    headline: 'Fortify the code.',
    description: 'The castle uses a thick three-layer stone dais with a smaller two-module physical border. Its floor is pale masonry and graphite QR stone rather than grass, giving the fortification its own weight and silhouette.',
    specimen: 'CASTLE + STONE DAIS = QR',
    projectionLabel: 'STONE PLINTH',
    defaultPalette: 'summer',
    appearance: {
      baseLight: '#d9d7cc',
      baseDark: ['#424a47', '#505854', '#616862', '#343c39'],
      foundation: ['#777a73', '#666b66', '#898a80'],
      qrTop: '#2f3834',
      voxelFill: 0.97,
    },
    generate: generateCastle,
  },
  {
    id: 'glyph',
    label: 'Glyph',
    eyebrow: 'VOXEL QR SCULPTURE / GLYPH',
    headline: 'Sign the code.',
    description: 'The glyph is a relief mounted on a thin display plaque exactly the size of the QR symbol. There is no physical quiet-zone rim, so the plaque reads more like a designed object than a landscape base.',
    specimen: 'GLYPH + DISPLAY PLAQUE = QR',
    projectionLabel: 'DISPLAY PLAQUE',
    defaultPalette: 'spectrum',
    appearance: {
      baseLight: '#ebe6ef',
      baseDark: ['#40394b', '#51475c', '#62556b'],
      foundation: ['#81768b', '#70647b', '#94879e'],
      qrTop: '#292432',
      voxelFill: 0.9,
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
