# 3D-QR

A generative Three.js system that turns a real QR matrix into a single voxel scene. The same physical scene can be viewed as semantic 3D art or rotated into an orthographic, machine-readable QR projection.

Live demo: `https://juleslois.github.io/3D-QR/`

## Core idea

The project no longer treats QR generation as “dark cells may contain geometry, light cells must stay flat.” Every QR cell now has two independent properties:

```text
scanner polarity  → light / dark
structural zone   → finder / timing / data
```

A light cell may be empty background, a flat floor, a wave, a courtyard terrace, a pale roof or part of a large building. A dark cell may be pavement, tree canopy, masonry, rock or a tower. The invariant is only that the highest visible surface from the QR axis keeps the correct scanner polarity.

```text
orthographic_projection(scene) === original_qr_matrix
```

The external quiet zone remains conservative: it may be a low scanner-light platform, but elevated semantic geometry is rejected there.

## Built-in generators

- **Tree / Full Lawn** — broad grass-like QR landscape with the complete physical quiet zone.
- **House / Courtyard Pad** — warm compact platform and house massing.
- **Castle / Fortress Plan** — the three finder regions become tiered watchtower complexes; timing cells become connector walls; selected light cells rise into pale courtyard terraces.
- **Glyph / Display Plaque** — alphanumeric relief on a thin QR-sized plaque.
- **City / Urban Masterplan** — a central megablock intentionally spans both light and dark cells. One light roof column can become an antenna; other light cells remain streets or rise into civic plazas. Sparse secondary blocks keep the skyline readable.
- **Lighthouse / Tidal Harbor** — scanner-light cells become shallow blue water with one/two-voxel wave variation; finder regions become reef-like breakwaters while the dark island and beacon rise above them.
- **Pagoda / Temple Courtyard** — a stepped mixed-polarity main pagoda spans light and dark data cells, finder regions become secondary pavilions, timing cells become corridors, and scanner-light data cells rise into gravel courts and steps.
- **Temple / Temple Precinct** — a broad horizontal main hall spans both polarities. The three finder regions are interpreted differently as a gatehouse, water-garden node and bell pavilion; timing cells become covered corridors and a stone approach; surrounding light cells form water courts and terraces.

## Architecture

```text
URL / text
   ↓
QRMatrixData
   ├─ polarity: light / dark
   └─ zone: finder / timing / data
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
src/qr.ts          QR truth + polarity + structural zones
src/sculpture.ts   voxel/platform helpers + projection validator
src/styles/*       semantic scene generators
src/main.ts        rendering, materials, palettes and view rotation
```

## Projection-safe raised light cells

`src/sculpture.ts` exposes `pushProjectedColumn()`. It accepts any `QRCell`, not only a dark module:

```ts
pushProjectedColumn(
  voxels,
  cell,
  matrix.size,
  fromLevel,
  toLevel,
  bodyKind,
  random,
)
```

The helper automatically caps the column with:

```text
dark cell  → qr-top
light cell → light-top
```

The body below that cap can use any semantic material (`stone`, `glass`, `water`, etc.) because it disappears into depth in QR view.

The validator checks the final visible cap per `(row, col)`:

1. Every dark module must project as `floor-dark` or `qr-top`.
2. A represented light module must project as `floor-light` or `light-top`; it may also be physically empty when the page background supplies the light field.
3. Elevated geometry may exist on both dark and light modules inside the QR symbol.
4. Elevated geometry is forbidden in the external quiet zone.
5. Foundation layers below the scanner-facing plane do not affect the projection.

## Structural QR zones

`QRCell.zone` is independent of color:

```ts
type ModuleZone = 'finder' | 'timing' | 'data'
```

The one-cell light separator around each finder is also classified as `finder`, which lets generators turn the complete recognition structure into semantic 3D forms while preserving its light/dark pattern in QR view.

Examples:

```text
Castle
finder → watchtower complexes
timing → connector walls
light data → courtyard terraces

Lighthouse
light data → waves
finder → reefs / breakwaters
dark data → island + beacon

City
light + dark data → one coherent megabuilding
light data → roads / plazas / antenna roof cells
dark data → secondary buildings

Pagoda
light + dark data → one tiered main pagoda
finder → secondary pavilions / gate complexes
timing → covered corridors / approach path
light data → gravel courts / stone steps

Temple
light + dark data → broad horizontal main hall
finder TL → gatehouse
finder TR → water-garden node
finder BL → bell pavilion
horizontal timing → covered timber corridor
vertical timing → stone approach
light data → water court / terraces
```

## Style appearance

Each style can separately define scanner-facing light and dark surfaces plus semantic materials:

```ts
interface StyleAppearance {
  baseLight: string
  baseDark: readonly string[]
  foundation: readonly string[]
  qrTop: 'palette' | string
  lightTop?: string
  water?: readonly string[]
  voxelFill: number
}
```

This allows, for example, Lighthouse light modules to be pale blue rather than white while still remaining scanner-light relative to the deep teal dark modules.

## Deterministic generation

Each style receives a seeded PRNG derived from:

```text
payload + style ID
```

The same payload and style reproduce the same scene; another style creates a different scene with the same QR topology.

## Stack

- Three.js
- TypeScript
- Vite
- `qrcode`

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Next directions

- render-and-decode QR tests in CI;
- scanner contrast validation for custom themes;
- richer finder-specific scene primitives;
- station / crystal / mountain generators;
- style parameter schemas;
- multi-view / anamorphic constraints;
- `.vox` or bitmap template ingestion with projection-safe clipping.
