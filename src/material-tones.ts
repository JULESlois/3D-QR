export type MaterialTone = 'dark' | 'light'

export interface MaterialToneRamp {
  dark: readonly string[]
  light: readonly string[]
}

/**
 * Split the palette's transitional paired-array representation into explicit dark and
 * light ramps. Keeping this logic in one production module makes projection polarity a
 * first-class palette concern instead of something callers infer from array indices.
 */
export function splitMaterialToneRamp(colors: readonly string[]): MaterialToneRamp {
  if (colors.length < 4 || colors.length % 2 !== 0) {
    throw new Error(
      `Material palette must contain equally-sized dark/light halves; received ${colors.length} colors.`,
    )
  }

  const half = colors.length / 2
  return {
    dark: colors.slice(0, half),
    light: colors.slice(half),
  }
}

export function materialColorForTone(
  ramp: MaterialToneRamp | readonly string[],
  tone: MaterialTone,
  colorPhase: number,
): string {
  const colors = Array.isArray(ramp) ? splitMaterialToneRamp(ramp)[tone] : ramp[tone]
  const phase = Math.max(0, Math.min(0.999999, colorPhase))
  const index = Math.min(colors.length - 1, Math.floor(phase * colors.length))
  return colors[index]
}
