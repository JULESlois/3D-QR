import type { QRMatrixData } from '../qr'
import type { SculptureBuild } from '../sculpture'
import type { PaletteKey } from '../palettes'
import { generateTree } from './tree'
import { generateHouse } from './house'
import { generateCastle } from './castle'
import { generateGlyph } from './glyph'

export type StyleId = 'tree' | 'house' | 'castle' | 'glyph'

export interface StyleDefinition {
  id: StyleId
  label: string
  eyebrow: string
  headline: string
  description: string
  specimen: string
  defaultPalette: PaletteKey
  generate: (matrix: QRMatrixData, seedText: string) => SculptureBuild
}

export const STYLES: readonly StyleDefinition[] = [
  {
    id: 'tree',
    label: 'Tree',
    eyebrow: 'VOXEL QR SCULPTURE / TREE',
    headline: 'Grow the code.',
    description: 'A QR-constrained canopy rises from dark modules while the ground keeps the rest of the symbol intact. Rotate the same voxel field into its scanner view.',
    specimen: 'TREE + GROUND = QR',
    defaultPalette: 'blossom',
    generate: generateTree,
  },
  {
    id: 'house',
    label: 'House',
    eyebrow: 'VOXEL QR SCULPTURE / HOUSE',
    headline: 'Build the code.',
    description: 'Dark data modules become walls, a gabled roof, a door and chimney. Every elevated column remains owned by a real QR module.',
    specimen: 'HOUSE + SITE = QR',
    defaultPalette: 'ginkgo',
    generate: generateHouse,
  },
  {
    id: 'castle',
    label: 'Castle',
    eyebrow: 'VOXEL QR SCULPTURE / CASTLE',
    headline: 'Fortify the code.',
    description: 'A keep, perimeter walls and crenellated towers emerge from scanner-safe QR columns without introducing geometry above light modules.',
    specimen: 'CASTLE + COURT = QR',
    defaultPalette: 'summer',
    generate: generateCastle,
  },
  {
    id: 'glyph',
    label: 'Glyph',
    eyebrow: 'VOXEL QR SCULPTURE / GLYPH',
    headline: 'Sign the code.',
    description: 'The first alphanumeric character in the payload is extruded as a deterministic 5×7 voxel glyph while its top projection remains the original QR.',
    specimen: 'GLYPH + FIELD = QR',
    defaultPalette: 'spectrum',
    generate: generateGlyph,
  },
]

export function isStyleId(value: string): value is StyleId {
  return STYLES.some((style) => style.id === value)
}

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES.find((style) => style.id === id) ?? STYLES[0]
}
