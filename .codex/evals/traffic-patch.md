# Traffic patch integration

## Scope and assumptions
- Integrate `/home/vchu@maureva.com/Downloads/mauritius-traffic.patch` into this repo.
- Baseline: `955a603`, clean worktree; 62 tests pass and production build passes.
- Own patch paths, focused traffic tests/browser checker and this eval only.
- No commit, push, deployment, credentials, paid traffic requests or unrelated cleanup.
- Apply the supplied patch, then one bounded repair batch for reproduced defects.
- One independent JavaScript review; root owns integration. Maximum 30 minutes.
- Provider entitlement, pricing and real Mauritius coverage remain unverified.

## Capability graders (defined before applying)
1. `git apply --check /home/vchu@maureva.com/Downloads/mauritius-traffic.patch` succeeds.
2. `node --test tests/traffic.test.js` decodes binary traffic, distinguishes empty
   coverage/errors, filters tunnels/unsupported geometry and preserves direction.
3. Local mocked-browser check: no request by default or without a public token;
   opt-in fetch, refresh, tile changes, cancellation and overview cleanup work;
   a decoded traffic ribbon is rendered without stale geometry.
4. Logo SVG parses and loads with nonzero browser dimensions; production asset
   URL respects the existing `/mauritius-3D-openworld/` base.

## Regression graders
- `npm test`: all 62 baseline tests plus new traffic checks pass.
- `npm run build`: both explorer and classic entry points build; pre-existing
  500 kB chunk warning is not a new failure.
- Existing browser explorer/scenery smoke checks where local Chrome is available.
- `git diff --check` succeeds; review the final file list against scope.
- `graphify update .` refreshes the ignored local graph after code changes.

## Report
### Outcome
Applied the ten-file patch and one bounded repair batch:
- Replaced its truncated logo with Mapbox's complete upstream SVG.
- Fixed the logo URL: Vite doubled the `%BASE_URL%` prefix in development.
- Invoke traffic cancellation on visibility change, not just from a frame loop
  that returns immediately while the tab is hidden.
- Added seven traffic unit checks, a mocked browser checker and traffic counters
  on the existing supported smoke-test state. Documented manual error retry.

### Capability evidence
Commands below were executed through the required `rtk` wrapper (usually
`rtk proxy bash -c` for grouped commands and logs).
- **PASS** `git apply --check /home/vchu@maureva.com/Downloads/mauritius-traffic.patch`
  before application: exit 0.
- **PASS** `node --test --test-reporter=tap tests/traffic.test.js`:
  7/7 checks, exit 0 (also included in the full suite).
- **PASS** `EXPECT_TRAFFIC_TOKEN=0 node scripts/check-traffic-browser.mjs` with
  local Vite at port 4173 and Chrome debugger at 9238: exit 0; disabled checkbox,
  no traffic requests and a decodable logo.
- **PASS** `APP_URL=http://127.0.0.1:4174/mauritius-3D-openworld/ node scripts/check-traffic-browser.mjs`
  with Vite started using `VITE_MAPBOX_PUBLIC_TOKEN=pk.fixture`: exit 0. Checks
  opt-in, decoded mesh/vertex counts, refresh without accumulation, cancellation
  on hiding, deliberately late responses, empty coverage, HTTP 403, manual retry,
  a Port Louis to Grand Baie tile change and overview cleanup. All traffic and
  external fetches are mocked/blocked in this checker.
- **PASS** Python `xml.etree.ElementTree.parse` on source and built SVG, plus
  assertions on `dist/index.html`: the production logo URL is exactly
  `/mauritius-3D-openworld/explorer/mapbox-logo.svg`, without a doubled prefix.
- Red-before-green evidence: XML parsing originally failed with `unclosed token`;
  browser checks failed on the undecodable logo/doubled URL, and then on
  `Hiding the tab must cancel in-flight traffic`, before the respective repairs.

### Regression evidence
- **PASS** `npm ci --ignore-scripts --no-audit --no-fund`: exit 0; lockfile
  dependencies install without lifecycle scripts.
- **PASS** `npm test`: 69/69, exit 0. Exact test-name comparison against
  `/tmp/mauritius-traffic-baseline-test.log` preserved all 62 baseline identities.
- **PASS** `npm run build`: exit 0; explorer and classic entries emitted.
  The existing 555.83 kB shared chunk warning is unchanged.
- **PASS** `node scripts/check-explorer-browser.mjs`: exit 0; streamed initial
  view, bounded cache, overview, wheel zoom, interior loading and WASD.
- **PASS** `node scripts/check-scenery-browser.mjs`: exit 0; all five landmarks,
  distant-scene cleanup, nature toggle, flat fallback and overview disposal.
- **PASS** `git diff --check`, new-file trailing whitespace/newline checks,
  and final path review: only the ten patch paths plus this eval and checker.
- **PASS** `graphify update .`: exit 0; ignored AST graph refreshed,
  final run: 458 nodes/991 edges. No semantic API extraction or relabeling was requested.

### Changed files
- `.github/workflows/deploy-pages.yml`, `README.md`, `index.html`
- `package.json`, `package-lock.json`, `public/explorer/mapbox-logo.svg`
- `src/explorer/app.js`, `src/explorer/style.css`, `src/explorer/traffic.js`
- `tests/traffic.test.js`, `scripts/check-traffic-browser.mjs`
- `.codex/evals/traffic-patch.md`

### Team and boundaries
- Grade B: asynchronous lifecycle/renderer coupling required bounded reasoning;
  routine risk, local patch integration authorized by the user's request.
- Root: integration, all writes, independent graders and final review.
- One `typescript_reviewer` review run, no writes or follow-up repairs. Runtime
  role catalog and `/home/vchu@maureva.com/.codex/agents/typescript-reviewer.toml`
  declare `gpt-6.1-sol` / `high`; actual inference telemetry and effective
  read-only isolation are **UNVERIFIED**, not claimed as security guarantees.
- Smallest useful route: deterministic patch application plus one independent
  review of asynchronous request lifecycle. No parallel write ownership.
- No commit, push, deployment, configuration change, provider credential access
  or real Mapbox traffic request. Total token usage is unavailable.
- Parent client version, selected profile, authentication mode and inference
  settings are not exposed by this session and remain **UNVERIFIED**. No separate
  Codex process or credential store was used to imitate runtime evidence.

### Remaining uncertainty
- **UNVERIFIED** Real Mauritius coverage, account entitlement, actual billing,
  provider response/cache freshness, directional alignment on surveyed roads,
  bridge-deck placement and native-device GPU performance.
- A retrieval timestamp does not establish provider observation time. Failures
  retain the eight-minute automatic retry interval; toggle off/on to retry.
- Browser checks establish DOM/state/geometry behavior, not pixel-perfect traffic
  appearance or surveyed geographic accuracy. Existing smoke checks obtained
  DEM data; these are not offline-only geographic validation.

### Source checks
- Traffic field values, left-hand line normalization and update cadence:
  https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/
- Attribution requirements: https://docs.mapbox.com/help/dive-deeper/attribution/
- Endpoint supports `.mvt`: https://docs.mapbox.com/api/maps/vector-tiles/
- Complete logo asset:
  https://raw.githubusercontent.com/mapbox/mapbox-gl-js/main/src/css/svg/mapboxgl-ctrl-logo.svg
  (downloaded SVG SHA-256 `138917d58861eb9d24f730936650d3dbb9b045e0897383fd76add833f83546cc`).

Status: **READY for local integration**, not verified for live traffic publication.
