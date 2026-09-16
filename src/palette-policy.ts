import { PALETTE_KEYS, type PaletteKey } from './palettes'
import type { StyleId } from './styles'

const ALL_PALETTES = PALETTE_KEYS as readonly PaletteKey[]

/**
 * Palette availability is authored per scene instead of forcing every sculpture into the
 * same four-way color selector. Single-entry scenes are intentionally fixed-color designs.
 */
export const STYLE_PALETTE_KEYS = {
  tree: ALL_PALETTES,
  forest: ['summer', 'ginkgo', 'spectrum'],
  mountain: ['blossom', 'summer', 'spectrum'],
  station: ['ginkgo', 'spectrum'],
  house: ['ginkgo', 'spectrum'],
  castle: ['summer'],
  glyph: ALL_PALETTES,
  city: ['ginkgo', 'spectrum'],
  lighthouse: ['blossom', 'spectrum'],
  pagoda: ['ginkgo'],
  temple: ['blossom'],
  crystal: ALL_PALETTES,
} as const satisfies Record<StyleId, readonly PaletteKey[]>

export function getStylePaletteKeys(styleId: StyleId): readonly PaletteKey[] {
  return STYLE_PALETTE_KEYS[styleId]
}

export function isStylePaletteAvailable(styleId: StyleId, paletteKey: PaletteKey): boolean {
  const available: readonly PaletteKey[] = STYLE_PALETTE_KEYS[styleId]
  return available.includes(paletteKey)
}
