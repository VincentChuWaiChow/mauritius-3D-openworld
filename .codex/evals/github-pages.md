# GitHub publication and Pages checks

## Scope

Import this source into `VincentChuWaiChow/mauritius-3D-openworld`, preserving
the existing `master` history. Configure a static Vite build for the project
site; do not redesign map rendering, change external data providers, or agent settings.
The user confirmed retaining the source MIT license, replacing the remote placeholder.

## Acceptance checks (defined before implementation)

- `npm test`: preserve all eight existing tests and add a production-build
  regression check for `/mauritius-3D-openworld/` HTML assets, local texture
  files, and the texture-sheet link.
- `npm ci --ignore-scripts && npm run build`: clean, lockfile-backed build.
- Serve `dist` under the project URL in Chrome: canvas and controls load;
  local assets have no missing requests. Separate external-service failures
  from publication regressions.
- Repair only the browser-discovered startup blockers: duplicate Three.js shader
  declarations and missing fog uniforms. Retain shared palette/time uniforms.
- Inspect the Pages workflow: push on `master`, manual dispatch, tests before
  build, upload only `dist`, required deployment permissions/environment.
- Inspect staged files for secrets and generated dependencies/builds.
- Normal fast-forward push only; local HEAD must equal remote `master`.
- Confirm the live Pages URL and Actions outcome if Pages is enabled;
  otherwise report the one-time settings step as unverified, not deployed.

## External prerequisites

SSH permits Git pushes but not Pages administration. Pages must use the
GitHub Actions publishing source; no new credentials will be requested or stored.

## Local verification report

- PASS: `npm test` baseline preserved eight existing tests. The Pages regression
  failed on root-relative asset URLs before the fix; the shader regression failed
  on duplicate declarations before the startup repair.
- PASS: `TMPDIR=/dev/shm npm ci --ignore-scripts`, `TMPDIR=/dev/shm npm test`
  (10/10), and `npm run build` (Vite 7.3.8, Three.js 0.181.2).
- PASS: local Chrome headless WebGL2/CDP smoke against `npm run preview --
  --host 127.0.0.1 --port 4175 --strictPort`: island-overview-ready status,
  12 destinations, working sunset palette and relief slider, correct texture link,
  no shader/runtime errors or application-asset HTTP failures. The three texture
  URLs returned HTTP 200; external map/terrain responses were observed.
- PASS: workflow YAML parse and structural assertions for `master`, manual
  dispatch, permissions, environment, test-before-build ordering and `dist` upload.
  Referenced GitHub action major-version tags were verified against GitHub.
- PASS: `git diff --cached --check`, credential-pattern scan, and
  `git check-ignore node_modules dist graphify-out .env`.
- PASS: `graphify update .`; generated navigation artifacts are ignored.
- UNVERIFIED here: live Pages deployment, native-GPU performance, every destination
  and Overpass buildings. Public services can fail or rate-limit independently.

The local `/tmp` filesystem was full; test scratch space used `/dev/shm` instead.
The build retains the existing non-fatal Three.js bundle-size warning.

Route: root integration/implementation plus `docs_researcher` for official-doc
checks and a read-only Three.js diagnosis. Its configured profile is
`gpt-6-luna` / `medium`; effective runtime model/effort was not independently
attested. No worker edits or external mutations. This avoided parallel writers
and kept all Git publication under the root agent.

Primary references:
- https://v7.vite.dev/guide/static-deploy
- https://github.com/actions/configure-pages/blob/main/action.yml
- Installed Three.js `WebGLProgram.js` (automatic shader declarations),
  `WebGLMaterials.js` (fog uniform access), and `UniformsLib.js` (fog definitions).

## Live workflow repair

The initial commit `6ce7591` preserved the remote's original commit and was
fast-forward pushed. GitHub recognized MIT and Pages activation. Run
`43369602568` passed install, all tests, build, Pages configuration and upload,
but deployment could not discover the artifact. The public run-artifacts API
confirmed `github-pages` existed (artifact `14012235904`).

This matches the reported same-job artifact-listing timing issue in
https://github.com/actions/deploy-pages/issues/451. One bounded workflow repair
separates build/upload from deployment using `needs: build`, as recommended in
https://github.com/actions/deploy-pages#usage. Only the deployment job receives
Pages-write and OIDC permissions. App source and action versions are unchanged.
The next run and public URL require fresh readback, not an assumed success.
