# Implementation Plan

## Overview

This plan fixes the QR Nav UI regressions described in `design.md` using the bugfix exploration methodology: write exploration tests that fail on the unfixed code (confirming each regression), write preservation tests that pass on the unfixed code (capturing behavior to keep), apply surgical view-layer fixes, then re-run both sets to confirm the bugs are fixed and nothing else changed. All fixes are confined to `FloorMap.jsx`, `FloorPlanLayer.jsx`, `BottomSheet.jsx`, `FABGroup.jsx`, and `App.jsx` wiring; `useNavStore.js` action bodies and backend contracts are out of scope.

## Task Dependency Graph

```
1 (test tooling)
├── 2,3,4,5,6,7,8 (bug condition exploration tests — fail on unfixed code)
└── 9,10 (preservation property tests — pass on unfixed code)
        │
        ▼
11 (apply fixes)
├── 11.1 ── validated by ──► 2, 8
├── 11.2 ── validated by ──► 6
├── 11.3 ── validated by ──► 3
├── 11.4 ── validated by ──► 4
├── 11.5 ── validated by ──► 5
├── 11.6 ── validated by ──► 7
├── 11.7 (fix checking)      ──► re-run 2–8 (now pass)
└── 11.8 (preservation check)──► re-run 9–10 (still pass)
        │
        ▼
12 (checkpoint: full suite + lint + build)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "dependsOn": []
    },
    {
      "wave": 2,
      "tasks": ["2", "3", "4", "5", "6", "7", "8", "9", "10"],
      "dependsOn": ["1"]
    },
    {
      "wave": 3,
      "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"],
      "dependsOn": ["2", "3", "4", "5", "6", "7", "8", "9", "10"]
    },
    {
      "wave": 4,
      "tasks": ["11.7", "11.8"],
      "dependsOn": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"]
    },
    {
      "wave": 5,
      "tasks": ["12"],
      "dependsOn": ["11.7", "11.8"]
    }
  ]
}
```

## Tasks

- [x] 1. Set up frontend test tooling for exploration and preservation tests
  - Add Vitest, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, and `fast-check` (for property-based tests) as devDependencies in `frontend/package.json`
  - Add a `test` script (e.g., `vitest run`) and configure Vitest with the `jsdom` environment and a setup file
  - Add a Leaflet/`react-leaflet` mock helper so map interactions (`map.flyTo`, `map.setView`) can be spied on in component tests
  - **NOTE**: This is infrastructure only — it does not implement or fix any behavior
  - _Requirements: supports validation of all requirements_

- [ ] 2. Write bug condition exploration test — floor switching / hook ordering
  - **Property 1: Bug Condition** - Floor switching renders the selected floor correctly
  - **CRITICAL**: This test MUST FAIL (or emit a hook-order warning) on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the hook-order instability and floor-switch corruption
  - **Scoped PBT Approach**: Scope the property to concrete failing cases first — render `FloorMap` with `floor = null`, then transition to a floor object, then switch Floor 1 → Floor 2 (idle and mid-`NAVIGATING`)
  - Assert React logs NO Rules-of-Hooks warning/error when `floor` toggles between absent and present (Bug Condition context 1, `floorSwitch` / `floor_data_transition`)
  - Assert the selected floor's plan, route polyline, location marker, and POI/QR markers render for every floor, not only the initially loaded one (from Expected Behavior 2.1, 2.2, 2.3)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS / warns (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "hook-order warning fired; markers blank/stale after switch to Floor 2")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Write bug condition exploration test — bottom sheet draggable slider
  - **Property 2: Bug Condition** - Bottom sheet behaves as a compact, draggable slider
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples showing the sheet cannot be dragged and covers the map on `NAVIGATING`
  - **Scoped PBT Approach**: Scope to concrete gestures — fire `pointerdown`/`pointermove`/`pointerup` on the `BottomSheet` drag handle, and render the sheet in the first `NAVIGATING` state
  - Assert the sheet height/translate changes in response to the drag and settles into a defined snap state (collapsed or expanded) (from Expected Behavior 2.4)
  - Assert that on first entering `NAVIGATING` the sheet height is compact (below a map-visibility threshold) (from Expected Behavior 2.5)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (no pointer handlers / fixed full-height overlay)
  - Document counterexamples found (e.g., "sheet height unchanged after drag; full-height sheet on NAVIGATING")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.4, 1.5_

- [ ] 4. Write bug condition exploration test — upgraded location overlays
  - **Property 3: Bug Condition** - Upgraded location overlays
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples showing the legacy `EntryPrompt` renders for both overlays
  - **Scoped PBT Approach**: Scope to the two overlay openings — `open_overlay` with `overlay = 'update_location'` and `overlay = 'where_are_you'`
  - Assert the upgraded location UI (new design-system marker/test id) is present and the legacy `EntryPrompt` is absent for both overlays (from Expected Behavior 2.6, 2.7)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (legacy `EntryPrompt` still rendered)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.6, 1.7_

- [ ] 5. Write bug condition exploration test — obsolete top-bar removed and status reflected
  - **Property 4: Bug Condition** - Obsolete top-bar controls removed and status reflected
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples showing the redundant header "Update" control and the header not reflecting `status`
  - **Scoped PBT Approach**: Scope to `render_shell` and `status_change` across `UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED`
  - Assert NO redundant top-bar "Update" control exists (no duplicate location-update action) (from Expected Behavior 2.8)
  - Assert the surviving header/status surface reflects the current navigation `status` for each transition (from Expected Behavior 2.9)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (legacy `app-header`/`LocationBar` "Update" present; header shows only node label)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.8, 1.9_

- [ ] 6. Write bug condition exploration test — Begin Navigation viewport sync
  - **Property 5: Bug Condition** - Begin Navigation synchronises the viewport
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface a counterexample showing no camera/floor sync on `ROUTE_PREVIEW → NAVIGATING`
  - **Scoped PBT Approach**: Scope to the concrete `begin_navigation` input from `ROUTE_PREVIEW`
  - Assert `map.flyTo`/`map.setView` is invoked targeting the starting node's position and the active floor matches the start node when "Begin Navigation" is tapped (from Expected Behavior 2.10)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (no camera move on begin)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.10_

- [ ] 7. Write bug condition exploration test — FAB accessibility and availability
  - **Property 6: Bug Condition** - FAB accessibility and availability
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples showing FABs obscured by the expanded sheet and the QR FAB gated behind demo mode
  - **Scoped PBT Approach**: Scope to `render_fab` with `sheetState = 'expanded'`, and `render_fab` with `isDemoMode = false` and `status IN ['UNLOCATED','ANCHORED']`
  - Assert the QR and re-center FABs remain visible and offset above the current bottom-sheet height, with `min-width`/`min-height` ≥ 42px and safe-area inset padding (from Expected Behavior 2.11)
  - Assert the QR scan FAB is present in non-demo use whenever re-anchoring is valid (from Expected Behavior 2.12)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (FABs not offset above sheet; QR FAB absent in non-demo mode)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.11, 1.12_

- [ ] 8. Write bug condition exploration test — location animation decoupled from camera
  - **Property 7: Bug Condition** - Location animation decoupled from the camera
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface a counterexample showing `FlyToPosition` pans the whole map during a location-dot animation
  - **Scoped PBT Approach**: Scope to a concrete `location_update` (QR scan and manual node select) where the location dot animates
  - Assert `map.flyTo` is NOT called for the location-dot (`currentPos`) change while the marker/`animatedPosition` updates (from Expected Behavior 2.13)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (flyTo fires on location update)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.13_

- [ ] 9. Write preservation property tests — state machine, backend contracts, and QR reroute (BEFORE implementing fix)
  - **Property 8: Preservation** - State machine, backend contracts, and QR reroute unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (`isBugCondition` false): record `status`/state results for random valid action sequences over `anchorLocation`, `selectDestination`, `beginNavigation`, `advanceStep`, `updateLocation`, `cancelNavigation`, `completeNavigation`, `switchFloor`
  - Observe and record the arguments passed to `computeRoute`/`scanQR`/`fetchFloor(s)`/`searchPOIs`/`logEvent`, and that QR-scan-during-navigation still reroutes via `anchorLocation`/`updateLocation`
  - Write property-based tests (fast-check) asserting the store transition graph and backend call arguments match the observed baseline across generated action sequences (from Preservation Requirements 3.1, 3.2, 3.4)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 10. Write preservation property tests — existing rendering and UI surfaces (BEFORE implementing fix)
  - **Property 9: Preservation** - Existing rendering and UI surfaces unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs: single-floor rendering of plan/polyline/markers (no floor switch), Floor_Selector_Widget listing one button per floor with active highlight (>1 floor), Instruction_Card turn icon/text/distance while `NAVIGATING`, three-layer pulsing marker with green confirmation flash, and explicit re-center (`map:recenter`)/"Fit" fly-to at fit zoom
  - Write property-based tests capturing observed behavior patterns across the relevant input domain (random floor sets without switching, random valid steps for the instruction card, explicit re-center events) (from Preservation Requirements 3.3, 3.5, 3.6, 3.7, 3.8)
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.3, 3.5, 3.6, 3.7, 3.8_

- [ ] 11. Fix for QR Nav UI regressions (floor switching, sheet, overlays, top bar, begin-nav, FABs, camera coupling)

  - [ ] 11.1 Hoist React hooks above the early return in `FloorMap` and decouple the camera from the location animation
    - In `frontend/src/components/FloorMap.jsx`, move `const hasSavedViewportRef = useRef(false);` and `const handleHasSaved = (val) => { hasSavedViewportRef.current = val; };` to the top of the component alongside the other hooks, keeping `if (!floor) return null;` AFTER all hook declarations so the hook list is invariant across `floor` presence transitions
    - In `FlyToPosition`, remove/neutralise the automatic `map.flyTo(currentPos, ...)` on `currentNode`/`currentPos` change so a location update no longer pans the map; the dot continues animating via `animatedPosition`/`PulsingLocationMarker`
    - Retain `RecenterOnEvent` (`map:recenter`) and `ViewportResetControl` ("Fit") for user-initiated camera moves
    - _Bug_Condition: isBugCondition(input) via `floorSwitch`/`floor_data_transition` and `cameraCoupling` (location_update) from design_
    - _Expected_Behavior: expectedBehavior(result) — Properties 1 and 7 from design_
    - _Preservation: Preservation Requirements 3.3, 3.8 (single-floor render, explicit re-center) from design_
    - _Requirements: 2.1, 2.2, 2.3, 2.13_

  - [ ] 11.2 Add Begin-Navigation viewport sync in the view layer
    - Add a focused effect (or reuse the recenter event) that, on the `ROUTE_PREVIEW → NAVIGATING` transition, centers the camera on the starting node's position at the appropriate zoom and ensures the active floor matches the start node
    - Implement in the view layer only — do NOT modify `beginNavigation` store semantics in `useNavStore.js`
    - _Bug_Condition: isBugCondition(input) via `beginNav` from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 5 from design_
    - _Preservation: Preservation Requirement 3.1 (store action semantics unchanged) from design_
    - _Requirements: 2.10_

  - [ ] 11.3 Make `BottomSheet` a draggable slider with snap states
    - In `frontend/src/components/BottomSheet.jsx`, introduce sheet height/translate state and a snap model (e.g., `collapsed`, `expanded`) driven by `onPointerDown`/`onPointerMove`/`onPointerUp` on the drag handle, with velocity/threshold-based snapping
    - Default the `NAVIGATING` state to the compact snap so the map stays visible
    - Continue dispatching `bottomsheet:resize` with the live height so FABs and map padding track the sheet
    - _Bug_Condition: isBugCondition(input) via `sheetInteraction` (sheet_drag / status_change NAVIGATING) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 2 from design_
    - _Preservation: Preservation Requirement 3.6 (instruction card content unchanged) from design_
    - _Requirements: 2.4, 2.5_

  - [ ] 11.4 Replace the legacy `EntryPrompt` with the upgraded location UI for both overlays
    - In `frontend/src/App.jsx`, route both the first-run "Where are you?" (`entry`) and "Update location" (`update`) overlays through the upgraded location UI consistent with the new design system, replacing `EntryPrompt` for both `entryMode` values
    - Keep the existing `onScan`/`onSelect`/`onClose` handlers and `locationOptions` data flow intact
    - _Bug_Condition: isBugCondition(input) via `legacyOverlay` (update_location / where_are_you) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 3 from design_
    - _Preservation: Preservation Requirement 3.4 (QR reroute flow unchanged) from design_
    - _Requirements: 2.6, 2.7_

  - [ ] 11.5 Remove legacy top-bar controls and reflect navigation status
    - In `frontend/src/App.jsx`, remove the obsolete `app-header` controls — specifically the redundant `LocationBar` "Update" button and duplicate location surface
    - Either drop `LocationBar` from the header or reduce the header to a minimal status-reflecting surface mapping `status` (`UNLOCATED/ANCHORED/ROUTE_PREVIEW/NAVIGATING/REROUTING/ARRIVED`) to an appropriate label; the bottom sheet remains the single source of the update action
    - _Bug_Condition: isBugCondition(input) via `legacyTopBar` (render_shell / status_change) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 4 from design_
    - _Preservation: Preservation Requirement 3.1 (status values from store unchanged) from design_
    - _Requirements: 2.8, 2.9_

  - [ ] 11.6 Ungate the QR FAB and lift the FAB group above the sheet
    - In `frontend/src/App.jsx`, change the QR FAB gating so `showQR` no longer depends on `isDemoMode`; compute availability from a valid re-anchoring context (`status === 'UNLOCATED' || status === 'ANCHORED'`, scanner closed, not `ARRIVED`). Demo-only tappable QR markers in `FloorMap` remain demo-gated and unchanged
    - In `frontend/src/components/FABGroup.jsx` (and associated CSS in `index.css`), offset the FAB group vertically above the current bottom-sheet height (consume the `bottomsheet:resize` height via a CSS variable or local state), add `env(safe-area-inset-bottom/right)` padding, and enforce `min-width: 42px; min-height: 42px` per FAB
    - _Bug_Condition: isBugCondition(input) via `fabIssue` (render_fab expanded / non-demo re-anchor) from design_
    - _Expected_Behavior: expectedBehavior(result) — Property 6 from design_
    - _Preservation: Preservation Requirement 3.8 (re-center FAB fly-to unchanged) from design_
    - _Requirements: 2.11, 2.12_

  - [ ] 11.7 Verify bug condition exploration tests now pass (fix checking)
    - **Property 1: Expected Behavior** - Floor switching renders the selected floor correctly
    - **Property 2: Expected Behavior** - Bottom sheet behaves as a compact, draggable slider
    - **Property 3: Expected Behavior** - Upgraded location overlays
    - **Property 4: Expected Behavior** - Obsolete top-bar controls removed and status reflected
    - **Property 5: Expected Behavior** - Begin Navigation synchronises the viewport
    - **Property 6: Expected Behavior** - FAB accessibility and availability
    - **Property 7: Expected Behavior** - Location animation decoupled from the camera
    - **IMPORTANT**: Re-run the SAME tests from tasks 2–8 - do NOT write new tests
    - The tests from tasks 2–8 encode the expected behavior; when they pass, they confirm each regression is fixed
    - Run the bug condition exploration tests from tasks 2–8
    - **EXPECTED OUTCOME**: All tests PASS (confirms the bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13_

  - [ ] 11.8 Verify preservation tests still pass (preservation checking)
    - **Property 8: Preservation** - State machine, backend contracts, and QR reroute unchanged
    - **Property 9: Preservation** - Existing rendering and UI surfaces unchanged
    - **IMPORTANT**: Re-run the SAME tests from tasks 9–10 - do NOT write new tests
    - Run the preservation property tests from tasks 9–10
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — non-buggy behavior unchanged)
    - Confirm all tests still pass after the fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Run the full frontend test suite (exploration tests from tasks 2–8, preservation tests from tasks 9–10) plus `npm run lint` and `npm run build`
  - Ensure all tests pass and the build succeeds; ask the user if questions arise
  - _Requirements: all_

## Notes

- **Methodology**: Exploration tests (tasks 2–8) MUST FAIL on the unfixed code — a failure confirms the regression exists and the test encodes the expected post-fix behavior. Do not "fix" a failing exploration test; it is meant to fail until the implementation lands.
- **Observation-first preservation**: Preservation tests (tasks 9–10) MUST PASS on the unfixed code first, capturing real baseline behavior, then must still pass after the fix.
- **Property/hover mapping**: Property numbers match `design.md` — Properties 1–7 are Bug Conditions (validated by tasks 2–8 and re-checked in 11.7), Properties 8–9 are Preservation (tasks 9–10, re-checked in 11.8).
- **Out of scope (preservation guards)**: `useNavStore.js` action bodies and transition graph, backend routes/schemas, `FloorSelector.jsx` listing/highlight, `InstructionCard`, `PulsingLocationMarker` visuals/flash, and the `RecenterOnEvent`/`ViewportResetControl` user-initiated camera flows.
- **Long-running commands**: Run dev server (`npm run dev`) and watch-mode tests manually; use `vitest run` (single execution) for task verification.

## Notes

- No test framework exists in `frontend/` yet, so task 1 sets up Vitest + React Testing Library + jsdom + fast-check (for property-based tests) before any tests are written.
- Exploration tests (tasks 2–8, Property N: Bug Condition) MUST fail on the unfixed code; preservation tests (tasks 9–10, Property N: Preservation) MUST pass on the unfixed code. Do not adjust tests or code to force an early-expected outcome.
- After the fix, the SAME exploration tests are re-run as fix checking (task 11.7, Property N: Expected Behavior) and the SAME preservation tests as preservation checking (task 11.8) — no new tests are written for verification.
- The fix is surgical and confined to the view layer and overlay wiring (`FloorMap.jsx`, `FloorPlanLayer.jsx`, `BottomSheet.jsx`, `FABGroup.jsx`, `App.jsx` + `index.css`). `store/useNavStore.js` action bodies, the state-machine transition graph, and backend routes/schemas are out of scope (preservation guards for Properties 8–9).
- The `**Property N:**` format on test tasks drives hover status: Property 1–7 = Bug Condition / Expected Behavior, Property 8–9 = Preservation.
- The final checkpoint (task 12) also runs `npm run lint` (`eslint .`) and `npm run build` (`vite build`) in addition to the full test suite.
