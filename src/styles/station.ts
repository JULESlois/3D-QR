import type { QRCell, QRMatrixData } from '../qr'
import { materialForRole } from '../material-roles'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  projectionToneForCell,
  pushCellVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

type StationRole = 'rail' | 'platform' | 'canopy' | 'post' | 'concourse' | 'clock' | 'train' | 'bridge'

interface StationSegment {
  fromLevel: number
  topLevel: number
  role: StationRole
  priority: number
}

interface StationColumn {
  cell: QRCell
  segments: StationSegment[]
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function register(
  columns: Map<string, StationColumn>,
  cell: QRCell | undefined,
  fromLevel: number,
  topLevel: number,
  role: StationRole,
  priority: number,
): void {
  if (!cell || cell.zone === 'finder') return

  const key = cellKey(cell.row, cell.col)
  let column = columns.get(key)
  if (!column) {
    column = { cell, segments: [] }
    columns.set(key, column)
  }

  column.segments.push({
    fromLevel: Math.max(1, Math.min(fromLevel, topLevel)),
    topLevel: Math.max(1, topLevel),
    role,
    priority,
  })
}

function bodyKind(role: StationRole, level: number, topLevel: number): VoxelKind {
  switch (role) {
    case 'rail':
      return materialForRole('metal')
    case 'platform':
      return level === 1 ? 'stone' : 'plaster'
    case 'canopy':
      return level === topLevel - 1 ? 'wood' : materialForRole('metal')
    case 'post':
      return 'stone'
    case 'concourse':
      if (level >= topLevel - 2) return 'wood'
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'clock':
      if (level >= topLevel - 1) return materialForRole('metal')
      if (level >= 11 && level <= 13) return 'glass'
      return 'stone'
    case 'train':
      if (level === 2) return materialForRole('metal')
      if (level >= 4 && level < topLevel) return 'glass'
      return materialForRole('metal')
    case 'bridge':
      return level >= topLevel - 1 ? 'wood' : 'stone'
    default:
      return 'stone'
  }
}

function buildColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  column: StationColumn,
  matrixSize: number,
): void {
  const occupied = new Map<number, StationSegment>()

  // Resolve overlap per level instead of replacing the entire QR column. This lets
  // rails/platforms survive underneath suspended canopies and lets a train keep the
  // rail bed below it while still giving higher-priority architecture precedence
  // where two pieces physically occupy the same height.
  for (const segment of column.segments) {
    for (let level = segment.fromLevel; level <= segment.topLevel; level += 1) {
      const current = occupied.get(level)
      if (
        !current
        || segment.priority > current.priority
        || (segment.priority === current.priority && segment.topLevel > current.topLevel)
      ) {
        occupied.set(level, segment)
      }
    }
  }

  const levels = Array.from(occupied.keys()).sort((a, b) => a - b)
  const visibleTop = levels.at(-1)
  if (visibleTop === undefined) return

  for (const level of levels) {
    const segment = occupied.get(level)
    if (!segment) continue
    const visibleMaterial = bodyKind(segment.role, level, segment.topLevel)

    pushCellVoxel(
      voxels,
      column.cell,
      matrixSize,
      level,
      visibleMaterial,
      (column.cell.row * 0.071 + column.cell.col * 0.043 + level * 0.057) % 1,
      level === visibleTop ? projectionToneForCell(column.cell) : undefined,
    )
  }
}

function buildWaitingTrain(
  matrix: QRMatrixData,
  columns: Map<string, StationColumn>,
  center: number,
  halfSpan: number,
): void {
  const trainRow = center + 2
  const trainLength = Math.max(13, Math.min(21, Math.floor(matrix.size * 0.44)))
  const trainStart = center - Math.min(halfSpan - 3, Math.floor(trainLength * 0.48))
  const trainEnd = trainStart + trainLength - 1

  // Build one coherent EMU silhouette instead of two rectangular cars. The cab ends
  // taper in both plan and height, the middle keeps a continuous three-cell body, and
  // shallow roof humps break the otherwise flat top line. This makes the parked train
  // legible from the default isometric camera without adding any off-grid geometry.
  for (let col = trainStart; col <= trainEnd; col += 1) {
    const distanceFromStart = col - trainStart
    const distanceFromEnd = trainEnd - col
    const noseDistance = Math.min(distanceFromStart, distanceFromEnd)
    const cab = noseDistance <= 2
    const extremeNose = noseDistance === 0
    const shoulder = noseDistance === 1
    const roofHump = !cab && ((col - trainStart) % 7 === 3 || (col - trainStart) % 7 === 4)

    for (let row = trainRow - 1; row <= trainRow + 1; row += 1) {
      const side = Math.abs(row - trainRow) === 1

      if (extremeNose && side) continue
      if (shoulder && side && row > trainRow) continue

      let topLevel = side ? 5 : 6
      if (extremeNose) topLevel = 3
      else if (shoulder) topLevel = side ? 4 : 5
      else if (cab) topLevel = side ? 5 : 6
      else if (roofHump && !side) topLevel = 7

      register(columns, getCell(matrix, row, col), 2, topLevel, 'train', 7)
    }
  }

  for (const fraction of [0.34, 0.67]) {
    const articulationCol = trainStart + Math.round((trainLength - 1) * fraction)
    for (const row of [trainRow - 1, trainRow + 1]) {
      register(columns, getCell(matrix, row, articulationCol), 2, 3, 'train', 8)
    }
  }
}

function buildFootbridge(
  matrix: QRMatrixData,
  columns: Map<string, StationColumn>,
  center: number,
  halfSpan: number,
): void {
  const bridgeCol = center + Math.max(4, Math.round(halfSpan * 0.42))
  const deckHalfSpan = 6

  for (let row = center - deckHalfSpan; row <= center + deckHalfSpan; row += 1) {
    for (const col of [bridgeCol, bridgeCol + 1]) {
      register(columns, getCell(matrix, row, col), 9, 10, 'bridge', 9)
    }
  }

  for (const direction of [-1, 1]) {
    const towerRow = center + direction * 5
    for (let row = towerRow - 1; row <= towerRow + 1; row += 1) {
      for (const col of [bridgeCol, bridgeCol + 1]) {
        register(columns, getCell(matrix, row, col), 1, 10, 'bridge', 9)
      }
    }

    for (let step = 1; step <= 4; step += 1) {
      const row = towerRow + direction * step
      const fromLevel = Math.max(2, 9 - step * 2)
      for (const col of [bridgeCol, bridgeCol + 1]) {
        register(columns, getCell(matrix, row, col), fromLevel, 10, 'bridge', 9)
      }
    }
  }
}

function buildGrandTerminal(
  matrix: QRMatrixData,
  columns: Map<string, StationColumn>,
  center: number,
  halfSpan: number,
): number {
  const concourseCol = center - Math.round(halfSpan * 0.36)
  const halfWidth = Math.max(7, Math.min(10, Math.round(matrix.size * 0.3)))

  for (let row = center - halfWidth; row <= center + halfWidth; row += 1) {
    const rowDistance = Math.abs(row - center)
    const normalized = 1 - rowDistance / Math.max(1, halfWidth)
    const gableLift = Math.max(0, Math.round(normalized * 5))

    for (let col = concourseCol - 3; col <= concourseCol + 3; col += 1) {
      const depth = Math.abs(col - concourseCol)
      if (rowDistance >= halfWidth - 1 && depth >= 2) continue

      const topLevel = Math.max(6, 8 + gableLift - Math.max(0, depth - 1))
      register(columns, getCell(matrix, row, col), 1, topLevel, 'concourse', 8)
    }
  }

  for (const direction of [-1, 1]) {
    const wingCenter = center + direction * Math.max(6, halfWidth - 1)
    for (let row = wingCenter - 2; row <= wingCenter + 2; row += 1) {
      for (let col = concourseCol - 2; col <= concourseCol + 2; col += 1) {
        const rowDistance = Math.abs(row - wingCenter)
        register(columns, getCell(matrix, row, col), 1, rowDistance === 0 ? 7 : 6, 'concourse', 8)
      }
    }
  }

  // Give the terminal a railway-station silhouette rather than a generic 3x3 tower:
  // a clipped five-cell masonry pedestal supports a glazed three-cell clock chamber,
  // then four stepped roof shoulders converge on a tall one-cell lantern/spire. The
  // structure stays on QR data columns, so the extra profile remains projection-safe.
  for (let row = center - 2; row <= center + 2; row += 1) {
    for (let col = concourseCol - 2; col <= concourseCol + 2; col += 1) {
      const dr = Math.abs(row - center)
      const dc = Math.abs(col - concourseCol)
      if (dr === 2 && dc === 2) continue
      register(columns, getCell(matrix, row, col), 1, 10, 'concourse', 9)
    }
  }

  for (let row = center - 1; row <= center + 1; row += 1) {
    for (let col = concourseCol - 1; col <= concourseCol + 1; col += 1) {
      register(columns, getCell(matrix, row, col), 10, 15, 'clock', 10)
    }
  }

  const roofShoulders = [
    [-1, 0, 17],
    [1, 0, 17],
    [0, -1, 17],
    [0, 1, 17],
    [-1, -1, 16],
    [-1, 1, 16],
    [1, -1, 16],
    [1, 1, 16],
  ] as const

  for (const [dr, dc, topLevel] of roofShoulders) {
    register(
      columns,
      getCell(matrix, center + dr, concourseCol + dc),
      15,
      topLevel,
      'clock',
      11,
    )
  }

  register(columns, getCell(matrix, center, concourseCol), 15, 22, 'clock', 12)

  return concourseCol
}

export function generateStation(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'station')
  const voxels = createBaseVoxels(context, {
    mode: 'symbol-pad',
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const columns = new Map<string, StationColumn>()
  const center = Math.round((matrix.size - 1) / 2)
  const halfSpan = Math.max(7, Math.floor(matrix.size * 0.36))
  const trackRows = [center - 2, center + 2]
  const platformRows = [center - 5, center - 4, center + 4, center + 5]

  for (const row of trackRows) {
    for (let col = center - halfSpan; col <= center + halfSpan; col += 1) {
      register(columns, getCell(matrix, row, col), 1, 1, 'rail', 1)
    }
  }

  for (const row of platformRows) {
    for (let col = center - halfSpan; col <= center + halfSpan; col += 1) {
      register(columns, getCell(matrix, row, col), 1, 2, 'platform', 2)
    }
  }

  const canopyCenters = [center - 5, center + 5]
  for (const row of canopyCenters) {
    for (let col = center - halfSpan + 3; col <= center + halfSpan - 3; col += 1) {
      register(columns, getCell(matrix, row, col), 6, 7, 'canopy', 4)

      if ((col - center) % 5 === 0) {
        const innerRow = row + (row < center ? 1 : -1)
        register(columns, getCell(matrix, innerRow, col), 1, 6, 'post', 5)
      }
    }
  }

  buildWaitingTrain(matrix, columns, center, halfSpan)
  buildFootbridge(matrix, columns, center, halfSpan)
  buildGrandTerminal(matrix, columns, center, halfSpan)

  for (const column of columns.values()) {
    buildColumn(voxels, column, matrix.size)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }

  const segmentCount = Array.from(columns.values())
    .reduce((total, column) => total + column.segments.length, 0)

  return finalizeSculpture(
    matrix,
    voxels,
    'station',
    'Station',
    lifted,
    `GABLED TERMINAL / STEPPED CLOCK TOWER + SPIRE / SUSPENDED FOOTBRIDGE + STAIRS / OPEN CANOPIES / TWIN TRACKS / TAPERED EMU TRAIN / PARALLEL PLATFORMS / ${columns.size} BUILT CELLS / ${segmentCount} HEIGHT SEGMENTS`,
    'display-plaque',
  )
}
