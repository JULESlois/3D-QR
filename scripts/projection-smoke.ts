import { CELL_SIZE, QUIET_ZONE, cellKey, positionForCell } from '../src/sculpture'
import { createQRMatrix, type QRMatrixData } from '../src/qr'
import { getPalette, type ScenePaletteDefinition } from '../src/palettes'
import { STYLES } from '../src/styles'

interface ProjectionCase {
  label: string
  payload: string
  minVersion: number
}

const cases: readonly ProjectionCase[] = [
  { label: 'compact', payload: 'A', minVersion: 1 },
  { label: 'typical-url', payload: 'https://github.com/JULESlois/3D-QR', minVersion: 3 },
  { label: 'medium-content', payload: `forest-${'mixed-case-payload/'.repeat(9)}`, minVersion: 6 },
  { label: 'large-content', payload: `city-${'projection-coverage/'.repeat(24)}`, minVersion: 10 },
]

const EPSILON = 1e-7
const MIN_PAIR_LUMINANCE_GAP = 0.025
const MIN_MEAN_LUMINANCE_GAP = 0.06
const MIN_BASE_LUMINANCE_GAP = 0.06

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

type GeneratedBuild = ReturnType<(typeof STYLES)[number]['generate']>
type GeneratedVoxel = GeneratedBuild['voxels'][number]

function channelToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) throw new Error(`Unsupported palette color ${hex}; expected #RRGGBB.`)

  const value = Number.parseInt(match[1], 16)
  const red = channelToLinear((value >> 16) & 0xff)
  const green = channelToLinear((value >> 8) & 0xff)
  const blue = channelToLinear(value & 0xff)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}

function assertPairedMaterialContrast(
  styleId: string,
  paletteLabel: string,
  material: string,
  colors: readonly string[],
): void {
  if (colors.length < 4 || colors.length % 2 !== 0) {
    throw new Error(
      `${styleId}/${paletteLabel} ${material} must contain equally-sized dark/light halves; received ${colors.length} colors.`,
    )
  }

  const half = colors.length / 2
  const dark = colors.slice(0, half).map(relativeLuminance)
  const light = colors.slice(half).map(relativeLuminance)

  for (let index = 0; index < half; index += 1) {
    const gap = light[index] - dark[index]
    if (gap < MIN_PAIR_LUMINANCE_GAP) {
      throw new Error(
        `${styleId}/${paletteLabel} ${material} pair ${index} has luminance gap ${gap.toFixed(4)}; `
        + `expected at least ${MIN_PAIR_LUMINANCE_GAP}.`,
      )
    }
  }

  const meanGap = mean(light) - mean(dark)
  if (meanGap < MIN_MEAN_LUMINANCE_GAP) {
    throw new Error(
      `${styleId}/${paletteLabel} ${material} mean luminance gap ${meanGap.toFixed(4)} is below ${MIN_MEAN_LUMINANCE_GAP}.`,
    )
  }
}

function assertDefaultPaletteContrast(): number {
  let pairedMaterialCount = 0

  for (const style of STYLES) {
    const palette = getPalette(style.id, style.defaultPalette)

    if (!palette.baseLight || !palette.baseDark?.length) {
      throw new Error(`${style.id}/${palette.label} must define both baseLight and baseDark for projection polarity.`)
    }

    const baseLight = relativeLuminance(palette.baseLight)
    const brightestBaseDark = Math.max(...palette.baseDark.map(relativeLuminance))
    const baseGap = baseLight - brightestBaseDark
    if (baseGap < MIN_BASE_LUMINANCE_GAP) {
      throw new Error(
        `${style.id}/${palette.label} base field luminance gap ${baseGap.toFixed(4)} is below ${MIN_BASE_LUMINANCE_GAP}.`,
      )
    }

    for (const material of PAIRED_MATERIAL_KEYS) {
      const colors = palette[material]
      if (!Array.isArray(colors)) continue
      assertPairedMaterialContrast(style.id, palette.label, material, colors)
      pairedMaterialCount += 1
    }
  }

  return pairedMaterialCount
}

function assertVoxelStructure(styleId: string, matrixSize: number, voxels: GeneratedVoxel[]): void {
  const occupied = new Set<string>()

  for (const voxel of voxels) {
    const expected = positionForCell(voxel.row, voxel.col, matrixSize)
    if (Math.abs(voxel.x - expected.x) > EPSILON || Math.abs(voxel.z - expected.z) > EPSILON) {
      throw new Error(
        `${styleId} placed voxel ${voxel.row}:${voxel.col} off its QR column: `
        + `expected (${expected.x}, ${expected.z}), received (${voxel.x}, ${voxel.z}).`,
      )
    }

    const level = Math.round(voxel.y / CELL_SIZE)
    if (Math.abs(voxel.y - level * CELL_SIZE) > EPSILON) {
      throw new Error(
        `${styleId} placed voxel ${voxel.row}:${voxel.col} at off-grid height ${voxel.y}.`,
      )
    }

    if (voxel.kind === 'qr-top' || voxel.kind === 'light-top') {
      throw new Error(`${styleId} leaked deprecated scanner-cap material ${voxel.kind}.`)
    }

    if (voxel.projectionTone !== undefined && voxel.projectionTone !== 'dark' && voxel.projectionTone !== 'light') {
      throw new Error(`${styleId} emitted invalid projection tone at ${voxel.row}:${voxel.col}.`)
    }

    const key = `${voxel.row}:${voxel.col}:${level}`
    if (occupied.has(key)) {
      throw new Error(
        `${styleId} generated duplicate voxels at QR column ${voxel.row}:${voxel.col}, level ${level}.`,
      )
    }
    occupied.add(key)
  }
}

function assertScannerProjection(styleId: string, matrix: QRMatrixData, build: GeneratedBuild): void {
  const topByColumn = new Map<string, GeneratedVoxel>()

  for (const voxel of build.voxels) {
    const key = cellKey(voxel.row, voxel.col)
    const current = topByColumn.get(key)
    if (!current || voxel.y > current.y) topByColumn.set(key, voxel)

    const insideSymbol = voxel.row >= 0
      && voxel.row < matrix.size
      && voxel.col >= 0
      && voxel.col < matrix.size

    if (!insideSymbol && voxel.y > EPSILON) {
      throw new Error(
        `${styleId} elevated quiet-zone column ${voxel.row}:${voxel.col} to y=${voxel.y}.`,
      )
    }
  }

  for (const cell of matrix.cells) {
    const top = topByColumn.get(cellKey(cell.row, cell.col))

    // A light QR cell may still be literal empty space. Dark modules must remain
    // physically present, but neither polarity is required to use a black/white material.
    if (!top) {
      if (cell.dark) {
        throw new Error(`${styleId} omitted dark QR column ${cell.row}:${cell.col} from the physical projection.`)
      }
      continue
    }

    const expectedTone = cell.dark ? 'dark' : 'light'
    if (top.projectionTone !== expectedTone) {
      throw new Error(
        `${styleId} exposes ${top.kind} with ${top.projectionTone ?? 'no'} tone above `
        + `${expectedTone} QR module ${cell.row}:${cell.col}.`,
      )
    }
  }

  for (const top of topByColumn.values()) {
    const insideSymbol = top.row >= 0
      && top.row < matrix.size
      && top.col >= 0
      && top.col < matrix.size
    if (!insideSymbol && (top.kind !== 'floor-light' || top.projectionTone !== 'light')) {
      throw new Error(
        `${styleId} exposes ${top.kind}/${top.projectionTone ?? 'none'} in quiet-zone column `
        + `${top.row}:${top.col}; expected light floor material.`,
      )
    }
  }
}

function assertBuildMetrics(styleId: string, matrix: QRMatrixData, build: GeneratedBuild): void {
  const expectedMaxHeight = Math.max(...build.voxels.map((voxel) => voxel.y + CELL_SIZE))
  if (Math.abs(build.maxHeight - expectedMaxHeight) > EPSILON) {
    throw new Error(
      `${styleId} reports maxHeight=${build.maxHeight}, but geometry reaches ${expectedMaxHeight}.`,
    )
  }

  const expectedFootprint = (matrix.size + QUIET_ZONE * 2) * CELL_SIZE
  if (Math.abs(build.footprint - expectedFootprint) > EPSILON) {
    throw new Error(
      `${styleId} reports projection footprint ${build.footprint}; expected ${expectedFootprint}.`,
    )
  }

  if (!Number.isFinite(build.physicalFootprint) || build.physicalFootprint <= 0) {
    throw new Error(`${styleId} reports invalid physical footprint ${build.physicalFootprint}.`)
  }

  const baseDarkCount = build.voxels.filter((voxel) => voxel.y === 0 && voxel.kind === 'floor-dark').length
  const baseLightCount = build.voxels.filter((voxel) => voxel.y === 0 && voxel.kind === 'floor-light').length
  const foundationVoxelCount = build.voxels.filter((voxel) => voxel.y < 0).length

  if (build.baseDarkCount !== baseDarkCount || build.groundDarkCount !== baseDarkCount) {
    throw new Error(`${styleId} reports inconsistent dark base counts.`)
  }
  if (build.baseLightCount !== baseLightCount) {
    throw new Error(`${styleId} reports inconsistent light base counts.`)
  }
  if (build.foundationVoxelCount !== foundationVoxelCount) {
    throw new Error(`${styleId} reports inconsistent foundation voxel counts.`)
  }
}

function assertDeterministic(styleId: string, first: GeneratedBuild, second: GeneratedBuild): void {
  const scalarKeys = [
    'styleId',
    'styleLabel',
    'detail',
    'projection',
    'footprint',
    'physicalFootprint',
    'maxHeight',
    'pivotY',
    'liftedModuleCount',
    'baseDarkCount',
    'baseLightCount',
    'foundationVoxelCount',
    'groundDarkCount',
  ] as const

  for (const key of scalarKeys) {
    if (first[key] !== second[key]) {
      throw new Error(`${styleId} generated non-deterministic build metadata for ${key}.`)
    }
  }

  if (first.voxels.length !== second.voxels.length) {
    throw new Error(`${styleId} generated a non-deterministic voxel count.`)
  }

  for (let index = 0; index < first.voxels.length; index += 1) {
    const a = first.voxels[index]
    const b = second.voxels[index]
    if (
      a.row !== b.row
      || a.col !== b.col
      || Math.abs(a.x - b.x) > EPSILON
      || Math.abs(a.y - b.y) > EPSILON
      || Math.abs(a.z - b.z) > EPSILON
      || a.kind !== b.kind
      || a.projectionTone !== b.projectionTone
      || Math.abs(a.colorPhase - b.colorPhase) > EPSILON
    ) {
      throw new Error(`${styleId} generated non-deterministic voxel ${index}.`)
    }
  }
}

const pairedMaterialCount = assertDefaultPaletteContrast()

for (const testCase of cases) {
  const matrix = createQRMatrix(testCase.payload)
  if (matrix.version < testCase.minVersion) {
    throw new Error(
      `${testCase.label} unexpectedly encoded as QR version ${matrix.version}; expected at least ${testCase.minVersion}.`,
    )
  }

  for (const style of STYLES) {
    const build = style.generate(matrix, testCase.payload)
    const repeat = style.generate(matrix, testCase.payload)
    assertVoxelStructure(style.id, matrix.size, build.voxels)
    assertScannerProjection(style.id, matrix, build)
    assertBuildMetrics(style.id, matrix, build)
    assertDeterministic(style.id, build, repeat)
  }
}

console.log(
  `projection smoke passed for ${STYLES.length} styles across ${cases.length} QR sizes; `
  + `${pairedMaterialCount} default paired material ramps preserve luminance polarity`,
)
