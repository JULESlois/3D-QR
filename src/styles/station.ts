import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  projectedCapKind,
  pushCellVoxel,
  type SculptureBuild,
  type VoxelKind,
} from '../sculpture'

type StationRole = 'rail' | 'platform' | 'canopy' | 'concourse' | 'clock'

interface StationColumn {
  cell: QRCell
  topLevel: number
  role: StationRole
  priority: number
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function register(
  columns: Map<string, StationColumn>,
  cell: QRCell | undefined,
  topLevel: number,
  role: StationRole,
  priority: number,
): void {
  if (!cell || cell.zone === 'finder') return
  const key = cellKey(cell.row, cell.col)
  const current = columns.get(key)
  if (current && current.priority > priority) return
  if (current && current.priority === priority && current.topLevel >= topLevel) return
  columns.set(key, { cell, topLevel, role, priority })
}

function bodyKind(role: StationRole, level: number, topLevel: number): VoxelKind {
  switch (role) {
    case 'rail':
      return 'stone'
    case 'platform':
      return level === 1 ? 'stone' : 'plaster'
    case 'canopy':
      return level >= topLevel - 1 ? 'primary' : level % 2 === 0 ? 'wood' : 'stone'
    case 'concourse':
      return level % 3 === 0 ? 'glass' : 'plaster'
    case 'clock':
      return level >= topLevel - 2 ? 'primary' : level % 4 === 0 ? 'glass' : 'stone'
    default:
      return 'stone'
  }
}

function buildColumn(
  voxels: ReturnType<typeof createBaseVoxels>,
  column: StationColumn,
  matrixSize: number,
): void {
  for (let level = 1; level <= column.topLevel; level += 1) {
    pushCellVoxel(
      voxels,
      column.cell,
      matrixSize,
      level,
      level === column.topLevel ? projectedCapKind(column.cell) : bodyKind(column.role, level, column.topLevel),
      (column.cell.row * 0.071 + column.cell.col * 0.043 + level * 0.057) % 1,
    )
  }
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
      register(columns, getCell(matrix, row, col), 1, 'rail', 1)
    }
  }

  // Raised parallel passenger platforms flank the tracks.
  for (const row of platformRows) {
    for (let col = center - halfSpan; col <= center + halfSpan; col += 1) {
      register(columns, getCell(matrix, row, col), 2, 'platform', 2)
    }
  }

  // Long canopy strips with sparse support posts: unlike City, the dominant mass
  // stays low and horizontal instead of becoming a field of towers.
  const canopyCenters = [center - 5, center + 5]
  for (const row of canopyCenters) {
    for (let col = center - halfSpan + 3; col <= center + halfSpan - 3; col += 1) {
      const roof = getCell(matrix, row, col)
      register(columns, roof, 7, 'canopy', 4)
      if ((col - center) % 5 === 0) {
        register(columns, getCell(matrix, row + (row < center ? 1 : -1), col), 6, 'canopy', 3)
      }
    }
  }

  // A broad central concourse bridges the platforms near one end, giving the
  // composition a recognizable terminal/head-house rather than just train tracks.
  const concourseCol = center - Math.round(halfSpan * 0.48)
  for (let row = center - 8; row <= center + 8; row += 1) {
    for (let col = concourseCol - 2; col <= concourseCol + 2; col += 1) {
      register(columns, getCell(matrix, row, col), 8, 'concourse', 6)
    }
  }

  // One narrow clock/sign tower acts as station identity without turning the scene
  // into another skyline. It is attached to the concourse and kept secondary.
  for (let row = center - 1; row <= center + 1; row += 1) {
    for (let col = concourseCol - 1; col <= concourseCol + 1; col += 1) {
      const distance = Math.max(Math.abs(row - center), Math.abs(col - concourseCol))
      register(columns, getCell(matrix, row, col), distance === 0 ? 13 : 10, 'clock', 8)
    }
  }

  for (const column of columns.values()) {
    buildColumn(voxels, column, matrix.size)
    lifted.add(cellKey(column.cell.row, column.cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'station',
    'Station',
    lifted,
    `TWIN TRACKS / PARALLEL PLATFORMS / LONG CANOPIES / CENTRAL CONCOURSE / ${columns.size} BUILT CELLS`,
    'display-plaque',
  )
}
