# Current Vite and demand-loaded assets

## Contract before implementation
- Baseline: traffic commit `c5a6e3e`; 69 passing tests, successful Vite 7.3.8
  build with a 555.83 kB shared Three.js chunk. Traffic commit is complete.
- npm `vite` stable `latest` resolves to 8.3.8 (not 8.4.0-beta.1), verified
  2026-11-23. Context7 `/vitejs/vite/v8.3.5` provides current-major migration
  and loading guidance; it is not evidence of the registry's latest patch.
- Root owns package/lock/config, optional asset-loading paths in explorer and
  classic, focused tests/checkers, README and this eval. No map-data regeneration,
  Three.js upgrade, rendering redesign, provider credentials, push or deployment.
- Follow-up edits were held for review until the user's subsequent commit request.
  Preserve both HTML entries and Pages base; no push is authorized.
- Grade B: new bundler plus async loading needs behavioral/production validation.
  One docs researcher and one independent review; root integrates. At most
  three delegated runs, one bounded repair batch and 35 minutes for follow-up.

## Success checks
1. Installed and locked Vite equal the current stable npm tag, Node 24 supported;
   `npm ci --ignore-scripts --no-audit --no-fund`, `npm ls vite` succeed.
2. `npm test` preserves every one of the 69 existing test identities and passes
   new regression checks; `npm run build` emits both entries without deprecated
   config or hiding bundle warnings.
3. Production manifest proves traffic protobuf decoding and scenery are outside
   each entry's eager dependency closure; no chunk exceeds 500 kB minified.
   Guard combined eager JS at 625 kB per entry against hiding growth by splitting.
   Core rendering remains necessarily eager, not claimed as a byte reduction.
4. Production-browser network evidence: no place index before search intent;
   first search loads it once and works; explorer textures are requested by
   material demand, not by a bulk startup preload; classic texture atlases are
   absent at default 0% and fetched once after increasing texture strength.
5. Production traffic fixture check still passes through lazy decode chunks;
   existing explorer/scenery browser checks pass and produce no JS exceptions.
6. Record before/after actual JS/gzip sizes and deferred file sizes, not invented
   latency/CPU/GPU gains. `git diff --check` and final path review pass.
7. `graphify update .` refreshes the ignored local AST graph.

## Results

Commands were executed through the required `rtk` wrapper (usually
`rtk proxy bash -c` for grouped commands and saved logs).

### Commit and scope
- **PASS** `git commit -m "feat: add opt-in traffic overlay and refine simulated cars"`
  created `c5a6e3e`, containing the previously verified twelve traffic-patch paths.
  The pre-commit suite passed 69/69 and the worktree was clean immediately after.
- Follow-up changes are included in the subsequent user-authorized commit. No push, deployment or live Mapbox
  traffic call was performed. No Codex configuration or memory file was edited.
- Changed follow-up paths: `package.json`, `package-lock.json`, `vite.config.js`,
  `src/explorer/app.js`, `src/explorer/traffic.js`, `src/main.js`,
  `tests/pages.test.js`, `tests/traffic.test.js`,
  `scripts/check-scenery-browser.mjs`, `scripts/check-traffic-browser.mjs`,
  `scripts/check-lazy-assets-browser.mjs`, `README.md`, and this eval.

### Version, build and deterministic checks
- **PASS** `npm view vite dist-tags engines --json` returned stable `latest=8.3.8`
  and beta `8.4.0-beta.1`. `npm view vite@8.3.8 version engines dependencies --json`
  confirmed Node `^20.19.0 || >=22.12.0`; local Node is 24.21.0 and CI uses 24.
- **PASS** `npm install --save-dev vite@^8.3.8 --ignore-scripts --no-audit --no-fund`,
  then `npm ci --ignore-scripts --no-audit --no-fund` and `npm ls vite --all`:
  exit 0, one Vite installation at 8.3.8. Package range and lock root both
  contain `^8.3.8`; locked package is 8.3.8.
- **PASS** `npm test`: 70/70, exit 0. Exact name comparison against
  `/tmp/mauritius-precommit-tests.log` preserved all 69 baseline identities.
  The new test checks cancellation versus empty coverage after HTTP headers.
- **PASS** `npm run build`: Vite 8.3.8, both HTML entries and manifest emitted,
  no deprecated configuration or oversized-chunk warning. A build emitted an
  informational Rolldown plugin-timing notice; it was not suppressed.
- **PASS** the enhanced production test builds into a temporary directory with
  `define(import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN)="pk.fixture"`; it verifies
  decoder/scenery dynamic entries, disjoint eager closures, <=500,000-byte
  chunks, <=625,000-byte combined eager JS, and existing Pages asset contracts.
  A no-token build legitimately removes the decoder feature entirely, so it is
  not sufficient on its own to test enabled traffic chunks.
- Red check: the expanded production manifest test failed before implementation
  because vector-tile was not a dynamic entry. A later no-token manifest check
  exposed Vite 8 dead-code removal, requiring the corrected temporary fixture
  build rather than weakening the lazy-loading criterion.
- **PASS** `git diff --check`, final path review, and `graphify update .` (AST
  only, ignored graph output; no semantic provider extraction or relabeling).

### Production-browser evidence
All checkers used headless Chrome/SwiftShader, preview URLs under
`/mauritius-3D-openworld/`, and a dedicated temporary browser profile.
- **PASS** `node scripts/check-lazy-assets-browser.mjs`: no startup place index;
  synthetic failed first load can retry, simultaneous input shares one request,
  cached search works, Escape keeps suggestions dismissed and restores input
  focus. Ten explorer textures are used by initial material demand, each once.
  Classic fetches neither atlas at 0%; both return HTTP 200 once after increasing
  the slider, remain cached across further slider changes, and emit no shader
  or JavaScript console errors. External fetches are blocked by the checker.
- **PASS** `VITE_MAPBOX_PUBLIC_TOKEN=pk.fixture npm run build -- --outDir /tmp/mauritius-vite-fixture-dist`,
  previewed on port 4174; `APP_URL=http://127.0.0.1:4174/mauritius-3D-openworld/ node scripts/check-traffic-browser.mjs`:
  no decoder network request at startup or for empty HTTP 200; both decoder
  chunks load on nonempty data. Existing opt-in, eight-minute refresh,
  non-accumulating geometry, cancellation/late completion, HTTP 403/manual retry,
  tile-change and overview-cleanup assertions pass with mocked provider data.
- **PASS** `EXPECT_TRAFFIC_TOKEN=0 node scripts/check-traffic-browser.mjs` against
  the normal no-token production build: disabled control, zero traffic/decoder
  requests and a valid logo.
- **PASS** `node scripts/check-explorer-browser.mjs` and
  `node scripts/check-scenery-browser.mjs`: exit 0, streaming/zoom/WASD and all five
  landmarks, bounded cache and cleanup, terrain toggles and no JS exceptions.
  The scenery checker now waits for the first asynchronous search results.

### Measured sizes, not a performance benchmark
Eager JS is the unique transitive static manifest closure of each HTML entry.
Gzip values use Node `zlib.gzipSync` consistently before/after; units are bytes.

| Entry/build | Eager JS | Eager gzip JS |
|---|---:|---:|
| Explorer, Vite 7 baseline | 600,736 | 164,404 |
| Explorer, Vite 8 without token | 602,326 | 162,063 |
| Explorer, Vite 8 with fixture token | 603,785 | 162,697 |
| Classic, Vite 7 baseline | 609,156 | 165,344 |
| Classic, Vite 8 | 612,218 | 163,709 |

- Largest minified chunk: **555.83 kB -> 334.18 kB**. Raw combined startup JS is
  slightly larger, gzip slightly smaller; chunk splitting is not a total-byte
  reduction claim. Shared core/renderer/controls remain eager and cacheable.
- Explorer defers the 195,364-byte place index until search intent.
- Classic defers 342,653 + 152,975 = 495,628 bytes of PNG atlases until texture
  intent. These are file sizes, not measured compressed transfer or latency.
- Ten textures are still required by the initial Port Louis explorer view;
  material-demand caching does not reduce that observed initial request count.
- An intermediate Vite 8 build retained unnecessary Three exports when an opaque
  namespace was passed to the terrain helper (~777 kB eager explorer JS). Passing
  its three required constructors restored pruning; the aggregate budget guards
  against reintroducing this regression while merely shrinking individual chunks.

### Independent review and limits
- One `docs_researcher` run (configured `gpt-6-luna`/`medium`) used Context7 for
  Vite migration/loading guidance; one reused `typescript_reviewer` run
  (configured `gpt-6.1-sol`/`high`) reviewed the async and shader changes.
- One bounded repair batch fixed the review's cached-focus/Escape regression and
  avoided decoder imports for zero-byte successful responses; root independently
  ran the final production/network graders. Workers made no edits.
- This was the smallest useful route: one bounded docs lookup, one independent
  JavaScript review, and a single integration owner. Actual inference settings,
  effective worker isolation, parent client/profile/auth mode and total tokens
  are **UNVERIFIED**; configured model pins are not inference telemetry.
- **UNVERIFIED** native-GPU/mobile performance, other browsers, visual equivalence
  by pixel comparison, production CDN transfer compression, real provider data
  freshness/coverage/billing, and live deployment. Vite 8's default browser target
  is newer than Vite 7's; older browser support has not been exercised here.

Status: **PASS for local upgrade and production-preview loading checks**;
follow-up commit authorized by the user's subsequent request, with no push.

## Primary documentation
Retrieved directly through `mcp__context7__resolve_library_id` /
`mcp__context7__query_docs` (not an inferred Context7 lookup):
- https://github.com/vitejs/vite/blob/v8.3.5/docs/guide/migration.md
- https://github.com/vitejs/vite/blob/v8.3.5/docs/config/build-options.md
- https://github.com/vitejs/vite/blob/v8.3.5/docs/guide/features.md
- https://github.com/vitejs/vite/blob/v8.3.5/docs/guide/assets.md
- https://github.com/rolldown/rolldown/blob/v1.2.19/docs/in-depth/manual-code-splitting.md
- https://github.com/rolldown/rolldown/blob/v1.2.19/docs/in-depth/dead-code-elimination.md
