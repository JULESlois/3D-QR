import type { QRMatrixData } from '../qr'
import {
  cellKey,
  createGenerationContext,
  finalizeSculpture,
  pushVoxel,
  type SculptureBuild,
  type SculptureVoxel,
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
  '@': ['01110','10001','10111','10101','10111','10000','01111'],
  '#': ['01010','11111','01010','01010','11111','01010','01010'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '&': ['01100','10010','10100','01000','10101','10010','01101'],
}

const GLYPH_TOKEN = /[A-Z0-9@#?!+&]/
const URL_SCHEME = /^[A-Z][A-Z0-9+.-]*:\/\//i
const GENERIC_HOST_PREFIX = /^(?:WWW\d*|MOBILE|M)\./i

function firstGlyphToken(value: string): string | null {
  return value.toUpperCase().match(GLYPH_TOKEN)?.[0] ?? null
}

function glyphFromSeed(seedText: string): string {
  const trimmed = seedText.trim()

  // Raw URL payloads used to almost always become "H" because the first token came
  // from "https". For URLs, derive the sculpture identity from the destination host
  // instead, stripping generic www/mobile prefixes. The QR payload itself is untouched.
  if (URL_SCHEME.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const meaningfulHost = url.hostname.replace(GENERIC_HOST_PREFIX, '')
      const fromHost = firstGlyphToken(meaningfulHost)
      if (fromHost) return fromHost

      // Hostless/custom schemes still get a deterministic fallback from their path.
      const fromPath = firstGlyphToken(url.pathname)
      if (fromPath) return fromPath
    } catch {
      // Malformed URLs fall through to normal text token selection.
    }
  }

  // Protocol-less www.example.com should identify as E rather than W.
  const withoutGenericHostPrefix = trimmed.replace(GENERIC_HOST_PREFIX, '')
  return firstGlyphToken(withoutGenericHostPrefix) ?? 'Q'
}

type GlyphBand = 'face' | 'inner-bevel' | 'outer-bevel' | 'field'

type GlyphSample = {
  band: GlyphBand
  distance: number
}

function sampleGlyph(bitmap: readonly string[], row: number, col: number): GlyphSample {
  let nearest = Number.POSITIVE_INFINITY

  for (let glyphRow = 0; glyphRow < bitmap.length; glyphRow += 1) {
    for (let glyphCol = 0; glyphCol < bitmap[glyphRow].length; glyphCol += 1) {
      if (bitmap[glyphRow][glyphCol] !== '1') continue
      const distance = Math.hypot(row - glyphRow, col - glyphCol)
      nearest = Math.min(nearest, distance)
    }
  }

  if (nearest <= 0.56) return { band: 'face', distance: nearest }
  if (nearest <= 1.05) return { band: 'inner-bevel', distance: nearest }
  if (nearest <= 1.55) return { band: 'outer-bevel', distance: nearest }
  return { band: 'field', distance: nearest }
}

export function generateGlyph(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'glyph')
  const { random, center } = context
  // No plaque or light floor: the QR-dark columns are the entire physical object.
  // Light modules and the quiet zone remain literal empty space, so the page/background
  // supplies scanner-light contrast while the sculpture reads as a floating monolith.
  const voxels: SculptureVoxel[] = []
  const glyph = glyphFromSeed(seedText)
  const bitmap = FONT_5X7[glyph] ?? FONT_5X7.Q
  const lifted = new Set<string>()

  for (const module of matrix.darkModules) {
    lifted.add(cellKey(module.row, module.col))

    const nx = (module.col - center) / Math.max(1, matrix.size - 1) + 0.5
    const nz = (module.row - center) / Math.max(1, matrix.size - 1) + 0.5
    const glyphX = nx * 4
    const glyphY = nz * 6
    const sample = sampleGlyph(bitmap, glyphY, glyphX)

    // The continuous distance field gives the glyph a broad readable face and two
    // stepped bevel bands instead of snapping every QR column to a coarse 5x7 cell.
    // Only column height/material changes; the scanner-facing top remains qr-top.
    let topLevel: number
    if (sample.band === 'face') {
      topLevel = 11
    } else if (sample.band === 'inner-bevel') {
      topLevel = 7
    } else if (sample.band === 'outer-bevel') {
      topLevel = 4
    } else if (module.role === 'finder') {
      topLevel = 1
    } else {
      topLevel = (module.row * 3 + module.col * 5) % 19 === 0 ? 2 : 1
    }

    for (let level = 1; level <= topLevel; level += 1) {
      const interiorKind = sample.band === 'face'
        ? 'primary'
        : sample.band === 'inner-bevel'
          ? 'plaster'
          : 'stone'

      const distancePhase = Number.isFinite(sample.distance)
        ? Math.min(1, sample.distance / 1.55)
        : 1

      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        level === topLevel ? 'qr-top' : interiorKind,
        (random() * 0.18 + distancePhase * 0.32 + glyphY * 0.055 + glyphX * 0.075 + level * 0.021) % 1,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'glyph',
    'Glyph',
    lifted,
    `GLYPH ${glyph} / PAYLOAD-AWARE IDENTITY / FREE-STANDING QR BODY / SYMBOL SET A-Z 0-9 @ # ? ! + &`,
    'free-standing-glyph',
  )
}
