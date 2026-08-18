import QRCode from 'qrcode'

export type ModuleZone = 'finder' | 'timing' | 'data'
export type ModuleRole = ModuleZone | 'light'
export type DarkModuleRole = ModuleZone

export interface QRCell {
  row: number
  col: number
  index: number
  dark: boolean
  /** Backwards-compatible color role. Light cells keep `light`; dark cells use their QR structure role. */
  role: ModuleRole
  /** Structural location independent of scanner polarity. Light finder/separator cells are still `finder`. */
  zone: ModuleZone
}

export interface DarkModule extends QRCell {
  dark: true
  role: DarkModuleRole
  zone: ModuleZone
}

export interface QRMatrixData {
  size: number
  version: number
  cells: QRCell[]
  darkModules: DarkModule[]
}

function classifyModuleZone(row: number, col: number, size: number): ModuleZone {
  // Include the one-cell separator around each 7x7 finder so light cells in the
  // recognition structures can participate in scene generation as well.
  const inTopLeftFinder = row <= 7 && col <= 7
  const inTopRightFinder = row <= 7 && col >= size - 8
  const inBottomLeftFinder = row >= size - 8 && col <= 7

  if (inTopLeftFinder || inTopRightFinder || inBottomLeftFinder) return 'finder'

  const inHorizontalTiming = row === 6 && col >= 8 && col <= size - 9
  const inVerticalTiming = col === 6 && row >= 8 && row <= size - 9

  if (inHorizontalTiming || inVerticalTiming) return 'timing'
  return 'data'
}

export function createQRMatrix(value: string): QRMatrixData {
  // Artistic 3D projection adds perspective, material variation and partial occlusion
  // that ordinary flat QR codes do not have to tolerate. Use Q-level redundancy as
  // the baseline so the same sculpture has more recovery margin without changing any
  // scene generator or projection invariant.
  const symbol = QRCode.create(value, { errorCorrectionLevel: 'Q' })
  const cells: QRCell[] = []
  const darkModules: DarkModule[] = []
  const size = symbol.modules.size

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col
      const dark = Boolean(symbol.modules.get(row, col))
      const zone = classifyModuleZone(row, col, size)

      if (dark) {
        const cell: DarkModule = {
          row,
          col,
          index,
          dark: true,
          role: zone,
          zone,
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
          zone,
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
