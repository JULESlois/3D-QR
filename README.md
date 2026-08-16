# 3D-QR

A generative Three.js system that turns a real QR matrix into a single voxel scene. The same physical scene can be viewed as semantic 3D art or rotated into an orthographic, machine-readable QR projection.

Live demo: `https://juleslois.github.io/3D-QR/`

## Core idea

The project no longer treats QR generation as “dark cells may contain geometry, light cells must stay flat.” Every QR cell now has two independent properties:

```text
scanner polarity  → light / dark
structural zone   → finder / timing / data
```

A light cell may be empty background, a flat floor, a wave, a courtyard terrace, a pale roof, a crystal tip or part of a large building. A dark cell may be pavement, tree canopy, masonry, rock, mineral or a tower. The invariant is only that the highest visible surface from the QR axis keeps the correct scanner polarity.

```text
orthographic_projection(scene) === original_qr_matrix
```

The external quiet zone remains conservative: it may be a low scanner-light platform, but elevated semantic geometry is rejected there.

## Built-in generators

- **Tree / Full Lawn** — one broad hero tree on the original lawn-like QR landscape.
- **Forest / Woodland Floor** — a mixed-species woodland of broadleaf trees, conical pines and larger ancient trees. Overlapping canopy columns surround a winding low clearing while sparse shrubs fill the understory.
- **House / Residential Lot** — a large gabled residence with projecting front gable, chimney, garage wing, porch and garden path.
- **Castle / Ruined Fortress** — a central keep dominates three finder-area bastions with different damage levels. Broken timing walls contain real gaps and the courtyard uses sparse rubble rather than symmetrical corner towers.
- **Glyph / Display Plaque** — alphanumeric relief on a thin QR-sized plaque.
- **City / Dense Skyline** — a high-rise district made from deliberately different silhouettes: landmark spire, setback tower, twin towers, podium towers, slabs, terraces and crowned offices.
- **Lighthouse / Tidal Harbor** — scanner-light cells become shallow blue water with one/two-voxel wave variation; finder regions become reef-like breakwaters while the dark island and beacon remain the visual anchor.
- **Pagoda / Temple Courtyard** — a stepped mixed-polarity main pagoda spans light and dark data cells, finder regions become secondary pavilions, timing cells become corridors, and scanner-light data cells rise into gravel courts and steps.
- **Temple / Shrine Axis** — a large foreground torii frames a stone approach and rear horizontal shrine hall. Finder regions are intentionally low gardens/water/lantern fragments rather than three tower nodes.
- **Crystal / Crystal Sanctum** — a single suspended cyan crystal hangs above an energy basin inside a low stone frame with four pylons. Finder regions remain part of the slab instead of becoming satellite crystal towers.

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

The body below that cap can use any semantic material (`stone`, `glass`, `water`, `crystal`, etc.) because it disappears into depth in QR view. Geometry also does not need to form solid columns: isolated high voxels can create suspended beams or crystals as long as the highest voxel in every represented QR column has the correct scanner polarity.

The validator checks the final visible cap per `(row, col)`:

1. Every dark module must project as `floor-dark` or `qr-top`.
2. A represented light module must project as `floor-light` or `light-top`; it may also be physically empty when the page background supplies the light field.
3. Elevated geometry may exist on both dark and light modules inside the QR symbol.
4. Elevated geometry is forbidden in the external quiet zone.
5. Foundation layers below the scanner-facing plane do not affect the projection.

## Structural QR zones are hints, not mandatory towers

`QRCell.zone` is independent of color:

```ts
type ModuleZone = 'finder' | 'timing' | 'data'
```

A style may use those zones semantically, but finder regions are not required to become three equivalent structures. Recent generators deliberately use different silhouette grammars:

```text
Forest
hero silhouette → layered woodland canopy
light + dark cells → mixed-species crowns
central field → winding low clearing / path
outer data → understory shrubs

Castle
hero silhouette → central keep
finder → three uneven ruined bastions
timing → broken wall fragments
light data → rubble / exposed court

Lighthouse
hero silhouette → beacon + island
light data → waves
finder → reefs / breakwaters

City
hero silhouette → dense differentiated skyline
light + dark data → coherent tower footprints
building grammar → landmark / setback / twin / podium / slab / terrace / crown

Pagoda
hero silhouette → vertical tiered tower
finder → secondary pavilions / gate complexes
timing → covered corridors / approach path

Temple
hero silhouette → foreground torii framing rear shrine hall
finder → low garden / water / lantern fragments
central axis → stone approach
light + dark data → rear horizontal main hall

Crystal
hero silhouette → one suspended central crystal
finder → low scanner slab only
central field → energy basin + sanctum frame
four selected cells → low pylons
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
  crystal?: readonly string[]
  voxelFill: number
}
```

This allows Lighthouse water to stay pale blue, Crystal bodies to use a dedicated cyan mineral range, Forest to keep a mossy floor and green canopy, and Temple to keep a warm shrine palette while scanner polarity is still controlled by the final cap colors.

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
- explicit silhouette-grammar and scene-role metadata per style;
- station / mountain generators;
- style parameter schemas;
- multi-view / anamorphic constraints;
- `.vox` or bitmap template ingestion with projection-safe clipping.
