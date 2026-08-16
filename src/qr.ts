import QRCode from 'qrcode'

export interface DarkModule {
  row: number
  col: number
  index: number
}

export interface QRMatrixData {
  size: number
  version: number
  darkModules: DarkModule[]
}

export function createQRMatrix(value: string): QRMatrixData {
  const symbol = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const darkModules: DarkModule[] = []
  let index = 0

  for (let row = 0; row < symbol.modules.size; row += 1) {
    for (let col = 0; col < symbol.modules.size; col += 1) {
      if (symbol.modules.get(row, col)) {
        darkModules.push({ row, col, index })
        index += 1
      }
    }
  }

  return {
    size: symbol.modules.size,
    version: symbol.version,
    darkModules,
  }
}
