import type { DarkModule, QRMatrixData } from '../qr'
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

function chooseGlyphModules(matrix: QRMatrixData, center: number): DarkModule[] {
  const preferred = matrix.darkModules.filter((module) => {
    if (module.role !== 'data') return false
    const nx = Math.abs((module.col - center) / Math.max(1, matrix.size * 0.34))
    const nz = Math.abs((module.row - center) / Math.max(1, matrix.size * 0.18))
    return nx <= 1.05 && nz <= 1.1
  })

  if (preferred.length >= 18) return preferred

  return matrix.darkModules
    .filter((module) => module.role === 'data')
    .sort((a, b) => {
      const da = Math.abs(a.row - center) * 1.8 + Math.abs(a.col - center)
      const db = Math.abs(b.row - center) * 1.8 + Math.abs(b.col - center)
      return da - db
    })
    .slice(0, 64)
}

export function generateGlyph(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'glyph')
  const { random, center } = context
  const voxels = createBaseVoxels(context)
  const glyph = glyphFromSeed(seedText)
  const bitmap = FONT_5X7[glyph] ?? FONT_5X7.Q
  const modules = chooseGlyphModules(matrix, center)
  const lifted = new Set<string>()

  for (const module of modules) {
    const normalized = (module.col - center) / Math.max(1, matrix.size * 0.34)
    const glyphCol = Math.max(0, Math.min(4, Math.round(((normalized + 1) * 0.5) * 4)))
    const activeRows: number[] = []

    for (let row = 0; row < 7; row += 1) {
      if (bitmap[row][glyphCol] === '1') activeRows.push(row)
    }

    if (activeRows.length === 0) continue
    lifted.add(cellKey(module.row, module.col))
    const topLevel = 3 + (6 - Math.min(...activeRows))

    for (const row of activeRows) {
      const level = 3 + (6 - row)
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : 'primary',
        (random() * 0.55 + row * 0.09 + glyphCol * 0.07) % 1,
      )
    }
  }

  return finalizeSculpture(matrix, voxels, 'glyph', 'Glyph', lifted, `GLYPH ${glyph} / 5×7`)
}
