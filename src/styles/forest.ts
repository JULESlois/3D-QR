import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectedCapKind,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
} from '../sculpture'

type ForestTreeSpecies = 'broadleaf' | 'pine' | 'ancient'

interface ForestSlot { row: number; col: number; species: ForestTreeSpecies }
interface ForestTree { cell: QRCell; species: ForestTreeSpecies; radius: number; trunkHeight: number; crownHeight: number; index: number }
interface CanopyColumn { cell: QRCell; treeIndex: number; fromLevel: number; topLevel: number; score: number }

const FOREST_SLOTS: readonly ForestSlot[] = [
  { row: -0.31, col: -0.28, species: 'pine' }, { row: -0.13, col: -0.34, species: 'broadleaf' },
  { row: 0.08, col: -0.32, species: 'pine' }, { row: 0.30, col: -0.24, species: 'broadleaf' },
  { row: -0.33, col: -0.03, species: 'ancient' }, { row: -0.19, col: 0.14, species: 'broadleaf' },
  { row: 0.17, col: -0.08, species: 'broadleaf' }, { row: 0.33, col: 0.09, species: 'pine' },
  { row: -0.26, col: 0.30, species: 'pine' }, { row: -0.02, col: 0.32, species: 'ancient' },
  { row: 0.23, col: 0.31, species: 'broadleaf' }, { row: 0.06, col: 0.16, species: 'pine' },
]

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::forest::${salt}::${row}:${col}`) % 10000) / 10000
}
function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}
function clearingColumn(row: number, center: number): number { return center + Math.sin((row - center) * 0.52) * 1.7 }
function isClearingCell(cell: Pick<QRCell, 'row' | 'col'>, center: number, size: number): boolean {
  return Math.abs(cell.row - center) <= size * 0.34 && Math.abs(cell.col - clearingColumn(cell.row, center)) <= 1.15
}
function findAnchorCell(matrix: QRMatrixData, targetRow: number, targetCol: number, center: number, used: readonly QRCell[], minSpacing: number): QRCell | undefined {
  return matrix.cells.filter((cell) => cell.zone === 'data')
    .filter((cell) => !isClearingCell(cell, center, matrix.size))
    .filter((cell) => used.every((other) => Math.hypot(cell.row - other.row, cell.col - other.col) >= minSpacing))
    .sort((a, b) => Math.hypot(a.row - targetRow, a.col - targetCol) - Math.hypot(b.row - targetRow, b.col - targetCol))[0]
}
function createTrees(matrix: QRMatrixData, seedText: string, center: number): ForestTree[] {
  const slotLimit = matrix.size < 29 ? 8 : matrix.size < 37 ? 10 : FOREST_SLOTS.length
  const minSpacing = matrix.size < 29 ? 3.8 : 4.4
  const used: QRCell[] = []; const trees: ForestTree[] = []
  for (let index = 0; index < slotLimit; index += 1) {
    const slot = FOREST_SLOTS[index]; const cell = findAnchorCell(matrix, center + slot.row * matrix.size, center + slot.col * matrix.size, center, used, minSpacing)
    if (!cell) continue
    used.push(cell); const noise = localNoise(seedText, cell.row, cell.col, `${slot.species}-${index}`)
    const radius = slot.species === 'ancient' ? 3.25 + noise * 0.5 : slot.species === 'broadleaf' ? 2.55 + noise * 0.45 : 2.15 + noise * 0.35
    const trunkHeight = slot.species === 'ancient' ? 7 + Math.floor(noise * 2) : slot.species === 'broadleaf' ? 5 + Math.floor(noise * 2) : 6 + Math.floor(noise * 2)
    const crownHeight = slot.species === 'ancient' ? 8 + Math.floor(noise * 3) : slot.species === 'broadleaf' ? 6 + Math.floor(noise * 3) : 9 + Math.floor(noise * 3)
    trees.push({ cell, species: slot.species, radius, trunkHeight, crownHeight, index })
  }
  return trees
}
function registerCanopy(matrix: QRMatrixData, seedText: string, center: number, tree: ForestTree, columns: Map<string, CanopyColumn>): void {
  const extent = Math.ceil(tree.radius)
  for (let dr = -extent; dr <= extent; dr += 1) for (let dc = -extent; dc <= extent; dc += 1) {
    const cell = getCell(matrix, tree.cell.row + dr, tree.cell.col + dc); if (!cell) continue
    const radial = Math.hypot(dr / tree.radius, dc / tree.radius); if (radial > 1) continue
    if (isClearingCell(cell, center, matrix.size) && radial > 0.22) continue
    const noise = localNoise(seedText, cell.row, cell.col, `crown-${tree.index}`); let topLevel: number; let fromLevel: number
    if (tree.species === 'pine') {
      const cone = Math.max(0, 1 - radial); topLevel = tree.trunkHeight + 2 + Math.round(cone * tree.crownHeight + noise * 1.4); fromLevel = Math.max(3, tree.trunkHeight - 2 + Math.round(radial * 2))
    } else {
      const dome = Math.sqrt(Math.max(0, 1 - radial * radial)); const ancientBoost = tree.species === 'ancient' ? 2 : 0
      topLevel = tree.trunkHeight + 2 + ancientBoost + Math.round(dome * tree.crownHeight + noise * 1.8); fromLevel = Math.max(3, topLevel - (tree.species === 'ancient' ? 5 : 4) - Math.round(dome * 1.5))
    }
    const key = cellKey(cell.row, cell.col); const score = topLevel + (tree.species === 'ancient' ? 2 : 0); const current = columns.get(key)
    if (!current || score > current.score) columns.set(key, { cell, treeIndex: tree.index, fromLevel, topLevel, score })
  }
}
function buildTrunks(voxels: ReturnType<typeof createBaseVoxels>, matrix: QRMatrixData, seedText: string, trees: readonly ForestTree[], canopy: ReadonlyMap<string, CanopyColumn>, lifted: Set<string>): void {
  for (const tree of trees) {
    const offsets = tree.species === 'ancient' ? [[0, 0], [0, 1]] as const : [[0, 0]] as const
    for (const [dr, dc] of offsets) {
      const cell = getCell(matrix, tree.cell.row + dr, tree.cell.col + dc); if (!cell) continue
      const crown = canopy.get(cellKey(cell.row, cell.col))
      if (!crown && (dr !== 0 || dc !== 0)) continue
      const trunkEnd = Math.max(2, Math.min(tree.trunkHeight - 1, (crown?.fromLevel ?? tree.trunkHeight) - 1))
      for (let level = 1; level <= trunkEnd; level += 1) pushCellVoxel(voxels, cell, matrix.size, level, 'wood', (localNoise(seedText, cell.row, cell.col, `trunk-${tree.index}-${level}`) * 0.54 + level * 0.05) % 1)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}
function buildCanopy(voxels: ReturnType<typeof createBaseVoxels>, matrix: QRMatrixData, seedText: string, canopy: ReadonlyMap<string, CanopyColumn>, lifted: Set<string>): void {
  for (const column of canopy.values()) {
    for (let level = column.fromLevel; level <= column.topLevel; level += 1) pushCellVoxel(voxels, column.cell, matrix.size, level, level === column.topLevel ? projectedCapKind(column.cell) : 'primary', (localNoise(seedText, column.cell.row, column.cell.col, `leaf-${column.treeIndex}-${level}`) * 0.72 + level * 0.033) % 1)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }
}
function buildForestPath(voxels: ReturnType<typeof createBaseVoxels>, matrix: QRMatrixData, random: () => number, canopy: ReadonlyMap<string, CanopyColumn>, lifted: Set<string>, center: number): void {
  const startRow = Math.max(1, Math.round(center - matrix.size * 0.34)); const endRow = Math.min(matrix.size - 2, Math.round(center + matrix.size * 0.34))
  for (let row = startRow; row <= endRow; row += 1) {
    const pathCol = Math.round(clearingColumn(row, center))
    for (const col of [pathCol - 1, pathCol]) {
      const cell = getCell(matrix, row, col); if (!cell || cell.zone === 'finder' || canopy.has(cellKey(cell.row, cell.col))) continue
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random); lifted.add(cellKey(cell.row, cell.col))
    }
  }
}
function buildUnderstory(voxels: ReturnType<typeof createBaseVoxels>, matrix: QRMatrixData, seedText: string, random: () => number, canopy: ReadonlyMap<string, CanopyColumn>, lifted: Set<string>, center: number): void {
  let shrubCount = 0; const shrubLimit = Math.max(8, Math.min(18, Math.round(matrix.size * 0.4)))
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || canopy.has(cellKey(cell.row, cell.col)) || isClearingCell(cell, center, matrix.size)) continue
    const noise = localNoise(seedText, cell.row, cell.col, 'understory'); if (noise < 0.965) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, noise > 0.992 ? 4 : 3, 'primary', random); lifted.add(cellKey(cell.row, cell.col)); shrubCount += 1
    if (shrubCount >= shrubLimit) break
  }
}
export function generateForest(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'forest'); const { random } = context
  const voxels = createBaseVoxels(context, { mode: 'full-pad', quietZone: 1, thickness: 2, foundationKind: 'foundation' }); const lifted = new Set<string>(); const center = Math.round((matrix.size - 1) / 2)
  const trees = createTrees(matrix, seedText, center); const canopy = new Map<string, CanopyColumn>(); for (const tree of trees) registerCanopy(matrix, seedText, center, tree, canopy)
  buildTrunks(voxels, matrix, seedText, trees, canopy, lifted); buildCanopy(voxels, matrix, seedText, canopy, lifted); buildForestPath(voxels, matrix, random, canopy, lifted, center); buildUnderstory(voxels, matrix, seedText, random, canopy, lifted, center)
  const speciesCounts = trees.reduce<Record<ForestTreeSpecies, number>>((counts, tree) => { counts[tree.species] += 1; return counts }, { broadleaf: 0, pine: 0, ancient: 0 })
  return finalizeSculpture(matrix, voxels, 'forest', 'Forest', lifted, `${trees.length} TREES / ${speciesCounts.broadleaf} BROADLEAF + ${speciesCounts.pine} PINE + ${speciesCounts.ancient} ANCIENT / WINDING CLEARING`, 'full-pad')
}
