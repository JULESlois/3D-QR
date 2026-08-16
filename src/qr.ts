import QRCode from 'qrcode'

export type ModuleRole = 'finder' | 'timing' | 'data' | 'light'
export type DarkModuleRole = Exclude<ModuleRole, 'light'>

export interface QRCell {
  row: number
  col: number
  index: number
  dark: boolean
  role: ModuleRole
}

export interface DarkModule extends QRCell {
  dark: true
  role: DarkModuleRole
}

export interface QRMatrixData {
  size: number
  version: number
  cells: QRCell[]
  darkModules: DarkModule[]
}

function classifyDarkModule(row: number, col: number, size: number): DarkModuleRole {
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
  const cells: QRCell[] = []
  const darkModules: DarkModule[] = []
  const size = symbol.modules.size

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col
      const dark = Boolean(symbol.modules.get(row, col))

      if (dark) {
        const cell: DarkModule = {
          row,
          col,
          index,
          dark: true,
          role: classifyDarkModule(row, col, size),
        }
        cells.push(cell)
        darkModules.push(cell)
      } else {
        cells.push({
          row,
          col,
          index,
          dark: false,
          role: 'light',
        })
      }
    }
  }

  return {
    size,
    version: symbol.version,
    cells,
    darkModules,
  }
}
