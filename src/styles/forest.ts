import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectionToneForCell,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
} from '../sculpture'

type ForestTreeSpecies = 'broadleaf' | 'pine' | 'ancient'

interface ForestSlot {
  row: number
  col: number
  species: ForestTreeSpecies
}

interface ForestTree {
  cell: QRCell
  species: ForestTreeSpecies
  radius: number
  trunkHeight: number
  crownHeight: number
  index: number
}

interface CanopyColumn {
  cell: QRCell
  treeIndex: number
  species: ForestTreeSpecies
  radial: number
  fromLevel: number
  topLevel: number
  score: number
}

const FOREST_SLOTS: readonly ForestSlot[] = [
  { row: -0.31, col: -0.28, species: 'pine' },
  { row: -0.13, col: -0.34, species: 'broadleaf' },
  { row: 0.08, col: -0.32, species: 'pine' },
  { row: 0.30, col: -0.24, species: 'broadleaf' },
  { row: -0.33, col: -0.03, species: 'ancient' },
  { row: -0.19, col: 0.14, species: 'broadleaf' },
  { row: 0.17, col: -0.08, species: 'broadleaf' },
  { row: 0.33, col: 0.09, species: 'pine' },
  { row: -0.26, col: 0.30, species: 'pine' },
  { row: -0.02, col: 0.32, species: 'ancient' },
  { row: 0.23, col: 0.31, species: 'broadleaf' },
  { row: 0.06, col: 0.16, species: 'pine' },
]

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::forest-v2::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function clearingColumn(row: number, center: number): number {
  return center + Math.sin((row - center) * 0.52) * 1.7
}

function isClearingCell(cell: Pick<QRCell, 'row' | 'col'>, center: number, size: number): boolean {
  return Math.abs(cell.row - center) <= size * 0.34
    && Math.abs(cell.col - clearingColumn(cell.row, center)) <= 1.15
}

function findAnchorCell(
  matrix: QRMatrixData,
  targetRow: number,
  targetCol: number,
  center: number,
  used: readonly QRCell[],
  minSpacing: number,
): QRCell | undefined {
  return matrix.cells
    .filter((cell) => cell.zone === 'data')
    .filter((cell) => !isClearingCell(cell, center, matrix.size))
    .filter((cell) => used.every((other) => Math.hypot(cell.row - other.row, cell.col - other.col) >= minSpacing))
    .sort((a, b) => Math.hypot(a.row - targetRow, a.col - targetCol) - Math.hypot(b.row - targetRow, b.col - targetCol))[0]
}

function createTrees(matrix: QRMatrixData, seedText: string, center: number): ForestTree[] {
  const slotLimit = matrix.size < 29 ? 8 : matrix.size < 37 ? 10 : FOREST_SLOTS.length
  const minSpacing = matrix.size < 29 ? 3.8 : 4.4
  const used: QRCell[] = []
  const trees: ForestTree[] = []

  for (let index = 0; index < slotLimit; index += 1) {
    const slot = FOREST_SLOTS[index]
    const cell = findAnchorCell(
      matrix,
      center + slot.row * matrix.size,
      center + slot.col * matrix.size,
      center,
      used,
      minSpacing,
    )
    if (!cell) continue

    used.push(cell)
    const noise = localNoise(seedText, cell.row, cell.col, `${slot.species}-${index}`)
    const radius = slot.species === 'ancient'
      ? 3.8 + noise * 0.65
      : slot.species === 'broadleaf'
        ? 2.75 + noise * 0.5
        : 2.25 + noise * 0.4
    const trunkHeight = slot.species === 'ancient'
      ? 7 + Math.floor(noise * 2)
      : slot.species === 'broadleaf'
        ? 6 + Math.floor(noise * 2)
        : 7 + Math.floor(noise * 2)
    const crownHeight = slot.species === 'ancient'
      ? 7 + Math.floor(noise * 2)
      : slot.species === 'broadleaf'
        ? 7 + Math.floor(noise * 3)
        : 11 + Math.floor(noise * 3)

    trees.push({ cell, species: slot.species, radius, trunkHeight, crownHeight, index })
  }

  return trees
}

function broadleafLobe(
  dr: number,
  dc: number,
  radius: number,
  seedText: string,
  tree: ForestTree,
): number {
  const lobeShift = localNoise(seedText, tree.cell.row, tree.cell.col, `lobe-shift-${tree.index}`) - 0.5
  const lobes = [
    [-0.28, -0.14, 0.76],
    [0.22, -0.24, 0.72],
    [-0.12, 0.28, 0.7],
    [0.28, 0.2, 0.66],
    [lobeShift * 0.28, -lobeShift * 0.22, 0.82],
  ] as const

  let influence = 0
  for (const [rowOffset, colOffset, lobeRadius] of lobes) {
    const row = dr / radius - rowOffset
    const col = dc / radius - colOffset
    const distance = Math.hypot(row, col) / lobeRadius
    if (distance >= 1) continue
    influence = Math.max(influence, Math.sqrt(Math.max(0, 1 - distance * distance)))
  }

  return influence
}

function registerCanopy(
  matrix: QRMatrixData,
  seedText: string,
  center: number,
  tree: ForestTree,
  columns: Map<string, CanopyColumn>,
): void {
  const extent = Math.ceil(tree.radius)

  for (let dr = -extent; dr <= extent; dr += 1) {
    for (let dc = -extent; dc <= extent; dc += 1) {
      const cell = getCell(matrix, tree.cell.row + dr, tree.cell.col + dc)
      if (!cell) continue

      const radial = Math.hypot(dr / tree.radius, dc / tree.radius)
      if (radial > 1) continue
      if (isClearingCell(cell, center, matrix.size) && radial > 0.2) continue

      const noise = localNoise(seedText, cell.row, cell.col, `crown-${tree.index}`)
      const edgeNoise = localNoise(seedText, cell.row, cell.col, `edge-${tree.index}`)

      // Break the outer contour into visible clumps instead of filling every cell in
      // a smooth disc. The inner crown is always retained so each tree still reads as
      // one coherent object rather than scattered shrubs.
      const edgeThreshold = tree.species === 'pine' ? 0.82 : tree.species === 'ancient' ? 0.92 : 0.88
      if (radial > edgeThreshold && edgeNoise < (radial - edgeThreshold) * 2.8) continue

      let topLevel: number
      let fromLevel: number

      if (tree.species === 'pine') {
        // Quantize the crown into four increasingly wide bough shelves instead of
        // using one smooth cone. In the isometric camera this creates the familiar
        // spruce/fir cadence: needle tip, narrow upper tier, broad middle tier and
        // a heavy lower skirt, with exposed trunk between the shelves.
        const tier = radial <= 0.18 ? 0 : radial <= 0.42 ? 1 : radial <= 0.68 ? 2 : 3
        const tierDrop = [0, 3, 6, 9][tier]
        const branchLift = noise > 0.76 ? 1 : 0
        topLevel = tree.trunkHeight + 2 + tree.crownHeight - tierDrop + branchLift
        const shelfDepth = tier === 0 ? 5 : 2 + ((tree.index + tier) % 2)
        fromLevel = Math.max(3, topLevel - shelfDepth)
      } else {
        const lobe = broadleafLobe(dr, dc, tree.radius, seedText, tree)
        if (lobe <= 0.02) continue
        const asymmetry = Math.sin((dr + tree.index) * 0.85) * 0.8 + Math.cos((dc - tree.index) * 0.7) * 0.55

        if (tree.species === 'ancient') {
          // Ancient trees read as old spreading oaks rather than oversized broadleaf
          // blobs: widen the crown, flatten its dome and lift the foliage above a
          // visible branching framework. This creates a broad umbrella silhouette.
          topLevel = tree.trunkHeight + 4 + Math.round(lobe * tree.crownHeight * 0.72 + asymmetry * 0.6 + noise)
          fromLevel = Math.max(tree.trunkHeight + 2, topLevel - 4 - Math.round(lobe * 1.2))
        } else {
          topLevel = tree.trunkHeight + 2 + Math.round(lobe * tree.crownHeight + asymmetry + noise * 1.5)
          fromLevel = Math.max(3, topLevel - 4 - Math.round(lobe * 1.8))
        }
      }

      const key = cellKey(cell.row, cell.col)
      const score = topLevel + (tree.species === 'ancient' ? 2 : 0)
      const current = columns.get(key)
      if (!current || score > current.score) {
        columns.set(key, {
          cell,
          treeIndex: tree.index,
          species: tree.species,
          radial,
          fromLevel,
          topLevel,
          score,
        })
      }
    }
  }
}

function buildTrunks(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  trees: readonly ForestTree[],
  canopy: ReadonlyMap<string, CanopyColumn>,
  lifted: Set<string>,
): void {
  for (const tree of trees) {
    const offsets = tree.species === 'ancient'
      ? [[0, 0], [0, 1], [1, 0]] as const
      : [[0, 0]] as const

    for (const [dr, dc] of offsets) {
      const cell = getCell(matrix, tree.cell.row + dr, tree.cell.col + dc)
      if (!cell) continue
      const crown = canopy.get(cellKey(cell.row, cell.col))
      if (!crown && (dr !== 0 || dc !== 0)) continue

      const trunkEnd = Math.max(2, Math.min(tree.trunkHeight - 1, (crown?.fromLevel ?? tree.trunkHeight) - 1))
      for (let level = 1; level <= trunkEnd; level += 1) {
        pushCellVoxel(
          voxels,
          cell,
          matrix.size,
          level,
          'wood',
          (localNoise(seedText, cell.row, cell.col, `trunk-${tree.index}-${level}`) * 0.54 + level * 0.05) % 1,
        )
      }
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildAncientFramework(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  trees: readonly ForestTree[],
  canopy: ReadonlyMap<string, CanopyColumn>,
  lifted: Set<string>,
  center: number,
): void {
  const rootDirections = [
    [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1],
  ] as const

  for (const tree of trees) {
    if (tree.species !== 'ancient') continue

    // Buttress roots spread as low wooden ridges. They stay on ordinary data cells,
    // avoid the walking glade, and use projected columns so an exposed root still
    // carries the correct QR polarity rather than becoming an unclassified top face.
    for (const [dr, dc] of rootDirections) {
      for (let distance = 1; distance <= 2; distance += 1) {
        const cell = getCell(matrix, tree.cell.row + dr * distance, tree.cell.col + dc * distance)
        if (!cell || cell.zone !== 'data') continue
        if (isClearingCell(cell, center, matrix.size)) continue

        pushProjectedColumn(voxels, cell, matrix.size, 1, distance === 1 ? 3 : 2, 'wood', random)
        lifted.add(cellKey(cell.row, cell.col))
      }
    }

    // Three asymmetric scaffold limbs expose the tree's age and scale beneath the
    // umbrella crown. Each limb rises gently away from the trunk, then forks upward
    // near the crown edge. Keeping limbs inside registered canopy cells ensures that
    // foliage remains the dominant projected surface whenever it exists above them.
    const branchDirections = tree.index % 2 === 0
      ? [[-1, -1], [0, 1], [1, 0]] as const
      : [[-1, 0], [0, -1], [1, 1]] as const
    const branchBase = Math.max(4, tree.trunkHeight - 2)

    for (const [dr, dc] of branchDirections) {
      let forkCell: QRCell | undefined

      for (let distance = 1; distance <= 2; distance += 1) {
        const cell = getCell(matrix, tree.cell.row + dr * distance, tree.cell.col + dc * distance)
        if (!cell || cell.zone !== 'data') continue
        if (!canopy.has(cellKey(cell.row, cell.col))) continue

        const bottom = branchBase + distance - 1
        const top = bottom + 1
        for (let level = bottom; level <= top; level += 1) {
          pushCellVoxel(
            voxels,
            cell,
            matrix.size,
            level,
            'wood',
            (localNoise(seedText, cell.row, cell.col, `ancient-limb-${tree.index}-${distance}-${level}`) * 0.48 + level * 0.047) % 1,
            level === top ? projectionToneForCell(cell) : undefined,
          )
        }
        lifted.add(cellKey(cell.row, cell.col))
        forkCell = cell
      }

      if (!forkCell) continue
      const forkTop = tree.trunkHeight + 2
      for (let level = branchBase + 2; level <= forkTop; level += 1) {
        pushCellVoxel(
          voxels,
          forkCell,
          matrix.size,
          level,
          'wood',
          (localNoise(seedText, forkCell.row, forkCell.col, `ancient-fork-${tree.index}-${level}`) * 0.46 + level * 0.051) % 1,
          level === forkTop ? projectionToneForCell(forkCell) : undefined,
        )
      }
    }
  }
}

function shouldKeepLeafLayer(column: CanopyColumn, level: number): boolean {
  if (level === column.topLevel) return true

  const distanceFromTop = column.topLevel - level
  if (column.species === 'pine') {
    // The narrow core stays connected vertically while outer branch shelves remain
    // intentionally thin. This prevents the stepped crown from reading as four solid
    // cylinders and exposes dark trunk gaps between successive tiers.
    if (column.radial < 0.24) return true
    return distanceFromTop <= 2
  }

  if (column.species === 'ancient') {
    // Ancient crowns keep a heavy upper mass but open a few windows in the lower
    // canopy, revealing their oversized trunks and new lateral branch framework.
    return distanceFromTop < 3 || distanceFromTop % 3 === 0
  }

  // Broadleaf trees are compact clusters rather than solid cylinders: keep the top
  // shell and alternate lower layers around the perimeter to create scalloped gaps.
  if (distanceFromTop <= 2) return true
  return column.radial < 0.48 || distanceFromTop % 2 === 0
}

function buildCanopy(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  canopy: ReadonlyMap<string, CanopyColumn>,
  lifted: Set<string>,
): void {
  for (const column of canopy.values()) {
    for (let level = column.fromLevel; level <= column.topLevel; level += 1) {
      if (!shouldKeepLeafLayer(column, level)) continue
      pushCellVoxel(
        voxels,
        column.cell,
        matrix.size,
        level,
        'primary',
        (localNoise(seedText, column.cell.row, column.cell.col, `leaf-${column.treeIndex}-${level}`) * 0.72 + level * 0.033) % 1,
        level === column.topLevel ? projectionToneForCell(column.cell) : undefined,
      )
    }
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }
}

function buildForestPath(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  canopy: ReadonlyMap<string, CanopyColumn>,
  lifted: Set<string>,
  center: number,
): void {
  const startRow = Math.max(1, Math.round(center - matrix.size * 0.34))
  const endRow = Math.min(matrix.size - 2, Math.round(center + matrix.size * 0.34))

  for (let row = startRow; row <= endRow; row += 1) {
    const pathCol = Math.round(clearingColumn(row, center))
    for (const col of [pathCol - 1, pathCol]) {
      const cell = getCell(matrix, row, col)
      if (!cell || cell.zone === 'finder' || canopy.has(cellKey(cell.row, cell.col))) continue
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildUnderstory(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  canopy: ReadonlyMap<string, CanopyColumn>,
  lifted: Set<string>,
  center: number,
): void {
  let shrubCount = 0
  const shrubLimit = Math.max(8, Math.min(18, Math.round(matrix.size * 0.4)))

  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || canopy.has(cellKey(cell.row, cell.col)) || isClearingCell(cell, center, matrix.size)) continue
    const noise = localNoise(seedText, cell.row, cell.col, 'understory')
    if (noise < 0.965) continue

    pushProjectedColumn(voxels, cell, matrix.size, 1, noise > 0.992 ? 4 : 3, 'primary', random)
    lifted.add(cellKey(cell.row, cell.col))
    shrubCount += 1
    if (shrubCount >= shrubLimit) break
  }
}

export function generateForest(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'forest')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 1,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const center = Math.round((matrix.size - 1) / 2)
  const trees = createTrees(matrix, seedText, center)
  const canopy = new Map<string, CanopyColumn>()

  for (const tree of trees) registerCanopy(matrix, seedText, center, tree, canopy)

  buildTrunks(voxels, matrix, seedText, trees, canopy, lifted)
  buildAncientFramework(voxels, matrix, seedText, random, trees, canopy, lifted, center)
  buildCanopy(voxels, matrix, seedText, canopy, lifted)
  buildForestPath(voxels, matrix, random, canopy, lifted, center)
  buildUnderstory(voxels, matrix, seedText, random, canopy, lifted, center)

  const speciesCounts = trees.reduce<Record<ForestTreeSpecies, number>>(
    (counts, tree) => {
      counts[tree.species] += 1
      return counts
    },
    { broadleaf: 0, pine: 0, ancient: 0 },
  )

  return finalizeSculpture(
    matrix,
    voxels,
    'forest',
    'Forest',
    lifted,
    `${trees.length} TREES / LOBED BROADLEAF + STEPPED SPRUCE TIERS + BUTTRESSED ANCIENT OAKS / WINDING GLADE`,
    'full-pad',
  )
}
