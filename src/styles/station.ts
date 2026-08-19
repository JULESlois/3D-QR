import type { QRCell, QRMatrixData } from '../qr'
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
      return 'stone'
    case 'platform':
      return level === 1 ? 'stone' : 'plaster'
    case 'canopy':
      return level === topLevel - 1 ? 'wood' : 'primary'
    case 'post':
      return 'stone'
    case 'concourse':
      if (level >= topLevel - 2) return 'wood'
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'clock':
      return level >= topLevel - 2 ? 'primary' : level % 4 === 0 ? 'glass' : 'stone'
    case 'train':
      if (level === 2) return 'stone'
      if (level >= 4 && level < topLevel) return 'glass'
      return 'primary'
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

      // The very tip occupies only the centre row, then widens over one module before
      // reaching the full three-cell carriage width. Cab roof height also rises toward
      // the body, creating a stepped wedge rather than a blunt vertical end.
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

  // Two narrow articulation notches interrupt the roof/body rhythm while leaving the
  // rail below intact. They read as door/coupler gaps rather than splitting the train
  // into unrelated blocks because the centre spine remains continuous at low height.
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
  // Place the bridge away from the terminal and waiting train so its transverse
  // silhouette remains legible. The deck is genuinely suspended above both tracks:
  // only the two platform-side towers connect it to ground level.
  const bridgeCol = center + Math.max(4, Math.round(halfSpan * 0.42))
  const deckHalfSpan = 6

  for (let row = center - deckHalfSpan; row <= center + deckHalfSpan; row += 1) {
    for (const col of [bridgeCol, bridgeCol + 1]) {
      register(columns, getCell(matrix, row, col), 9, 10, 'bridge', 9)
    }
  }

  // Two narrow lift/stair towers make the suspended strip read as a passenger
  // footbridge rather than another canopy. The stepped outer runs descend toward
  // the platform surface while preserving open air over the rails themselves.
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
  // Put the head-house close enough to the platforms to read as one station, but
  // far enough from the symbol corners that finder reservations do not shear off
  // most of the facade on compact QR versions.
  const concourseCol = center - Math.round(halfSpan * 0.36)
  const halfWidth = Math.max(7, Math.min(10, Math.round(matrix.size * 0.3)))

  // A stepped gable replaces the previous flat rectangular concourse. Height rises
  // towards the centre line, producing a clear terminal roof silhouette from the
  // default isometric camera while the rear depth steps down slightly like roof bays.
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

  // Low side wings anchor the tall gable into the platforms. Their shorter roofs
  // make the main hall read as a deliberate civic building rather than one tower.
  for (const direction of [-1, 1]) {
    const wingCenter = center + direction * Math.max(6, halfWidth - 1)
    for (let row = wingCenter - 2; row <= wingCenter + 2; row += 1) {
      for (let col = concourseCol - 2; col <= concourseCol + 2; col += 1) {
        const rowDistance = Math.abs(row - wingCenter)
        register(columns, getCell(matrix, row, col), 1, rowDistance === 0 ? 7 : 6, 'concourse', 8)
      }
    }
  }

  // A compact clock lantern rises directly from the gable ridge. Keeping its
  // footprint narrow avoids turning Station into another generic skyline scene.
  for (let row = center - 1; row <= center + 1; row += 1) {
    for (let col = concourseCol - 1; col <= concourseCol + 1; col += 1) {
      const distance = Math.max(Math.abs(row - center), Math.abs(col - concourseCol))
      const topLevel = distance === 0 ? 17 : distance === 1 ? 14 : 12
      register(columns, getCell(matrix, row, col), 1, topLevel, 'clock', 10)
    }
  }

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

  // Two long rails create the scene's strongest horizontal read.
  for (const row of trackRows) {
    for (let col = center - halfSpan; col <= center + halfSpan; col += 1) {
      register(columns, getCell(matrix, row, col), 1, 1, 'rail', 1)
    }
  }

  // Raised parallel passenger platforms flank the tracks.
  for (const row of platformRows) {
    for (let col = center - halfSpan; col <= center + halfSpan; col += 1) {
      register(columns, getCell(matrix, row, col), 1, 2, 'platform', 2)
    }
  }

  // These are now truly layered suspended roofs: the platform segment remains at
  // levels 1-2 while the canopy occupies only 6-7, with narrow posts joining them
  // at regular bays. The open vertical gap is real geometry, not just an intention
  // in the generator comments.
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

  // A visible train on one track supplies an immediate rail-station cue while the
  // opposite track stays open. Its level-2+ body now layers over the level-1 rail
  // instead of deleting that rail segment from the same QR column.
  buildWaitingTrain(matrix, columns, center, halfSpan)

  // The transverse bridge adds a second, unmistakably railway-specific silhouette:
  // an elevated passenger crossing over both tracks with stairs landing on platforms.
  buildFootbridge(matrix, columns, center, halfSpan)

  // The head-house carries the dominant station identity: a broad stepped gable,
  // two low wings and a clock lantern frame the linear rail elements.
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
    `GABLED TERMINAL / CLOCK LANTERN / SUSPENDED FOOTBRIDGE + STAIRS / OPEN CANOPIES / TWIN TRACKS / TAPERED EMU TRAIN / PARALLEL PLATFORMS / ${columns.size} BUILT CELLS / ${segmentCount} HEIGHT SEGMENTS`,
    'display-plaque',
  )
}
