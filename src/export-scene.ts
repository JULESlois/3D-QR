import * as THREE from 'three'

export interface ExportSceneSnapshot {
  scene: THREE.Scene
  presentationGroup: THREE.Group
  sculptureRoot: THREE.Group
  voxelMesh: THREE.InstancedMesh
}

/**
 * Clone the render scene for export so Art/QR capture never mutates the live presentation
 * hierarchy. InstancedMesh.clone() copies instance transforms/colors while geometry and
 * materials remain shared read-only resources, keeping the snapshot deterministic without
 * duplicating the heavyweight voxel geometry/material allocations.
 */
export function createExportSceneSnapshot(
  scene: THREE.Scene,
  presentationGroup: THREE.Group,
  sculptureRoot: THREE.Group,
): ExportSceneSnapshot {
  const presentationIndex = scene.children.indexOf(presentationGroup)
  const sculptureIndex = presentationGroup.children.indexOf(sculptureRoot)
  const voxelMeshIndices = sculptureRoot.children
    .map((child, index) => child instanceof THREE.InstancedMesh ? index : -1)
    .filter((index) => index >= 0)

  if (presentationIndex < 0 || sculptureIndex < 0) {
    throw new Error('Export scene requires the live presentation hierarchy to be attached.')
  }
  if (voxelMeshIndices.length !== 1) {
    throw new Error(`Export scene expected one voxel mesh, found ${voxelMeshIndices.length}.`)
  }

  const exportScene = scene.clone(true)
  const exportPresentation = exportScene.children[presentationIndex]
  if (!(exportPresentation instanceof THREE.Group)) {
    throw new Error('Export scene could not resolve the cloned presentation group.')
  }

  const exportSculpture = exportPresentation.children[sculptureIndex]
  if (!(exportSculpture instanceof THREE.Group)) {
    throw new Error('Export scene could not resolve the cloned sculpture root.')
  }

  const exportVoxelMesh = exportSculpture.children[voxelMeshIndices[0]]
  if (!(exportVoxelMesh instanceof THREE.InstancedMesh)) {
    throw new Error('Export scene could not resolve the cloned voxel mesh.')
  }

  return {
    scene: exportScene,
    presentationGroup: exportPresentation,
    sculptureRoot: exportSculpture,
    voxelMesh: exportVoxelMesh,
  }
}
