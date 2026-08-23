import {
  STYLE_PALETTES,
  type PaletteKey,
  type PaletteSceneId,
  type ScenePaletteDefinition,
} from './palettes'

type MutablePaletteTable = Record<PaletteSceneId, Record<PaletteKey, ScenePaletteDefinition>>

const palettes = STYLE_PALETTES as unknown as MutablePaletteTable

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

function setDefaultPalette(
  scene: PaletteSceneId,
  key: PaletteKey,
  palette: ScenePaletteDefinition,
): void {
  palettes[scene][key] = palette
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`Unsupported palette color ${hex}; expected #RRGGBB.`)
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}

function mixHex(source: string, target: string, amount: number): string {
  const [sr, sg, sb] = parseHex(source)
  const [tr, tg, tb] = parseHex(target)
  return toHex(
    sr + (tr - sr) * amount,
    sg + (tg - sg) * amount,
    sb + (tb - sb) * amount,
  )
}

function polarityRamp(colors: readonly string[]): readonly string[] {
  // Keep every authored hue as an anchor. The first half becomes a richer/shadowed
  // version and the second half a sunlit version of the same sequence, matching
  // the explicit material-tone renderer without collapsing to black/white.
  const dark = colors.map((color) => mixHex(color, '#101820', 0.24))
  const light = colors.map((color) => mixHex(color, '#f2f0e7', 0.16))
  return [...dark, ...light]
}

function normalizeAlternatePalettes(): void {
  // The original palette table predates material/polarity decoupling. Normalize every
  // authored option first; curated defaults below then replace their active entries.
  // This makes palette switching projection-safe instead of relying on accidental array order.
  for (const scenePalettes of Object.values(palettes)) {
    for (const palette of Object.values(scenePalettes)) {
      for (const material of PAIRED_MATERIAL_KEYS) {
        const colors = palette[material]
        if (!Array.isArray(colors) || colors.length === 0) continue
        ;(palette as unknown as Record<string, unknown>)[material] = polarityRamp(colors)
      }

      if (palette.baseDark?.length) {
        palette.baseDark = palette.baseDark.map((color) => mixHex(color, '#101820', 0.18))
      }
      if (palette.baseLight) {
        palette.baseLight = mixHex(palette.baseLight, '#f2f0e7', 0.1)
      }
    }
  }
}

normalizeAlternatePalettes()

// Paired material arrays are ordered as [dark variants..., matching light variants...].
// projectionTone selects the explicit material tone while colorPhase only selects a
// variation within that material. This preserves QR polarity without scanner-cap colors.
setDefaultPalette('tree', 'blossom', {
  label: 'Blossom Meadow',
  swatch: ['#d86f91', '#8fae73', '#6a4735'],
  colors: ['#873b59', '#a44a69', '#bd5b79', '#df91a7', '#efb2c1', '#f7ced8'],
  baseLight: '#98b77a',
  baseDark: ['#294832', '#36593a', '#456a43'],
  foundation: ['#5a4d3a', '#6c5b44', '#7b694e', '#8f7b5d', '#a08b69', '#b19b77'],
  wood: ['#4a3028', '#5d3b2e', '#6d4634', '#76513c', '#896148', '#9b7255'],
})

setDefaultPalette('forest', 'summer', {
  label: 'Fern Canopy',
  swatch: ['#5e8e49', '#9abb72', '#5a4330'],
  colors: ['#274b31', '#35623b', '#487845', '#6f9b5c', '#91b775', '#b2cd91'],
  baseLight: '#9fbd7f',
  baseDark: ['#203f2c', '#2c5034', '#38613b'],
  foundation: ['#4d3d31', '#5f4b39', '#6e5842', '#795f48', '#8a6d51', '#9b7a5a'],
  wood: ['#452f26', '#563829', '#67432f', '#715039', '#835e42', '#956e4b'],
})

setDefaultPalette('mountain', 'summer', {
  label: 'Alpine',
  swatch: ['#436247', '#7f8581', '#b8d7dd'],
  colors: ['#294537', '#365744', '#49694e', '#6f845e', '#8fa273', '#afbd90'],
  baseLight: '#96a781',
  baseDark: ['#29483a', '#355846', '#42674f'],
  foundation: ['#4f5758', '#5d6666', '#697171', '#767e7d', '#858c89', '#969b96'],
  stone: ['#4d5557', '#5b6465', '#6a7171', '#7c8381', '#909590', '#a5aaa3'],
  plaster: ['#7899a5', '#8baab4', '#9ebac2', '#b9d1d7', '#d0e2e6', '#e5f0f2'],
  water: ['#3f7180', '#548896', '#689ca7', '#84b6bf', '#9fced3', '#b8dfe2'],
})

setDefaultPalette('station', 'ginkgo', {
  label: 'Rail Steel',
  swatch: ['#4f5a5e', '#b64a3b', '#6d8d9a'],
  colors: ['#354247', '#79362f', '#334d59', '#77868b', '#c75a49', '#7798a5'],
  baseLight: '#aeb8b5',
  baseDark: ['#30383a', '#3d4749', '#4a5555'],
  foundation: ['#454a49', '#525958', '#5f6664', '#6c7471', '#7d8581', '#8f9690'],
  wood: ['#4f3a2d', '#5f4534', '#6c4d38', '#775741', '#89664a', '#9b7554'],
  stone: ['#555b5c', '#626969', '#707675', '#858b88', '#989d98', '#aab0aa'],
  plaster: ['#747b79', '#848b88', '#949a96', '#aab0aa', '#bcc1ba', '#d0d4cd'],
  glass: ['#355d6b', '#46717e', '#568390', '#7098a3', '#88adb5', '#a1c2c8'],
})

setDefaultPalette('house', 'ginkgo', {
  label: 'Garden House',
  swatch: ['#8c4035', '#8fa76c', '#d6c5a8'],
  colors: ['#652f2b', '#79352f', '#8b3c33', '#a95647', '#c56f5c', '#db8d73'],
  baseLight: '#91aa71',
  baseDark: ['#2e4932', '#3b5a3a', '#4b6a43'],
  foundation: ['#5f5548', '#6c6052', '#7a6c5c', '#887967', '#998873', '#aa9780'],
  wood: ['#4b3328', '#5b3b2c', '#6b4532', '#765039', '#875f43', '#99704e'],
  stone: ['#5d625e', '#6b716c', '#797f78', '#8b9188', '#9fa498', '#b2b7a8'],
  plaster: ['#a18f79', '#b19c82', '#c0aa8e', '#d4bfa2', '#e2ceb1', '#efdec3'],
  glass: ['#315c72', '#3e7187', '#4b8398', '#66a0b2', '#80b5c3', '#9bcbd4'],
})

setDefaultPalette('castle', 'summer', {
  label: 'Weathered Stone',
  swatch: ['#6d706a', '#b19d79', '#687858'],
  colors: ['#424944', '#4f594b', '#5e6459', '#747c70', '#87917b', '#9ba18d'],
  baseLight: '#b3a789',
  baseDark: ['#3d453e', '#4a5546', '#58634f'],
  foundation: ['#4f514e', '#5c5f59', '#696c64', '#767a70', '#85897c', '#95998a'],
  stone: ['#555b59', '#686b63', '#756f61', '#8b918c', '#a19d8d', '#b9aa8e'],
  plaster: ['#7d796f', '#8f897b', '#9d9584', '#b2aa97', '#c6bca6', '#d9ceb8'],
})

setDefaultPalette('glyph', 'spectrum', {
  label: 'Spectrum Ink',
  swatch: ['#c94f6a', '#56a5a6', '#7867b5'],
  colors: [
    '#8f344a', '#93512f', '#8b712a', '#3f6f45', '#315f7b', '#554589',
    '#df7087', '#e1905b', '#d6bd59', '#76ad78', '#68a8c5', '#9180c8',
  ],
  baseLight: '#aaa7b7',
  baseDark: ['#30333e', '#3d404d', '#4a4d5c'],
  foundation: ['#454754', '#525461', '#5e606d', '#70727f', '#81838f', '#9496a1'],
})

setDefaultPalette('city', 'ginkgo', {
  label: 'Metropolis',
  swatch: ['#5c7480', '#9b5646', '#8c6a43'],
  colors: ['#69372f', '#6e4c31', '#364b55', '#303f50', '#ad5c49', '#b9824f', '#617f8d', '#58708b'],
  baseLight: '#949da0',
  baseDark: ['#30383c', '#3d474b', '#495458'],
  foundation: ['#41484b', '#4e5659', '#5a6366', '#687175', '#788184', '#899294'],
  stone: ['#4e575b', '#5c666a', '#697277', '#7d878b', '#909a9d', '#a4adaf'],
  plaster: ['#737a7b', '#858b8a', '#949a98', '#a9afab', '#bcc2bd', '#d0d4ce'],
  glass: ['#315a6d', '#3f7286', '#4e899c', '#69a2b4', '#82b9c7', '#9cced8'],
})

setDefaultPalette('lighthouse', 'blossom', {
  label: 'Harbor',
  swatch: ['#2f7891', '#89c8d8', '#dcebed'],
  colors: ['#264e5f', '#6e332e', '#455b64', '#79a8b6', '#c86658', '#b8d4da'],
  baseLight: '#86bfd0',
  baseDark: ['#16475a', '#20596d', '#2c6b7d'],
  foundation: ['#3c5962', '#4a6871', '#57767e', '#68868d', '#79979d', '#8aa8ad'],
  stone: ['#405d66', '#506d75', '#5d7980', '#718c92', '#84a0a5', '#99b4b8'],
  plaster: ['#9fb9bd', '#b1c8ca', '#c1d5d6', '#d1e1e1', '#e0ebea', '#edf4f1'],
  glass: ['#2d667d', '#3c7e94', '#4e93a6', '#6aabba', '#84bdc9', '#9fd0d8'],
  water: ['#2f6f86', '#3f879d', '#529db0', '#73b6c7', '#8dcbd7', '#a9dce3'],
})

setDefaultPalette('pagoda', 'ginkgo', {
  label: 'Vermilion Court',
  swatch: ['#a23c32', '#32453a', '#b4914f'],
  colors: ['#682b27', '#293831', '#705529', '#b34b3d', '#536b56', '#c7a15d'],
  baseLight: '#aaa18f',
  baseDark: ['#303834', '#3e4840', '#4c5748'],
  foundation: ['#55524b', '#635f56', '#706c60', '#7d796b', '#8e8978', '#9f9985'],
  wood: ['#5f2724', '#753029', '#89372e', '#a44437', '#bb5545', '#cf6a55'],
  stone: ['#565b58', '#656b66', '#737974', '#868c85', '#999f95', '#adb2a5'],
  plaster: ['#9d8f7e', '#ad9d88', '#bba993', '#cfbba0', '#ddc9ad', '#ebd8bb'],
})

setDefaultPalette('temple', 'blossom', {
  label: 'Torii Garden',
  swatch: ['#b64335', '#477044', '#9db58a'],
  colors: ['#6e2b27', '#833129', '#96372e', '#b94a3a', '#cf5c48', '#df7157'],
  baseLight: '#91aa78',
  baseDark: ['#294a32', '#365b3a', '#426847'],
  foundation: ['#596359', '#687267', '#768174', '#879183', '#98a293', '#a9b3a3'],
  wood: ['#542722', '#672d27', '#7a342b', '#8f4134', '#a84d3e', '#bf604b'],
  stone: ['#5f655f', '#6d746d', '#7b8179', '#8d9388', '#a0a697', '#b3b9a7'],
  plaster: ['#a89681', '#b9a58e', '#c9b49a', '#dcc7aa', '#ead8bb', '#f2e4cc'],
  water: ['#46796f', '#5b8e82', '#6da094', '#86b6aa', '#9cc9bd', '#b2d9cc'],
})

setDefaultPalette('crystal', 'spectrum', {
  label: 'Cyan Core',
  swatch: ['#3b8fa5', '#72c7d3', '#b8f3f2'],
  colors: ['#284d63', '#315f77', '#3a7189', '#5b94a8', '#75adbd', '#91c5cf'],
  baseLight: '#6fa9b5',
  baseDark: ['#263e4b', '#31505d', '#3d626c'],
  foundation: ['#414d56', '#505c65', '#5e6a72', '#6e7980', '#7f8a90', '#919ca1'],
  stone: ['#48545d', '#57636b', '#65717a', '#77838a', '#89959b', '#9ca8ad'],
  water: ['#2f7f92', '#3e94a6', '#50a8b8', '#6fc1ce', '#8ad4dc', '#a7e5e9'],
  crystal: ['#3e9eae', '#53b5c3', '#6acbd5', '#8fe4e8', '#b0f1f1', '#d0fbf8'],
})
