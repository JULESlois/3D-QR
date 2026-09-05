import * as THREE from 'three'
import {
  materialColorForTone,
  splitMaterialToneRamp,
  type MaterialToneRamp,
} from './material-tones'
import { getPalette, type PaletteKey } from './palettes'
import type { ProjectionTone, SculptureBuild, SculptureVoxel } from './sculpture'
import { getStyle, type StyleId } from './styles'

const fallbackWood = ['#3f2a22', '#523428', '#65402f', '#76513c', '#896148', '#9b7255'] as const
const fallbackStone = ['#505650', '#626861', '#73786f', '#85897e', '#999b8d', '#aaa99a'] as const
const fallbackPlaster = ['#9f927e', '#b2a38b', '#c4b49a', '#d8cbb4', '#e7dbc5', '#eee6d8'] as const
const fallbackGlass = ['#3c626c', '#4c7580', '#5e8790', '#83a7aa', '#9bbabd', '#b2cccd'] as const
const fallbackMetal = ['#30424b', '#3f5560', '#506975', '#76909a', '#91a9b1', '#acbec4'] as const

// Three.Color stores linear RGB values after parsing authored sRGB palette colors, so this
// is the same relative-luminance space that a thresholding scanner effectively needs.
// Keep a generous global gap across every semantic material rather than assuming each
// material's locally-paired dark/light ramps are mutually separable from other materials.
const DARK_PROJECTION_MAX_LUMINANCE = 0.1
const LIGHT_PROJECTION_MIN_LUMINANCE = 0.62

const materialToneRampCache = new WeakMap<readonly string[], MaterialToneRamp>()

function explicitMaterialToneRamp(colors: readonly string[]): MaterialToneRamp {
  const cached = materialToneRampCache.get(colors)
  if (cached) return cached

  const ramp = splitMaterialToneRamp(colors)
  materialToneRampCache.set(colors, ramp)
  return ramp
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function indexedHexColor(colors: readonly string[], phase: number, target: THREE.Color): THREE.Color {
  const index = Math.min(colors.length - 1, Math.floor(clamp01(phase) * colors.length))
  return target.set(colors[index])
}

function relativeLuminance(color: THREE.Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
}

/**
 * Paired material ramps preserve hue and material identity, but independently-authored
 * materials can still overlap in absolute brightness (for example dark snow versus a
 * light stone). A scanner sees all QR modules together, not one material at a time, so
 * scanner-facing top surfaces need one shared luminance envelope across materials.
 *
 * Dark colors are scaled toward black only as far as required, preserving their linear
 * RGB chromaticity exactly. Light colors are mixed toward white only as far as required.
 * This applies only to surfaces that encode QR polarity; side walls and ordinary art
 * geometry retain the authored palette unchanged, and scanner surfaces remain visibly
 * green/blue/red/etc. rather than becoming generic black/white caps.
 */
function enforceProjectionContrast(
  color: THREE.Color,
  tone: ProjectionTone,
): THREE.Color {
  const luminance = relativeLuminance(color)

  if (tone === 'dark' && luminance > DARK_PROJECTION_MAX_LUMINANCE) {
    color.multiplyScalar(DARK_PROJECTION_MAX_LUMINANCE / Math.max(luminance, 1e-6))
    return color
  }

  if (tone === 'light' && luminance < LIGHT_PROJECTION_MIN_LUMINANCE) {
    const amount = (LIGHT_PROJECTION_MIN_LUMINANCE - luminance) / Math.max(1e-6, 1 - luminance)
    color.lerp(new THREE.Color(1, 1, 1), clamp01(amount))
  }

  return color
}

function materialVoxelColor(
  colors: readonly string[],
  voxel: SculptureVoxel,
  target: THREE.Color,
): THREE.Color {
  if (voxel.projectionTone) {
    target.set(
      materialColorForTone(explicitMaterialToneRamp(colors), voxel.projectionTone, voxel.colorPhase),
    )
    return enforceProjectionContrast(target, voxel.projectionTone)
  }
  return indexedHexColor(colors, voxel.colorPhase, target)
}

function colorForVoxel(
  voxel: SculptureVoxel,
  styleId: StyleId,
  paletteKey: PaletteKey,
  target: THREE.Color,
): THREE.Color {
  const palette = getPalette(styleId, paletteKey)
  const appearance = getStyle(styleId).appearance
  const baseLight = palette.baseLight ?? appearance.baseLight

  switch (voxel.kind) {
    case 'floor-light':
      target.set(baseLight)
      return enforceProjectionContrast(target, 'light')
    case 'floor-dark':
      indexedHexColor(palette.baseDark ?? appearance.baseDark, voxel.colorPhase, target)
      return enforceProjectionContrast(target, 'dark')
    case 'water': {
      const colors = palette.water ?? appearance.water
      return colors
        ? materialVoxelColor(colors, voxel, target)
        : enforceProjectionContrast(target.set(baseLight), voxel.projectionTone ?? 'light')
    }
    case 'crystal':
      return materialVoxelColor(
        palette.crystal ?? appearance.crystal ?? palette.glass ?? fallbackGlass,
        voxel,
        target,
      )
    case 'foundation':
      return materialVoxelColor(palette.foundation ?? appearance.foundation, voxel, target)
    case 'wood':
      return materialVoxelColor(palette.wood ?? fallbackWood, voxel, target)
    case 'stone':
      return materialVoxelColor(palette.stone ?? fallbackStone, voxel, target)
    case 'plaster':
      return materialVoxelColor(palette.plaster ?? fallbackPlaster, voxel, target)
    case 'glass':
      return materialVoxelColor(palette.glass ?? fallbackGlass, voxel, target)
    case 'metal':
      return materialVoxelColor(palette.metal ?? fallbackMetal, voxel, target)
    case 'primary':
    default:
      return materialVoxelColor(palette.colors, voxel, target)
  }
}

export function computePaletteColors(
  build: SculptureBuild,
  styleId: StyleId,
  paletteKey: PaletteKey,
): Float32Array {
  const buffer = new Float32Array(build.voxels.length * 3)
  const color = new THREE.Color()

  for (let i = 0; i < build.voxels.length; i += 1) {
    colorForVoxel(build.voxels[i], styleId, paletteKey, color)
    const offset = i * 3
    buffer[offset] = color.r
    buffer[offset + 1] = color.g
    buffer[offset + 2] = color.b
  }

  return buffer
}

export function applyPaletteColorBuffer(
  mesh: THREE.InstancedMesh,
  build: SculptureBuild,
  buffer: Float32Array,
): void {
  const color = new THREE.Color()

  for (let i = 0; i < build.voxels.length; i += 1) {
    const offset = i * 3
    color.setRGB(buffer[offset], buffer[offset + 1], buffer[offset + 2])
    mesh.setColorAt(i, color)
  }

  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

export function capturePaletteColors(mesh: THREE.InstancedMesh | null): Float32Array | null {
  const attribute = mesh?.instanceColor
  if (!attribute) return null
  return Float32Array.from(attribute.array as ArrayLike<number>)
}

export function createPaletteDelays(build: SculptureBuild): Float32Array {
  const delays = new Float32Array(build.voxels.length)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const voxel of build.voxels) {
    const coordinate = voxel.x + voxel.z * 0.72 + (voxel.y - build.pivotY) * 0.24
    min = Math.min(min, coordinate)
    max = Math.max(max, coordinate)
  }

  const span = Math.max(0.0001, max - min)
  for (let i = 0; i < build.voxels.length; i += 1) {
    const voxel = build.voxels[i]
    const coordinate = voxel.x + voxel.z * 0.72 + (voxel.y - build.pivotY) * 0.24
    delays[i] = clamp01((coordinate - min) / span)
  }

  return delays
}
