<p align="center">
  <img src="./.github/assets/mauritius-life-logo.webp" alt="Mauritius Life — Explore, Discover, Preserve" width="720">
</p>

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

### Build chunks and on-demand assets

The lockfile uses Vite 8.3.8; CI runs Node 24. Both HTML entries share separate
Three.js core, renderer and controls chunks. Rendering still needs these chunks
at startup. Scenery loads on approach, while traffic decoding loads only after
an enabled overlay receives non-empty data. Without a token, the production
build removes the unused traffic feature.

Place search fetches its index on focus or typing, with cached results and retry
after failure. Explorer PNGs are cached by material demand (the initial Port Louis
view currently uses all ten). Classic-view texture atlases load only when
**Surface texture** rises above 0%. Public map data and PNGs retain their names;
they are fetched on demand, not converted into JavaScript chunks.

Production tests inspect the emitted manifest: optional code must stay outside
the eager dependency graph, each JS chunk is limited to 500 kB, and combined eager
JS per entry is guarded at 625 kB so splitting cannot conceal bundle growth.
With a local production preview and Chrome debugger running, use
`APP_URL=<preview URL> CHROME_DEBUG_URL=<debugger URL> node scripts/check-lazy-assets-browser.mjs`
to check network demand, search retry/Escape behavior and classic atlas loading.
It blocks external fetches and does not measure native-device performance.

Browser evidence for this recovery is under `.workflow/ultracode/world-recovery/` (local workflow artifacts, not application assets). It exercises real bundled data with external services blocked. Software WebGL checks do not prove native-GPU frame rate or mobile-device performance; visual approval remains a human check.

## Publication

`vite.config.js` keeps the `/mauritius-3D-openworld/` base for application, texture and snapshot URLs. The existing GitHub Actions workflow tests/builds/publishes `dist/` on pushes to `master` or manual dispatch. No server or API keys are required. Commit, push and deployment are separate actions, not part of local verification.

## Attribution

- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); bundled data is [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), extracted via [Geofabrik](https://download.geofabrik.de/africa/mauritius.html).
- Live standard tiles follow the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/).
- Live elevation: [Mapzen terrain via AWS Open Data](https://registry.opendata.aws/terrain-tiles/).
- Application code: MIT. Material PNGs are original procedural textures.

### Chamarel scenery (illustrative)

Search **7 colors**, **Seven Coloured Earth**, or **Chamarel Waterfall** for
original procedural 3D scenery. Searching **Chamarel** still selects the village;
choose the named attraction from the results instead. Dunes, cliffs, basin and
broadleaf forest are artistic reconstructions, not photogrammetry or surveyed
geology. The waterfall is raised illustrative relief above the shared terrain,
not a DEM excavation. Locations use OSM way 133131985 and node 248643391 from the
local extract. Reference: https://chamarel7colouredearth.com/experiences/geopark/.
No Google imagery is embedded or used as textures.

The scenery generator is a separate lazy-loaded bundle. Only nearby detail views
construct meshes (about 4,000–5,300 triangles per site); leaving the area or returning
to island view disposes their GPU geometry/materials. **Trees & parks** also hides
scenery. WebGL animates small waterfall highlights; software rendering and reduced
motion retain static water. Native-device frame rate and long-session memory have
not been benchmarked.

### More landmark scenery

| Search | Scenery | Verified OSM anchor | Reference |
|---|---|---|---|
| **Le Morne Brabant** | Asymmetric basalt massif and wooded shoulders | Peak `n828423453`, 57.3213024, -20.4540752 | [UNESCO](https://whc.unesco.org/en/list/1259/) |
| **Trou aux Cerfs** / **Curepipe volcano** | Forested bowl and low central floor; no lava | Volcano `n1891384067`, 57.5114969, -20.3179077 | [Curepipe Municipality](https://www.municipal-curepipe.org/management-of-parks-gardens-and-green-spaces/) |
| **Ganga Talao** / **Grand Bassin** | Level lake, wooded banks and decorative steps/pavilion | Outer-polygon centroid of lake `r1789151`, 57.4921158, -20.4181020 | [Mauritius Telecom tourism](https://www.myt.mu/tourist-tour/explore-info/grand-bassin-ganga-talao) |

Anchors come from the local OSM extract, not from the model shapes. These are
original illustrative scenes, not survey-accurate footprints, geology, temples or
statues. Mountain relief starts at the surrounding foothill datum and takes the
higher of model relief and existing ground, avoiding double-added summit height.
The crater and lake sit on level raised foundations with ground-connected skirts;
they do **not** excavate or replace the DEM. Existing mapped buildings/roads remain.

Each new model has fewer than 6,000 triangles. Nearby scenery can remain visible
when street tiles fall back to the overview terrain; whole-island zoom unloads it.
Search **Le Morne Brabant**, not just **Le Morne** (which retains the village result).

Checks: `npm test`, `npm run build`, and `scripts/check-scenery-browser.mjs` against
a local preview with `APP_URL` and `CHROME_DEBUG_URL`. The browser check covers all
five landmarks, search aliases, distant-scene removal, bounded tile cache, the
Trees & parks toggle, flat fallback, and whole-island cleanup. It writes inspection
screenshots to `/tmp/mu-<osm-id>.png`. This is not a native-GPU performance benchmark.

## Optional traffic overlay in the main explorer

Set `VITE_MAPBOX_PUBLIC_TOKEN=pk.…` in an ignored `.env.local` before starting Vite, or set the same GitHub Actions repository variable before building Pages. Use a URL-restricted public token with an account entitled to Mapbox Traffic. Requests from each browser count against the account. Check Traffic entitlement and the account's current pricing before enabling it publicly.

Open **Layers & Style → Mapbox traffic · centre tile** in street view. The overlay requests the zoom-14 vector tile beneath the camera target and refreshes it every eight minutes while stationary. Panning across a tile boundary makes an additional request. The timestamp records retrieval. Empty tiles and access errors are shown separately. After an error, the next automatic attempt follows the same interval; toggle off and on to retry sooner. Colour describes provider-reported congestion; simulated cars remain illustrative and independent. No provider credential or Mauritius traffic sample is bundled.

Validate coverage with a real token in Port Louis, at Phoenix and on a quieter road. Record non-empty directional features, tile coordinates and fetch times in peak and off-peak periods before advertising local coverage. Inspect opposing carriageways and grade-separated junctions; the overlay uses ground-level ribbons, omits tunnels and does not reconstruct bridge-deck heights.

Offline browser regression: start Vite with `VITE_MAPBOX_PUBLIC_TOKEN=pk.fixture npm run dev`, then run `APP_URL=<local Vite URL> CHROME_DEBUG_URL=<local Chrome debugger URL> node scripts/check-traffic-browser.mjs`. The checker mocks provider responses and blocks external fetches. Run again against Vite without a token with `EXPECT_TRAFFIC_TOKEN=0` to check the disabled state. This does not verify live coverage or native GPU performance.
