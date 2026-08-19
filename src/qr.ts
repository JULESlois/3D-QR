import QRCode from 'qrcode'

export type ModuleZone = 'finder' | 'timing' | 'alignment' | 'format' | 'version' | 'data'
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

function getAlignmentPatternCenters(version: number, size: number): number[] {
  if (version === 1) return []

  // Mirrors the alignment-pattern placement used by node-qrcode. Keeping the
  // calculation local lets scene generators reason about structural QR zones
  // without importing private package internals.
  const positionCount = Math.floor(version / 7) + 2
  const interval = size === 145
    ? 26
    : Math.ceil((size - 13) / (2 * positionCount - 2)) * 2
  const positions = [size - 7]

  for (let index = 1; index < positionCount - 1; index += 1) {
    positions[index] = positions[index - 1] - interval
  }

  positions.push(6)
  return positions.reverse()
}

function createAlignmentCellSet(version: number, size: number): Set<string> {
  const centers = getAlignmentPatternCenters(version, size)
  const cells = new Set<string>()

  for (let rowIndex = 0; rowIndex < centers.length; rowIndex += 1) {
    for (let colIndex = 0; colIndex < centers.length; colIndex += 1) {
      const overlapsFinder = (
        (rowIndex === 0 && colIndex === 0)
        || (rowIndex === 0 && colIndex === centers.length - 1)
        || (rowIndex === centers.length - 1 && colIndex === 0)
      )
      if (overlapsFinder) continue

      const centerRow = centers[rowIndex]
      const centerCol = centers[colIndex]
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
          cells.add(`${centerRow + rowOffset}:${centerCol + colOffset}`)
        }
      }
    }
  }

  return cells
}

function isFormatInformationCell(row: number, col: number, size: number): boolean {
  // The first 15-bit copy wraps around the top-left finder without crossing the
  // timing row/column at index 6. The redundant copy lives beside the other two
  // finders; include the fixed dark module at (size - 8, 8) in the same protected
  // structural band because it must never become ordinary scene geometry.
  const aroundTopLeft = (
    (row === 8 && (col <= 5 || col === 7 || col === 8))
    || (col === 8 && (row <= 5 || row === 7))
  )
  const redundantHorizontal = row === 8 && col >= size - 8
  const redundantVerticalAndDarkModule = col === 8 && row >= size - 8

  return aroundTopLeft || redundantHorizontal || redundantVerticalAndDarkModule
}

function isVersionInformationCell(row: number, col: number, size: number, version: number): boolean {
  if (version < 7) return false

  // QR v7+ adds two mirrored 3x6 version-information blocks immediately beside
  // the top-right and bottom-left finder structures. Keeping these cells low and
  // structurally distinct improves perspective tolerance for the 3D projection.
  const besideTopRight = row <= 5 && col >= size - 11 && col <= size - 9
  const aboveBottomLeft = col <= 5 && row >= size - 11 && row <= size - 9
  return besideTopRight || aboveBottomLeft
}

function classifyModuleZone(
  row: number,
  col: number,
  size: number,
  version: number,
  alignmentCells: ReadonlySet<string>,
): ModuleZone {
  // Include the one-cell separator around each 7x7 finder so light cells in the
  // recognition structures can participate in scene generation as well.
  const inTopLeftFinder = row <= 7 && col <= 7
  const inTopRightFinder = row <= 7 && col >= size - 8
  const inBottomLeftFinder = row >= size - 8 && col <= 7

  if (inTopLeftFinder || inTopRightFinder || inBottomLeftFinder) return 'finder'
  if (isFormatInformationCell(row, col, size)) return 'format'
  if (isVersionInformationCell(row, col, size, version)) return 'version'

  const inHorizontalTiming = row === 6 && col >= 8 && col <= size - 9
  const inVerticalTiming = col === 6 && row >= 8 && row <= size - 9

  if (inHorizontalTiming || inVerticalTiming) return 'timing'
  if (alignmentCells.has(`${row}:${col}`)) return 'alignment'
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
  const alignmentCells = createAlignmentCellSet(symbol.version, size)

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col
      const dark = Boolean(symbol.modules.get(row, col))
      const zone = classifyModuleZone(row, col, size, symbol.version, alignmentCells)

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
