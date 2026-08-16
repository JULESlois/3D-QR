# 3D-QR

A small generative-art experiment built with Three.js: enter a URL or text, grow its real QR matrix into a colorful 3D tree, then morph the same instances back into a flat, scannable QR code.

The interaction is inspired by [Chroma Tree](https://6cls.com/chroma-tree). This repository is an original implementation written from scratch rather than a source-code copy.

## What it does

- Encodes the input with `qrcode` and reads the actual QR module matrix.
- Creates one Three.js `InstancedMesh` instance for every dark QR module.
- Gives every module two deterministic transforms:
  - a procedural tree-canopy position, rotation, and scale;
  - its exact QR grid position.
- Morphs between both layouts with eased transform interpolation.
- Transitions the camera from an orbitable perspective view to a front-facing QR view.
- Fades the trunk and ground away while adding a high-contrast quiet-zone backing plane.
- Supports Blossom, Summer, Ginkgo, and Spectrum palettes.
- Seeds the procedural tree from the encoded text, so the same content grows the same tree.

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

The visual trick is deliberately simple. A leaf is not separate from the QR code; it is a QR module with two layouts:

```ts
interface LeafLayout {
  qrPosition: THREE.Vector3
  treePosition: THREE.Vector3
  treeRotation: THREE.Quaternion
  treeScale: number
}
```

At runtime, the instance transform is interpolated from the tree layout to the QR layout. In QR mode, rotation goes to identity, scale becomes one QR-module width, Z goes to zero, and the camera moves to a centered frontal view.

## Interaction

- Drag the canvas to orbit the tree.
- Click the canvas or `SHOW QR` to morph into QR mode.
- Click again or use `SHOW TREE` to grow the tree back.
- Edit the input to regenerate the QR matrix and deterministic tree.
- Use the four square swatches to change palette.

## Notes on scanability

The QR mode uses the unmodified QR matrix produced by the encoder. It adds a four-module quiet zone on every side and shifts the colorful tree colors toward a dark, high-contrast palette while flattened. Actual scan performance still depends on screen glare, camera focus, display scaling, and the encoded payload length.
