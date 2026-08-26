import * as THREE from 'three'
import { CELL_SIZE, type SculptureBuild } from './sculpture'

export interface VoxelMeshController {
  readonly mesh: THREE.InstancedMesh | null
  replace(build: SculptureBuild, voxelFill: number): THREE.InstancedMesh
  setScannerFacing(scannerFacing: boolean): void
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
  let build: SculptureBuild | null = null
  let authoredVoxelFill = 1
  let scannerFacing = false
  let appliedVoxelFill = Number.NaN

  function writeInstanceMatrices(target: THREE.InstancedMesh, nextBuild: SculptureBuild, voxelFill: number): void {
    const voxelSize = CELL_SIZE * voxelFill

    for (let i = 0; i < nextBuild.voxels.length; i += 1) {
      const voxel = nextBuild.voxels[i]
      dummy.position.set(voxel.x, voxel.y - nextBuild.pivotY, voxel.z)
      dummy.quaternion.identity()
      dummy.scale.set(voxelSize, voxelSize, voxelSize)
      dummy.updateMatrix()
      target.setMatrixAt(i, dummy.matrix)
    }

    target.instanceMatrix.needsUpdate = true
    appliedVoxelFill = voxelFill
  }

  function effectiveVoxelFill(): number {
    // In the scanner-facing orthographic projection every voxel corresponds to one QR
    // module column. Closing authored decorative seams here makes adjacent modules meet
    // exactly at their cell boundaries without changing positions, heights, materials,
    // projectionTone, or the more open voxel treatment used in the Art view.
    return scannerFacing ? 1 : authoredVoxelFill
  }

  function clear(): void {
    if (mesh) root.remove(mesh)
    mesh = null
    build = null
    appliedVoxelFill = Number.NaN
  }

  function replace(nextBuild: SculptureBuild, voxelFill: number): THREE.InstancedMesh {
    clear()
    build = nextBuild
    authoredVoxelFill = voxelFill

    const nextMesh = new THREE.InstancedMesh(geometry, material, nextBuild.voxels.length)
    nextMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    nextMesh.frustumCulled = false
    writeInstanceMatrices(nextMesh, nextBuild, effectiveVoxelFill())

    root.add(nextMesh)
    mesh = nextMesh
    return nextMesh
  }

  function setScannerFacing(nextScannerFacing: boolean): void {
    scannerFacing = nextScannerFacing
    if (!mesh || !build) return

    const nextFill = effectiveVoxelFill()
    if (Math.abs(nextFill - appliedVoxelFill) < 0.0001) return
    writeInstanceMatrices(mesh, build, nextFill)
  }

  return {
    get mesh() {
      return mesh
    },
    replace,
    setScannerFacing,
    clear,
  }
}
