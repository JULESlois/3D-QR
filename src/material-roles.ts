import type { VoxelKind } from './sculpture'

export type SemanticMaterialRole = 'metal'

const ROLE_MATERIALS = {
  // Until renderer-level PBR families are split further, matte architectural steel
  // shares the neutral stone color family. Keeping the semantic role separate means
  // scenes no longer need to misuse `primary`, and the renderer can promote `metal`
  // to a dedicated material family later without revisiting every generator.
  metal: 'stone',
} as const satisfies Record<SemanticMaterialRole, VoxelKind>

export function materialForRole(role: SemanticMaterialRole): VoxelKind {
  return ROLE_MATERIALS[role]
}
