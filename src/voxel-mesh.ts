import * as THREE from 'three'
import { CELL_SIZE, type SculptureBuild } from './sculpture'

const SCANNER_PLANE_FILL = 0.96

export interface VoxelMeshController {
  readonly mesh: THREE.InstancedMesh | null
  replace(build: SculptureBuild, voxelFill: number): THREE.InstancedMesh
  setScannerPlaneFill(enabled: boolean): void
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
  let currentBuild: SculptureBuild | null = null
  let currentVoxelFill = 1
  let scannerPlaneFillEnabled = false

  function applyInstanceMatrices(): void {
    if (!mesh || !currentBuild) return

    const bodySize = CELL_SIZE * currentVoxelFill
    const scannerPlaneSize = CELL_SIZE * Math.max(currentVoxelFill, SCANNER_PLANE_FILL)
    const horizontalSize = scannerPlaneFillEnabled ? scannerPlaneSize : bodySize

    for (let i = 0; i < currentBuild.voxels.length; i += 1) {
      const voxel = currentBuild.voxels[i]
      dummy.position.set(voxel.x, voxel.y - currentBuild.pivotY, voxel.z)
      dummy.quaternion.identity()
      // In QR orientation the sculpture rotates around X, so local X/Z form the scanner
      // plane while local Y points toward the orthographic camera. Tighten only X/Z gaps;
      // preserve authored voxel height/material geometry and never exceed the module cell.
      dummy.scale.set(horizontalSize, bodySize, horizontalSize)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  function clear(): void {
    if (mesh) root.remove(mesh)
    mesh = null
    currentBuild = null
  }

  function replace(build: SculptureBuild, voxelFill: number): THREE.InstancedMesh {
    clear()

    const nextMesh = new THREE.InstancedMesh(geometry, material, build.voxels.length)
    nextMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    nextMesh.frustumCulled = false
    mesh = nextMesh
    currentBuild = build
    currentVoxelFill = voxelFill
    applyInstanceMatrices()

    root.add(nextMesh)
    return nextMesh
  }

  function setScannerPlaneFill(enabled: boolean): void {
    if (scannerPlaneFillEnabled === enabled) return
    scannerPlaneFillEnabled = enabled
    applyInstanceMatrices()
  }

  return {
    get mesh() {
      return mesh
    },
    replace,
    setScannerPlaneFill,
    clear,
  }
}
