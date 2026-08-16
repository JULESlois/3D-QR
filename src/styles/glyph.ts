import type { QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
} from '../sculpture'

const FONT_5X7: Record<string, readonly string[]> = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
}

function glyphFromSeed(seedText: string): string {
  return seedText.toUpperCase().match(/[A-Z0-9]/)?.[0] ?? 'Q'
}

export function generateGlyph(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'glyph')
  const { random, center } = context
  const voxels = createBaseVoxels(context, { mode: 'none' })
  const glyph = glyphFromSeed(seedText)
  const bitmap = FONT_5X7[glyph] ?? FONT_5X7.Q
  const lifted = new Set<string>()

  for (const module of matrix.darkModules) {
    lifted.add(cellKey(module.row, module.col))

    const nx = (module.col - center) / Math.max(1, matrix.size - 1) + 0.5
    const nz = (module.row - center) / Math.max(1, matrix.size - 1) + 0.5
    const glyphCol = Math.max(0, Math.min(4, Math.round(nx * 4)))
    const glyphRow = Math.max(0, Math.min(6, Math.round(nz * 6)))
    const active = bitmap[glyphRow][glyphCol] === '1'

    const baseHeight = module.role === 'finder' ? 2 : 1
    const topLevel = active
      ? 7 + Math.floor(random() * 3)
      : baseHeight + (random() > 0.82 ? 1 : 0)

    for (let level = 1; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : active ? 'primary' : 'stone',
        (random() * 0.55 + glyphRow * 0.08 + glyphCol * 0.11 + level * 0.025) % 1,
      )
    }
  }

  return finalizeSculpture(matrix, voxels, 'glyph', 'Glyph', lifted, `GLYPH ${glyph} / WHOLE PROJECTION`, 'object-only')
}
