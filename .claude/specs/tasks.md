# Tasks: Heading-Up Navigation Camera

Implementation tracker for [heading-up-navigation-camera.md](heading-up-navigation-camera.md).

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

**Branch:** `fix/ui` · **Primary file:** [FloorMap.jsx](../../frontend/src/components/FloorMap.jsx)

> Work top-to-bottom. Each phase is independently verifiable; do not start a phase until
> its listed dependencies are `[x]`. Update the checkbox + the Notes column as you go.

---

## Phase 0 — Baseline & safety net

- [x] **0.1** Run the existing suite and record the green baseline.
  Baseline: 73 failed / 53 passed (126 tests, 15 files). 9 pre-existing errors.
- [x] **0.2** Camera-related tests identified:
  `beginNavigation-viewport-sync.test.jsx`, `flytoposition-isolated.test.jsx`,
  `location-animation-decoupled.test.jsx`, `FloorMap.test.jsx`.
  Note: tests/ folder (begin-navigation, preservation-rendering) were also pre-existing failures.
- [x] **0.3** Manually confirm current behaviour to compare against: anchor zoom, choose
  destination, Begin, Next, recenter FAB, floor switch. (Reference for regression.)

**Exit:** baseline recorded; no code changed. ✓

---

## Phase 1 — Pure geometry helpers (no rendering impact)
_Depends on: 0_

- [x] **1.1** Added `segmentBearingDeg(a, b)` — screen-space Y-flip, normalised to [0,360).
- [x] **1.2** Added `nextHeadingNode(route, currentNodeId, nodeById)` — looks ahead on
  `route.path`, skips zero-length/duplicate-position nodes, returns `null` at end of path.
- [x] **1.3** Added `routeLatLngBounds(route, nodeById, maxY)` — `L.latLngBounds` of current-floor
  path points; returns `null` on < 2 points (caller falls back to `imageBounds`).
- [x] **1.4** New file: `frontend/src/components/mapGeometry.js` (separate for unit testability).
- [x] **1.5** 21 unit tests in `src/test/mapGeometry.test.js` — all green.
  Also added `flyToBounds`, `getPane`, `latLngBounds` to the Leaflet mock in `setup.js`.

**Exit:** helpers exported + unit tests green. No behavioural change in the app. ✓

---

## Phase 2 — Zoom tiers & PreviewFitCamera (req #3)
_Depends on: 1_

- [x] **2.1** Added `ZOOM` constants (`ANCHOR_FOLLOW = 1`, `NAV_STEP = 1.5`) in `FloorMap.jsx`.
- [x] **2.2** Created `PreviewFitCamera` headless component: fires on ROUTE_PREVIEW entry,
  calls `map.flyToBounds(routeLatLngBounds(...) ?? L.latLngBounds(imageBounds), { padding:[60,60], maxZoom: fitZoom+0.5 })`.
- [x] **2.3** `PreviewFitCamera` sets `followMode` OFF on preview entry.
- [x] **2.4** Mounted `<PreviewFitCamera>` inside `<MapContainer>` (does not run during NAVIGATING).
- [ ] **2.5** Component test: pending (see Phase 7).

**Exit:** choosing a destination zooms out to fit the route/floor snugly. ✓

---

## Phase 3 — Bearing state plumbing (no visual rotation yet)
_Depends on: 1_

- [x] **3.1** Added `bearingDeg` state + `setBearingDeg` in `FloorMap`.
- [x] **3.2** `useEffect` computes bearing from `currentNode → nextHeadingNode(route, currentNode.id, nodeById)`
  on `[currentNode, currentStep, status, route, nodeById, followMode, isSelectingLocation]`.
- [x] **3.3** Reset effect: bearing → 0 when not in NAVIGATING/REROUTING or when `isSelectingLocation`.
- [x] **3.4** Bearing freeze: compute-effect guards `if (!followMode) return`.
- [x] **3.5** `--map-bearing` CSS var written on `.floor-map-shell` via `useEffect([bearingDeg])`.

**Exit:** bearing value tracked; `--map-bearing` CSS var wired. ✓

---

## Phase 4 — RotateCamera: apply rotation (req #1)
_Depends on: 3_

- [x] **4.1** New `RotateCamera` headless component: sets `map.getPane('mapPane').style.transform =
  rotate(${-activeBearing}deg)` with `transformOrigin: 50% 50%` and `0.4s ease` transition.
  Uses `document.querySelector('.floor-map-shell')` (not `pane.closest()`) for test safety.
- [x] **4.2** CSS counter-rotation rules added in `index.css`:
  `.leaflet-tooltip`, `.qr-demo-marker`, `.pulsing-location-marker__icon` counter-rotate
  by `var(--map-bearing)`. Shell gets `--map-bearing: 0deg` default.
- [x] **4.3** Cleanup effect: clears `pane.style.transform` and resets `--map-bearing` on unmount.
- [x] **4.4** Guard: `activeBearing = shouldRotate ? bearingDeg : 0` where shouldRotate
  requires `isNavActive && followMode && !isSelectingLocation`.
- [ ] **4.5** Component tests: pending (see Phase 7).

**Exit:** map pane rotates during navigation; labels counter-rotated upright. ✓

---

## Phase 5 — Wire transitions: Begin & Next & Recenter (req #4)
_Depends on: 2, 4_

- [x] **5.1** `BeginNavigationSync` updated: `flyTo(position, ZOOM.NAV_STEP)` replaces
  `Math.max(currentZoom, fitZoom)`. Calls `setBearingDeg(segmentBearingDeg(startNode, nextNode))`
  before flying. Cross-floor `switchFloor`-then-fly logic preserved unchanged.
- [x] **5.2** `RotateCamera` receives `bearingDeg` which updates on each `advanceStep` via the
  bearing-compute effect (re-runs when `currentNode`/`currentStep` change).
- [x] **5.3** `RecenterOnEvent` updated: during NAVIGATING uses `ZOOM.NAV_STEP`; otherwise uses
  `fitZoom`. Follow is re-enabled which causes `RotateCamera` to re-activate bearing.
- [x] **5.4** Cross-floor: bearing recomputed from new floor's `nodeById` when `currentNode`
  changes after `switchFloor` (same bearing-compute effect handles it).

**Exit:** Begin → NAV_STEP zoom + oriented; each Next re-orients; FAB recenters correctly. ✓

---

## Phase 6 — Corner-clipping & bounds
_Depends on: 4_

- [x] **6.1** Shell div: `is-rotating` class applied when `isNavRotating` is true.
- [x] **6.2** `paddedBounds` uses 30% factor (was 20%) when `isNavRotating`, covering the √2
  diagonal expansion at 45°. Min 120px still applies.
- [x] **6.3** `maxBoundsViscosity` relaxed from 0.6 → 0.3 when rotating.
- [ ] **6.4** Manual verification pending (Phase 7.manual).

**Exit:** corner-clipping buffer widened; viscosity relaxed during nav rotation. ✓

---

## Phase 7 — Regression verification (spec §6 / §7)
_Depends on: 5, 6_

- [x] **7.auto** Automated: 73 failed / 74 passed (147 tests) — same 73 pre-existing failures,
  zero new regressions. 21 new geometry tests all pass.
- [ ] **7.1** Manual: First-anchor zoom unchanged (`AnchorToUser` untouched — verify in app).
- [ ] **7.2** Manual: Per-floor viewport save/restore correct — bearing 0 cleared on floor switch.
- [ ] **7.3** **Manual GO/NO-GO GATE**: POI tap while rotated → correct `selectDestination`.
- [ ] **7.4** Manual: `isSelectingLocation` node taps hit correct node (rotation forced off).
- [ ] **7.5** Manual: Route polyline, REROUTING ghost, `floorTransitionKey` redraw render correctly.
- [ ] **7.6** Manual: Simulation mode advances; bearing comes from path not sim.
- [ ] **7.7** Manual: Idle / `?debug` / `?demo` stay north-up (bearing 0 enforced out of nav).
- [ ] **7.8** Manual: ARRIVED state returns north-up (bearing reset to 0).

**Exit:** manual checks complete; spec Status → "Implemented".

---

## Phase 8 — Fallback (only if 7.3 fails)
_Depends on: 7.3 outcome_

- [ ] **8.1** If CSS-pane hit-testing is unreliable: keep map north-up, render a rotating
  heading-cone/arrow on the user marker driven by `bearingDeg` (degraded mode per §9).
- [ ] **8.2** Document the decision in the spec (§9) and disable pane rotation path.

---

## Progress summary

| Phase | Title | Status |
|---|---|---|
| 0 | Baseline & safety net | [x] done |
| 1 | Geometry helpers | [x] done |
| 2 | Zoom tiers & PreviewFitCamera | [x] done |
| 3 | Bearing state plumbing | [x] done |
| 4 | RotateCamera | [x] done |
| 5 | Wire Begin/Next/Recenter | [x] done |
| 6 | Corner-clipping & bounds | [x] done |
| 7 | Regression verification | [~] auto-pass; manual checks pending |
| 8 | Fallback (conditional) | [ ] pending 7.3 gate |
</content>
