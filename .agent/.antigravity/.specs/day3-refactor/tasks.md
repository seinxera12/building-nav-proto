# Day 3 Refactor Tasks - Search-First Manual Navigation

Status: Ready for implementation.

Source specs:

- `.agent/.antigravity/.specs/day3-refactor/plan.md`
- `.agent/.antigravity/.specs/day3-qr/plan.md`
- `.agent/.antigravity/.specs/day3-qr/implementation.md`
- `.agent/.antigravity/.specs/day4-demo/plan.md`
- `.agent/.antigravity/.specs/day4-demo/implementation.md`

Current implementation summary:

- Backend already exposes `/scan`, `/event`, `/map/floor/{floor_id}`, `/search`, and `/route`.
- Backend `/route` still returns `checkpoints`, but this must become passive metadata only. It must not drive navigation progression.
- Frontend `useNavStore` is the main source of navigation state, but it still treats QR scans during `NAVIGATING` as checkpoint progression, arrival, and reroute triggers.
- `selectDestination()` currently computes a route and immediately sets `status: 'NAVIGATING'`.
- `InstructionPanel` currently appears as soon as a route exists and uses `Next` / `Arrived!` instead of a preview, begin, confirmation, manual update, cancel, and end lifecycle.
- `FloorMap` has demo QR markers behind `?demo=1`; these currently call `handleScan()` at any point in the flow.
- Day 4 simulation exists and currently drives navigation by scanning QR checkpoints after route creation. It must be updated to drive the new user-confirmation and manual-location workflow instead.

Target behavior:

1. QR is used only to establish the initial location anchor.
2. Destination selection is search-first and map POI markers are an equivalent secondary selection method.
3. Selecting a destination creates a route preview, not an active navigation session.
4. Navigation starts only after `Begin`.
5. During navigation, progress happens through user confirmations such as `I'm Here`.
6. Manual location updates use map selection and reroute when needed.
7. There are no scan checkpoints after route creation.
8. Navigation supports `Begin`, `Cancel`, arrival, and `End Navigation`.
9. Day 4 demo remains available in `?demo=1`, but it must drive the new lifecycle instead of checkpoint scans.

## Task 1 - Baseline Audit and Regression Map

- [ ] Read these files before editing:
  - `frontend/src/store/useNavStore.js`
  - `frontend/src/App.jsx`
  - `frontend/src/components/InstructionPanel.jsx`
  - `frontend/src/components/FloorMap.jsx`
  - `frontend/src/components/SearchBar.jsx`
  - `frontend/src/components/ArrivedScreen.jsx`
  - `frontend/src/components/SimulationPanel.jsx`
  - `frontend/src/simulation/scenarios.js`
  - `frontend/src/simulation/animateProgress.js`
  - `frontend/src/hooks/useSimKeyboard.js`
  - `frontend/src/api/index.js`
  - `backend/routes/routing.py`
  - `backend/routes/map.py`
  - `backend/routes/scan.py`
  - `backend/graph.py`

- [ ] Capture the current status names and store fields that need migration:
  - Current: `IDLE`, `LOCATED`, `NAVIGATING`, `REROUTING`, `ARRIVED`.
  - Target: `UNLOCATED`, `ANCHORED`, `ROUTE_PREVIEW`, `NAVIGATING`, `REROUTING`, `ARRIVED`.

- [ ] Confirm the route response shape used by frontend:
  - `path`
  - `instructions`
  - `checkpoints`
  - `totalDistance`

- [ ] Confirm POI fields available from map/search:
  - `floor.pois`
  - `floor.nodes`
  - `/search` response fields: `name`, `category`, `node_id`, `x`, `y`.

- [ ] Run initial verification if dependencies are available:
  - `cd frontend && npm run build`
  - Backend route smoke test for `/map/floor/1`, `/scan`, and `/route`.

Acceptance criteria:

- [ ] The implementation target is documented against real files and no task assumes non-existent frontend APIs.
- [ ] Existing Day 4 demo dependencies are identified before changing the store API.

## Task 2 - Normalize Navigation State Model

- [ ] Update `frontend/src/store/useNavStore.js` status names:
  - Replace `IDLE` with `UNLOCATED`.
  - Replace `LOCATED` with `ANCHORED`.
  - Keep `ROUTE_PREVIEW`, `NAVIGATING`, `REROUTING`, `ARRIVED`.

- [ ] Add or normalize these store fields:
  - `status`
  - `currentNodeId`
  - `currentNode`
  - `destinationNodeId`
  - `destinationNode`
  - `route`
  - `routeLoading`
  - `routeError`
  - `instructions` if keeping separate from `route.instructions` is useful; otherwise keep instructions derived from route.
  - `currentStep`
  - `progress`
  - `remainingDistance`
  - `isSelectingLocation`
  - `manualLocationCandidate`
  - `pendingArrival`
  - `animatedPosition`
  - `error`

- [ ] Add or rename store actions so the workflow vocabulary is explicit:
  - `anchorLocation(qrCodeOrScanResult)`
  - `selectDestination(nodeId)`
  - `beginNavigation()`
  - `advanceStep()`
  - `startLocationUpdate()`
  - `cancelLocationUpdate()`
  - `updateLocation(nodeId)`
  - `reroute(fromNodeId)`
  - `cancelNavigation()`
  - `completeNavigation()`
  - `resetNavigation()`
  - Keep compatibility aliases only if Day 4 code needs an incremental migration.

- [ ] Keep `useNavStore` as the single source of truth. Do not introduce component-local navigation lifecycle state.

Acceptance criteria:

- [ ] App opens in `UNLOCATED`.
- [ ] First successful QR scan transitions to `ANCHORED`.
- [ ] Destination selection transitions to `ROUTE_PREVIEW`.
- [ ] `Begin` transitions to `NAVIGATING`.
- [ ] Final confirmation transitions to `ARRIVED`.
- [ ] `End Navigation` transitions to `ANCHORED` while preserving current location.

## Task 3 - Restrict QR to Initial Location Anchoring

- [ ] Refactor `handleScan(qrCode)` in `useNavStore`.
- [ ] Keep `/scan` backend behavior unchanged.
- [ ] Allow QR scan only when status is:
  - `UNLOCATED`: resolve QR, set current location, transition to `ANCHORED`.
  - `ANCHORED`: optionally allow re-anchoring before a route exists.

- [ ] Prevent QR from advancing navigation after a route exists:
  - In `ROUTE_PREVIEW`, show a user-facing error such as `Location is already anchored. Use Begin or Cancel.`
  - In `NAVIGATING`, show a user-facing error such as `Use I'm Here or Update My Location during navigation.`
  - In `REROUTING`, keep existing recalculation guard.
  - In `ARRIVED`, ask the user to end navigation first.

- [ ] Remove these QR-driven behaviors from `handleScan`:
  - checkpoint scan progression
  - destination QR arrival
  - off-route QR rerouting
  - `checkpoint_scan` event logging

- [ ] Update scan button labels in `App.jsx`:
  - `UNLOCATED`: `Scan to Locate`
  - `ANCHORED`: optional `Update Anchor`
  - `ROUTE_PREVIEW`, `NAVIGATING`, `REROUTING`, `ARRIVED`: hide the scan button or disable it with a clear label.

- [ ] Update error copy from `checkpoint` language to anchoring language.

Acceptance criteria:

- [ ] After a route has been created, no QR scan changes `currentStep`, `route`, `progress`, or `status`.
- [ ] QR remains functional for initial anchoring.
- [ ] Demo QR markers no longer create route progression after route preview starts.

## Task 4 - Implement Search-First Destination Selection

- [ ] Keep `SearchBar` as the primary destination entry point.
- [ ] Change search to use already-loaded `floor.pois` client-side if practical:
  - Filter by `name` and `category`.
  - Match the plan's `GET /pois?floor=1` intent without adding backend work unless needed.

- [ ] If backend support is preferred, add `GET /pois?floor=1` in `backend/routes/map.py` and a frontend API helper:
  - Return `id`, `name`, `category`, `nearest_node_id` or existing `node_id`.
  - Keep `/search` temporarily for backwards compatibility until all usage is removed.

- [ ] Update `selectDestination(nodeId)`:
  - Require `status === 'ANCHORED'` before route computation.
  - If `UNLOCATED`, show `Scan a QR code first to set your starting location.`
  - If `NAVIGATING`, block destination changes until cancel/end.
  - Compute route from `currentNodeId` to selected destination.
  - Set route, destination, `currentStep: 0`, `progress: 0`.
  - Transition to `ROUTE_PREVIEW`, not `NAVIGATING`.

- [ ] Preserve route loading and route error states.

Acceptance criteria:

- [ ] A destination can be selected from search after anchoring.
- [ ] Route polyline renders in preview mode.
- [ ] Instruction progression controls do not appear before `Begin`.
- [ ] Destination cannot be changed during `NAVIGATING`.

## Task 5 - Add Clickable POI Marker Destination Selection

- [ ] Update `frontend/src/components/FloorMap.jsx`.
- [ ] Identify POI destination nodes from `floor.pois`.
- [ ] Add clickable POI markers or make existing POI node markers clickable.
- [ ] Marker click must call the same `selectDestination(nodeId)` action used by `SearchBar`.
- [ ] Keep debug tooltips and demo QR markers independent.
- [ ] Do not make QR markers destination selectors.

Acceptance criteria:

- [ ] Clicking a POI marker after anchoring creates the same `ROUTE_PREVIEW` as selecting search result.
- [ ] Clicking a POI while unlocated shows the same anchor-first error.
- [ ] Existing current-location, destination, route, debug, and demo markers still render.

## Task 6 - Build Route Preview UX

- [ ] Update or split `InstructionPanel` so `ROUTE_PREVIEW` is distinct from `NAVIGATING`.
- [ ] In `ROUTE_PREVIEW`, show:
  - destination name
  - total route distance
  - estimated walking distance/time if available, otherwise use total distance label consistently
  - instruction count
  - `Begin` button
  - `Cancel` button

- [ ] Add store actions:
  - `beginNavigation()`: transitions `ROUTE_PREVIEW` to `NAVIGATING`, locks destination, initializes step/progress.
  - `cancelNavigation()`: clears route/destination/instructions/progress and returns to `ANCHORED`.

- [ ] Ensure `Begin` is disabled when route is still loading or route has failed.

Acceptance criteria:

- [ ] Selecting a destination never starts step-by-step navigation automatically.
- [ ] The user must click `Begin` before `I'm Here` appears.
- [ ] `Cancel` from preview clears only route/destination state and keeps current location anchored.

## Task 7 - Refactor Step-by-Step Instruction UX

- [ ] Update `InstructionPanel` for `NAVIGATING` state.
- [ ] Replace `Next` with primary action `I'm Here`.
- [ ] Replace `Arrived!` with either:
  - `I'm Here` on the final step, which transitions to `ARRIVED`, or
  - `Arrived` only if the current instruction is the destination instruction.

- [ ] Show:
  - current instruction text
  - current instruction distance
  - remaining distance
  - `Step X of Y`
  - next instruction preview when available
  - `Update My Location`
  - `Cancel Navigation`

- [ ] Keep `previousStep` only if it still makes product sense. Otherwise remove/hide it to avoid contradicting confirmation-based progression.
- [ ] Add a lightweight CSS transition for current instruction changes.
- [ ] Ensure mobile bottom-sheet layout remains usable and does not overlap search or map controls.

Acceptance criteria:

- [ ] Navigation progresses only when the user confirms `I'm Here`.
- [ ] Blue current-location dot updates to the new step node on confirmation.
- [ ] The current step and next step are visually distinct.
- [ ] No text or buttons mention QR checkpoints.

## Task 8 - Implement Manual Location Update Mode

- [ ] Add `startLocationUpdate()` action:
  - Set `isSelectingLocation: true`.
  - Keep existing route and destination visible.

- [ ] Add `cancelLocationUpdate()` action:
  - Set `isSelectingLocation: false`.
  - Clear any temporary candidate.

- [ ] Update `FloorMap`:
  - When `isSelectingLocation` is true, map/node clicks select an approximate current position.
  - Prefer node clicks for the prototype if arbitrary coordinate snapping is not yet available.
  - Show a clear selection mode indicator and a cancel affordance.

- [ ] Add API support for snapping:
  - Add `POST /snap` in backend if coordinate tapping is implemented.
  - Request shape: `{ "x": number, "y": number, "floor_id": 1 }`.
  - Response shape: `{ "nodeId": 47 }`.
  - Use graph/node data to find nearest navigation node.

- [ ] If implementing node-click selection first, route it through the same `updateLocation(nodeId)` store action so adding `/snap` later does not affect lifecycle logic.

Acceptance criteria:

- [ ] `Update My Location` enters a visible selection mode.
- [ ] Selecting a point/node updates the blue dot.
- [ ] Selection mode exits after a successful update.
- [ ] Cancel selection returns to `NAVIGATING` with no route changes.

## Task 9 - Implement Rerouting from Manual Location Updates

- [ ] Add `updateLocation(nodeId)` to `useNavStore`.
- [ ] When selected node is on the remaining route:
  - Update `currentNodeId` and `currentNode`.
  - Advance or preserve `currentStep` based on the nearest remaining instruction node.
  - Recompute `progress` and `remainingDistance`.
  - Keep `status: 'NAVIGATING'`.

- [ ] When selected node is outside the remaining route:
  - Set `status: 'REROUTING'`.
  - Preserve `destinationNodeId` and `destinationNode`.
  - Call `computeRoute(newNodeId, destinationNodeId)`.
  - Replace `route`.
  - Reset `currentStep: 0`, `progress: 0`, `pendingArrival: false`.
  - Log `reroute` with `{ from_node, to_node, reason: 'manual_location_update' }`.
  - Return to `NAVIGATING`.

- [ ] On reroute failure:
  - Restore `status: 'NAVIGATING'`.
  - Keep the manually selected current location.
  - Keep the previous route if that is safer for recovery, or clear route with an explicit error. Choose one behavior and document it in code comments only if not obvious.
  - Show `Could not recalculate route`.

Acceptance criteria:

- [ ] Manual update to a node on the remaining route does not call `/route`.
- [ ] Manual update to an off-route node calls `/route` once.
- [ ] Rerouting overlay appears only during recalculation.
- [ ] Destination is preserved during reroute.

## Task 10 - Complete Cancel, Arrival, and End Lifecycle

- [ ] Rename or wrap `cancelRoute()` as `cancelNavigation()`.
- [ ] Add a confirmation UI for cancel during `NAVIGATING`:
  - Native `window.confirm` is acceptable for the smallest safe change.
  - A custom modal can be added only if existing UI patterns support it cleanly.

- [ ] Cancel behavior:
  - Clear route.
  - Clear destination.
  - Clear instructions/progress/current step.
  - Clear selection mode.
  - Clear animation state.
  - Return to `ANCHORED`.
  - Preserve `currentNodeId` and `currentNode`.

- [ ] Arrival behavior:
  - Final `I'm Here` transitions to `ARRIVED`.
  - `ArrivedScreen` shows destination name and completion state.
  - `End Navigation` logs `path_complete`, clears route/destination/progress, and returns to `ANCHORED`.

- [ ] Keep full reset behavior for demo reset:
  - `resetNavigation()` can reset to `UNLOCATED`.
  - `completeNavigation()` / `End Navigation` must return to `ANCHORED`.

Acceptance criteria:

- [ ] Cancel from navigation returns to anchored map with no route.
- [ ] End navigation returns to anchored map with no route.
- [ ] Current location remains visible after cancel and after end.
- [ ] Demo reset can still reset the whole app to `UNLOCATED`.

## Task 11 - Update Day 4 Demo to Use the New Workflow

- [ ] Update `frontend/src/simulation/scenarios.js`.
- [ ] Remove all post-route checkpoint scans:
  - No `scan('QR_CENTER_JCT')` after destination selection.
  - No destination QR scan to arrive.
  - No wrong QR scan to trigger reroute.

- [ ] Cafeteria scenario should use:
  - scan lobby QR for initial anchor
  - select Cafeteria
  - begin navigation
  - animate segment
  - call `advanceStep()` / `I'm Here` equivalent
  - repeat for several instructions
  - optionally call `startLocationUpdate()` and `updateLocation(nodeId)` for manual correction
  - complete final step
  - show arrived screen
  - end navigation if the scenario includes cleanup

- [ ] Reroute scenario should use:
  - scan lobby QR for initial anchor
  - select destination
  - begin navigation
  - animate partial route
  - manually update location to an off-route node, such as Stairwell A
  - wait for reroute
  - continue with confirmations
  - arrive via final confirmation, not QR

- [ ] Update simulation labels so stakeholder demo language no longer says `scan checkpoint`.
- [ ] Keep `animateProgress`, `animateRouteSegment`, and `animateNodePath` cosmetic only.
- [ ] Ensure `SimulationPanel` still resets both sim and navigation stores.
- [ ] Ensure `useSimKeyboard` still works with `Space`, `P`, and `R`.

Acceptance criteria:

- [ ] `http://localhost:5173?demo=1` shows the simulation panel.
- [ ] Demo route progresses without scanning QR checkpoints.
- [ ] Demo reroute is driven by manual location update.
- [ ] Non-demo mode has no simulation panel.

## Task 12 - Update QR Demo Markers and Scanner Availability

- [ ] Keep demo QR markers only for initial anchoring or pre-route re-anchoring.
- [ ] In `FloorMap`, disable or hide QR demo markers when status is:
  - `ROUTE_PREVIEW`
  - `NAVIGATING`
  - `REROUTING`
  - `ARRIVED`

- [ ] In `App.jsx`, hide or disable the scanner button after route creation.
- [ ] Keep `QRScanner` component and backend `/scan` endpoint intact.
- [ ] Update user-facing labels from `Scan Checkpoint` to anchoring-specific copy.

Acceptance criteria:

- [ ] There is no visible checkpoint scanning affordance during navigation.
- [ ] Camera scanner still works for initial location anchoring.
- [ ] Demo mode still has a camera-free initial anchoring fallback.

## Task 13 - Backend Support for Manual Snap and POI Listing

- [ ] Add `POST /snap` if manual map coordinate selection is implemented.
- [ ] Validate request fields:
  - numeric `x`
  - numeric `y`
  - integer `floor_id`

- [ ] Snap only against nodes on the requested floor.
- [ ] Return 404 if no nodes exist for the floor.
- [ ] Return `{ "nodeId": id }`.

- [ ] Add `GET /pois?floor=1` only if frontend is moved away from `/search` or `floor.pois`.
- [ ] Keep existing `/search` until no code uses it.

Acceptance criteria:

- [ ] Manual location update can resolve arbitrary map taps through backend snap, or node-click fallback is deliberately documented in the implementation.
- [ ] Backend input errors return explicit 4xx responses.
- [ ] Existing `/map/floor/1`, `/route`, `/scan`, and `/event` continue to work.

## Task 14 - Update Styling and Copy

- [ ] Update `frontend/src/index.css` or component CSS classes for:
  - route preview panel
  - navigation bottom sheet
  - next-step preview
  - `I'm Here`
  - `Update My Location`
  - location selection mode
  - cancel confirmation affordance if custom
  - end navigation button

- [ ] Remove or replace copy mentioning:
  - `checkpoint`
  - `Scan Checkpoint`
  - destination QR scan
  - QR-driven arrival

- [ ] Ensure mobile layout:
  - search stays accessible in `ANCHORED`.
  - preview and navigation panels do not cover critical map controls.
  - buttons have stable sizes and do not shift layout when labels change.

Acceptance criteria:

- [ ] The UI communicates a single model: QR anchors the start, confirmations and manual location updates drive navigation.
- [ ] No visible text instructs users to scan checkpoints after route creation.

## Task 15 - Focused Tests and Manual Verification

- [ ] Add focused frontend tests if a test framework is already configured. If not, do not add a new test dependency just for this refactor.
- [ ] Prefer store-level tests for:
  - QR scan in `UNLOCATED` anchors location.
  - QR scan in `NAVIGATING` does not progress.
  - destination selection creates `ROUTE_PREVIEW`.
  - `beginNavigation()` transitions to `NAVIGATING`.
  - `advanceStep()` progresses instructions and arrives at the end.
  - manual update on-route does not reroute.
  - manual update off-route reroutes.
  - cancel and end preserve current location.

- [ ] Add backend tests only if the project already has a backend test pattern. Otherwise run endpoint smoke checks manually.

Manual verification sequence:

- [ ] Start backend.
- [ ] Start frontend.
- [ ] Open normal mode: `http://localhost:5173`.
- [ ] Scan or demo-anchor `QR_LOBBY_MAIN`.
- [ ] Confirm status is anchored and blue dot appears.
- [ ] Search for Cafeteria.
- [ ] Select Cafeteria.
- [ ] Confirm route preview appears and navigation has not started.
- [ ] Click `Begin`.
- [ ] Click `I'm Here` through at least three instructions.
- [ ] Click `Update My Location`.
- [ ] Select a point/node on the remaining route and confirm no reroute.
- [ ] Click `Update My Location` again.
- [ ] Select an off-route node and confirm reroute.
- [ ] Continue confirmations to arrival.
- [ ] Click `End Navigation`.
- [ ] Confirm route is cleared and current location remains.
- [ ] Start another route and click `Cancel Navigation`.
- [ ] Confirm route is cleared and current location remains.
- [ ] Try scanning a QR during navigation and confirm it does not change route progress.

Demo verification sequence:

- [ ] Open `http://localhost:5173?demo=1`.
- [ ] Run Cafeteria scenario manually with `Next`.
- [ ] Run Cafeteria scenario with `Auto`.
- [ ] Run Reroute scenario.
- [ ] Confirm no scenario step scans a checkpoint after route creation.
- [ ] Confirm `Space`, `P`, and `R` still work.
- [ ] Open `http://localhost:5173` and confirm no simulation UI is rendered.

Build verification:

- [ ] `cd frontend && npm run build`
- [ ] Backend import/start check.

Done criteria:

- [ ] QR is only used for initial location anchoring.
- [ ] Search-first destination selection creates route preview.
- [ ] POI marker selection uses the same route preview path.
- [ ] Begin, Cancel, Arrival, and End lifecycle is implemented.
- [ ] Navigation progresses by user confirmations.
- [ ] Manual location updates drive rerouting.
- [ ] No scan checkpoints exist after route creation.
- [ ] Day 4 demo is updated to the new lifecycle with no QR checkpoint progression.
- [ ] Existing backend route, scan, map, and demo support do not regress.
