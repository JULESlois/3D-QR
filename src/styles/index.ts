import type { QRMatrixData } from '../qr'
import type { SculptureBuild } from '../sculpture'
import type { PaletteKey } from '../palettes'
import { generateTree } from './tree'
import { generateForest } from './forest'
import { generateMountain } from './mountain'
import { generateStation } from './station'
import { generateHouse } from './house'
import { generateCastle } from './castle'
import { generateGlyph } from './glyph'
import { generateCity } from './city'
import { generateLighthouse } from './lighthouse'
import { generatePagoda } from './pagoda'
import { generateTemple } from './temple'
import { generateCrystal } from './crystal'

export type StyleId = 'tree' | 'forest' | 'mountain' | 'station' | 'house' | 'castle' | 'glyph' | 'city' | 'lighthouse' | 'pagoda' | 'temple' | 'crystal'

export interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  foundation: readonly string[]
  qrTop: 'palette' | string
  lightTop?: string
  water?: readonly string[]
  crystal?: readonly string[]
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
    id: 'tree', label: 'Tree', eyebrow: 'VOXEL QR SCULPTURE / TREE', headline: 'Grow the code.',
    description: 'The original landscape treatment: a broad lawn-like QR plate with the full physical quiet zone. Dark modules rise into the canopy while the ground remains part of the composition.',
    specimen: 'TREE + FULL LAWN = QR', projectionLabel: 'FULL LAWN', defaultPalette: 'blossom',
    appearance: { baseLight: '#ece7d8', baseDark: ['#315d43', '#466f49', '#5d7e50', '#738e58'], foundation: ['#d8d0bb', '#c8bea7'], qrTop: 'palette', voxelFill: 0.91 },
    generate: generateTree,
  },
  {
    id: 'forest', label: 'Forest', eyebrow: 'VOXEL QR SCENE / FOREST', headline: 'Walk into the code.',
    description: 'A mixed-species woodland replaces the single hero tree. Broadleaf crowns, conical pines and a few larger ancient trees overlap into a layered canopy around a winding low clearing, while shrubs and mossy QR ground fill the understory.',
    specimen: 'CANOPY + TRUNKS + CLEARING = QR', projectionLabel: 'WOODLAND FLOOR', defaultPalette: 'summer',
    appearance: { baseLight: '#d8ddbd', baseDark: ['#274b35', '#31583b', '#3b6543', '#203e2e'], foundation: ['#735e45', '#604d39', '#826b4e'], qrTop: '#173927', lightTop: '#dce2c2', voxelFill: 0.93 },
    generate: generateForest,
  },
  {
    id: 'mountain', label: 'Mountain', eyebrow: 'VOXEL QR TERRAIN / MOUNTAIN', headline: 'Carve the code.',
    description: 'The whole QR symbol becomes one continuous alpine relief: forested lower slopes rise into rock and snow, a curved valley cuts across the terrain, and finder regions remain deliberately low foothills instead of becoming three corner monuments.',
    specimen: 'RIDGE + VALLEY + SNOWLINE = QR', projectionLabel: 'ALPINE RELIEF', defaultPalette: 'summer',
    appearance: { baseLight: '#dbe6df', baseDark: ['#315348', '#3d6252', '#29483f', '#496b58'], foundation: ['#676f6b', '#59625e', '#78807a'], qrTop: '#263f36', lightTop: '#eff3ed', water: ['#9fc4c7', '#afd0d1', '#8db6bc', '#bed8d6'], voxelFill: 0.95 },
    generate: generateMountain,
  },
  {
    id: 'station', label: 'Station', eyebrow: 'VOXEL QR INFRASTRUCTURE / STATION', headline: 'Board the code.',
    description: 'A broad rail terminal introduces a horizontal transport grammar: twin tracks run between parallel platforms, long canopy strips define the passenger zone, and a central concourse with a compact clock tower ties the composition together.',
    specimen: 'TRACKS + PLATFORMS + CANOPY = QR', projectionLabel: 'RAIL TERMINAL', defaultPalette: 'ginkgo',
    appearance: { baseLight: '#e7e6df', baseDark: ['#4c5352', '#5a6260', '#3f4746', '#68706c'], foundation: ['#696861', '#585852', '#7b786e'], qrTop: '#28302f', lightTop: '#f0efe9', voxelFill: 0.96 },
    generate: generateStation,
  },
  {
    id: 'house', label: 'House', eyebrow: 'VOXEL QR SCULPTURE / HOUSE', headline: 'Live in the code.',
    description: 'A large mixed-polarity residence dominates the lot: main gabled home, projecting front gable, two-cell chimney, garage wing, porch canopy and garden path. Finder regions stay at ground level as part of the residential site.',
    specimen: 'HOME + GABLE + GARAGE = QR', projectionLabel: 'RESIDENTIAL LOT', defaultPalette: 'ginkgo',
    appearance: { baseLight: '#efe3cb', baseDark: ['#7a5140', '#8f6047', '#a46d4c', '#6a473c'], foundation: ['#b58b68', '#9e765c', '#c29b77'], qrTop: '#57362f', lightTop: '#ead8b9', voxelFill: 0.94 },
    generate: generateHouse,
  },
  {
    id: 'castle', label: 'Castle', eyebrow: 'VOXEL QR SCULPTURE / CASTLE', headline: 'Ruin the code.',
    description: 'A comparatively intact central keep dominates an asymmetric ruin. The three finder regions are no longer equal towers: they become bastions with different damage profiles, while timing walls break into gaps and the courtyard collects sparse rubble.',
    specimen: 'KEEP + RUINED BASTIONS + BROKEN WALLS = QR', projectionLabel: 'RUINED FORTRESS', defaultPalette: 'summer',
    appearance: { baseLight: '#d9d7cc', baseDark: ['#424a47', '#505854', '#616862', '#343c39'], foundation: ['#777a73', '#666b66', '#898a80'], qrTop: '#2f3834', lightTop: '#ddd9ca', voxelFill: 0.97 },
    generate: generateCastle,
  },
  {
    id: 'glyph', label: 'Glyph', eyebrow: 'VOXEL QR SCULPTURE / GLYPH', headline: 'Sign the code.',
    description: 'The glyph is a relief mounted on a thin display plaque exactly the size of the QR symbol. There is no physical quiet-zone rim, so the plaque reads more like a designed object than a landscape base.',
    specimen: 'GLYPH + DISPLAY PLAQUE = QR', projectionLabel: 'DISPLAY PLAQUE', defaultPalette: 'spectrum',
    appearance: { baseLight: '#ebe6ef', baseDark: ['#40394b', '#51475c', '#62556b'], foundation: ['#81768b', '#70647b', '#94879e'], qrTop: '#292432', voxelFill: 0.9 },
    generate: generateGlyph,
  },
  {
    id: 'city', label: 'City', eyebrow: 'VOXEL QR SCULPTURE / CITY', headline: 'Raise the code.',
    description: 'A dense high-rise skyline uses deliberately different building silhouettes: landmark spire, setback tower, twin towers, podium towers, slabs, terraces and crowned offices. Buildings may cross light and dark QR cells while their roofs restore scanner polarity.',
    specimen: 'DIVERSE TOWERS + SKYLINE = QR', projectionLabel: 'DENSE SKYLINE', defaultPalette: 'ginkgo',
    appearance: { baseLight: '#eff1ec', baseDark: ['#596164', '#4b5558', '#687174', '#414a4e'], foundation: ['#5b6264', '#4d5659', '#707679'], qrTop: '#202a2e', lightTop: '#eef0e8', voxelFill: 0.94 },
    generate: generateCity,
  },
  {
    id: 'lighthouse', label: 'Lighthouse', eyebrow: 'VOXEL QR SCULPTURE / LIGHTHOUSE', headline: 'Shape the tide.',
    description: 'Scanner-light QR cells become a shallow blue wave field with deterministic height variation. Finder regions rise into reef-like breakwaters while the dark island and beacon remain the visual anchor.',
    specimen: 'SEA + REEFS + BEACON = QR', projectionLabel: 'TIDAL HARBOR', defaultPalette: 'ginkgo',
    appearance: { baseLight: '#b9dce4', baseDark: ['#245663', '#2e6870', '#174a54', '#376f77'], foundation: ['#55787a', '#466769', '#678486'], qrTop: '#163d47', lightTop: '#b8dfe8', water: ['#9bcbd8', '#acd7e1', '#b9e0e7', '#8fc3d1'], voxelFill: 0.93 },
    generate: generateLighthouse,
  },
  {
    id: 'pagoda', label: 'Pagoda', eyebrow: 'VOXEL QR SCULPTURE / PAGODA', headline: 'Layer the code.',
    description: 'A tiered main pagoda spans scanner-light and scanner-dark data cells as one continuous building. Finder regions become secondary pavilions, timing cells become ordered corridors, and pale cells rise into gravel courts and stone steps.',
    specimen: 'PAGODA + PAVILIONS + COURTS = QR', projectionLabel: 'TEMPLE COURTYARD', defaultPalette: 'ginkgo',
    appearance: { baseLight: '#eee7d5', baseDark: ['#5a4c3d', '#665846', '#4a4f43', '#735c46'], foundation: ['#8c7f6d', '#756a5b', '#a1937d'], qrTop: '#3d342c', lightTop: '#f2ead8', voxelFill: 0.94 },
    generate: generatePagoda,
  },
  {
    id: 'temple', label: 'Temple', eyebrow: 'VOXEL QR SCULPTURE / TEMPLE', headline: 'Pass through the code.',
    description: 'A large foreground torii frames a central stone approach and a broad rear shrine hall. Finder regions stay subordinate as low gardens, water and lantern fragments instead of becoming three towers, giving the scene a strong front-to-back shrine axis.',
    specimen: 'TORII + APPROACH + MAIN HALL = QR', projectionLabel: 'SHRINE AXIS', defaultPalette: 'spectrum',
    appearance: { baseLight: '#eee8dc', baseDark: ['#4b433a', '#58493f', '#3d4740', '#645143'], foundation: ['#8d8172', '#756b60', '#a09686'], qrTop: '#342f2a', lightTop: '#f3eee4', water: ['#9fbfbd', '#b2cdc7', '#91b3b3', '#c2d7d0'], voxelFill: 0.95 },
    generate: generateTemple,
  },
  {
    id: 'crystal', label: 'Crystal', eyebrow: 'VOXEL QR SCULPTURE / CRYSTAL', headline: 'Focus the code.',
    description: 'A single suspended cyan crystal becomes the unmistakable focal point above a recessed energy basin. A low stone sanctum frame and four pylons define the room; the three QR finder regions remain in the slab instead of competing as satellite crystal towers.',
    specimen: 'SUSPENDED CRYSTAL + ENERGY BASIN = QR', projectionLabel: 'CRYSTAL SANCTUM', defaultPalette: 'spectrum',
    appearance: { baseLight: '#cbd9df', baseDark: ['#424e59', '#4d5b67', '#36434f', '#5b6670'], foundation: ['#515b65', '#434c56', '#65707a'], qrTop: '#273541', lightTop: '#d8edf1', water: ['#66b9c7', '#79c8d2', '#8ed6dc', '#58aebd'], crystal: ['#b9f4f4', '#8fe5ea', '#69ccd8', '#b7e8ff', '#73d9e7'], voxelFill: 0.92 },
    generate: generateCrystal,
  },
]

export function isStyleId(value: string): value is StyleId {
  return STYLES.some((style) => style.id === value)
}

export function getStyle(id: StyleId): StyleDefinition {
  return STYLES.find((style) => style.id === id) ?? STYLES[0]
}
