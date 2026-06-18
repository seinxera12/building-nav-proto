# Phase 1: Data model refactor

## Objectives

Create a backward-compatible schema foundation for multi-floor navigation without changing the visible user flow. The current models already have `floors`, `nodes`, `edges`, `pois`, and `qr_checkpoints`, but they lack explicit floor-transition semantics and richer coordinate metadata.

## Code areas affected

`backend/models.py`, `backend/db.py`, `backend/seed.py`, `backend/routes/map.py`, `backend/routes/scan.py`, `backend/routes/offline.py`. The document explicitly flags these as the primary places needing changes for floor, node, edge, QR, and search refactors.

## New components/services

Add a small **navigation schema service** or migration helper layer that centralizes:

- floor metadata normalization,
- connector normalization,
- QR scope normalization,
- coordinate-system conversion helpers.

This keeps schema changes from leaking into UI or routing logic too early.

## Database changes

Add fields in a backward-compatible way:

**Floor**

- `coordinate_system`
- `origin_x`
- `origin_y`
- `scale`
- `elevation_m`
- `default_viewport`
- `is_accessible`

**Node**

- `elevation`
- `kind` or equivalent normalized type
- `metadata` expansion for connector and accessibility details

**Edge**

- `edge_type`
- `floor_change`
- `floor_delta`
- keep `cost`, `reverse_cost`, `walkable`, `accessible`

**POI / QR**

- add floor scoping where missing
- support floor-prefixed QR lookup

These additions are directly suggested by the extension points in the document.

## API changes

Keep current endpoints working, but extend response payloads:

- `/map/floor/{floor_id}` returns floor metadata, nodes, POIs, and QR codes as before, plus optional connector context.
- `/scan` returns `nodeId` plus `floorId`.
- `/search` accepts optional `floor_id`.

Do **not** remove or rename existing fields yet. The current frontend depends on the single-floor payload shape.

## State management changes

No behavioral change yet. Add only additive state:

- `floorsById`
- `floorViewportsById`
- `currentFloorId` as a derived field, not a replacement for `floor`

Keep the existing scalar `floor` until Phase 4. The document calls out the current scalar `floor` as a structural issue, but it should not be removed in phase 1.

## Acceptance criteria

- Existing single-floor screens still render and route exactly as before.
- Database migrations apply cleanly to a current deployment.
- `floor_id` can be returned from scan and search without breaking current clients.
- New fields are nullable or defaulted so seed data does not fail.
- No route results or map payloads regress for the current floor.

## Risks

- Migration breaks seed scripts if defaults are incomplete.
- API payloads become inconsistent if only some endpoints are updated.
- Early schema changes can tempt frontend rewrites too soon.

Mitigation: keep all new columns additive and defaulted; do not alter old payload keys.

## Estimated implementation complexity

**Medium.** Mostly schema and serialization work, low UI risk.

## Step-by-step execution

1. Add nullable/defaulted floor, node, edge, and QR fields.
2. Add migration and seed updates.
3. Extend map/scan/search payloads without changing old keys.
4. Add unit tests for old and new serialization shapes.
5. Ship behind a feature flag that does not affect runtime behavior.

---

# Phase 2: Multi-floor support

## Objectives

Allow the system to load, store, and switch between multiple floors while preserving the current one-floor experience by default. The document explicitly recommends converting the scalar floor state into a floor registry and loading floors by ID rather than overwriting the whole state.

## Code areas affected

`backend/routes/map.py`, `backend/routes/search.py`, `backend/routes/scan.py`, `frontend/src/store/useNavStore.js`, `frontend/src/api/index.js`, `frontend/src/components/FloorMap.jsx`.

The document calls out these exact areas for floor loading, caching, state conversion, and map switching.

## New components/services

- `FloorRegistryService` on the frontend or an equivalent store helper
- `FloorDataLoader` on the backend if batch floor loading is needed
- `ViewportPersistenceService` for per-floor zoom/center state

The current architecture mixes loading and state mutation in `loadFloor()`; separating that reduces rewrite risk.

## Database changes

- Enforce unique `(building_id, floor_num)`
- Store per-floor map assets
- Ensure each floor has its own bounds and coordinate space metadata

This matches the existing recommendation to make bounds and map URLs floor-specific.

## API changes

- Add `GET /buildings/{building_id}/floors`
- Extend `GET /map/floor/{floor_id}` to return consistent floor metadata
- Add optional `floor_id` filters to search and QR queries
- Keep existing single-floor endpoint behavior intact

The document explicitly recommends floor filtering for search and floor-scoped scan results.

## State management changes

Replace the implicit assumption of one active floor with:

- `floors: Map<floorId, Floor>`
- `currentFloorId`
- `floorViewport: Map<floorId, viewport>`

Keep the existing `floor` object as a compatibility alias until the UI cutover. The document directly recommends this shape.

## Acceptance criteria

- App can load floor 1, floor 2, floor 3 without losing previously loaded floor data.
- Switching floors preserves route history and viewport state.
- Offline cache stores multiple floors independently.
- QR and search results can be grouped by floor.
- Existing single-floor behavior still works unchanged.

## Risks

- Memory growth from caching many floors.
- Floor switch can still reset map state if viewport persistence is incomplete.
- Search results can feel noisier if floor context is not shown clearly.

Mitigation: lazy-load floors, cache per floor, and surface floor labels in every result.

## Estimated implementation complexity

**Medium-high.** Requires coordinated backend + frontend state changes, but still avoids routing rewrite.

## Step-by-step execution

1. Add multi-floor read endpoints.
2. Convert frontend store to floor registry + current floor ID.
3. Implement per-floor viewport persistence.
4. Update search and QR responses to carry floor context.
5. Add floor switch UI without changing route logic yet.
6. Validate that current single-floor flows still work.

---

# Phase 3: Inter-floor navigation

## Objectives

Make elevators, stairs, and escalators first-class routing entities so the router can produce a single route that crosses floors cleanly. The document explicitly calls for a floor-aware `shortest_path_multi()` and instruction types such as `take_elevator` and `take_stairs`.

## Code areas affected

`backend/graph.py`, `backend/routes/routing.py`, `backend/routes/scan.py`, `frontend/src/api/index.js`, `frontend/src/store/useNavStore.js`.

The current graph is a single adjacency list with Dijkstra and no floor context; that must be extended, not replaced.

## New components/services

- `MultiFloorRoutePlanner`
- `ConnectorResolver`
- `InstructionComposer`
- optional `AccessibilityRoutingPolicy`

These separate the connector logic from ordinary same-floor turn logic, which is important because current turn computation only understands left/right/straight/u-turn.

## Database changes

- Connector edges must identify their floor-change behavior.
- Stairs, escalators, and elevators need connector-specific metadata.
- QR checkpoints near connectors should be floor-scoped.

The document already recommends connector-specific fields such as `connects_to_floors`, `floor_change`, and `floor_delta`.

## API changes

- `/route` returns:
    - path segments,
    - floor transition segments,
    - transition instructions,
    - floor context per step.
- `/scan` returns floor-aware anchors.
- Offline routing uses floor-aware cached subgraphs.

The existing route endpoint returns a single path and turn instructions; this phase extends the payload without breaking old consumers.

## State management changes

Add route structure fields:

- `route.segments`
- `route.floorTransitions`
- `route.activeFloorId`
- `route.pendingConnector`

Keep `route.path` and `route.instructions` for compatibility. The document warns that route breaks are likely if floor changes clear state, so route state must survive floor transitions.

## Acceptance criteria

- A route can start on floor 1 and end on floor 3.
- The route includes connector steps in the correct order.
- Accessibility mode prefers accessible connectors.
- Same-floor routes still behave exactly as before.
- Offline mode can still compute a route using cached floor graphs.

## Risks

- Incorrect connector costs can bias routing toward the wrong vertical transition.
- Instruction generation can become confusing if floor transitions are emitted like normal turns.
- Edge directionality can break if reverse costs are inconsistent.

Mitigation: keep connector logic separate from normal turn generation and add route snapshots for test fixtures.

## Estimated implementation complexity

**High.** This is the first phase that changes core routing behavior.

## Step-by-step execution

1. Add connector-aware graph loading.
2. Implement `shortest_path_multi()` while preserving `shortest_path()`.
3. Extend instruction generation with floor-change instruction types.
4. Add tests for same-floor, upward, downward, and accessible routes.
5. Update offline fallback to use the new graph shape.
6. Validate that same-floor route output remains unchanged.

---

# Phase 4: Map rendering migration

## Objectives

Move from the current single image overlay approach to a vector-first floor renderer while preserving Leaflet-based interaction. The document recommends SVG first because it is scalable, editable, and minimally disruptive, with CAD-derived assets later for large buildings.

## Code areas affected

`frontend/src/components/FloorMap.jsx`, `frontend/public/floor-assets/`, `backend/seed.py`, `backend/routes/map.py`.

The current renderer uses `ImageOverlay` and CRS.Simple with hardcoded bounds, and it must be generalized to per-floor assets and per-floor bounds.

## New components/services

- `VectorMapRenderer`
- `FloorAssetRegistry`
- `OverlayLayerManager`
- optional `3DPreviewRenderer` later, but not in this phase

Keep rendering separate from routing, as the document recommends keeping 2D routing independent of any 3D view.

## Database changes

- `map_url` should support SVG/vector assets
- floor metadata should include coordinate-system and bounds data
- optional asset references for icons and overlays

This follows the documented SVG migration path and later coordinate-system alignment.

## API changes

- `/map/floor/{floor_id}` returns vector asset URLs and bounds per floor
- optional asset manifest endpoint for icons
- route payloads include floor-aware geometry segments

Do not remove the image-based payload immediately; support both until migration is complete.

## State management changes

- Preserve `zoom`/`center` per floor
- Preserve active floor during overlay swaps
- Keep the old Leaflet state shape until the SVG renderer is stable

The document explicitly notes the need to persist per-floor viewport state and to avoid losing zoom/pan on floor change.

## Acceptance criteria

- SVG floors render correctly on desktop and mobile.
- Floor switches no longer reset the viewport.
- Existing route overlays still render above the map.
- Marker positions align with the new vector asset coordinates.
- Current PNG-based floors can still be loaded during transition.

## Risks

- Overlay alignment issues if coordinate transforms are not centralized.
- Asset management drift if icons are hardcoded in multiple places.
- Performance regressions if all floors render simultaneously.

Mitigation: make floor rendering lazy, keep one active floor visible, and centralize transforms.

## Estimated implementation complexity

**Medium.** Mostly frontend rendering and asset management, with limited backend changes.

## Step-by-step execution

1. Add SVG/vector asset support for floors.
2. Build a floor asset registry.
3. Replace hardcoded image overlay logic with a floor-aware renderer.
4. Add per-floor viewport persistence.
5. Add fallback path to old images.
6. Verify marker, route, and connector alignment across floors.

---

# Phase 5: UI/UX improvements

## Objectives

Make floor navigation feel intuitive: clear floor switching, explicit cross-floor instructions, better route visualization, and reliable location tracking. The document already identifies floor-switch UX, route step clarity, and per-floor location anchoring as necessary improvements.

## Code areas affected

`frontend/src/components/FloorMap.jsx`, `frontend/src/store/useNavStore.js`, `frontend/src/components/...` for route cards, floor selector, and location tracking widgets.

## New components/services

- `FloorSelector`
- `CrossFloorStepCard`
- `RouteProgressPanel`
- `LocationConfidenceIndicator`
- `AccessibleRouteToggle`

These map directly to the current navigation status model (`UNLOCATED`, `ANCHORED`, `NAVIGATING`, `ARRIVED`) and make floor transitions understandable to users.

## Database changes

Usually none in this phase, except perhaps UX telemetry for:

- floor switch frequency,
- reroute frequency,
- connector usage,
- route completion times.

## API changes

- Optional enhancement: return more descriptive instruction metadata
- Optional enhancement: return connector labels and accessibility flags
- Optional enhancement: return floor-local POI groups for better search UI

These are additive and should not change core route behavior.

## State management changes

Add:

- `activeInstructionType`
- `routeProgressByFloor`
- `locationConfidence`
- `selectedFloorId`
- `floorSwitchHistory`

Keep the current status machine, but enrich it with floor transition state.

## Acceptance criteria

- Users can switch floors without losing their context.
- Cross-floor instructions are readable and explicit.
- Route visualization clearly distinguishes walked path, remaining path, and connector segments.
- User location updates do not “jump” silently between floors.
- Accessible routing is obvious and selectable.

## Risks

- Too much UI density can overwhelm users.
- Floor switches can still feel abrupt if transition messaging is weak.
- Bad labeling can make connector selection confusing.

Mitigation: keep UI patterns simple, show only the active floor prominently, and make transition cards explicit.

## Estimated implementation complexity

**Medium.** UI work is straightforward once routing and state are stable.

## Step-by-step execution

1. Add floor switcher UI.
2. Add cross-floor instruction cards.
3. Improve route polyline styling for transition segments.
4. Add floor-aware location status and confidence hints.
5. Add accessibility and search refinements.
6. Validate on mobile first.

---

# Recommended execution order for an AI coding agent

1. **Phase 1 first**: schema migrations and additive API fields.
2. **Phase 2 next**: multi-floor storage, loading, and state registry.
3. **Phase 3**: connector-aware routing and instructions.
4. **Phase 4**: renderer migration to SVG/vector floors.
5. **Phase 5**: polish UX, then tune performance and accessibility.

That sequence minimizes rewrite risk because it preserves the current graph, current routing behavior, and current floor rendering until each replacement is proven. The document’s own refactor opportunities support this ordering: separate loading, add floor context, persist viewport per floor, extend instructions, and only then expand rendering and asset complexity.