import * as THREE from 'three'
import { CELL_SIZE, type SculptureBuild } from './sculpture'

export interface VoxelMeshController {
  readonly mesh: THREE.InstancedMesh | null
  replace(build: SculptureBuild, voxelFill: number): THREE.InstancedMesh
  clear(): void
}

export function createVoxelMeshController(root: THREE.Group): VoxelMeshController {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.015,
  })
  const dummy = new THREE.Object3D()
  let mesh: THREE.InstancedMesh | null = null

  function clear(): void {
    if (!mesh) return
    root.remove(mesh)
    mesh = null
  }

  function replace(build: SculptureBuild, voxelFill: number): THREE.InstancedMesh {
    clear()

    const nextMesh = new THREE.InstancedMesh(geometry, material, build.voxels.length)
    nextMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    nextMesh.frustumCulled = false
    const voxelSize = CELL_SIZE * voxelFill

    for (let i = 0; i < build.voxels.length; i += 1) {
      const voxel = build.voxels[i]
      dummy.position.set(voxel.x, voxel.y - build.pivotY, voxel.z)
      dummy.quaternion.identity()
      dummy.scale.set(voxelSize, voxelSize, voxelSize)
      dummy.updateMatrix()
      nextMesh.setMatrixAt(i, dummy.matrix)
    }

    nextMesh.instanceMatrix.needsUpdate = true
    root.add(nextMesh)
    mesh = nextMesh
    return nextMesh
  }

  return {
    get mesh() {
      return mesh
    },
    replace,
    clear,
  }
}
