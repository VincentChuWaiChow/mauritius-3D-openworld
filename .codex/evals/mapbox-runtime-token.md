# Runtime Mapbox public token

## Definition before implementation

- User authorizes entering their own Mapbox token and immediate in-place traffic
  refresh. Interpretation: no page reload, rebuild or Vite restart to apply it.
- Scope: explorer traffic token validation/lifecycle and panel controls, focused
  Node/browser regressions, README and this record. Preserve the uncommitted
  adaptive three-column layout, weather behavior and existing build-token support.
  No dependencies, unrelated accessibility fixes, real credentials, commit/push.
- Public `pk.` tokens only; trim surrounding whitespace and reject secret/missing
  payload/embedded-whitespace values without applying or echoing them. This is
  format screening, not proof of Mapbox acceptance, entitlement or local coverage.
- Explicit Apply prevents per-keystroke network calls. Layer remains opt-in.
  If already enabled, applying/reapplying a valid token cancels pending work,
  disposes old ribbons, invalidates tile/refresh state and fetches with the new
  token without reloading the scene/page. Old responses cannot replace new ones.
- Clear removes the runtime token, aborts work, disables/unchecks live traffic and
  clears its ribbons/attribution. No local/session storage, URL persistence, logs
  or backend submission. On reload, use only the configured build-time default.
- UI: labeled masked token field, native compact disclosure, keyboard submit,
  explicit Clear, validation/status feedback, readable >=12px and >=44px actions.
- Capability graders: normalization tests; mocked browser no-token -> Apply A ->
  enable -> live replace B -> delayed A ignored -> reapply retry -> Clear; reject
  sk./invalid values; no request while typing; no stored/URL/debug-state token;
  reload clears override; original scene initialization identity is retained.
- Regression graders: existing traffic refresh/error/tile/visibility/overview and
  lazy decoder checks, eight-viewport layer-layout check, `npm test`,
  `npm run build`, `git diff --check`, AST graph update.
- Browser uses fixture tokens only and blocks external provider requests. Do not
  claim live Mapbox entitlement, billing, Mauritius coverage or physical-device
  performance. Local server retained; temporary test browser stopped afterward.

## Route

Parent implements/integrates/verifies. One docs_lookup (`gpt-6-luna`/medium,
declared read-only) checks primary Mapbox docs; one security_reviewer
(`gpt-6.1-sol`/high, declared read-only) reviews the final bounded change.
Role configuration verified; actual inference telemetry/isolation unavailable.
At most one implementation repair batch after integrated verification.

## Results

- PASS — baseline `npm test`: 99/99. Added normalization tests first: the expected
  red run failed because `normalizeTrafficToken` did not yet exist. Final suite:
  102/102; `npm run build`, browser-script syntax checks and `git diff --check`
  exited 0. Optional traffic decoders remain lazy dynamic chunks.
- PASS — production/no-default browser:
  `APP_URL=http://127.0.0.1:4185/mauritius-3D-openworld/
  CHROME_DEBUG_URL=http://127.0.0.1:9246 EXPECT_TRAFFIC_TOKEN=0 node
  scripts/check-traffic-browser.mjs` exited 0.
- PASS — separate fixture-default Vite browser:
  `APP_URL=http://127.0.0.1:4186/mauritius-3D-openworld/
  CHROME_DEBUG_URL=http://127.0.0.1:9246 node
  scripts/check-traffic-browser.mjs` exited 0. That isolated Vite process used
  `VITE_MAPBOX_PUBLIC_TOKEN=pk.fixture`; no .env/config/real credentials changed.
- Both modes verify no request on typing (including active traffic), rejected
  secret tokens, no automatic opt-in, same-tile Apply A -> B abort/replacement,
  stale completion isolation, same-token retry after 403, Clear during pending
  work, no stale ribbon/attribution after Clear, no storage writes/page-URL/debug
  token exposure, reload reset and unchanged scene-function identity across Apply.
  Original refresh, error/empty, visibility, tile-change, overview and decoder
  behavior also passed with mocked provider responses and HTTPS requests blocked.
- PASS — `scripts/check-layer-layout-browser.mjs` against production: eight
  viewports, adaptive three/two-column grid, token disclosure open/closed without
  horizontal overflow, >=44px controls and >=12px text. Desktop/phone captures of
  the open form inspected in `/tmp/mauritius-layer-tiles/token-{1440,375}.png`.
  Apply-button text contrast calculated as 4.67:1; existing status/tile palettes
  retained. External fonts blocked; screenshots are fallback-font/software proof.
- PASS — explicit comparison with pre-task snapshots: removing only the new token
  disclosure reproduces the prior HTML exactly; current CSS starts with the prior
  CSS unchanged. The user's uncommitted adaptive layout is preserved.
- PASS — focused independent security review: no blocking finding. Reviewer
  identified missing active-layer typing coverage; added it and both full browser
  modes passed. No production repair was needed.
- PASS — `graphify update .`: exit 0 (646 nodes / 1351 edges).
- Source/docs changed: `src/explorer/app.js`, `src/explorer/traffic.js`,
  `index.html`, `src/explorer/style.css`, `README.md`; graders changed:
  `tests/traffic.test.js`, `tests/explorer-layer-layout.test.js`,
  `scripts/check-traffic-browser.mjs`, `scripts/check-layer-layout-browser.mjs`.
  This record is new; pre-existing layout/evaluation changes remain uncommitted.
- Docs lookup verified public/secret token types and URL restrictions using
  official Mapbox token and traffic/vector-tile docs. In particular, localhost
  must be allowed when using a restricted token for local testing.
- UNVERIFIED — real Mapbox acceptance, account entitlement/usage limits, Mauritius
  traffic coverage, native GPU/device and screen-reader behavior. No actual user
  token used. The public token necessarily appears in the provider request URL;
  it is not persisted in the page URL/application storage/debug state.
- Existing unrelated page typography/contrast and mobile panel dismissal/ARIA
  warnings were not broadened into this task; no suppressions added.
- Temporary localhost processes and local socket checks required approved
  escalation. User's existing port-4000 app retained; temporary preview, fixture
  Vite and Chrome are stopped after verification. No commit, push or deployment.

Smallest capable route: parent-owned surgical implementation plus one narrow docs
lookup and one security review. Tests use actual token/request listeners rather
than a parallel implementation. Role configs verified; usage telemetry unavailable.
