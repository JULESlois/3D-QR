export const PALETTE_KEYS = ['blossom', 'summer', 'ginkgo', 'spectrum'] as const
export type PaletteKey = (typeof PALETTE_KEYS)[number]

export type PaletteSceneId =
  | 'tree'
  | 'forest'
  | 'mountain'
  | 'station'
  | 'house'
  | 'castle'
  | 'glyph'
  | 'city'
  | 'lighthouse'
  | 'pagoda'
  | 'temple'
  | 'crystal'

export interface ScenePaletteDefinition {
  label: string
  swatch: readonly string[]
  colors: readonly string[]
  qrDark: string
  baseLight?: string
  baseDark?: readonly string[]
  lightTop?: string
  foundation?: readonly string[]
  wood?: readonly string[]
  stone?: readonly string[]
  plaster?: readonly string[]
  glass?: readonly string[]
  water?: readonly string[]
  crystal?: readonly string[]
}

export const STYLE_PALETTES = {
  tree: {
    blossom: { label: 'Blossom', swatch: ['#f7d6df', '#d77491', '#bd587b'], colors: ['#f7d6df', '#edafbf', '#d77491', '#f3c8d3', '#bd587b'], qrDark: '#6b2f48', baseLight: '#f1ede3', baseDark: ['#315244', '#42604c', '#526f56'], wood: ['#5b3b2e', '#714a34', '#875d3b'] },
    summer: { label: 'Canopy', swatch: ['#d5e5a9', '#7eaa66', '#c0d998'], colors: ['#d5e5a9', '#abc985', '#7eaa66', '#5d8f53', '#c0d998'], qrDark: '#234a31', baseLight: '#e9eadc', baseDark: ['#294b34', '#37603d', '#456e48'], wood: ['#543c2a', '#6b4b31', '#805b38'] },
    ginkgo: { label: 'Ginkgo', swatch: ['#f4e3a2', '#c99c32', '#b77f25'], colors: ['#f4e3a2', '#e7c65b', '#c99c32', '#f0d676', '#b77f25'], qrDark: '#665019', baseLight: '#eee9d8', baseDark: ['#59613a', '#6b6c38', '#4d5934'], wood: ['#5a4630', '#74583a', '#8a683f'] },
    spectrum: { label: 'Night Bloom', swatch: ['#d46f91', '#6f83bd', '#d59466'], colors: ['#d46f91', '#a871b3', '#6f83bd', '#609e9c', '#d59466'], qrDark: '#30364d', baseLight: '#e9e7ef', baseDark: ['#37434d', '#3e4c51', '#2f3946'], wood: ['#4d3940', '#60434a', '#73505b'] },
  },
  forest: {
    blossom: { label: 'Moss', swatch: ['#9fbd7d', '#5f8950', '#496f43'], colors: ['#9fbd7d', '#7ea263', '#5f8950', '#b2c991', '#496f43'], qrDark: '#1e3b2c', baseLight: '#dfe3cf', baseDark: ['#274533', '#30513a', '#3c6042'], wood: ['#5a4330', '#6b5037', '#7a5e40'] },
    summer: { label: 'Fern', swatch: ['#c7dc90', '#6fa052', '#adc97e'], colors: ['#c7dc90', '#98bf6e', '#6fa052', '#4f823f', '#adc97e'], qrDark: '#173b29', baseLight: '#dbe3c6', baseDark: ['#234831', '#2d5737', '#38663e'], wood: ['#543b29', '#69482f', '#7c5737'] },
    ginkgo: { label: 'Autumn', swatch: ['#e5bd5a', '#a9582f', '#8f4a2b'], colors: ['#e5bd5a', '#cf853b', '#a9582f', '#e1a646', '#8f4a2b'], qrDark: '#5c321f', baseLight: '#eadfc8', baseDark: ['#5e4a2b', '#694b27', '#784b27'], wood: ['#56362a', '#6e4330', '#825038'] },
    spectrum: { label: 'Dusk', swatch: ['#758c88', '#6f718d', '#557067'], colors: ['#758c88', '#627e78', '#6f718d', '#9b7690', '#557067'], qrDark: '#293343', baseLight: '#d8dce2', baseDark: ['#304139', '#354a43', '#303b44'], wood: ['#44373a', '#564145', '#674d50'] },
  },
  mountain: {
    blossom: { label: 'Granite', swatch: ['#878d8d', '#a2a5a1', '#b7b8b1'], colors: ['#878d8d', '#727a7b', '#a2a5a1', '#626b6e', '#b7b8b1'], qrDark: '#343a3d', baseLight: '#e7e7e3', baseDark: ['#454d4f', '#535b5d', '#3f4749'], stone: ['#676f72', '#7c8382', '#929795', '#555e61'], water: ['#a8c3c5', '#b8ccca', '#94b2b7'] },
    summer: { label: 'Alpine', swatch: ['#647a63', '#8d9476', '#a6a995'], colors: ['#647a63', '#778968', '#8d9476', '#727b6e', '#a6a995'], qrDark: '#27443a', baseLight: '#e5e9e2', baseDark: ['#335247', '#405f50', '#2b493f'], stone: ['#747a74', '#8a8f86', '#5f6864'], water: ['#9fc3c7', '#b5d0ce', '#88b0b7'] },
    ginkgo: { label: 'Sunset', swatch: ['#b8795e', '#9f6654', '#8c5c50'], colors: ['#b8795e', '#c58f68', '#9f6654', '#d1a47a', '#8c5c50'], qrDark: '#5b382e', baseLight: '#efe5dc', baseDark: ['#62483e', '#715044', '#594039'], stone: ['#826e64', '#9a7d70', '#6e5e58'], water: ['#9ab9c2', '#b0c8ca', '#87a9b4'] },
    spectrum: { label: 'Glacier', swatch: ['#a8c8cf', '#6f95a4', '#7d9fac'], colors: ['#a8c8cf', '#89aeb8', '#6f95a4', '#bed7db', '#7d9fac'], qrDark: '#2d4555', baseLight: '#e5eef1', baseDark: ['#3a5661', '#496671', '#324b58'], stone: ['#64777d', '#7b8c90', '#526a72'], water: ['#8fc5d0', '#add9de', '#76adbc'] },
  },
  station: {
    blossom: { label: 'Concrete', swatch: ['#c9c7c0', '#747c7c', '#8b9290'], colors: ['#c9c7c0', '#9fa3a1', '#747c7c', '#dad7cf', '#8b9290'], qrDark: '#303638', baseLight: '#ecebe6', baseDark: ['#454c4d', '#555c5c', '#3d4446'], stone: ['#6d706d', '#878984', '#5e6361'], plaster: ['#d7d4cb', '#c5c4be', '#e5e2db'], glass: ['#617d84', '#78949a', '#506b73'] },
    summer: { label: 'Metro', swatch: ['#7e9b8a', '#9caf98', '#b8c3ad'], colors: ['#7e9b8a', '#658879', '#9caf98', '#557568', '#b8c3ad'], qrDark: '#28423d', baseLight: '#e6ebe4', baseDark: ['#3d504b', '#4c5d56', '#354640'], stone: ['#727a75', '#8a9188', '#616a65'], plaster: ['#d7ddd5', '#c6cec6', '#e5e9e3'], glass: ['#537c7e', '#6f9998', '#44686f'] },
    ginkgo: { label: 'Signal', swatch: ['#e1bd55', '#efcf6a', '#d8aa3f'], colors: ['#e1bd55', '#c9952f', '#efcf6a', '#a77429', '#d8aa3f'], qrDark: '#4d4230', baseLight: '#ece9df', baseDark: ['#575449', '#646054', '#47483f'], stone: ['#6b6c67', '#808078', '#595b57'], plaster: ['#ddd8ca', '#c9c4b8', '#e8e2d5'], glass: ['#5b747a', '#769096', '#486269'] },
    spectrum: { label: 'Nightline', swatch: ['#697db7', '#4d93a4', '#596aa0'], colors: ['#697db7', '#806ca8', '#4d93a4', '#a35f83', '#596aa0'], qrDark: '#252f43', baseLight: '#e3e6eb', baseDark: ['#354151', '#3f4b5c', '#2d3747'], stone: ['#626b76', '#77818b', '#525b68'], plaster: ['#ccd2da', '#bbc3ce', '#dde2e7'], glass: ['#436e85', '#5e8fa0', '#3d596f'] },
  },
  house: {
    blossom: { label: 'Brick', swatch: ['#b96855', '#9f5648', '#8b4d43'], colors: ['#b96855', '#c87c63', '#9f5648', '#d28f73', '#8b4d43'], qrDark: '#5d332c', baseLight: '#f0e5d9', baseDark: ['#71453a', '#825043', '#603b34'], wood: ['#59382d', '#6d4634', '#80543a'], stone: ['#81766b', '#97897b', '#6d655e'], plaster: ['#e3d4c4', '#d3c0ae', '#efe1d2'] },
    summer: { label: 'Cottage', swatch: ['#879b70', '#72885f', '#657b55'], colors: ['#879b70', '#a9b88a', '#72885f', '#bec6a0', '#657b55'], qrDark: '#354634', baseLight: '#e9eadc', baseDark: ['#465743', '#53664c', '#3d4e3c'], wood: ['#5b452f', '#72563a', '#856842'], stone: ['#7a7d70', '#929587', '#666a62'], plaster: ['#dedfce', '#ced1be', '#eaeadc'] },
    ginkgo: { label: 'Timber', swatch: ['#c08a4e', '#aa7441', '#95643a'], colors: ['#c08a4e', '#d3a362', '#aa7441', '#e1b573', '#95643a'], qrDark: '#563a2d', baseLight: '#eee2ce', baseDark: ['#6a4936', '#79543d', '#5c4032'], wood: ['#4f3528', '#65442f', '#7b5637'], stone: ['#817467', '#998879', '#6d635b'], plaster: ['#e6d8c2', '#d5c4aa', '#f0e4d1'] },
    spectrum: { label: 'Midnight', swatch: ['#65718d', '#586b78', '#566276'], colors: ['#65718d', '#7e7290', '#586b78', '#94727f', '#566276'], qrDark: '#303442', baseLight: '#e6e5e8', baseDark: ['#414653', '#4d5360', '#383d49'], wood: ['#46383b', '#58444a', '#6a5054'], plaster: ['#d1cfd3', '#c0bdc4', '#e0dde0'], glass: ['#496b7c', '#608695', '#3e586b'] },
  },
  castle: {
    blossom: { label: 'Limestone', swatch: ['#aaa494', '#c0b9a8', '#d0c7b3'], colors: ['#aaa494', '#8e8b80', '#c0b9a8', '#777870', '#d0c7b3'], qrDark: '#3d3b36', baseLight: '#e7e3d8', baseDark: ['#4e5049', '#5d5e55', '#42443f'], stone: ['#77766d', '#8f8c81', '#a5a092', '#62645e'] },
    summer: { label: 'Moss', swatch: ['#6f8065', '#5f7158', '#536550'], colors: ['#6f8065', '#859276', '#5f7158', '#9aa28a', '#536550'], qrDark: '#334039', baseLight: '#dfe2d5', baseDark: ['#414c43', '#4e5a4c', '#37433a'], stone: ['#6d746b', '#81877b', '#5b645d'] },
    ginkgo: { label: 'Ember', swatch: ['#a66f55', '#8d5b48', '#7d4e42'], colors: ['#a66f55', '#b98363', '#8d5b48', '#c49772', '#7d4e42'], qrDark: '#50372f', baseLight: '#e8dfd3', baseDark: ['#5e463d', '#6a4f43', '#503d36'], stone: ['#796c63', '#8d7b70', '#655b57'] },
    spectrum: { label: 'Moonstone', swatch: ['#7e8795', '#959aa6', '#a9abb1'], colors: ['#7e8795', '#687788', '#959aa6', '#5d6978', '#a9abb1'], qrDark: '#303846', baseLight: '#e1e3e5', baseDark: ['#404852', '#4c5560', '#363e49'], stone: ['#6e747d', '#828892', '#5c646e'] },
  },
  glyph: {
    blossom: { label: 'Ink', swatch: ['#5a5561', '#44404a', '#35313a'], colors: ['#5a5561', '#736c79', '#44404a', '#8a818d', '#35313a'], qrDark: '#29272d', baseLight: '#efedef', baseDark: ['#39363e', '#47434d', '#302e35'] },
    summer: { label: 'Signal', swatch: ['#60816f', '#4f6e60', '#405c50'], colors: ['#60816f', '#7c9b84', '#4f6e60', '#96ac94', '#405c50'], qrDark: '#283d35', baseLight: '#e8ece8', baseDark: ['#394c43', '#46594e', '#314139'] },
    ginkgo: { label: 'Foil', swatch: ['#d7b65c', '#bd9441', '#a87d32'], colors: ['#d7b65c', '#e3c972', '#bd9441', '#f0d98e', '#a87d32'], qrDark: '#59481e', baseLight: '#f0eadc', baseDark: ['#665b3c', '#756844', '#554d36'] },
    spectrum: { label: 'Spectrum', swatch: ['#d96f87', '#65a4ad', '#cf799c'], colors: ['#d96f87', '#e69a67', '#d7bc59', '#78aa76', '#65a4ad', '#6d83bd', '#9d72ad', '#cf799c'], qrDark: '#34364b', baseLight: '#ece8ef', baseDark: ['#424558', '#50536a', '#393c4d'] },
  },
  city: {
    blossom: { label: 'Steel', swatch: ['#727f84', '#5e6d73', '#4f5f66'], colors: ['#727f84', '#89969a', '#5e6d73', '#a0aaac', '#4f5f66'], qrDark: '#273136', baseLight: '#edf0ef', baseDark: ['#3d494e', '#4a575c', '#354146'], stone: ['#626a6d', '#777f81', '#535c60'], plaster: ['#c9cecc', '#b8bfbd', '#dde0dc'], glass: ['#587b87', '#7395a0', '#456773'] },
    summer: { label: 'Glass', swatch: ['#6d9293', '#5e7f82', '#507074'], colors: ['#6d9293', '#83a7a3', '#5e7f82', '#9bb7b0', '#507074'], qrDark: '#244044', baseLight: '#e8efed', baseDark: ['#355156', '#426167', '#2e474c'], stone: ['#657170', '#78817e', '#555f60'], plaster: ['#c8d1cd', '#b9c5c1', '#dce2de'], glass: ['#4f8895', '#69a2ab', '#40717e'] },
    ginkgo: { label: 'Sunset', swatch: ['#c48362', '#ac6d57', '#946054'], colors: ['#c48362', '#d29a70', '#ac6d57', '#dfa986', '#946054'], qrDark: '#493c38', baseLight: '#f0e8df', baseDark: ['#5a4c48', '#685752', '#4c4140'], stone: ['#766b67', '#8b7d77', '#645d5a'], plaster: ['#d9cdc2', '#c9baae', '#e8ddd2'], glass: ['#7c7d8b', '#9892a0', '#686d7a'] },
    spectrum: { label: 'Neon', swatch: ['#536fb3', '#8b5fa2', '#4d8d96'], colors: ['#536fb3', '#597f9f', '#8b5fa2', '#b05c82', '#4d8d96'], qrDark: '#252d46', baseLight: '#e7e9ee', baseDark: ['#343d56', '#414a64', '#2d354b'], stone: ['#596270', '#6e7784', '#4b5361'], plaster: ['#c3c8d3', '#b2bac8', '#d6dae2'], glass: ['#3f77a1', '#4f96a4', '#675b99'] },
  },
  lighthouse: {
    blossom: { label: 'Harbor', swatch: ['#8fc9d8', '#3f8198', '#dcebed'], colors: ['#e7f0ef', '#3f8198', '#d8e7e7', '#2f6f87', '#edf4f2'], qrDark: '#123f52', baseLight: '#b9dce5', baseDark: ['#1f5367', '#2b6578', '#174758'], foundation: ['#466b76', '#567b84', '#395d69'], stone: ['#55727b', '#67838a', '#46646e'], plaster: ['#e8f0ed', '#d9e6e3', '#f4f6f1'], glass: ['#4d8ca2', '#70a9b9', '#39778e'], water: ['#83c4d5', '#9ed3df', '#70b4c8', '#b7e1e7'] },
    summer: { label: 'Seafoam', swatch: ['#b8d5bc', '#d2e1c9', '#a7c6ae'], colors: ['#b8d5bc', '#90b9a4', '#d2e1c9', '#739b87', '#a7c6ae'], qrDark: '#1d4945', baseLight: '#cce7df', baseDark: ['#295b56', '#356b63', '#22504b'], stone: ['#627a73', '#768c83', '#526a65'], water: ['#9fd5cf', '#b7e2da', '#8ac7c1', '#c9ebe3'] },
    ginkgo: { label: 'Golden Hour', swatch: ['#e2b65a', '#c78d38', '#ac772f'], colors: ['#e2b65a', '#efcc73', '#c78d38', '#f4dc94', '#ac772f'], qrDark: '#4b4533', baseLight: '#d9e2dd', baseDark: ['#5c5945', '#6b654d', '#4d4c3d'], stone: ['#807766', '#968a76', '#6d675c'], water: ['#91bbc7', '#abcbd0', '#7ba9b8', '#c1d9d9'] },
    spectrum: { label: 'Storm', swatch: ['#718393', '#8592a0', '#9ba3aa'], colors: ['#718393', '#5d7486', '#8592a0', '#4d6679', '#9ba3aa'], qrDark: '#293847', baseLight: '#cfdbe2', baseDark: ['#384957', '#455865', '#30404e'], stone: ['#65717a', '#79838b', '#555f69'], water: ['#82aab8', '#9bbcc6', '#7096a7', '#b2cbd0'] },
  },
  pagoda: {
    blossom: { label: 'Vermilion', swatch: ['#b94f3f', '#9f4036', '#8a352f'], colors: ['#b94f3f', '#ce6750', '#9f4036', '#dd7d61', '#8a352f'], qrDark: '#4e332b', baseLight: '#efe7d8', baseDark: ['#5e4438', '#6b4d3e', '#503a32'], wood: ['#4a3028', '#5d3b2e', '#704734'], stone: ['#82786a', '#968b7a', '#6d665e'], plaster: ['#e4d9c5', '#d4c6ad', '#f0e6d3'] },
    summer: { label: 'Moss', swatch: ['#70805e', '#607151', '#536447'], colors: ['#70805e', '#86936d', '#607151', '#9da785', '#536447'], qrDark: '#374333', baseLight: '#e5e7d8', baseDark: ['#465240', '#53614a', '#3c4839'], wood: ['#4c3b2b', '#604a33', '#72583a'], stone: ['#777b6d', '#8c8f7e', '#64685f'] },
    ginkgo: { label: 'Gilt', swatch: ['#d6af4e', '#bc8d32', '#a97827'], colors: ['#d6af4e', '#e4c768', '#bc8d32', '#eedb8a', '#a97827'], qrDark: '#57471f', baseLight: '#f0e9d7', baseDark: ['#655b3b', '#746746', '#554e35'], wood: ['#4e3728', '#62452f', '#76543a'], stone: ['#817869', '#958977', '#6d655b'], plaster: ['#e6dcc5', '#d6c8ae', '#f1e8d5'] },
    spectrum: { label: 'Indigo', swatch: ['#5f6490', '#4f547e', '#444a72'], colors: ['#5f6490', '#7278a3', '#4f547e', '#8c7c9e', '#444a72'], qrDark: '#303348', baseLight: '#e7e6ea', baseDark: ['#404359', '#4d5067', '#373a4e'], wood: ['#43343b', '#574049', '#694c55'], stone: ['#6d6e78', '#82828d', '#5c5e69'], plaster: ['#d5d2d8', '#c4c0ca', '#e4e1e5'] },
  },
  temple: {
    blossom: { label: 'Torii', swatch: ['#b84535', '#365d3d', '#8d332c'], colors: ['#b84535', '#cf5843', '#a63a31', '#dd6c50', '#8d332c'], qrDark: '#26382d', baseLight: '#e8eadb', baseDark: ['#294a32', '#365b3a', '#426847'], foundation: ['#6b765f', '#7d8670', '#596751'], wood: ['#572d27', '#71372d', '#884333'], plaster: ['#e8decf', '#d8cbb9', '#f1e7da'], water: ['#8fb9ad', '#a9ccc0', '#7ca79f'] },
    summer: { label: 'Cedar', swatch: ['#6f7e63', '#5f7055', '#53634c'], colors: ['#6f7e63', '#879274', '#5f7055', '#9ca38a', '#53634c'], qrDark: '#384236', baseLight: '#e7e8dc', baseDark: ['#485246', '#55614f', '#3d473c'], wood: ['#4a3428', '#5d402e', '#724f36'], plaster: ['#dddccf', '#cdccbe', '#eae8dc'], water: ['#9ebfba', '#b2cdc5', '#8caeac'] },
    ginkgo: { label: 'Lantern', swatch: ['#d49748', '#bd7c34', '#a9672c'], colors: ['#d49748', '#e3af59', '#bd7c34', '#efc778', '#a9672c'], qrDark: '#58402a', baseLight: '#f0e8db', baseDark: ['#67513c', '#755c43', '#584634'], wood: ['#4d3428', '#62422f', '#765039'], plaster: ['#e7dac5', '#d6c6ad', '#f1e5d1'], water: ['#9ab8b6', '#adc7c2', '#87a8aa'] },
    spectrum: { label: 'Moon', swatch: ['#6f7788', '#5f687b', '#555e70'], colors: ['#6f7788', '#85899a', '#5f687b', '#9a92a0', '#555e70'], qrDark: '#303743', baseLight: '#e7e7eb', baseDark: ['#414954', '#4e5662', '#383f4a'], wood: ['#43373a', '#554349', '#684f52'], plaster: ['#d4d1d5', '#c3c0c7', '#e2dfe2'], water: ['#8faeb7', '#a8c1c5', '#7d9ba8'] },
  },
  crystal: {
    blossom: { label: 'Cyan', swatch: ['#7fcbd5', '#61b8c6', '#4ca6b7'], colors: ['#7fcbd5', '#9adce1', '#61b8c6', '#b5e9eb', '#4ca6b7'], qrDark: '#24434d', baseLight: '#d8e9ec', baseDark: ['#35525d', '#41616b', '#2e4853'], stone: ['#5b6870', '#6d7a82', '#4c5962'], water: ['#68b8c6', '#7ec9d2', '#57a8b8'], crystal: ['#c7ffff', '#9af1f3', '#6edce5', '#b9efff', '#71cddd'] },
    summer: { label: 'Jade', swatch: ['#72b999', '#58a883', '#4b9574'], colors: ['#72b999', '#8bcaa9', '#58a883', '#a4d8b8', '#4b9574'], qrDark: '#25483e', baseLight: '#dce9e2', baseDark: ['#36594e', '#42685a', '#2e4e45'], stone: ['#5c6d67', '#6f8178', '#4d5d59'], water: ['#6ebeb0', '#86cec0', '#5aa99e'], crystal: ['#c8ffe5', '#9aefc7', '#6fdbae', '#b9f5d6', '#61c89b'] },
    ginkgo: { label: 'Amber', swatch: ['#e2a94f', '#cc8a38', '#b4722f'], colors: ['#e2a94f', '#f0c56b', '#cc8a38', '#f5d687', '#b4722f'], qrDark: '#5b3d27', baseLight: '#eee5d8', baseDark: ['#6a4e37', '#785a3f', '#5b432f'], stone: ['#74675c', '#88786a', '#61584f'], water: ['#9cb4b2', '#b0c5c0', '#899fa2'], crystal: ['#fff0b9', '#ffd982', '#f5b94e', '#ffe8a1', '#e6a13e'] },
    spectrum: { label: 'Amethyst', swatch: ['#9c70bd', '#825ba8', '#6f4b94'], colors: ['#9c70bd', '#b487cb', '#825ba8', '#c59dda', '#6f4b94'], qrDark: '#3d3150', baseLight: '#e8e3ed', baseDark: ['#4d4160', '#5b4c70', '#423751'], stone: ['#625b6d', '#756d80', '#544d60'], water: ['#8fa9bc', '#a6becb', '#7b94aa'], crystal: ['#ecd5ff', '#d0a7f0', '#b47eda', '#e6c0ff', '#9d65c7'] },
  },
} satisfies Record<PaletteSceneId, Record<PaletteKey, ScenePaletteDefinition>>

export function isPaletteKey(value: string): value is PaletteKey {
  return (PALETTE_KEYS as readonly string[]).includes(value)
}

export function getPalette(sceneId: PaletteSceneId, key: PaletteKey): ScenePaletteDefinition {
  return STYLE_PALETTES[sceneId][key]
}
