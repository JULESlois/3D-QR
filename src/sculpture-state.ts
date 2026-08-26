import type { PaletteKey } from './palettes'
import { createQRMatrix, type QRMatrixData } from './qr'
import type { SculptureBuild } from './sculpture'
import { getStyle, type StyleDefinition, type StyleId } from './styles'

export type SculptureSnapshot = {
  styleId: StyleId
  paletteKey: PaletteKey
  build: SculptureBuild
  matrix: QRMatrixData
  style: StyleDefinition
}

export type SculptureController = {
  readonly styleId: StyleId
  readonly paletteKey: PaletteKey
  readonly build: SculptureBuild | null
  setStyle(styleId: StyleId): void
  setPalette(paletteKey: PaletteKey): void
  rebuild(content: string): SculptureSnapshot
}

export function createSculptureController(initialStyleId: StyleId = 'tree'): SculptureController {
  let styleId = initialStyleId
  let paletteKey = getStyle(styleId).defaultPalette
  let build: SculptureBuild | null = null

  return {
    get styleId() {
      return styleId
    },
    get paletteKey() {
      return paletteKey
    },
    get build() {
      return build
    },
    setStyle(nextStyleId) {
      styleId = nextStyleId
      paletteKey = getStyle(styleId).defaultPalette
    },
    setPalette(nextPaletteKey) {
      paletteKey = nextPaletteKey
    },
    rebuild(content) {
      const matrix = createQRMatrix(content)
      const style = getStyle(styleId)
      build = style.generate(matrix, content)

      return {
        styleId,
        paletteKey,
        build,
        matrix,
        style,
      }
    },
  }
}
