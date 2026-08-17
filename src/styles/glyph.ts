import type { QRMatrixData } from '../qr'
import {
  cellKey,
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

type GlyphBand = 'face' | 'bevel' | 'field'

function glyphBand(bitmap: readonly string[], row: number, col: number): GlyphBand {
  if (bitmap[row][col] === '1') return 'face'

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue
      const neighborRow = row + rowOffset
      const neighborCol = col + colOffset
      if (neighborRow < 0 || neighborRow >= bitmap.length) continue
      if (neighborCol < 0 || neighborCol >= bitmap[neighborRow].length) continue
      if (bitmap[neighborRow][neighborCol] === '1') return 'bevel'
    }
  }

  return 'field'
}

export function generateGlyph(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'glyph')
  const { random, center } = context
  // No plaque or light floor: the QR-dark columns are the entire physical object.
  // Light modules and the quiet zone remain literal empty space, so the page/background
  // supplies scanner-light contrast while the sculpture reads as a floating monolith.
  const voxels = []
  const glyph = glyphFromSeed(seedText)
  const bitmap = FONT_5X7[glyph] ?? FONT_5X7.Q
  const lifted = new Set<string>()

  for (const module of matrix.darkModules) {
    lifted.add(cellKey(module.row, module.col))

    const nx = (module.col - center) / Math.max(1, matrix.size - 1) + 0.5
    const nz = (module.row - center) / Math.max(1, matrix.size - 1) + 0.5
    const glyphCol = Math.max(0, Math.min(4, Math.round(nx * 4)))
    const glyphRow = Math.max(0, Math.min(6, Math.round(nz * 6)))
    const band = glyphBand(bitmap, glyphRow, glyphCol)

    // A high face, medium shoulder and deliberately shallow residual QR field makes
    // the character dominate the isometric silhouette without adding non-QR support.
    let topLevel: number
    if (module.role !== 'data') {
      topLevel = module.role === 'finder' ? 2 : 1
    } else if (band === 'face') {
      topLevel = 10
    } else if (band === 'bevel') {
      topLevel = 5
    } else {
      topLevel = (module.row * 3 + module.col * 5) % 17 === 0 ? 2 : 1
    }

    for (let level = 1; level <= topLevel; level += 1) {
      const interiorKind = band === 'face'
        ? 'primary'
        : band === 'bevel'
          ? 'plaster'
          : 'stone'

      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : interiorKind,
        (random() * 0.28 + glyphRow * 0.085 + glyphCol * 0.12 + level * 0.024) % 1,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'glyph',
    'Glyph',
    lifted,
    `GLYPH ${glyph} / FREE-STANDING QR BODY / TALL LETTER FACE / EMPTY LIGHT FIELD`,
    'display-plaque',
  )
}
