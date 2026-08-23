import {
  materialColorForTone,
  splitMaterialToneRamp,
  type MaterialTone,
} from '../src/material-tones'
import { PALETTE_KEYS, getPalette, type ScenePaletteDefinition } from '../src/palettes'
import { STYLES } from '../src/styles'

const PAIRED_MATERIAL_KEYS = [
  'colors',
  'foundation',
  'wood',
  'stone',
  'plaster',
  'glass',
  'water',
  'crystal',
] as const satisfies readonly (keyof ScenePaletteDefinition)[]

const SAMPLE_PHASES = [0, 0.24, 0.5, 0.74, 0.999999] as const
const TONES = ['dark', 'light'] as const satisfies readonly MaterialTone[]

let rampCount = 0
let sampleCount = 0

for (const style of STYLES) {
  for (const paletteKey of PALETTE_KEYS) {
    const palette = getPalette(style.id, paletteKey)

    for (const material of PAIRED_MATERIAL_KEYS) {
      const colors = palette[material]
      if (!Array.isArray(colors)) continue

      const ramp = splitMaterialToneRamp(colors)
      if (ramp.dark.length !== ramp.light.length || ramp.dark.length * 2 !== colors.length) {
        throw new Error(`${style.id}/${paletteKey}/${material} produced mismatched tone ramps.`)
      }

      for (const tone of TONES) {
        const expectedRamp = tone === 'dark' ? ramp.dark : ramp.light
        for (const phase of SAMPLE_PHASES) {
          const expectedIndex = Math.min(
            expectedRamp.length - 1,
            Math.floor(Math.max(0, Math.min(0.999999, phase)) * expectedRamp.length),
          )
          const actual = materialColorForTone(colors, tone, phase)
          const expected = expectedRamp[expectedIndex]
          if (actual !== expected) {
            throw new Error(
              `${style.id}/${paletteKey}/${material}/${tone} phase ${phase} resolved to ${actual}; expected ${expected}.`,
            )
          }
          sampleCount += 1
        }
      }

      rampCount += 1
    }
  }
}

console.log(
  `material tone smoke passed for ${rampCount} paired ramps and ${sampleCount} explicit tone/phase samples`,
)
