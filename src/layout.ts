// Compatibility exports for the original tree-only API.
// New generators live under src/styles and share the QR-safe sculpture core.
export {
  CELL_SIZE,
  QUIET_ZONE,
  type SculptureBuild,
  type SculptureVoxel,
  type VoxelKind,
} from './sculpture'
export { generateTree as buildVoxelSculpture } from './styles/tree'
