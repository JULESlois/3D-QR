# 3D-QR

A generative Three.js experiment that turns a real QR matrix into a single voxel sculpture. The same physical voxel field can be viewed as a semantic 3D form or rotated into an orthographic, machine-readable QR projection.

Live demo: `https://juleslois.github.io/3D-QR/`

## Built-in generators

- **Tree** — QR-constrained canopy, trunk and ground.
- **House** — gabled house with wall, roof, door and chimney language.
- **Castle** — keep, perimeter walls, towers and crenellations.
- **Glyph** — extrudes the first alphanumeric character in the payload using a deterministic 5×7 bitmap font.

All styles preserve the same core invariant: elevated geometry may only occupy dark QR-module columns, and every elevated column must terminate in a scanner-dark `qr-top` voxel. Light modules and the four-module quiet zone are never occluded.

## Architecture

```text
URL / text
   ↓
QRMatrixData
   ↓
StyleDefinition.generate()
   ↓
QR-safe SculptureBuild
   ↓
THREE.InstancedMesh
   ↓
ART VIEW ⇄ QR VIEW
    same voxel field
```

The application is split into three layers:

```text
src/qr.ts          QR truth layer
src/sculpture.ts   QR-safe voxel field + projection invariants
src/styles/*       semantic generators
src/main.ts        rendering, UI, palettes and view rotation
```

### Style registry

`src/styles/index.ts` owns the public generator registry:

```ts
export interface StyleDefinition {
  id: StyleId
  label: string
  eyebrow: string
  headline: string
  description: string
  specimen: string
  defaultPalette: PaletteKey
  generate: (matrix: QRMatrixData, seedText: string) => SculptureBuild
}
```

Adding another form such as a city, tower, icon, crystal, robot or symbol should normally require a new `src/styles/<style>.ts` generator plus one registry entry. The renderer does not need style-specific geometry code.

## Projection safety

`src/sculpture.ts` provides shared helpers and validates every generated field before rendering.

The validator currently enforces:

1. No elevated voxel may exist in the quiet zone.
2. No elevated voxel may occupy a light QR cell.
3. The highest voxel in every elevated QR column must use the scanner-dark `qr-top` material role.
4. The base plane always contains the complete original QR matrix plus its four-module quiet zone.

This makes style generation a constrained depth/height problem instead of allowing styles to rewrite the QR topology.

## Deterministic generation

Each style receives a seeded PRNG derived from:

```text
payload + style ID
```

Therefore:

```text
same payload + same style → same sculpture
same payload + another style → different form, same QR projection
```

## Stack

- Three.js
- TypeScript
- Vite
- `qrcode`

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

## GitHub Pages

`.github/workflows/build.yml` type-checks and builds pushes and pull requests. Pushes to `main` also deploy `dist/` to GitHub Pages.

## Next directions

The style system is intentionally small but extensible. Good next additions are:

- tower / pagoda / lighthouse generators;
- procedural city blocks and skylines;
- icon and logo bitmap generators;
- style-specific parameter schemas and presets;
- `.vox` template ingestion;
- automated binary projection tests and rendered-image QR decoder tests;
- multi-view constrained sculptures where QR is one projection and a glyph/icon is another.
