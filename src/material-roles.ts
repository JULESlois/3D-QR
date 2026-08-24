import type { VoxelKind } from './sculpture'

export type SemanticMaterialRole = 'metal'

const ROLE_MATERIALS = {
  // Architectural metal now uses the cool glass color family rather than the masonry
  // family. Rendering is still the shared matte voxel material, so this changes only
  // the semantic color ramp: rails, train shells, canopies and metal roof pieces read
  // as blue-steel instead of collapsing into the same neutral stone as platforms.
  // Keeping the role indirection lets a future renderer promote metal to dedicated PBR
  // properties without revisiting scene generators.
  metal: 'glass',
} as const satisfies Record<SemanticMaterialRole, VoxelKind>

export function materialForRole(role: SemanticMaterialRole): VoxelKind {
  return ROLE_MATERIALS[role]
}
