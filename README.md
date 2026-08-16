# 3D-QR

A generative-art experiment built with Three.js: enter a URL or text, grow its real QR matrix into a colorful 3D tree, then fold the same modules back into a flat, scannable QR code.

The interaction is inspired by [Chroma Tree](https://6cls.com/chroma-tree). This repository is an original implementation written from scratch rather than a source-code copy.

## Live demo

GitHub Pages deployment is configured for `main` and publishes the production build from `dist/`.

Expected project URL after Pages is enabled for the repository:

`https://juleslois.github.io/3D-QR/`

## What it does

- Encodes the input with `qrcode` and reads the actual QR module matrix.
- Creates one Three.js instanced leaf for every dark QR module.
- Gives every module two deterministic transforms:
  - a procedural tree-canopy position, rotation, and non-uniform leaf scale;
  - its exact QR grid position.
- Morphs between both layouts with eased transform interpolation and subtle procedural wind.
- Uses a separate flat, unlit QR `InstancedMesh` in the final stage so scanability is not affected by the richer tree material and lighting.
- Transitions the camera from an orbitable perspective view to a front-facing QR view.
- Fades the curved low-poly trunk, dust field, ground shadow, and background treatment away for QR mode.
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

A leaf is not separate from the QR code; it is a QR module with two layouts:

```ts
interface LeafLayout {
  qrPosition: THREE.Vector3
  treePosition: THREE.Vector3
  treeRotation: THREE.Quaternion
  treeScale: THREE.Vector3
  colorPhase: number
  windPhase: number
  windStrength: number
}
```

At runtime, each tree instance interpolates toward its QR position while its organic scale, rotation, and wind motion collapse. Near the end of the transition, a separate unlit plane-based QR mesh fades in at the exact module coordinates.

## Interaction

- Drag the canvas to orbit the tree.
- Click the canvas or `REVEAL QR` to fold into QR mode.
- Click again or use `GROW TREE` to return to the sculpture.
- Edit the input to regenerate the QR matrix and deterministic tree.
- Use the four square swatches to change palette.

## GitHub Pages

The workflow in `.github/workflows/build.yml` type-checks and builds the project on pushes and pull requests. Pushes to `main` also upload `dist/` and deploy it with GitHub Pages Actions.

If Pages has never been enabled for this repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions** once. Private repositories also require a GitHub plan that supports Pages for private repositories.

## Notes on scanability

The final QR state uses the unmodified matrix produced by the encoder, a four-module quiet zone, a front-facing camera, and an unlit high-contrast QR layer. Actual scan performance still depends on screen glare, camera focus, display scaling, and encoded payload length.
