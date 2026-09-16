import { PALETTE_KEYS, type PaletteKey } from './palettes'
import type { StyleId } from './styles'

const ALL_PALETTES = PALETTE_KEYS as readonly PaletteKey[]

/**
 * Palette availability is authored per scene instead of forcing every sculpture into the
 * same four-way color selector. Single-entry scenes are intentionally fixed-color designs.
 * Widen the registry values to PaletteKey[] at the boundary so callers do not inherit a
 * union of scene-specific tuple element types when indexing by a dynamic StyleId.
 */
export const STYLE_PALETTE_KEYS: Readonly<Record<StyleId, readonly PaletteKey[]>> = {
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
}

export function getStylePaletteKeys(styleId: StyleId): readonly PaletteKey[] {
  return STYLE_PALETTE_KEYS[styleId]
}

export function isStylePaletteAvailable(styleId: StyleId, paletteKey: PaletteKey): boolean {
  return STYLE_PALETTE_KEYS[styleId].includes(paletteKey)
}
