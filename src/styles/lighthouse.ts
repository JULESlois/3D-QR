import type { DarkModule, QRCell, QRMatrixData } from '../qr'
import { materialForRole } from '../material-roles'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  projectionToneForCell,
  pushProjectedColumn,
  pushVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

const lighthouseMetalMaterial = materialForRole('metal')
const lighthouseRoofMaterial = materialForRole('roof')

function distance(a: Pick<QRCell, 'row' | 'col'>, b: Pick<QRCell, 'row' | 'col'>): number {
  return Math.hypot(a.row - b.row, a.col - b.col)
}

function adjacencyScore(module: DarkModule, modules: readonly DarkModule[]): number {
  let score = 0
  for (const candidate of modules) {
    if (candidate === module) continue
    const dr = Math.abs(candidate.row - module.row)
    const dc = Math.abs(candidate.col - module.col)
    if (dr <= 1 && dc <= 1) score += 1
  }
  return score
}

function waveHeight(cell: QRCell, seedText: string): number {
  // QR function zones must stay visually shallow even when their light modules are
  // interpreted as water. Finder/timing cells were already conservative; extend the
  // same rule to alignment/format/version so later QR versions cannot grow a two-level
  // wave directly across the synchronization metadata.
  if (cell.zone !== 'data') return 1

  const seed = (hashString(`${seedText}::wave::${cell.row}:${cell.col}`) % 1000) / 1000
  const wave = Math.sin(cell.row * 0.83 + cell.col * 0.31)
    + Math.cos(cell.col * 0.71 - cell.row * 0.27)
    + (seed - 0.5) * 0.9

  return wave > 0.55 ? 2 : 1
}

function quadraticPoint(
  t: number,
  start: Pick<QRCell, 'row' | 'col'>,
  controlRow: number,
  controlCol: number,
  endRow: number,
  endCol: number,
): { row: number; col: number } {
  const inverse = 1 - t
  return {
    row: inverse * inverse * start.row + 2 * inverse * t * controlRow + t * t * endRow,
    col: inverse * inverse * start.col + 2 * inverse * t * controlCol + t * t * endCol,
  }
}

function distanceToBreakwater(
  cell: Pick<QRCell, 'row' | 'col'>,
  anchor: Pick<QRCell, 'row' | 'col'>,
  matrixSize: number,
): number {
  const endRow = matrixSize - 2
  const bend = anchor.col <= (matrixSize - 1) / 2 ? 1 : -1
  const endCol = Math.max(2, Math.min(matrixSize - 3, anchor.col + bend * matrixSize * 0.16))
  const controlRow = anchor.row + (endRow - anchor.row) * 0.55
  const controlCol = anchor.col + bend * matrixSize * 0.2
  let nearest = Number.POSITIVE_INFINITY

  // Sampling is deterministic and cheap at QR scale. The stepped curve reads as a
  // masonry harbor arm instead of a straight printed stripe when viewed isometrically.
  for (let step = 0; step <= 18; step += 1) {
    const point = quadraticPoint(step / 18, anchor, controlRow, controlCol, endRow, endCol)
    nearest = Math.min(nearest, Math.hypot(cell.row - point.row, cell.col - point.col))
  }

  return nearest
}

function towerBodyKind(level: number, role: 'apron' | 'gallery' | 'shaft' | 'lantern'): VoxelKind {
  if (role === 'apron') return level <= 2 ? 'stone' : 'plaster'

  // The gallery ring is explicitly metal so it separates from both masonry and the
  // broad scene accent ramp. Projection polarity is still carried independently.
  if (level === 9 || level === 10) return lighthouseMetalMaterial

  if (role === 'gallery') return level >= 9 ? lighthouseMetalMaterial : level % 4 < 2 ? 'plaster' : 'primary'
  if (role === 'shaft') return level >= 12 ? 'glass' : level % 4 < 2 ? 'plaster' : 'primary'

  // The lantern core stays visibly glazed above the gallery while the very top uses
  // the shared roof role, giving the cap a neutral tile/stone read rather than accent.
  if (level >= 14 && level <= 18) return 'glass'
  if (level >= 19) return lighthouseRoofMaterial
  return level % 4 < 2 ? 'plaster' : 'primary'
}

export function generateLighthouse(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'lighthouse')
  const { random, center } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 3,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()

  // Scanner-light cells are real scene geometry now: a shallow blue sea with a
  // deterministic one/two-voxel wave field. In QR view their caps remain light.
  for (const cell of matrix.cells) {
    if (cell.dark) continue
    const topLevel = waveHeight(cell, seedText)
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'water', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  // Dark finder modules become three low reef/breakwater structures instead of
  // remaining a printed-looking corner pattern on the harbor floor.
  for (const module of matrix.darkModules.filter((cell) => cell.zone === 'finder')) {
    const topLevel = ((module.row + module.col) % 4 === 0) ? 2 : 1
    pushProjectedColumn(voxels, module, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(cellKey(module.row, module.col))
  }

  const dataModules = matrix.darkModules.filter((module) => module.role === 'data')
  const anchor = [...dataModules].sort((a, b) => {
    const aCenter = Math.hypot(a.row - center, a.col - center)
    const bCenter = Math.hypot(b.row - center, b.col - center)
    const aScore = aCenter - adjacencyScore(a, dataModules) * 1.2
    const bScore = bCenter - adjacencyScore(b, dataModules) * 1.2
    return aScore - bScore
  })[0]

  if (!anchor) {
    return finalizeSculpture(
      matrix,
      voxels,
      'lighthouse',
      'Lighthouse',
      lifted,
      'WAVE FIELD / FINDER REEFS / HARBOR PAD',
      'courtyard-pad',
    )
  }

  // A curved masonry breakwater gives the scene a readable foreground approach and
  // visually connects the beacon island to the harbor edge. It intentionally crosses
  // both light and dark data cells: pushProjectedColumn preserves each cell's QR tone,
  // so the path remains one stone material without turning scanner-light cells white.
  const breakwaterStart = Math.max(anchor.row + 2, Math.round(matrix.size * 0.56))
  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || cell.row < breakwaterStart) continue
    if (distance(cell, anchor) <= Math.max(3.1, matrix.size * 0.12)) continue

    const pathDistance = distanceToBreakwater(cell, anchor, matrix.size)
    if (pathDistance > 1.15) continue

    const topLevel = pathDistance <= 0.58 ? 3 : 2
    pushProjectedColumn(voxels, cell, matrix.size, 1, topLevel, 'stone', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  const nearby = [...dataModules]
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(14, Math.max(10, Math.round(matrix.size * 0.31))))

  // Build four concentric visual roles from the same QR-aligned dark columns.
  // A low stone apron establishes the island, seven columns form a visibly flared
  // gallery, three continue into the narrow shaft, and one lantern core rises above
  // everything else. The silhouette now reads like a lighthouse before its stripes
  // or color treatment are considered.
  const apronModules = nearby.slice(0, Math.min(10, nearby.length))
  const galleryModules = nearby.slice(0, Math.min(7, nearby.length))
  const shaftModules = nearby.slice(0, Math.min(3, nearby.length))
  const lanternModule = nearby[0]

  const islandModules = dataModules
    .filter((module) => distance(module, anchor) <= Math.max(3.2, matrix.size * 0.13))
    .sort((a, b) => distance(a, anchor) - distance(b, anchor))
    .slice(0, Math.min(20, dataModules.length))

  const apronKeys = new Set(apronModules.map((module) => cellKey(module.row, module.col)))

  for (const module of islandModules) {
    if (apronKeys.has(cellKey(module.row, module.col))) continue
    const topLevel = random() > 0.72 ? 3 : 2
    lifted.add(cellKey(module.row, module.col))

    for (let level = 1; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        'stone',
        (random() * 0.6 + level * 0.08) % 1,
        level === topLevel ? projectionToneForCell(module) : undefined,
      )
    }
  }

  const galleryKeys = new Set(galleryModules.map((module) => cellKey(module.row, module.col)))
  const shaftKeys = new Set(shaftModules.map((module) => cellKey(module.row, module.col)))
  const lanternKey = cellKey(lanternModule.row, lanternModule.col)

  for (const module of apronModules) {
    const key = cellKey(module.row, module.col)
    const role = key === lanternKey
      ? 'lantern'
      : shaftKeys.has(key)
        ? 'shaft'
        : galleryKeys.has(key)
          ? 'gallery'
          : 'apron'
    const topLevel = role === 'lantern'
      ? 20
      : role === 'shaft'
        ? 15
        : role === 'gallery'
          ? 11
          : 6

    lifted.add(key)

    for (let level = 1; level <= topLevel; level += 1) {
      pushVoxel(
        voxels,
        module,
        matrix.size,
        level,
        towerBodyKind(level, role),
        (random() * 0.48 + level * 0.052 + distance(module, anchor) * 0.07) % 1,
        level === topLevel ? projectionToneForCell(module) : undefined,
      )
    }
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'lighthouse',
    'Lighthouse',
    lifted,
    'SCANNER-LIGHT WAVES / FINDER REEFS / CURVED BREAKWATER / STONE APRON / METAL GALLERY / GLASS LANTERN / ROOF CAP',
    'courtyard-pad',
  )
}
