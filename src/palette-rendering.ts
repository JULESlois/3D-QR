import * as THREE from 'three'
import { materialColorForTone } from './material-tones'
import { getPalette, type PaletteKey } from './palettes'
import type { SculptureBuild, SculptureVoxel } from './sculpture'
import { getStyle, type StyleId } from './styles'

const fallbackWood = ['#3f2a22', '#523428', '#65402f', '#76513c', '#896148', '#9b7255'] as const
const fallbackStone = ['#505650', '#626861', '#73786f', '#85897e', '#999b8d', '#aaa99a'] as const
const fallbackPlaster = ['#9f927e', '#b2a38b', '#c4b49a', '#d8cbb4', '#e7dbc5', '#eee6d8'] as const
const fallbackGlass = ['#3c626c', '#4c7580', '#5e8790', '#83a7aa', '#9bbabd', '#b2cccd'] as const

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function indexedHexColor(colors: readonly string[], phase: number, target: THREE.Color): THREE.Color {
  const index = Math.min(colors.length - 1, Math.floor(clamp01(phase) * colors.length))
  return target.set(colors[index])
}

function materialVoxelColor(
  colors: readonly string[],
  voxel: SculptureVoxel,
  target: THREE.Color,
): THREE.Color {
  if (voxel.projectionTone) {
    return target.set(materialColorForTone(colors, voxel.projectionTone, voxel.colorPhase))
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
      return target.set(baseLight)
    case 'floor-dark':
      return indexedHexColor(palette.baseDark ?? appearance.baseDark, voxel.colorPhase, target)
    case 'water': {
      const colors = palette.water ?? appearance.water
      return colors
        ? materialVoxelColor(colors, voxel, target)
        : target.set(baseLight)
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
