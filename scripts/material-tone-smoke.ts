import * as THREE from 'three'
import {
  materialColorForTone,
  splitMaterialToneRamp,
  type MaterialTone,
} from '../src/material-tones'
import { PALETTE_KEYS, getPalette, type ScenePaletteDefinition } from '../src/palettes'
import { createPaletteTransitionController } from '../src/palette-transition'
import type { SculptureBuild } from '../src/sculpture'
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
      if (!ramp.dark.length || !ramp.light.length || ramp.dark.length + ramp.light.length !== colors.length) {
        throw new Error(`${style.id}/${paletteKey}/${material} produced an invalid explicit tone ramp.`)
      }

      for (const tone of TONES) {
        const expectedRamp = tone === 'dark' ? ramp.dark : ramp.light
        for (const phase of SAMPLE_PHASES) {
          const expectedIndex = Math.min(
            expectedRamp.length - 1,
            Math.floor(Math.max(0, Math.min(0.999999, phase)) * expectedRamp.length),
          )
          const actual = materialColorForTone(ramp, tone, phase)
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

const transitionBuild = {
  voxels: [
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ],
  pivotY: 0,
} as SculptureBuild
const transitionMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial(),
  transitionBuild.voxels.length,
)
transitionMesh.setColorAt(0, new THREE.Color(0.1, 0.2, 0.3))
transitionMesh.setColorAt(1, new THREE.Color(0.3, 0.2, 0.1))

const transitionTarget = new Float32Array([
  0.9, 0.8, 0.7,
  0.6, 0.5, 0.4,
])
const transitions = createPaletteTransitionController()
if (!transitions.start(transitionMesh, transitionBuild, transitionTarget, 0)) {
  throw new Error('Palette transition smoke could not start.')
}
transitions.update(transitionMesh, 120)
if (!transitions.active) {
  throw new Error('Palette transition unexpectedly completed before finish().')
}
if (!transitions.finish(transitionMesh)) {
  throw new Error('Palette transition finish() did not finalize an active transition.')
}
if (transitions.active) {
  throw new Error('Palette transition remained active after finish().')
}

const finalized = transitionMesh.instanceColor?.array
if (!finalized || finalized.length !== transitionTarget.length) {
  throw new Error('Palette transition finish() did not preserve the instance color buffer.')
}
for (let i = 0; i < transitionTarget.length; i += 1) {
  if (Math.abs(Number(finalized[i]) - transitionTarget[i]) > 1e-6) {
    throw new Error(
      `Palette transition finish() left color component ${i} at ${finalized[i]}; expected ${transitionTarget[i]}.`,
    )
  }
}
if (transitions.finish(transitionMesh)) {
  throw new Error('Palette transition finish() reported an inactive transition as finalized.')
}

console.log(
  `material tone smoke passed for ${rampCount} explicit ramps, ${sampleCount} explicit tone/phase samples, and palette transition finalization`,
)
