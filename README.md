# 3D-QR

A generative Three.js experiment that turns a real QR matrix into a single voxel sculpture. The same physical voxel field can be viewed as a semantic 3D form or rotated into an orthographic, machine-readable QR projection.

Live demo: `https://juleslois.github.io/3D-QR/`

## Built-in generators

Every built-in style has a physical platform, but the platform is part of the style rather than a copy of the Tree lawn.

- **Tree / Full Lawn** — broad grass-like QR plate with the complete physical four-module quiet zone.
- **House / Courtyard Pad** — compact warm two-layer courtyard with only a one-module physical border; the remaining quiet zone is supplied by the page background.
- **Castle / Stone Plinth** — heavy three-layer masonry dais with a two-module physical border and denser voxel packing.
- **Glyph / Display Plaque** — thin two-layer plaque exactly the size of the QR symbol; no physical quiet-zone rim is attached to the object.
- **City / Urban Slab** — QR-sized two-layer metropolitan base. Finder/timing modules remain at street level while selected data modules rise into low blocks, glass towers and a seeded central skyscraper.
- **Lighthouse / Harbor Pad** — sea-toned two-layer platform with a three-module physical border, a low rocky island and a compact lighthouse/lantern cluster.

The QR topology is unchanged between styles. What changes is the physical footprint, platform thickness, tile gap, surface palette and semantic geometry above the dark modules.

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

```text
src/qr.ts          QR truth layer
src/sculpture.ts   QR-safe voxel/platform system + projection invariants
src/styles/*       semantic generators
src/main.ts        rendering, style appearance, palettes and view rotation
```

## Style registry

`src/styles/index.ts` defines both semantic generation and platform appearance:

```ts
export interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  foundation: readonly string[]
  qrTop: 'palette' | string
  voxelFill: number
}
```

`voxelFill` controls how much of each QR cell the voxel occupies, so styles can have tighter masonry or more visible grid gaps without changing QR cell coordinates.

## Platform system

`src/sculpture.ts` separates the scanner-facing surface from the physical foundation beneath it.

A `BaseFieldProfile` can vary:

```ts
interface BaseFieldProfile {
  mode: 'full-pad' | 'symbol-pad' | 'dark-only' | 'window' | 'none'
  quietZone?: number
  thickness?: number
  foundationKind?: VoxelKind
}
```

The current built-ins intentionally use physical platforms:

```text
Tree       → full-pad, quiet zone 4, one layer
House      → full-pad, quiet zone 1, two layers
Castle     → full-pad, quiet zone 2, three layers
Glyph      → symbol-pad, quiet zone 0, two layers
City       → symbol-pad, quiet zone 0, two layers
Lighthouse → full-pad, quiet zone 3, two layers
```

This gives each object a different silhouette in art view while preserving the same machine-readable projection.

## Scene generators

### City

`src/styles/city.ts` treats dark data modules as candidate building lots. A deterministic seeded height field combines radial centrality, random variation and a reserved avenue pattern. The nearest central data module becomes a landmark tower; taller blocks introduce glass bands while QR finder/timing structures remain at street level.

### Lighthouse

`src/styles/lighthouse.ts` scores central data modules by local adjacency to find a compact tower anchor. Nearby dark modules form a low rock island, while a small cluster rises into a tapered masonry beacon with a glass lantern band. The surrounding platform uses pale seafoam light cells and deep teal QR cells.

## Projection safety

The validator checks the final projected column topology rather than assuming one specific floor design.

It enforces:

1. Every original dark QR module has a projected dark column.
2. The highest visible surface in every dark column is `floor-dark` or scanner-dark `qr-top`.
3. A light QR module may only project as `floor-light` or empty background.
4. Elevated semantic geometry may never occupy a light module.
5. Physical quiet-zone columns, when present, must expose a scanner-light top surface.
6. Foundation voxels may extend below the scanner-facing plane without changing the QR projection.

The important invariant is therefore:

```text
orthographic_projection(sculpture) === original_qr_matrix
```

not:

```text
all styles share the same QR lawn
```

## Deterministic generation

Each style receives a seeded PRNG derived from:

```text
payload + style ID
```

Therefore the same payload and style reproduce the same sculpture, while another style produces a different object with the same QR projection.

## Adding another style

A new generator can choose its own platform vocabulary. Examples:

```text
Pagoda     → raised stone courtyard
Temple     → timber terrace + stone approach
Station    → industrial transit slab
Robot      → industrial display base
Crystal    → faceted mineral slab
Logo       → thin gallery plaque
```

The renderer should not need generator-specific geometry logic; style code provides the QR-safe voxel field and appearance metadata.

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

- pagoda / temple / station / icon generators;
- platform presets and per-style parameter schemas;
- automatic rendered-image QR decoding tests in CI;
- scanner-contrast validation for custom material themes;
- multi-view / anamorphic constraints;
- `.vox` or bitmap template ingestion with projection-safe clipping.
