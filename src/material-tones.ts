export type MaterialTone = 'dark' | 'light'

export interface MaterialToneRamp {
  dark: readonly string[]
  light: readonly string[]
}

function hexChannel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
}

function linearChannel(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

function authoredColorLuminance(color: string): number {
  const normalized = color.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new Error(`Material palette tone derivation requires #rrggbb colors; received ${color}.`)
  }

  const r = linearChannel(hexChannel(normalized, 1))
  const g = linearChannel(hexChannel(normalized, 3))
  const b = linearChannel(hexChannel(normalized, 5))
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

/**
 * Convert the palette's transitional flat material arrays into explicit dark/light ramps.
 *
 * Legacy scene palettes were authored as general variation ramps, not as equal-sized tone
 * halves: many valid materials contain three or five colors and their index order is not
 * monotonic by brightness. Derive polarity by stable luminance rank at this compatibility
 * boundary, then let projectionTone choose one explicit ramp. colorPhase is only used for
 * variation inside the selected ramp and never encodes polarity.
 */
export function splitMaterialToneRamp(colors: readonly string[]): MaterialToneRamp {
  if (colors.length < 2) {
    throw new Error(`Material palette must contain at least two colors; received ${colors.length}.`)
  }

  const ranked = colors
    .map((color, index) => ({ color, index, luminance: authoredColorLuminance(color) }))
    .sort((a, b) => a.luminance - b.luminance || a.index - b.index)

  const darkCount = Math.max(1, Math.floor(ranked.length / 2))
  return {
    dark: ranked.slice(0, darkCount).map(({ color }) => color),
    light: ranked.slice(darkCount).map(({ color }) => color),
  }
}

export function materialColorForTone(
  ramp: MaterialToneRamp,
  tone: MaterialTone,
  colorPhase: number,
): string {
  const colors = ramp[tone]
  if (colors.length === 0) {
    throw new Error(`Material ${tone} tone ramp must contain at least one color.`)
  }

  const phase = Math.max(0, Math.min(0.999999, colorPhase))
  const index = Math.min(colors.length - 1, Math.floor(phase * colors.length))
  return colors[index]
}
