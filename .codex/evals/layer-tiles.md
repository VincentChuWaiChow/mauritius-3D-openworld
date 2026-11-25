# Compact Layers & Style tiles

## Definition before UI changes

- Scope: `index.html` panel markup, `src/explorer/style.css` panel rules, focused
  layout regression graders and this record. No application JS, dependencies,
  unrelated panels, existing `.impeccable/` artifacts, commit or push changes.
- Preserve all eight checkbox labels, IDs/data-layer bindings, initial checked
  states, provider status/attribution, theme selector and both working sliders.
- Group checkboxes in a two-column/four-row grid of full-label clickable tiles.
  Native checkbox semantics, keyboard focus and disabled behavior must remain.
- Preserve the current cream/green identity (Impeccable layout, Operate mode).
  Tight gaps within the tile grid; distinct space before supporting status,
  theme and slider controls. No new decorative icons or JS-managed state.
- Browser checks at 1440x900, 768x1024, 375x812 and 320x640: exactly two equal
  columns/four rows; tile targets at least 44px tall; no horizontal overflow;
  wrapped labels and long status content; last slider reachable by panel scroll.
- Compare checkbox-block height with the pre-change browser measurement.
- Interaction checks: label clicks, keyboard Space/focus, selected appearance,
  disabled Mapbox tile and unchanged IDs; no browser runtime errors.
- Graders: focused Node test, mocked offline browser check with desktop/mobile
  screenshots, `npm test`, `npm run build`, `git diff --check`, final Impeccable
  mechanical detector and `graphify update .`.
- Bounded verification: one batched screenshot round, at most one fix batch and
  one confirmation round. Live weather/provider accuracy is outside scope.

## Team

Parent owns edits, mechanical checks and browser verification. One independent
layout reviewer (configured `gpt-6.1-sol`/high, declared read-only) assesses source
grouping and structural risks; actual inference settings/isolation unverified.

## Results

### Accepted three-column refinement

- User selected adaptive three columns: widen desktop panel, fall back to two
  columns on narrow phones, CSS-only, no animation or new dependencies.
- New layout acceptance: three equal columns/three rows at viewport width >=480px;
  two equal columns/four rows below 480px, unchanged full checkbox labels and 12px
  minimum text, >=44px targets, bounded panel and scroll access. Desktop panel
  width 480px; mobile remains viewport-bounded.
- Update the browser grader for 420px, 480px and 600px boundaries as well as the
  previous five viewports. Preserve all native control behavior and bindings.
- Independent Impeccable critique A and audit B completed on the two-column draft
  before this refinement. A consumed no detector findings; B used separate source
  scan and screenshots. Their subjective scores describe that draft, not the
  unbuilt three-column design. No new motion/decoration is authorized.
- Both passes noted readability/metadata density; audit also identified inherited
  mobile dismissal and Escape `aria-expanded` concerns. Those are reported,
  not silently rewritten as part of this CSS-only direction.

### Final three-column verification

- PASS — `rtk node scripts/check-layer-layout-browser.mjs`: eight viewports,
  including 420px (two columns), 480px (three columns), 600px and desktop/tablet.
  All assertions pass: responsive row/column counts, equal column widths,
  readable 12px labels/metadata, >=44px targets, wrapping, viewport containment,
  final slider scrolling, label/Space/focus/disabled states and slider input.
- Desktop checkbox grid: 148.75px (two-column draft: 198.75px). Desktop panel
  content: 517px (draft: 567px; original vertical list: 610px). Measured in local
  Chrome/software fallback with external fonts/providers blocked, not extrapolated
  to all devices or live fonts. At 320px, two columns and scrolling are retained.
- PASS — fresh `npm test`: 99/99; `npm run build`: exit 0; `git diff --check`:
  exit 0. `git diff --exit-code -- src/explorer/app.js src/explorer/weather.js
  package.json package-lock.json`: exit 0 (behavior/dependencies unchanged).
- PASS — independent WCAG contrast calculation for edited default-opacity text:
  tile unchecked 9.37:1, checked 8.81:1, status 7.24:1, links 7.94:1, disabled
  4.89:1. This is not a contrast claim for arbitrary user-selected transparency.
- PASS — `graphify update .`: exit 0, 645 nodes / 1340 edges.
- Assessment A: independent reviewer `impeccable_design_a`, configured
  `gpt-6.1-sol`/high, reviewed source and prior captures without detector output.
  Subjective draft score 25/40; no post-change score invented.
- Assessment B: independent reviewer `impeccable_audit_b`, configured
  `gpt-6.1-sol`/high, source detector/technical review and separate capture review.
  Draft technical score 13/20. Broad scan included duplicated target/root coverage:
  41 raw hits, 19 distinct file/rule/snippet signatures, mostly existing warnings
  outside this panel. Reused findings rather than running another broad scan.
- UNVERIFIED — no live detector overlay, independent physical-touch/screen-reader
  testing, real-device performance or downloaded-font pixel certification.
- MISS (inherited, outside selected CSS-only change) — mobile panel can obscure
  its existing close trigger; Escape hides the panel without resetting the
  trigger's `aria-expanded`. Explicitly reported for separate behavior work.
- No suppressions, commits or pushes. Existing port-4000 dev server retained;
  isolated test Chrome stopped after verification. Existing artifacts not removed.

### Two-column draft checks (before the user requested three columns)

- PASS — `node --test tests/explorer-layer-layout.test.js`: 2/2. All eight native
  checkbox bindings/initial states and supporting controls/attribution preserved.
- PASS — `npm test`: 99/99 (previous baseline 97/97); `npm run build`: exit 0;
  `git diff --check`: exit 0. Application JS and dependency files are unchanged.
- PASS — `rtk node scripts/check-layer-layout-browser.mjs`: five viewports
  (1440x900, 768x1024, 375x812, 320x640, 960x540), two columns/four rows, equal
  column widths, minimum 44px target height, minimum 12px tile/metadata text,
  viewport containment, no horizontal overflow, long-status wrapping, final
  slider reachable, label click/Space-key/focus/disabled states, transparency
  input and no runtime exceptions. Provider calls blocked; software fallback.
- Measured desktop content height: 610px before, 567px after. Panel width:
  434.5px before, 352px after. Bottom edge: 976px before (outside 900px window),
  884px after. At 320px viewport width, labels wrap and content scrolls; no claim
  that every viewport has lower total content height.
- Visual verification: desktop/mobile batch inspected, one UI fix batch enlarged
  panel text and compacted the desktop theme row, confirmation batch inspected.
  PNGs and measurements are in `/tmp/mauritius-layer-tiles/`; external webfonts
  were blocked, so screenshots use font fallbacks rather than claiming exact
  downloaded-font fidelity or native GPU proof.
- Grader repair: native scrolling rounded to integer offsets, leaving a measured
  0.34375px difference in a strict slider-bound assertion. Added a 1px geometry
  tolerance (not a UI workaround); the full confirmation then passed.
- PASS — Impeccable final layout scan:
  `impeccable detect --json --scope layout index.html src/explorer/style.css`
  returned `[]`. Broad initial scan was not globally clean (triage below).
- PASS — independent source assessment identified intrinsic-width and desktop
  containment risks; both were addressed and verified in the browser.
- PASS — source changes remain limited to panel HTML/CSS, focused graders and
  this record. Existing local server on port 4000 reused; no commit or push.

## Design detector triage

- Fixed in the edited panel: small control/provider text (now 12px), weak note
  color (now `#365e4f`), wrapping/width containment, desktop vertical containment,
  and explicit tile focus/disabled/selected states.
- No detector suppressions or ignore entries added.
- Left standing outside this narrow panel change: existing page-wide low-contrast
  colors (`#839881`, `#608779`, `#6c8476` and other aggregated matches), small
  header/footer/credits copy, existing colored/hard-offset shadows, hidden-region
  eyebrow markup and the existing loading-loop animation. The broad detector
  reports these without precise element locations; they were not treated as
  proof of a new regression or grounds for silently redesigning unrelated UI.
- Optional future handoff: Impeccable polish; `impeccable init` can capture the
  currently missing product/design context separately. Neither was run here.

## Files and remaining uncertainty

- `index.html`, `src/explorer/style.css`: compact panel structure and appearance.
- `tests/explorer-layer-layout.test.js`, `scripts/check-layer-layout-browser.mjs`:
  deterministic markup and local browser regression checks.
- `.codex/evals/layer-tiles.md`: scope and evidence.
- UNVERIFIED: screen-reader/device testing, downloaded-font pixel fidelity and
  live provider behavior; unchanged/outside layout scope. Token usage unavailable.
