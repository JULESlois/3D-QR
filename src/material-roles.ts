import type { VoxelKind } from './sculpture'

export type SemanticMaterialRole = 'metal' | 'roof' | 'path'

const ROLE_MATERIALS = {
  // Architectural metal now uses the cool glass color family rather than the masonry
  // family. Rendering is still the shared matte voxel material, so this changes only
  // the semantic color ramp: rails, train shells, canopies and metal roof pieces read
  // as blue-steel instead of collapsing into the same neutral stone as platforms.
  // Keeping the role indirection lets a future renderer promote metal to dedicated PBR
  // properties without revisiting scene generators.
  metal: 'metal',
  // Roof planes keep their own semantic color family instead of borrowing foundation.
  // House, Pagoda, Temple, and Lighthouse can now share roof behavior while palettes gain
  // independent control over silhouette contrast. Projection polarity remains explicit
  // because roof ramps are normalized through the same dark/light material pipeline.
  roof: 'roof',
  // Paths and processional approaches keep a dedicated shared color family instead of
  // borrowing wall plaster. Temple, House, and Castle can therefore tune circulation
  // independently from facades while projectionTone still chooses explicit dark/light ramps.
  path: 'path',
} as const satisfies Record<SemanticMaterialRole, VoxelKind>

export function materialForRole(role: SemanticMaterialRole): VoxelKind {
  return ROLE_MATERIALS[role]
}
