# 3D-QR

A generative Three.js experiment where a real QR matrix is built as one voxel sculpture. In the isometric view it reads as a small tree standing on a tiled ground plane; rotate the same object to the top view and the tree crown plus ground become the QR code.

The interaction is inspired by [Chroma Tree](https://6cls.com/chroma-tree). This repository is an original implementation written from scratch rather than a source-code copy.

## Live demo

`https://juleslois.github.io/3D-QR/`

GitHub Pages deployment is configured for `main` and publishes the production build from `dist/`.

## What it does

- Encodes the input with `qrcode` and reads the complete QR module matrix.
- Builds a four-module quiet zone and the whole symbol as a tiled voxel ground plane.
- Uses light ground voxels for QR light modules.
- Uses green ground voxels for dark modules that remain on the ground.
- Promotes a deterministic central subset of dark data modules into elevated tree-canopy columns.
- Keeps the top voxel of every canopy column dark enough to remain a valid QR dark module from the top view.
- Builds two trunk columns underneath central canopy modules, so the trunk never introduces a new top-view QR cell.
- Uses one `InstancedMesh` for the whole sculpture rather than separate tree and QR meshes.
- Switches views only by slerping the sculpture root between an isometric quaternion and a top-view quaternion.
- Uses a fixed orthographic camera so the QR state is an aligned top projection instead of a perspective reconstruction.
- Supports Blossom, Summer, Ginkgo, and Spectrum canopy palettes while preserving a green/cream ground matrix.
- Seeds the voxel topology from the encoded text, so the same content produces the same tree.

## Stack

- Three.js
- TypeScript
- Vite
- `qrcode`

## Development

Vite 8 requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Core model

There is no longer a separate QR render layer and no per-module tree-to-grid morph. The QR is the top projection of the same voxel object:

```ts
interface SculptureVoxel {
  x: number
  y: number
  z: number
  kind: 'floor-light' | 'floor-dark' | 'trunk' | 'canopy' | 'canopy-top'
  colorPhase: number
}
```

The mode transition is intentionally small:

```ts
sculptureRoot.quaternion.slerpQuaternions(
  treeQuaternion,
  qrQuaternion,
  easedProgress,
)
```

The ground occupies the QR grid in the X/Z plane. Rotating the sculpture by 90 degrees around X turns that plane toward the orthographic camera. Elevated canopy columns remain inside dark QR cells, so their top voxels simply replace the green ground modules with canopy-colored dark modules in the QR projection.

## Interaction

- Click the canvas or `VIEW QR` to rotate to the machine-readable view.
- Click again or use `BACK TO TREE` to return to the isometric sculpture.
- Edit the input to rebuild the QR matrix and deterministic voxel tree.
- Use the four swatches to change the canopy palette.

## GitHub Pages

The workflow in `.github/workflows/build.yml` type-checks and builds the project on pushes and pull requests. Pushes to `main` also upload `dist/` and deploy it with GitHub Pages Actions.

## Notes on scanability

The QR state uses the unmodified encoder matrix and a four-module quiet zone. Every elevated tree column is constrained to an already-dark QR data cell, so the tree cannot create a new dark module in a light cell. Finder/timing and remaining dark modules stay on the green ground. The fixed orthographic top view keeps all module centers aligned. Actual scan performance still depends on display scaling, camera focus, screen glare, and palette contrast.
