import type { QRMatrixData } from '../qr'
import type { SculptureBuild } from '../sculpture'
import type { PaletteKey } from '../palettes'
import { generateTree } from './tree'
import { generateHouse } from './house'
import { generateCastle } from './castle'
import { generateGlyph } from './glyph'
import { generateCity } from './city'
import { generateLighthouse } from './lighthouse'
import { generatePagoda } from './pagoda'
import { generateTemple } from './temple'
import { generateCrystal } from './crystal'

export type StyleId = 'tree' | 'house' | 'castle' | 'glyph' | 'city' | 'lighthouse' | 'pagoda' | 'temple' | 'crystal'

export interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  foundation: readonly string[]
  qrTop: 'palette' | string
  /** Scanner-light cap color for elevated light QR cells. Defaults to baseLight. */
  lightTop?: string
  /** Optional semantic water palette for styles that turn light cells into water. */
  water?: readonly string[]
  /** Optional semantic crystal palette for mineral/crystal scene bodies. */
  crystal?: readonly string[]
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
    headline: 'Ruin the code.',
    description: 'A comparatively intact central keep dominates an asymmetric ruin. The three finder regions are no longer equal towers: they become bastions with different damage profiles, while timing walls break into gaps and the courtyard collects sparse rubble.',
    specimen: 'KEEP + RUINED BASTIONS + BROKEN WALLS = QR',
    projectionLabel: 'RUINED FORTRESS',
    defaultPalette: 'summer',
    appearance: {
      baseLight: '#d9d7cc',
      baseDark: ['#424a47', '#505854', '#616862', '#343c39'],
      foundation: ['#777a73', '#666b66', '#898a80'],
      qrTop: '#2f3834',
      lightTop: '#ddd9ca',
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
  {
    id: 'city',
    label: 'City',
    eyebrow: 'VOXEL QR SCULPTURE / CITY',
    headline: 'Build across the code.',
    description: 'A central megablock deliberately spans both dark and light QR cells, with one scanner-light roof column extending as an antenna. Other light cells become streets or raised civic plazas while sparse secondary buildings keep the skyline readable.',
    specimen: 'MEGABLOCK + STREETS + PLAZAS = QR',
    projectionLabel: 'URBAN MASTERPLAN',
    defaultPalette: 'ginkgo',
    appearance: {
      baseLight: '#eff1ec',
      baseDark: ['#596164', '#4b5558', '#687174', '#414a4e'],
      foundation: ['#5b6264', '#4d5659', '#707679'],
      qrTop: '#202a2e',
      lightTop: '#eef0e8',
      voxelFill: 0.94,
    },
    generate: generateCity,
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    eyebrow: 'VOXEL QR SCULPTURE / LIGHTHOUSE',
    headline: 'Shape the tide.',
    description: 'Scanner-light QR cells become a shallow blue wave field with deterministic height variation. Finder regions rise into reef-like breakwaters while the dark island and beacon remain the visual anchor.',
    specimen: 'SEA + REEFS + BEACON = QR',
    projectionLabel: 'TIDAL HARBOR',
    defaultPalette: 'ginkgo',
    appearance: {
      baseLight: '#b9dce4',
      baseDark: ['#245663', '#2e6870', '#174a54', '#376f77'],
      foundation: ['#55787a', '#466769', '#678486'],
      qrTop: '#163d47',
      lightTop: '#b8dfe8',
      water: ['#9bcbd8', '#acd7e1', '#b9e0e7', '#8fc3d1'],
      voxelFill: 0.93,
    },
    generate: generateLighthouse,
  },
  {
    id: 'pagoda',
    label: 'Pagoda',
    eyebrow: 'VOXEL QR SCULPTURE / PAGODA',
    headline: 'Layer the code.',
    description: 'A tiered main pagoda spans scanner-light and scanner-dark data cells as one continuous building. Finder regions become secondary pavilions, timing cells become ordered corridors, and pale cells rise into gravel courts and stone steps.',
    specimen: 'PAGODA + PAVILIONS + COURTS = QR',
    projectionLabel: 'TEMPLE COURTYARD',
    defaultPalette: 'ginkgo',
    appearance: {
      baseLight: '#eee7d5',
      baseDark: ['#5a4c3d', '#665846', '#4a4f43', '#735c46'],
      foundation: ['#8c7f6d', '#756a5b', '#a1937d'],
      qrTop: '#3d342c',
      lightTop: '#f2ead8',
      voxelFill: 0.94,
    },
    generate: generatePagoda,
  },
  {
    id: 'temple',
    label: 'Temple',
    eyebrow: 'VOXEL QR SCULPTURE / TEMPLE',
    headline: 'Pass through the code.',
    description: 'A large foreground torii frames a central stone approach and a broad rear shrine hall. Finder regions stay subordinate as low gardens, water and lantern fragments instead of becoming three towers, giving the scene a strong front-to-back shrine axis.',
    specimen: 'TORII + APPROACH + MAIN HALL = QR',
    projectionLabel: 'SHRINE AXIS',
    defaultPalette: 'spectrum',
    appearance: {
      baseLight: '#eee8dc',
      baseDark: ['#4b433a', '#58493f', '#3d4740', '#645143'],
      foundation: ['#8d8172', '#756b60', '#a09686'],
      qrTop: '#342f2a',
      lightTop: '#f3eee4',
      water: ['#9fbfbd', '#b2cdc7', '#91b3b3', '#c2d7d0'],
      voxelFill: 0.95,
    },
    generate: generateTemple,
  },
  {
    id: 'crystal',
    label: 'Crystal',
    eyebrow: 'VOXEL QR SCULPTURE / CRYSTAL',
    headline: 'Focus the code.',
    description: 'A single suspended cyan crystal becomes the unmistakable focal point above a recessed energy basin. A low stone sanctum frame and four pylons define the room; the three QR finder regions remain in the slab instead of competing as satellite crystal towers.',
    specimen: 'SUSPENDED CRYSTAL + ENERGY BASIN = QR',
    projectionLabel: 'CRYSTAL SANCTUM',
    defaultPalette: 'spectrum',
    appearance: {
      baseLight: '#cbd9df',
      baseDark: ['#424e59', '#4d5b67', '#36434f', '#5b6670'],
      foundation: ['#515b65', '#434c56', '#65707a'],
      qrTop: '#273541',
      lightTop: '#d8edf1',
      water: ['#66b9c7', '#79c8d2', '#8ed6dc', '#58aebd'],
      crystal: ['#b9f4f4', '#8fe5ea', '#69ccd8', '#b7e8ff', '#73d9e7'],
      voxelFill: 0.92,
    },
    generate: generateCrystal,
  },
]

export function isStyleId(value: string): value is StyleId {
  return STYLES.some((style) => style.id === value)
}

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES.find((style) => style.id === id) ?? STYLES[0]
}
