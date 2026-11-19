# Mauritius Life — a little world to explore

Explore Mauritius in 3D, from a whole-island overview to individual mapped buildings. Point and scroll for smooth zoom, use WASD to travel, and drag to orbit. The four towns are shortcuts rather than travel boundaries.

Nearby roads and buildings load from bundled OpenStreetMap tiles, not a live Overpass query. Coverage varies; buildings are illustrated, and this is not panoramic street photography.

**Website:** [Explore Mauritius in 3D](https://VincentChuWaiChow.github.io/mauritius-3D-openworld/)
Local source changes are not live until separately deployed.

## Run locally

Requires Node.js 20.19+ or 22.12+, npm and a WebGL2-capable browser.

```bash
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the Vite URL, normally `http://localhost:5173/mauritius-3D-openworld/`.
## Elevation

With **Real DEM terrain (online)** enabled, the overview and street views share a
coarse OSM-clipped terrain mesh. Road ribbons are split at terrain triangle
boundaries and lifted above that same surface; building foundations use its
heights. A bounded z10 Mapzen DEM request loads on demand and is reused while
navigating. Failed requests fall back to flat terrain and can be retried by
toggling the checkbox. Terrain detail is currently fixed, not a high-resolution
streaming terrain system; buildings and streets stream independently.

## Free-roam explorer

The default entry uses `src/explorer/` and `public/explorer/`. To regenerate the street tiles from a Mauritius OSM extract with pyosmium installed, run `python scripts/build_street_tiles.py mauritius.osm.pbf public/explorer/tiles` into an empty output directory. The index records attribution and the input checksum. For a browser interaction check against the production preview, run `node scripts/check-explorer-browser.mjs` with a dedicated headless Chrome debugger on port 9238.

## Classic explorer

The previous map remains available at [classic.html](./classic.html). The controls and implementation notes below describe that version.

Featured scenes need access to this app’s own assets, not third-party APIs. They are **not** an installed offline/PWA experience. Other locations require the public map, elevation and building services.

## Explore

- **Drag / one-finger swipe:** move across the town. Arrow keys move the focused map.
- **Right-drag / two-finger rotate:** orbit. Scroll / pinch or +/−: zoom.
- **Whole island:** north-up overview with four labelled town pins. Pick a pin or use the destination dock to travel.
- **Zoom out button:** returns a close-up to the island when the local zoom limit is reached.
- **Reset:** restores the location’s framing and clears drag inertia.
- **Layers:** additional destinations, colour palettes, building height, textures, shadows, places and PNG capture. Mountain relief applies only to live-terrain views.

Town panning is bounded to the available scene; this is not a continuously streamed full-island game world. Public-service failures have a visible retry action. Featured scenes remain independent of those services.

## Data and accuracy

The bundled extracts were built from the **2026-11-15T21:22:28Z** Geofabrik Mauritius snapshot:
[dataset provenance and ODbL licence](public/data/README.md).

- Building footprints, road centre lines and shoreline are real OSM data, not random substitute buildings. Multipolygon building relations are not represented.
- Featured scenes deliberately use **flat illustrated terrain**. Building heights without explicit tags, widths of roads, colours, windows and decorative trees inside mapped parks are illustrative. Data can be outdated; not for navigation or surveying.
- Live views use up to 25 visible OSM raster tiles and public Mapzen Terrarium DEM data (z10 overview/z12 detail). Raster classification includes embedded labels and is approximate. No raster tiles are bundled or bulk-prefetched.
- Live buildings use a deadline-bounded Overpass request. Missing, rate-limited or stalled services are reported without claiming the scene is complete.
- Procedural texture PNGs are not photographs. See [the material study](PHOTO_REFERENCES.md).

## Implementation

| File | Responsibility |
|---|---|
| `src/main.js` | Scene lifecycle, local/live loading, camera, markers, UI wiring |
| `src/vector-scene.js` | Label-free coastline, roads, parks, instanced trees, coverage bounds and disposal |
| `src/data-source.js` | Deadline/cancellation-safe JSON requests and OSM validation |
| `src/experience.js`, `src/style.css` | Mauritius Life UI and responsive layouts |
| `src/buildings.js`, `src/materials.js` | Footprint extrusion, batched geometry and illustrated facades |
| `src/terrain.js`, `src/map-shaders.js` | Live DEM sampling and raster/sea shaders |
| `src/palettes.js` | Semantic colour and lighting presets |
| `public/data/` | Four bounded town snapshots and main-island coastline, with provenance |
| `scripts/build-scene-data.py` | Build-only snapshot extraction from a supplied PBF; requires pyosmium |

The snapshot script makes no network requests. It joins coastline segments by OSM node ID and fails rather than bridging an incomplete coast. It does not install tools or publish data. The web app has no new runtime dependency.

## Verification

`npm test` covers data timeouts, cancellation and validation, concurrent DEM loading, snapshot integrity, geometry/disposal, palette contracts and GitHub Pages asset paths. `npm run build` creates `dist/`.

Browser evidence for this recovery is under `.workflow/ultracode/world-recovery/` (local workflow artifacts, not application assets). It exercises real bundled data with external services blocked. Software WebGL checks do not prove native-GPU frame rate or mobile-device performance; visual approval remains a human check.

## Publication

`vite.config.js` keeps the `/mauritius-3D-openworld/` base for application, texture and snapshot URLs. The existing GitHub Actions workflow tests/builds/publishes `dist/` on pushes to `master` or manual dispatch. No server or API keys are required. Commit, push and deployment are separate actions, not part of local verification.

## Attribution

- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); bundled data is [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), extracted via [Geofabrik](https://download.geofabrik.de/africa/mauritius.html).
- Live standard tiles follow the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).
- Live elevation: [Mapzen terrain via AWS Open Data](https://registry.opendata.aws/terrain-tiles/).
- Application code: MIT. Material PNGs are original procedural textures.
