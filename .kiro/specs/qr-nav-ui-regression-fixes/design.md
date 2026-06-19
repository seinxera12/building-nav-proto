# QR Nav UI Regression Fixes Bugfix Design

## Overview

The `qr-nav-ui-upgrade` work moved the frontend to a three-layer map architecture (floor-plan overlay → route polyline → live markers) with a floating bottom sheet, floating action buttons (FABs), a floor selector, and an instruction card. That migration left the UI in a half-converted state: some new surfaces coexist with legacy ones, a React Rules-of-Hooks violation destabilises floor-switch rendering, the bottom sheet is a static overlay rather than a slider, the camera is hard-coupled to the location-dot animation, and the QR FAB is gated behind demo mode.

This document performs root-cause analysis for each regression captured in `bugfix.md`, formalises a single composite **bug condition** that selects the inputs/contexts where any regression manifests, and defines the **expected behaviour** for those inputs along with the **preservation requirements** that must hold for every other input. The fix strategy is deliberately surgical: each change targets a specific defective code path in `App.jsx`, `FloorMap.jsx`, `FloorPlanLayer.jsx`, `BottomSheet.jsx`, `FABGroup.jsx`, and `App.jsx`'s overlay wiring, while leaving the Zustand state-machine semantics (`store/useNavStore.js`) and the backend routing/scan contracts untouched.

The validation approach is two-phase: first reproduce each regression with exploratory tests against the current (unfixed) code to confirm the root cause, then apply the fix and verify both that the bug is resolved (fix checking) and that non-buggy behaviour is byte-for-byte unchanged (preservation checking).

## Glossary

- **Bug_Condition (C)**: The composite condition that selects an input/UI context that triggers any of the documented QR Nav UI regressions (floor switching, hook ordering, bottom-sheet interaction, legacy overlays, legacy top bar, begin-navigation viewport sync, FAB accessibility/gating, location-animation camera coupling). `isBugCondition(input)` returns `true` for these.
- **Property (P)**: The desired behaviour when the bug condition holds — the corrected rendering, interaction, or wiring described in section 2 of `bugfix.md` (`expectedBehavior(result)`).
- **Preservation**: Behaviour that must remain identical before and after the fix for any input where the bug condition does NOT hold — state-machine semantics, backend contracts, single-floor rendering, QR reroute flow, floor selector, instruction card, pulsing marker, and explicit re-center.
- **FloorMap**: The Leaflet `CRS.Simple` map component in `frontend/src/components/FloorMap.jsx`. Hosts child controls (`FitBounds`, `FlyToPosition`, `FloorViewportPersistence`, `RecenterOnEvent`) and the position-animation `requestAnimationFrame` loop.
- **FlyToPosition**: The child component inside `FloorMap` that calls `map.flyTo(currentPos, ...)` whenever the anchored `currentNode` position changes. This is the camera/location coupling point.
- **FloorPlanLayer**: The `ImageOverlay` component in `frontend/src/components/FloorPlanLayer.jsx` that crossfades the floor-plan image on `floorId` change and emits `floorplan:transitionend`.
- **BottomSheet**: The floating navigation panel in `frontend/src/components/BottomSheet.jsx`. Renders idle / preview / navigation states and dispatches `bottomsheet:resize`. Its drag handle is currently visual-only.
- **FABGroup**: The floating action buttons (QR scan + re-center) in `frontend/src/components/FABGroup.jsx`, gated by `showQR`/`showRecenter` props supplied from `App.jsx`.
- **EntryPrompt**: The legacy location-entry dialog in `frontend/src/components/EntryPrompt.jsx`, currently reused for both first-run "Where are you?" and "Update location".
- **LocationBar / app-header**: The legacy top bar rendered in `App.jsx` (`<header className="app-header">` + `<LocationBar>`), containing a redundant "Update" button.
- **status**: The navigation state-machine value from `useNavStore` (`UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → REROUTING → ARRIVED`).
- **animatedPosition / currentNode**: Store fields. `animatedPosition` (ghost) is updated each animation frame by the `FloorMap` motion loop; `currentNode` is the anchored/route node. The pulsing marker renders `ghostPos || currentPos`.

## Bug Details

### Bug Condition

The bug manifests across eight distinct but related UI/rendering contexts. The current code is defective when an input drives any of these contexts:

1. **Floor switch / floor-data transition** — switching floors via the Floor_Selector_Widget, or `floor` transitioning between absent and present, renders only the initially loaded floor correctly. The root cause is a Rules-of-Hooks violation in `FloorMap`: `useRef`/`handleHasSaved` are declared *after* `if (!floor) return null;`, so when `floor` toggles presence the hook order changes and React reconciliation becomes unstable, corrupting subsequent floor-switch renders of the plan, polyline, and markers.
2. **Bottom sheet interaction** — the sheet renders as a fixed overlay; its drag handle has no pointer/touch handlers and there are no snap/height states, so it cannot be dragged, collapsed, or expanded, and it occupies excessive space when navigation first becomes active.
3. **Location overlays** — "Update location" and first-run "Where are you?" both render the legacy `EntryPrompt` instead of the upgraded UI.
4. **Legacy top bar** — the `app-header` + `LocationBar` renders obsolete controls (including a redundant "Update" button) and does not reflect the current navigation status.
5. **Begin Navigation** — tapping "Begin Navigation" sets `status = NAVIGATING` but does not synchronise the map viewport/camera and floor to the starting position.
6. **FAB accessibility** — the QR and re-center FABs are obscured behind the bottom sheet in expanded states and do not reliably honour safe-area insets or a 42px minimum touch target.
7. **FAB gating** — the QR scan FAB is gated entirely behind demo mode (`canScan = isDemoMode && ...`), so users cannot re-anchor via the QR FAB in normal use.
8. **Location-update camera coupling** — when the location dot animates to a new position, `FlyToPosition` pans the whole map in lockstep, visually dragging POI markers and the floor plan.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UIInteraction
         { kind, status, floorBefore, floorAfter, sheetState, overlay, isDemoMode, viewport }
  OUTPUT: boolean

  // 1. Floor switching / floor-data presence transition
  floorSwitch := (input.kind == 'floor_switch' AND input.floorAfter != input.floorBefore)
                 OR (input.kind == 'floor_data_transition')

  // 2. Bottom sheet drag / size when navigation becomes active
  sheetInteraction := input.kind == 'sheet_drag'
                      OR (input.kind == 'status_change' AND input.status == 'NAVIGATING')

  // 3. Legacy location overlays
  legacyOverlay := input.kind == 'open_overlay'
                   AND input.overlay IN ['update_location', 'where_are_you']

  // 4. Legacy top bar present / not reflecting status
  legacyTopBar := input.kind == 'render_shell'
                  OR (input.kind == 'status_change')

  // 5. Begin Navigation viewport sync
  beginNav := input.kind == 'begin_navigation'

  // 6/7. FAB accessibility + gating
  fabIssue := (input.kind == 'render_fab' AND input.sheetState == 'expanded')
              OR (input.kind == 'render_fab' AND NOT input.isDemoMode
                  AND input.status IN ['UNLOCATED', 'ANCHORED'])

  // 8. Location-update animation couples camera
  cameraCoupling := input.kind == 'location_update'   // qr_scan OR manual_select
                    AND locationDotAnimates(input)

  RETURN floorSwitch OR sheetInteraction OR legacyOverlay OR legacyTopBar
         OR beginNav OR fabIssue OR cameraCoupling
END FUNCTION
```

### Examples

- **Floor switch corruption (1.1, 1.3):** Load Ground Floor, tap "F2" in the Floor_Selector_Widget. Expected: Floor 2 plan, POI/QR markers, and any route render. Actual: only the initial floor renders reliably; subsequent switches show stale/blank markers because the post-`return` `useRef` desynchronises React's hook list.
- **Floor switch during navigation (1.2):** While `NAVIGATING`, an instruction crosses to Floor 2 (`switchFloor`). Expected: polyline, location marker, and markers redraw for Floor 2. Actual: inconsistent redraw of the now-visible floor.
- **Bottom sheet static (1.4, 1.5):** Drag the sheet handle upward. Expected: the sheet follows the gesture and snaps to a collapsed/expanded height. Actual: nothing moves; on entering `NAVIGATING` the sheet covers most of the map.
- **Legacy overlay (1.6, 1.7):** Tap "Update" / first launch with no `loc` param. Expected: upgraded location UI. Actual: legacy `EntryPrompt` dialog.
- **Legacy top bar (1.8, 1.9):** App renders the `app-header` with a duplicate "Update" button; during `ROUTE_PREVIEW`/`NAVIGATING` the bar still shows only the raw node label, not the navigation state.
- **Begin Navigation (1.10):** From `ROUTE_PREVIEW`, tap "Begin Navigation". Expected: camera snaps/flies to the starting node on the correct floor. Actual: viewport stays wherever the user left it.
- **FAB obscured / gated (1.11, 1.12):** With the sheet expanded the QR/re-center FABs sit behind it; in normal (non-demo) use the QR FAB is absent entirely.
- **Camera coupling (1.13):** Scan a QR or pick a node to update location. Expected: the dot glides to the new node while the map holds still. Actual: `map.flyTo` pans the entire map (and POI markers) along with the dot.
- **Edge case — single floor, no switch (preserve 3.3):** User stays on one floor; rendering must continue to work exactly as today (this input is NOT a bug condition).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The Zustand state-machine actions (`beginNavigation`, `advanceStep`, `cancelNavigation`, `completeNavigation`, `anchorLocation`, `selectDestination`, `updateLocation`, `switchFloor`) keep their existing semantics and transition graph (3.1).
- Backend pathfinding, node/edge schemas, and API contracts (`computeRoute`, `scanQR`, `fetchFloor(s)`, `searchPOIs`, `logEvent`) are called exactly as before (3.2).
- Single-floor rendering of plan, polyline, location marker, and POI/QR markers when the user does not switch floors (3.3).
- QR-scan-during-navigation reroute via `anchorLocation`/`updateLocation` (3.4).
- Floor_Selector_Widget listing one button per loaded floor and highlighting the active floor when more than one floor is loaded (3.5).
- Instruction_Card turn icon, text, and distance for the current step while navigating (3.6).
- Three-layer pulsing location marker and the green confirmation flash on update completion (3.7).
- Re-center FAB / "Fit" control flying to the current anchored position at the computed fit zoom (3.8).

**Scope:**
All inputs where `isBugCondition` returns `false` must be completely unaffected by this fix. This includes:
- Any state-machine transition triggered by store actions (the fix must not change store action bodies).
- Any backend request/response handling.
- Rendering and interaction while remaining on a single floor.
- The explicit user-initiated re-center (`map:recenter`) and "Fit" flows, which must still pan/zoom the camera.

**Note:** The corrected behaviour for buggy inputs is specified in the Correctness Properties section (Properties 1–7). This section enumerates what must NOT change.

## Hypothesized Root Cause

1. **React Rules-of-Hooks violation in `FloorMap` (1.1, 1.2, 1.3 / drives all floor-switch rendering).** `FloorMap` executes `if (!floor) return null;` and only *afterwards* declares `const hasSavedViewportRef = useRef(false);` and `const handleHasSaved = ...`. Because `floor` toggles between `null` (loading/switch) and an object, the number of hooks invoked per render changes. React's hook list desynchronises, producing unstable renders that corrupt floor-switch redraws of the plan, polyline, and markers. Fix: hoist all hooks above every early return.

2. **No drag gesture model in `BottomSheet` (1.4, 1.5).** The component renders a `bottom-sheet__handle` pill marked `aria-hidden` with no `onPointerDown`/move/up handlers, no height/translate state, and no snap points. It is a fixed-size overlay. The `NAVIGATING` state renders all nav content at full height, covering the map. Fix: add a pointer-driven drag controller with defined snap states (collapsed / expanded) and a compact default height for `NAVIGATING`.

3. **Legacy `EntryPrompt` still wired for both overlays (1.6, 1.7).** `App.jsx` renders `<EntryPrompt mode={entryMode} ...>` for both `entry` and `update`, where `entryMode = updatePromptOpen ? 'update' : 'entry'`. The upgraded design system surface was never substituted. Fix: route both overlays through the upgraded location UI.

4. **Legacy top bar carried over (1.8, 1.9).** `App.jsx` still renders `<header className="app-header">` containing the brand plus `<LocationBar onUpdateLocation={() => setUpdatePromptOpen(true)} />`. `LocationBar` exposes a second "Update" button (duplicating the bottom sheet's update action) and renders only the node label/floor, never the navigation `status`. Fix: remove the obsolete controls (the redundant Update button and duplicate location surface); keep only a minimal status-reflecting header or fold status into a surviving surface.

5. **`beginNavigation` performs no viewport sync (1.10).** The store's `beginNavigation` only mutates state (`status`, `currentStep`, ...); it does not move the camera. `FlyToPosition` only reacts to a *change* in `currentPos`, and `currentNode` does not change at begin time, so no fly occurs. Fix: on the `ROUTE_PREVIEW → NAVIGATING` transition, sync the viewport/floor to the starting node from the view layer (without altering store semantics) — e.g., dispatch a recenter/sync event in the `beginNavigation` click path or an effect keyed on the transition.

6. **FAB positioning ignores sheet height and safe areas (1.11).** `FABGroup` is positioned purely by static CSS and is not lifted above the bottom sheet. The sheet already dispatches `bottomsheet:resize` with its height, but the FABs do not consume it. Safe-area insets and a 42px minimum target are not enforced. Fix: offset the FAB group above the current sheet height (via the `bottomsheet:resize` event / CSS variable), honour `env(safe-area-inset-*)`, and enforce `min-width/height: 42px`.

7. **QR FAB gated behind demo mode (1.12).** In `App.jsx`, `canScan = isDemoMode && (status === 'UNLOCATED' || status === 'ANCHORED')` and `showQR={... && canScan}`. The `isDemoMode` term suppresses the QR FAB entirely in normal use. Fix: gate QR FAB visibility on a valid re-anchoring context (status in `UNLOCATED`/`ANCHORED`, scanner closed, not `ARRIVED`) independent of demo mode. (Demo-only tappable QR map markers in `FloorMap` stay demo-gated.)

8. **`FlyToPosition` couples camera to the location animation (1.13).** `FlyToPosition` calls `map.flyTo(currentPos, zoom, { duration: 1.2 })` on every `currentNode` change, including location updates. This pans the whole map (and its markers) during the dot's animation. Fix: decouple — remove the automatic fly on location update so the dot animates via the marker/`animatedPosition` while the camera holds still; keep camera movement only for explicit user re-center (`map:recenter`) and the deliberate Begin-Navigation sync.

## Correctness Properties

Property 1: Bug Condition — Floor switching renders the selected floor correctly

_For any_ input where the bug condition holds for a floor switch or floor-data presence transition (`isBugCondition` true via `floorSwitch`), the fixed code SHALL render the selected floor's plan, route polyline, location marker, and POI/QR markers correctly for every floor — not only the initially loaded one — by invoking all React hooks unconditionally (no hooks after an early return) so reconciliation stays stable.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition — Bottom sheet behaves as a compact, draggable slider

_For any_ input where the bug condition holds for sheet interaction (`isBugCondition` true via `sheetInteraction`), the fixed BottomSheet SHALL respond to drag gestures and settle into a defined snap state (collapsed or expanded), and on first entering `NAVIGATING` SHALL occupy a compact height that preserves map visibility.

**Validates: Requirements 2.4, 2.5**

Property 3: Bug Condition — Upgraded location overlays

_For any_ input where the bug condition holds for opening a location overlay (`isBugCondition` true via `legacyOverlay` for `update_location` or `where_are_you`), the fixed code SHALL display the upgraded location UI consistent with the new design system rather than the legacy `EntryPrompt`.

**Validates: Requirements 2.6, 2.7**

Property 4: Bug Condition — Obsolete top-bar controls removed and status reflected

_For any_ input where the bug condition holds for the app shell or a status change (`isBugCondition` true via `legacyTopBar`), the fixed code SHALL NOT render the redundant top-bar "Update" control (no duplicate location-update action), and the surviving header/status surface SHALL reflect the current navigation status.

**Validates: Requirements 2.8, 2.9**

Property 5: Bug Condition — Begin Navigation synchronises the viewport

_For any_ input where the bug condition holds for begin navigation (`isBugCondition` true via `beginNav`), the fixed code SHALL immediately synchronise the map viewport/camera and floor to the correct starting floor and position.

**Validates: Requirements 2.10**

Property 6: Bug Condition — FAB accessibility and availability

_For any_ input where the bug condition holds for FAB rendering (`isBugCondition` true via `fabIssue`), the fixed code SHALL keep the QR and re-center FABs visible, tappable, and positioned above the bottom sheet in any sheet state, respecting safe-area insets and a minimum 42px touch target, AND SHALL make the QR scan FAB available in normal (non-demo) use whenever re-anchoring is valid.

**Validates: Requirements 2.11, 2.12**

Property 7: Bug Condition — Location animation decoupled from the camera

_For any_ input where the bug condition holds for a location update (`isBugCondition` true via `cameraCoupling`), the fixed code SHALL animate the location dot smoothly to the new position without panning the entire map in lockstep, so POI markers and the floor plan stay visually stable and aligned.

**Validates: Requirements 2.13**

Property 8: Preservation — State machine, backend contracts, and QR reroute unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` false), the fixed code SHALL produce the same result as the original code, preserving the Zustand state-machine action semantics, backend pathfinding/schema/API contracts, and the QR-scan-during-navigation reroute flow.

**Validates: Requirements 3.1, 3.2, 3.4**

Property 9: Preservation — Existing rendering and UI surfaces unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` false), the fixed code SHALL produce the same result as the original code, preserving single-floor rendering, the floor selector listing/highlight, the instruction card content, the three-layer pulsing marker with green confirmation flash, and the explicit re-center/"Fit" fly-to behaviour.

**Validates: Requirements 3.3, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the fixes are localised to the view layer and overlay wiring. **No store action bodies in `useNavStore.js` change**, preserving Properties 8 and 9.

**File**: `frontend/src/components/FloorMap.jsx`

**Function**: `FloorMap` (default export) and `FlyToPosition`

1. **Hoist hooks above early return (1.1–1.3 / Property 1)**: Move `const hasSavedViewportRef = useRef(false);` and `const handleHasSaved = (val) => { hasSavedViewportRef.current = val; };` to the top of the component, alongside the other `useRef`/`useState`/`useMemo`/`useEffect` declarations, so they execute on every render. Keep `if (!floor) return null;` *after* all hook declarations. This makes the hook list invariant across `floor` presence transitions.
2. **Decouple camera from location animation (1.13 / Property 7)**: Remove (or neutralise) the automatic `map.flyTo` in `FlyToPosition` so a change in `currentPos` no longer pans the map during a location update. The dot continues to animate via `animatedPosition`/`PulsingLocationMarker`. Retain `RecenterOnEvent` (explicit `map:recenter`) and `ViewportResetControl` ("Fit") for user-initiated camera moves (preserves 3.8).
3. **Begin-Navigation viewport sync hook (1.10 / Property 5)**: Add a focused effect (or reuse the recenter event) that, on the `ROUTE_PREVIEW → NAVIGATING` transition, centers the camera on the starting node's position at the appropriate zoom and ensures the active floor matches the start node. This lives in the view layer and does not modify `beginNavigation` store semantics.

**File**: `frontend/src/components/BottomSheet.jsx`

**Function**: `BottomSheet`

4. **Draggable slider with snap states (1.4, 1.5 / Property 2)**: Introduce sheet height/translate state and a snap model (e.g., `collapsed`, `expanded`) driven by `onPointerDown`/`onPointerMove`/`onPointerUp` on the drag handle, with velocity/threshold-based snapping. Default the `NAVIGATING` state to the compact snap so the map stays visible. Continue dispatching `bottomsheet:resize` with the live height so FABs and map padding track the sheet.

**File**: `frontend/src/App.jsx`

**Functions**: `App` render, overlay wiring, FAB wiring

5. **Replace legacy `EntryPrompt` with upgraded UI (1.6, 1.7 / Property 3)**: Route both the first-run "Where are you?" (`entry`) and "Update location" (`update`) overlays through the upgraded location UI consistent with the new design system, replacing the `EntryPrompt` usage for both `entryMode` values while keeping the existing `onScan`/`onSelect`/`onClose` handlers and `locationOptions` data flow.
6. **Remove legacy top-bar controls and reflect status (1.8, 1.9 / Property 4)**: Remove the obsolete `app-header` controls — specifically the redundant `LocationBar` "Update" button and duplicate location surface. Either drop `LocationBar` from the header or reduce the header to a minimal status-reflecting surface that maps `status` (`UNLOCATED/ANCHORED/ROUTE_PREVIEW/NAVIGATING/REROUTING/ARRIVED`) to an appropriate label. The bottom sheet remains the single source of the update action.
7. **Ungate the QR FAB for normal use (1.12 / Property 6)**: Change the QR FAB gating so `showQR` no longer depends on `isDemoMode`. Compute availability from a valid re-anchoring context (`status === 'UNLOCATED' || status === 'ANCHORED'`, scanner closed, not `ARRIVED`). Demo-only tappable QR markers inside `FloorMap` remain demo-gated and unchanged.

**File**: `frontend/src/components/FABGroup.jsx` (and associated CSS in `index.css`)

**Function**: `FABGroup`

8. **Lift FABs above the sheet and enforce touch targets (1.11 / Property 6)**: Offset the FAB group vertically above the current bottom-sheet height (consume the `bottomsheet:resize` height via a CSS variable or local state), add `env(safe-area-inset-bottom/right)` padding, and enforce `min-width: 42px; min-height: 42px` on each FAB so they remain visible and tappable in every sheet state.

### Out of Scope (Preservation Guards)

- `frontend/src/store/useNavStore.js` action bodies and transition graph — unchanged.
- Backend routes and schemas — unchanged.
- `FloorSelector.jsx` listing/highlight logic, `InstructionCard`, `PulsingLocationMarker` visuals/flash — unchanged.
- `RecenterOnEvent` / `ViewportResetControl` user-initiated camera flows — unchanged.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each regression on the unfixed code (confirming or refuting the root-cause hypotheses), then verify the fix resolves each bug (fix checking) and leaves all non-buggy behaviour identical (preservation checking). Because the UI is React + Leaflet, component-level tests use React Testing Library with the store and Leaflet map interactions mocked where needed; preservation of store/backend behaviour is asserted at the action level.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each regression BEFORE implementing the fix, confirming or refuting the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Drive each bug context against the current code and assert the (currently failing) corrected behaviour, or directly observe the defect.

**Test Cases**:
1. **Hook-order instability (1.3)**: Render `FloorMap`, toggle `floor` from `null` to a floor object and switch floors; assert React logs no hook-order warning/error and markers render. (Will fail / warn on unfixed code.)
2. **Floor switch render (1.1, 1.2)**: Switch to Floor 2 (idle and mid-navigation); assert plan, polyline, and POI/QR markers reflect Floor 2. (Will fail on unfixed code.)
3. **Bottom-sheet drag (1.4)**: Fire pointer down/move/up on the handle; assert sheet height changes and snaps. (Will fail — no handlers on unfixed code.)
4. **Nav sheet size (1.5)**: Enter `NAVIGATING`; assert the sheet height is compact (below a threshold). (Will fail on unfixed code.)
5. **Legacy overlays (1.6, 1.7)**: Open update and first-run overlays; assert the upgraded UI marker is present, legacy `EntryPrompt` is absent. (Will fail on unfixed code.)
6. **Legacy top bar (1.8, 1.9)**: Assert no redundant header "Update" button exists and that the header reflects `status`. (Will fail on unfixed code.)
7. **Begin Navigation sync (1.10)**: From `ROUTE_PREVIEW`, invoke begin; assert `map.flyTo`/`setView` was called targeting the start node. (Will fail on unfixed code.)
8. **FAB obscuring & gating (1.11, 1.12)**: Expand sheet, assert FAB offset above sheet height and ≥42px; in non-demo mode with `ANCHORED`, assert QR FAB present. (Will fail on unfixed code.)
9. **Camera coupling (1.13)**: Trigger a location update; assert `map.flyTo` is NOT called for the location-dot change while the marker position updates. (Will fail on unfixed code — flyTo fires.)

**Expected Counterexamples**:
- React hook-order warning when `floor` toggles; stale/blank markers after a floor switch.
- Sheet does not move on drag; full-height sheet on `NAVIGATING`.
- Legacy `EntryPrompt` rendered; redundant header "Update" button present.
- No camera move on begin; camera pans on location update.
- Possible alternative causes to rule out: floor data not refetched (refuted — `switchFloor` updates `floor`), CSS-only sheet sizing vs missing gesture logic, FAB z-index vs missing height offset.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedRender(input)
  ASSERT expectedBehavior(result)   // Properties 1–7 per input.kind
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many inputs automatically across the state-machine and rendering domain.
- It catches edge cases manual unit tests miss (e.g., uncommon status sequences).
- It provides strong guarantees that non-buggy behaviour is unchanged.

**Test Plan**: Observe behaviour on the UNFIXED code first for non-buggy inputs (single-floor rendering, store transitions, backend calls, explicit re-center), capture it, then assert the fixed code matches.

**Test Cases**:
1. **State-machine preservation (3.1)**: Property test over random valid action sequences (`anchorLocation`, `selectDestination`, `beginNavigation`, `advanceStep`, `updateLocation`, `cancelNavigation`, `completeNavigation`, `switchFloor`); assert the resulting `status`/state matches the unfixed store.
2. **Backend contract preservation (3.2, 3.4)**: Assert `computeRoute`/`scanQR`/`fetchFloor`/`searchPOIs` are invoked with identical arguments and that QR-scan-during-navigation still reroutes via `anchorLocation`/`updateLocation`.
3. **Single-floor rendering (3.3)**: With no floor switch, assert plan/polyline/markers render identically to baseline.
4. **Floor selector (3.5)**: With >1 floor loaded, assert one button per floor and active highlight unchanged.
5. **Instruction card (3.6)**: While `NAVIGATING`, assert turn icon/text/distance for the current step unchanged.
6. **Pulsing marker + flash (3.7)**: Assert three-layer marker renders and green flash fires on update completion unchanged.
7. **Explicit re-center (3.8)**: Fire `map:recenter` / "Fit"; assert `map.flyTo` to anchored position at fit zoom still occurs.

### Unit Tests

- `FloorMap` hook ordering: render with `floor = null` then a floor object; no hook warnings, markers render after switch.
- `FlyToPosition`: location-update change does not call `map.flyTo`; explicit recenter does.
- `BottomSheet`: pointer drag updates height and snaps; `NAVIGATING` defaults to compact height; `bottomsheet:resize` dispatched.
- `App` overlays: update and first-run overlays render upgraded UI; no legacy `EntryPrompt`.
- `App` header: no redundant "Update" control; header reflects `status`.
- `FABGroup`: QR FAB present in non-demo `ANCHORED`/`UNLOCATED`; FABs offset above sheet height; ≥42px targets; safe-area padding applied.

### Property-Based Tests

- Generate random valid action sequences and assert state-machine equivalence between unfixed and fixed stores (preservation, Property 8).
- Generate random floor sets and switch orders; assert the rendered floor always matches `currentFloorId` (Property 1).
- Generate random sheet drag gestures; assert the sheet always settles into a defined snap state and never below a minimum or above container height (Property 2).
- Generate random `status` values; assert QR FAB availability matches the re-anchoring-context predicate independent of demo mode, and FABs never overlap the sheet (Property 6).

### Integration Tests

- Full flow: anchor → select destination → Begin Navigation (camera syncs to start) → advance steps across a floor change (markers/polyline redraw) → arrive.
- Switch floors repeatedly during idle and navigation; assert consistent rendering each time.
- Location update via QR scan and via manual node selection; assert the dot animates while the camera holds still, then explicit re-center pans correctly.
- Expand/collapse the bottom sheet and confirm FABs remain visible and tappable above it throughout.
