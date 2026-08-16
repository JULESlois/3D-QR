# 3D-QR

A generative Three.js experiment that turns a real QR matrix into a single voxel sculpture. The same physical voxel field can be viewed as a semantic 3D form or rotated into an orthographic, machine-readable QR projection.

Live demo: `https://juleslois.github.io/3D-QR/`

## Built-in generators

The generators now use different projection strategies rather than sharing one mandatory QR lawn:

- **Tree / Full Pad** — a complete grass-like QR plate with a physical four-module quiet zone; selected dark modules rise into the canopy.
- **House / Site Window** — a smaller warm courtyard contains both light and dark modules around the building, while dark modules outside the site remain as sparse QR pavers over the page background.
- **Castle / Dark Field** — no light-colored board. Only dark QR-module stones remain at ground level and the keep/walls rise from them.
- **Glyph / Object Only** — no QR floor at all. Every dark QR module is an elevated column; height differences reveal a 5×7 alphanumeric relief while the whole object projects back into the QR.

This lets each style decide how much of the QR is represented by a physical base, by empty background, or by the object itself.

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
src/styles/*       semantic generators + projection strategies
src/main.ts        rendering, style appearance, palettes and view rotation
```

### Style registry

`src/styles/index.ts` owns both generator metadata and style-specific projection appearance:

```ts
export interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  qrTop: 'palette' | string
}

export interface StyleDefinition {
  id: StyleId
  label: string
  eyebrow: string
  headline: string
  description: string
  specimen: string
  projectionLabel: string
  defaultPalette: PaletteKey
  appearance: StyleAppearance
  generate: (matrix: QRMatrixData, seedText: string) => SculptureBuild
}
```

The renderer therefore does not assume that every style has grass, a full board, or even any base at all.

## Projection strategies

`src/sculpture.ts` supports several base-field modes:

```text
full-pad     complete QR + physical quiet zone
symbol-pad   complete QR symbol, no physical quiet-zone plate
dark-only    only dark modules become base voxels
window       a local patch contains light + dark cells; dark cells outside remain sparse
none         no base voxels; the object must provide every dark QR module itself
```

Built-in styles currently map them as:

```text
Tree    → full-pad
House   → window
Castle  → dark-only
Glyph   → none
```

Empty light modules are allowed because the page background itself can be the scanner-light field. This is what makes partial pads and object-only QR sculptures possible.

## Projection safety

The validator now checks the final projected column topology, not merely whether elevated geometry is legal.

It enforces:

1. Every original **dark** QR module must have a projected voxel column.
2. The highest visible voxel in every dark column must be `floor-dark` or scanner-dark `qr-top`.
3. A **light** QR module may either be empty/background or contain only scanner-light `floor-light` at base level.
4. Elevated geometry may never occupy a light module.
5. Physical quiet-zone voxels, when present, must be scanner-light base voxels only.
6. Styles with no physical quiet-zone plate still reserve composition space around the QR so the page background supplies the required quiet zone.

This changes style generation from “all models sit on the same QR floor” into a constrained projection problem:

```text
3D form may vary freely along depth/height
           ↓
orthographic projection must equal QR topology
```

## Style-specific QR appearance

Each style may define its own scanner-safe surface treatment:

- Tree uses green dark ground modules and a warm light lawn.
- House uses sand/plaster light tiles and terracotta/earth dark pavers.
- Castle uses dark stone only; there is no light board.
- Glyph uses an ink-like object-only dark projection.

`qr-top` can either follow the selected palette's dark color or use a style-specific fixed scanner-dark color.

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

## Adding another style

A new style can choose any projection strategy. Examples:

```text
City      → dark-only streets + buildings on selected modules
Tower     → object-only vertical QR columns
Pagoda    → compact window courtyard
Logo      → object-only relief
Robot     → sparse site pad + full-body projection ownership
Crystal   → no floor, every dark module contributes to a crystal cluster
```

The important requirement is not a shared base shape; it is that the final orthographic column projection reconstructs the QR matrix.

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

- style-specific parameter schemas (`siteSize`, `towerCount`, `reliefDepth`, etc.);
- procedural city / pagoda / lighthouse / icon generators;
- multiple projection axes and anamorphic sculptures;
- automatic rendered-image QR decoding tests in CI;
- scanner-contrast validation for custom material themes;
- `.vox` or bitmap template ingestion with projection-safe clipping.
