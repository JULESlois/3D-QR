import QRCode from 'qrcode'

export type ModuleRole = 'finder' | 'timing' | 'data'

export interface DarkModule {
  row: number
  col: number
  index: number
  role: ModuleRole
}

export interface QRMatrixData {
  size: number
  version: number
  darkModules: DarkModule[]
}

function classifyModule(row: number, col: number, size: number): ModuleRole {
  const inTopLeftFinder = row <= 6 && col <= 6
  const inTopRightFinder = row <= 6 && col >= size - 7
  const inBottomLeftFinder = row >= size - 7 && col <= 6

  if (inTopLeftFinder || inTopRightFinder || inBottomLeftFinder) return 'finder'

  const inHorizontalTiming = row === 6 && col >= 8 && col <= size - 9
  const inVerticalTiming = col === 6 && row >= 8 && row <= size - 9

  if (inHorizontalTiming || inVerticalTiming) return 'timing'
  return 'data'
}

export function createQRMatrix(value: string): QRMatrixData {
  const symbol = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const darkModules: DarkModule[] = []
  let index = 0

  for (let row = 0; row < symbol.modules.size; row += 1) {
    for (let col = 0; col < symbol.modules.size; col += 1) {
      if (symbol.modules.get(row, col)) {
        darkModules.push({
          row,
          col,
          index,
          role: classifyModule(row, col, symbol.modules.size),
        })
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
