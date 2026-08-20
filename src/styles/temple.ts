import type { QRCell, QRMatrixData } from '../qr'
import {
  cellKey,
  createBaseVoxels,
  createGenerationContext,
  finalizeSculpture,
  hashString,
  maxProjectionLevelForCell,
  projectedCapKind,
  projectionToneForCell,
  pushCellVoxel,
  pushProjectedColumn,
  type SculptureBuild,
} from '../sculpture'

function localNoise(seedText: string, row: number, col: number, salt: string): number {
  return (hashString(`${seedText}::temple-v3::${salt}::${row}:${col}`) % 10000) / 10000
}

function getCell(matrix: QRMatrixData, row: number, col: number): QRCell | undefined {
  if (row < 0 || row >= matrix.size || col < 0 || col >= matrix.size) return undefined
  return matrix.cells[row * matrix.size + col]
}

function isProtected(cell: QRCell): boolean {
  return maxProjectionLevelForCell(cell) !== undefined
}

function buildFinderGardens(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  random: () => number,
  lifted: Set<string>,
): void {
  for (const cell of matrix.cells.filter((candidate) => candidate.zone === 'finder')) {
    const topLeft = cell.row <= 7 && cell.col <= 7
    const topRight = cell.row <= 7 && cell.col >= matrix.size - 8
    const bottomLeft = cell.row >= matrix.size - 8 && cell.col <= 7
    const noise = localNoise(seedText, cell.row, cell.col, 'finder-landscape')

    if (topRight) {
      if (!cell.dark && noise > 0.44) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 1, 'water', random)
        lifted.add(cellKey(cell.row, cell.col))
      } else if (cell.dark && noise > 0.9) {
        pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
        lifted.add(cellKey(cell.row, cell.col))
      }
      continue
    }

    if (topLeft && cell.dark && noise > 0.9) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, 2, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
      continue
    }

    if (bottomLeft && noise > 0.94) {
      pushProjectedColumn(voxels, cell, matrix.size, 1, cell.dark ? 2 : 1, cell.dark ? 'wood' : 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildMainHall(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  seedText: string,
  lifted: Set<string>,
  hallRow: number,
  center: number,
): void {
  const halfWidth = Math.max(5, Math.min(10, Math.floor(matrix.size * 0.28)))
  const halfDepth = Math.max(2, Math.min(3, Math.floor(matrix.size * 0.09)))
  const bodyHalfWidth = Math.max(3, halfWidth - 2)
  const bodyHalfDepth = Math.max(1, halfDepth - 1)
  const frontRow = hallRow + bodyHalfDepth

  for (let row = hallRow - halfDepth; row <= hallRow + halfDepth; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || isProtected(cell)) continue

      const rowDistance = Math.abs(row - hallRow)
      const colDistance = Math.abs(col - center)
      const insideBody = rowDistance <= bodyHalfDepth && colDistance <= bodyHalfWidth
      const isFrontFacade = row === frontRow && colDistance <= bodyHalfWidth
      const facadePost = isFrontFacade && (colDistance === bodyHalfWidth || colDistance % 3 === 0)

      if (insideBody) {
        for (let level = 1; level <= 5; level += 1) {
          const kind = level <= 2
            ? 'stone'
            : facadePost
              ? 'wood'
              : level === 4
                ? 'plaster'
                : 'wood'
          pushCellVoxel(
            voxels,
            cell,
            matrix.size,
            level,
            kind,
            (localNoise(seedText, row, col, `hall-body-${level}`) * 0.52 + level * 0.061) % 1,
          )
        }
      }

      const clippedCorner = rowDistance === halfDepth && colDistance >= halfWidth - 1
      if (clippedCorner) continue

      const inwardFromEave = Math.min(halfDepth - rowDistance, halfWidth - colDistance)
      const ridgeSpan = Math.max(2, halfWidth - 3)
      const ridge = rowDistance === 0 && colDistance <= ridgeSpan
      const ridgeEnd = rowDistance === 0 && colDistance === ridgeSpan + 1
      const roofTop = ridge
        ? 11
        : ridgeEnd
          ? 10
          : rowDistance <= 1 && colDistance <= halfWidth - 2
            ? 9
            : inwardFromEave >= 1
              ? 8
              : 7
      const roofBottom = roofTop >= 10 ? 8 : roofTop >= 9 ? 7 : 6

      for (let level = roofBottom; level <= roofTop; level += 1) {
        const top = level === roofTop
        const kind = top
          ? projectedCapKind(cell)
          : level === roofBottom
            ? 'wood'
            : 'primary'
        pushCellVoxel(
          voxels,
          cell,
          matrix.size,
          level,
          kind,
          kind === 'primary'
            ? 0.08
            : (localNoise(seedText, row, col, `hall-roof-${level}`) * 0.42 + level * 0.047) % 1,
        )
      }

      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const verandaRow = hallRow + halfDepth + 1
  for (let col = center - halfWidth + 2; col <= center + halfWidth - 2; col += 1) {
    const cell = getCell(matrix, verandaRow, col)
    if (!cell) continue
    pushProjectedColumn(
      voxels,
      cell,
      matrix.size,
      1,
      3,
      col % 3 === 0 ? 'wood' : 'stone',
      () => localNoise(seedText, verandaRow, col, 'veranda'),
    )
    lifted.add(cellKey(cell.row, cell.col))
  }
}

function buildApproach(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  random: () => number,
  lifted: Set<string>,
  hallRow: number,
  toriiRow: number,
  center: number,
): void {
  const halfWidth = matrix.size >= 33 ? 3 : 2

  for (let row = hallRow + 4; row < toriiRow; row += 1) {
    for (let col = center - halfWidth; col <= center + halfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell) continue
      const nearHall = row <= hallRow + 6
      const nearTorii = row >= toriiRow - 2
      const step = nearHall ? 3 : nearTorii ? 2 : 1
      pushProjectedColumn(voxels, cell, matrix.size, 1, step, 'stone', random)
      lifted.add(cellKey(cell.row, cell.col))
    }
  }
}

function buildTorii(
  voxels: ReturnType<typeof createBaseVoxels>,
  matrix: QRMatrixData,
  lifted: Set<string>,
  toriiRow: number,
  center: number,
): void {
  const safeHalfWidth = Math.max(6, Math.min(Math.floor(matrix.size * 0.36), Math.floor((matrix.size - 3) / 2)))
  const postOffset = Math.max(3, safeHalfWidth - 3)
  const toriiRows = [toriiRow, Math.min(matrix.size - 1, toriiRow + 1)]
  const postColumns = [
    center - postOffset - 1,
    center - postOffset,
    center + postOffset,
    center + postOffset + 1,
  ]

  for (const row of toriiRows) {
    for (const col of postColumns) {
      const cell = getCell(matrix, row, col)
      if (!cell || isProtected(cell)) continue
      for (let level = 1; level <= 11; level += 1) {
        pushCellVoxel(
          voxels,
          cell,
          matrix.size,
          level,
          'primary',
          0.08,
          level === 11 ? projectionToneForCell(cell) : undefined,
        )
      }
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const nukiHalfWidth = Math.max(3, postOffset - 1)
  for (let col = center - nukiHalfWidth; col <= center + nukiHalfWidth; col += 1) {
    const cell = getCell(matrix, toriiRow + 1, col)
    if (!cell || isProtected(cell)) continue
    pushCellVoxel(voxels, cell, matrix.size, 9, 'primary', 0.08)
    pushCellVoxel(
      voxels,
      cell,
      matrix.size,
      10,
      'primary',
      0.08,
      projectionToneForCell(cell),
    )
    lifted.add(cellKey(cell.row, cell.col))
  }

  for (const row of toriiRows) {
    for (let col = center - safeHalfWidth; col <= center + safeHalfWidth; col += 1) {
      const cell = getCell(matrix, row, col)
      if (!cell || isProtected(cell)) continue
      const normalized = Math.abs(col - center) / Math.max(1, safeHalfWidth)
      const lift = normalized > 0.84 ? 2 : normalized > 0.62 ? 1 : 0
      const topLevel = 13 + lift

      pushCellVoxel(voxels, cell, matrix.size, topLevel - 1, 'primary', 0.08)
      pushCellVoxel(
        voxels,
        cell,
        matrix.size,
        topLevel,
        'primary',
        0.08,
        projectionToneForCell(cell),
      )
      lifted.add(cellKey(cell.row, cell.col))
    }
  }

  const lowerLipHalfWidth = Math.max(4, safeHalfWidth - 1)
  for (let col = center - lowerLipHalfWidth; col <= center + lowerLipHalfWidth; col += 1) {
    const cell = getCell(matrix, toriiRow, col)
    if (!cell || isProtected(cell)) continue
    pushCellVoxel(voxels, cell, matrix.size, 12, 'primary', 0.08)
    lifted.add(cellKey(cell.row, cell.col))
  }
}

export function generateTemple(matrix: QRMatrixData, seedText: string): SculptureBuild {
  const context = createGenerationContext(matrix, seedText, 'temple')
  const { random } = context
  const voxels = createBaseVoxels(context, {
    mode: 'full-pad',
    quietZone: 2,
    thickness: 2,
    foundationKind: 'foundation',
  })
  const lifted = new Set<string>()
  const center = Math.round((matrix.size - 1) / 2)
  const hallRow = Math.max(9, center - Math.max(3, Math.floor(matrix.size * 0.14)))
  const toriiRow = Math.min(matrix.size - 4, center + Math.max(5, Math.floor(matrix.size * 0.24)))

  buildFinderGardens(voxels, matrix, seedText, random, lifted)
  buildMainHall(voxels, matrix, seedText, lifted, hallRow, center)
  buildApproach(voxels, matrix, random, lifted, hallRow, toriiRow, center)
  buildTorii(voxels, matrix, lifted, toriiRow, center)

  for (const cell of matrix.cells) {
    if (cell.zone !== 'data' || !cell.dark) continue
    if (Math.abs(cell.row - center) > matrix.size * 0.32) continue
    if (Math.abs(cell.col - center) < Math.max(5, matrix.size * 0.15)) continue
    const noise = localNoise(seedText, cell.row, cell.col, 'lantern')
    if (noise < 0.988) continue
    pushProjectedColumn(voxels, cell, matrix.size, 1, 3, 'wood', random)
    lifted.add(cellKey(cell.row, cell.col))
  }

  return finalizeSculpture(
    matrix,
    voxels,
    'temple',
    'Temple',
    lifted,
    'UPTURNED KASAGI TORII / DEEP-EAVED RIDGE HALL / TIMBER FACADE / BROAD STONE APPROACH',
    'courtyard-pad',
  )
}
