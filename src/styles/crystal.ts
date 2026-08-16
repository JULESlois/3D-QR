import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  pushProjectedColumn,
  type SculptureBuild,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::crystal::${salt}::${row}:${col}`) % 10000) / 10000
}

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function finderCenter(cell: QRCell, size: number): { row: number; col: number; bias: number } | null {
  if (cell.row <= 7 && cell.col <= 7) return { row: 3, col: 3, bias: 0 }
  if (cell.row <= 7 && cell.col >= size - 8) return { row: 3, col: size - 4, bias: 1 }
  if (cell.row >= size - 8 && cell.col <= 7) return { row: size - 4, col: 3, bias: 2 }
  return null
}

function finderCrystalHeight(cell: QRCell, size: number, seedText: string): number {
  const center = finderCenter(cell, size)
  if (!center) return cell.dark ? 4 : 2

  const ring = Math.max(Math.abs(cell.row - center.row), Math.abs(cell.col - center.col))
  const shimmer = localNoise(seedText, cell.row, cell.col, 'finder-height')

  if (ring <= 1) return 9 + center.bias + Math.round(shimmer * 2)
  if (ring === 2) return 4 + Math.round(shimmer)
  if (ring === 3) return 6 + center.bias + Math.round(shimmer * 2)
  return 2 + Math.round(shimmer)
}

function chooseCoreAnchor(matrix: QRMatrixData, seedText: string): QRCell | undefined {
  const center = (matrix.size - 1) / 2
  const dataCells = matrix.cells.filter((cell) => cell.zone === 'data')

  return [...dataCells].sort((a, b) => {
    const score = (cell: QRCell): number => (
      Math.hypot(cell.row - center, cell.col - center)
      - localNoise(seedText, cell.row, cell.col, 'core-anchor') * 0.28
      - (cell.dark ? 0.16 : 0)
    )
    return score(a) - score(b)
  })[0]
}

function coreCells(matrix: QRMatrixData, anchor: QRCell): QRCell[] {
  return matrix.cells.filter((cell) => (
    cell.zone === 'data'
    && Math.abs(cell.row - anchor.row) <= 2
    && Math.abs(cell.col - anchor.col) <= 2
  ))
}

function coreHeight(cell: QRCell, anchor: QRCell, seedText: string): number {
  const ring = Math.max(Math.abs(cell.row - anchor.row), Math.abs(cell.col - anchor.col))
  const noise = localNoise(seedText, cell.row, cell.col, 'core-height')

  if (ring === 0) return 17
  if (ring === 1) return 11 + Math.round(noise * 4)
  return 5 + Math.round(noise * 4)
}

export function generateCrystal(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'crystal')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  // Finder structures become three satellite geodes. Their light and dark rings
  // rise together as one crystalline object while their cap polarity preserves
  // the scanner-facing finder pattern exactly.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const topLevel = finderCrystalHeight(cell, matrix.size, seedText)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Timing cells are interpreted as low mineral veins crossing the slab.
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'timing')) {
    const noise = localNoise(seedText, cell.row, cell.col, 'vein')
    const topLevel = cell.dark ? 2 + Math.round(noise) : 1
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  const anchor = chooseCoreAnchor(matrix, seedText)
  if (!anchor) {
    return finalizeSculpture(
      matrix,
      voxels,
      'crystal',
      'Crystal',
      lifted,
      'FINDER GEODES / MINERAL VEINS',
      'mineral-slab',
    )
  }

  const cluster = coreCells(matrix, anchor)
  const clusterKeys = new Set(cluster.map((cell) => cellKey(cell.row, cell.col)))

  // The central crystal bloom deliberately spans both scanner polarities. Height,
  // not QR color, defines its isometric silhouette; each column receives the
  // correct light/dark scanner cap at its tip.
  for (const cell of cluster) {
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      coreHeight(cell, anchor, seedText),
      'crystal',
      random,
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Keep satellite shards sparse and deterministic so the scene reads as one main
  // crystal cluster instead of a noisy height field on every QR module.
  const satelliteLimit = Math.min(28, Math.max(12, Math.round(matrix.size * 0.55)))
  const satellites = matrix.cells
    .filter((cell) => cell.zone === 'data')
    .filter((cell) => !clusterKeys.has(cellKey(cell.row, cell.col)))
    .filter((cell) => distance(cell, anchor) >= 3.4)
    .sort((a, b) => (
      localNoise(seedText, b.row, b.col, 'satellite-rank')
      - localNoise(seedText, a.row, a.col, 'satellite-rank')
    ))
    .slice(0, satelliteLimit)

  for (const cell of satellites) {
    const noise = localNoise(seedText, cell.row, cell.col, 'satellite-height')
    const topLevel = 2 + Math.floor(noise * 5)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'crystal', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'crystal',
    'Crystal',
    lifted,
    `${cluster.length} CORE CELLS / ${satellites.length} SATELLITE SHARDS / FINDER GEODES`,
    'mineral-slab',
  )
}
