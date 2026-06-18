# Multi-Floor Navigation Implementation Tasks

---

## Implementation Status Tracker

### Phase 1: Data Model Refactor (Foundation) ✅ COMPLETED

| Task | Status | Notes |
|------|--------|-------|
| 1.1.1 Add new fields to Floor model | ✅ DONE | Added: map_svg_url, coordinate_system, origin_x, origin_y, scale, elevation_m, default_viewport, is_accessible |
| 1.1.2 Add elevation to Node model | ✅ DONE | Added elevation field |
| 1.1.3 Add floor transition fields to Edge model | ✅ DONE | Added: edge_type, floor_change, floor_delta |
| 1.2.1 Create migration script | ✅ DONE | Created backend/migrations/add_multifloor_columns.py |
| 1.3.1 Update seed.py with new fields | ✅ DONE | Updated; generates floor images, resolves paths relative to file |
| 1.3.2 Create seed data for Floor 2 | ✅ DONE | nodes.json: 14 F1 + 14 F2 nodes; edges.json with connectors; qr_codes.json for both floors |
| 1.4.1 Extend /map/floor/{floor_id} response | ✅ DONE | Added floorId, floorName, floorNum, connectors, coordinate metadata |
| 1.4.2 Add floor_id filter to /search | ✅ DONE | Added optional floor_id parameter; returns floorName per result |
| 1.4.3 Ensure /scan returns floorId | ✅ DONE | Already returns floorId (verified) |
| 1.5.1 Add floor registry to useNavStore | ✅ DONE | Added floorsById Map, floorViewportsById, currentFloorId |
| 1.5.2 Add multi-floor API functions | ✅ DONE | Added fetchFloors(), saveFloorViewport(), getFloorViewport() |

### Phase 2: Multi-Floor Support ✅ COMPLETED

| Task | Status | Notes |
|------|--------|-------|
| 2.1.1 Add GET /buildings/{building_id}/floors | ✅ DONE | Added endpoint in routes/map.py |
| 2.1.2 Add floor_id filter to /qr-codes/all | ✅ DONE | Added optional floor_id parameter |
| 2.2.1 Implement floor registry in useNavStore | ✅ DONE | loadFloors(), switchFloor() actions added |
| 2.2.2 Add floor switching action | ✅ DONE | switchFloor() switches between loaded floors; used by anchorLocation on cross-floor QR scan |
| 2.3.1 Persist viewport per floor | ✅ DONE | saveFloorViewport() / getFloorViewport() in api/index.js |
| 2.3.2 Integrate viewport persistence in FloorMap | ✅ DONE | FloorViewportPersistence component added |
| 2.4.1 Update offline cache for multi-floor | ✅ DONE | Cache key per floor: floor:{floorId}; /graph endpoint returns elevation + edge_type + floor_change + floor_delta |
| 2.5.1 Display floor context in search results | ✅ DONE | Backend returns floorId, floorName; frontend falls back gracefully |

### Bug Fixes Applied (Post-Seed Run)

| Bug | Fix |
|-----|-----|
| Dijkstra unpack error `cost, v = edge` | graph.py: all edges are 6-tuples, Dijkstra unpacks all 6 fields explicitly |
| Floor images 404 (`floor_plan.png` not found) | generate_floorplan.py now generates `floor1.png` and `floor2.png`; seed.py calls it on run |
| seed.py path error inside Docker `/app` | All file paths now resolved relative to `__file__` using `os.path.abspath` |
| `/graph` offline endpoint missing new edge columns | offline.py `/graph` now returns `elevation`, `edge_type`, `floor_change`, `floor_delta` |
| Cross-floor QR scan fails (`findNode` returns null) | anchorLocation now calls `switchFloor()` before `findNode` when scan floorId differs from currentFloorId |
| Missing blank line before `/buildings` route | Fixed in map.py |
| App.jsx calls `loadFloor(1)` — floors list never populated | Changed to `loadFloors(1)` which fetches all floors then loads floor 1 as active |
| LocationBar shows no floor context | Added `floorName (F{N})` label reading from store's `floor.floorName` / `floor.floorNum` |

---

## Analysis Summary

| Phase | Plan Requirements | Status |
|-------|-------------------|--------|
| **Phase 1** | Schema additions, additive API fields, frontend state additions | ✅ COMPLETED |
| **Phase 2** | Multi-floor endpoints, floor registry in state, viewport persistence | ✅ COMPLETED |
| **Phase 3** | Connector-aware graph, floor-aware pathfinding, floor-change instructions | ✅ COMPLETED |
| **Phase 4** | SVG support, floor-aware rendering, per-floor viewport | ⏳ PENDING |
| **Phase 5** | Floor switcher UI, cross-floor instructions | ✅ COMPLETED |

---

## Phase 3: Inter-Floor Navigation ✅ COMPLETED

### What was implemented

| Task | Status | Notes |
|------|--------|-------|
| 3.1.1 Connectors index at startup | ✅ DONE | `/health` returns `connectors` count |
| 3.1.2 `path_with_floors()` helper | ✅ DONE | graph.py — annotates each path node with floor_id, edge_type, floor_change |
| 3.2.1 Multi-floor Dijkstra | ✅ DONE | Existing Dijkstra finds cross-floor paths naturally via seeded connector edges |
| 3.2.2 Connector cost modeling | ✅ DONE | floor_change edges excluded from walking distance total |
| 3.3.1 Floor-transition instructions | ✅ DONE | `generate_instructions()` checks `path_meta[i].floor_change` |
| 3.3.2 New turn types + templates | ✅ DONE | `elevator`, `stairs`, `escalator`; `build_transition_text()` |
| 3.3.3 `floorId` on every instruction | ✅ DONE | All instruction dicts carry `floorId` |
| 3.4.1 `floorTransitions` in /route | ✅ DONE | `extract_floor_transitions()` returns structured list |
| 3.5.1 Auto-switch floor on advanceStep | ✅ DONE | Uses `instruction.floorId` directly; calls `switchFloor()` with toast |
| 3.5.2 Offline floor-aware routing | ✅ DONE | `buildOfflineRoute` emits `floorId` per instruction + `floorTransitions` |

### Phase 5: UI/UX — Completed alongside Phase 3

| Task | Status | Notes |
|------|--------|-------|
| 5.1.1 `FloorSelector.jsx` | ✅ DONE | Vertical pill stack on map left edge |
| 5.1.2 Integrate in App.jsx | ✅ DONE | Mounted alongside `<FloorMap />` |
| 5.2.1 CrossFloorStepCard | ✅ DONE | Rendered inside InstructionPanel for elevator/stairs/escalator steps |
| 5.2.2 InstructionPanel floor-change display | ✅ DONE | Preview shows transition badges; navigation shows CrossFloorStepCard |
| 5.3.1 Filter polyline to current floor | ✅ DONE | FloorMap builds contiguous same-floor segments only |
| 5.4.1 Floor name in LocationBar | ✅ DONE | `location-bar__floor` badge |
| 5.4.2 Floor switch on QR/manual anchor | ✅ DONE | `anchorLocation` + `anchorNode` call `switchFloor()` |

### 3.1 Connector-Aware Graph

**Task 3.1.1: Verify connectors index is populated at startup**
- File: `backend/graph.py`
- `NavGraph.connectors` is already built — verify at `/health` endpoint
- Status: ✅ structure exists, needs end-to-end test

**Task 3.1.2: Add `get_floor_connectors()` helper**
- File: `backend/graph.py`
- Return all connector nodes that link floor A to floor B
- Used by routing to find viable cross-floor paths

### 3.2 Multi-Floor Pathfinding

**Task 3.2.1: Implement `shortest_path_multi()`**
- File: `backend/graph.py`
- Logic:
  1. Check if `start` and `end` are on same floor → call existing `shortest_path()`
  2. If different floors → Dijkstra already handles it because elevator/stair edges are in the graph; just call `shortest_path()` unchanged
  3. Add `floor_id` metadata to each node in the returned path for the instruction generator
- Note: Because connector edges were seeded with real costs and `floor_change=True`, the existing Dijkstra will find cross-floor paths naturally — the main work is in instruction generation

**Task 3.2.2: Add path metadata helper**
- File: `backend/graph.py`
- `path_with_floors(path: list[int]) → list[dict]` — annotates each node with its floor_id
- Used by `generate_instructions` to detect floor transitions

### 3.3 Floor-Aware Instructions

**Task 3.3.1: Detect floor transitions in `generate_instructions()`**
- File: `backend/routes/routing.py`
- For each consecutive pair in path, check if `nav_graph.nodes[u]['floor_id'] != nav_graph.nodes[v]['floor_id']`
- When true, emit `take_elevator` / `take_stairs` / `take_escalator` instruction instead of turn direction

**Task 3.3.2: Add new instruction turn types and text templates**
- File: `backend/routes/routing.py`
- New turn types: `take_elevator`, `take_stairs`, `take_escalator`
- Template: `"Take the {type} to {floor_name}"`

**Task 3.3.3: Add `floorId` to every instruction**
- File: `backend/routes/routing.py`
- Each instruction dict gets `"floorId": nav_graph.nodes[curr_id]['floor_id']`
- Allows frontend to know which floor to display at each step

### 3.4 Extend `/route` Response

**Task 3.4.1: Add `floorTransitions` to route response**
- File: `backend/routes/routing.py`
- `floorTransitions: [{"fromFloor": 1, "toFloor": 2, "nodeId": 8, "type": "elevator"}, ...]`
- Derived from scanning the path for consecutive nodes with different floor_ids

### 3.5 Frontend Route State

**Task 3.5.1: Auto-switch map floor during navigation step**
- File: `frontend/src/store/useNavStore.js`
- In `advanceStep()`: check `nextInstruction.floorId` — if different from `currentFloorId`, call `switchFloor(nextInstruction.floorId)`

**Task 3.5.2: Update offline `buildOfflineRoute` for floor awareness**
- File: `frontend/src/api/index.js`
- Offline path already works (Dijkstra traverses cross-floor edges); add `floorId` per instruction using node metadata from cached graph

---

## Phase 4: Map Rendering ⏳ PENDING

### 4.1 SVG Floor Plans

**Task 4.1.1: Generate SVG alongside PNG in `generate_floorplan.py`**
- For each floor, output both `.png` (existing) and `.svg`
- SVG structure: `<g class="walls">`, `<g class="rooms">`, `<g class="connectors">`

**Task 4.1.2: Serve SVGs from backend**
- Already handled: `main.py` mounts `/maps` from `seed/` — SVGs placed there are served automatically

### 4.2 FloorMap SVG Support

**Task 4.2.1: Prefer SVG if `imageSvgUrl` is present**
- File: `frontend/src/components/FloorMap.jsx`
- Change: `const imageUrl = floor?.imageSvgUrl || floor?.imageUrl`
- No other changes needed — `ImageOverlay` accepts SVG URLs

**Task 4.2.2: Update `FitBounds` to handle per-floor bounds**
- File: `frontend/src/components/FloorMap.jsx`
- Already uses `floor.bounds` — will work correctly once Floor 2 has correct bounds

---

## Phase 5: UI/UX ⏳ PENDING

### 5.1 Floor Selector Component

**Task 5.1.1: Create `FloorSelector.jsx`**
- File: `frontend/src/components/FloorSelector.jsx` (new)
- Reads `floorsById` from store, renders floor tabs/pills
- Calls `switchFloor(id)` on click
- Highlights `currentFloorId`

**Task 5.1.2: Add to App.jsx**
- Render `<FloorSelector />` inside the map area (top-left overlay position)
- Only show when `floorsById.size > 1`

### 5.2 Cross-Floor Instruction Card

**Task 5.2.1: Extend `InstructionPanel.jsx` for floor-change steps**
- Detect `instruction.turn === 'take_elevator' | 'take_stairs' | 'take_escalator'`
- Show prominent floor-change banner: `"🛗 Take elevator → Floor 2"`

### 5.3 Route Polyline Across Floors

**Task 5.3.1: Filter route polyline to current floor only**
- File: `frontend/src/components/FloorMap.jsx`
- When rendering `remainingPositions`, only include nodes where `node.floor_id === currentFloorId`
- Avoids drawing route lines to nodes on invisible floors

---

## Setup Commands

Run these in order after pulling the latest code changes.

### Step 1 — Rebuild the backend image

```bash
docker-compose build backend
```

### Step 2 — Restart the backend container

```bash
docker-compose up -d backend
```

### Step 3 — Re-seed the database (fresh)

This drops and recreates all tables, generates floor images, and inserts both floors.

```bash
docker-compose exec backend python seed.py
```

Expected output:
```
[OK] Floor 1 image saved → /app/seed/floor1.png
[OK] Floor 2 image saved → /app/seed/floor2.png
✅ Seeded:
   - Floor 1 (Ground Floor): 14 nodes
   - Floor 2 (Second Floor): 14 nodes
   - 34 edges (including 4 floor connectors)
   - 12 QR codes
   - 16 POIs
```

### Step 4 — Verify database state

```bash
# Floors
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text; import os
e = create_engine(os.getenv('SYNC_DATABASE_URL'))
with e.connect() as c:
    for r in c.execute(text('SELECT floor_num, name, elevation_m, is_accessible FROM floors ORDER BY floor_num')).fetchall():
        print(r)
"

# Nodes per floor
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text; import os
e = create_engine(os.getenv('SYNC_DATABASE_URL'))
with e.connect() as c:
    for r in c.execute(text('SELECT floor_id, COUNT(*) as cnt FROM nodes GROUP BY floor_id')).fetchall():
        print(r)
"

# Floor connector edges
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text; import os
e = create_engine(os.getenv('SYNC_DATABASE_URL'))
with e.connect() as c:
    for r in c.execute(text(\"SELECT edge_type, floor_change, COUNT(*) FROM edges GROUP BY edge_type, floor_change ORDER BY floor_change DESC\")).fetchall():
        print(r)
"
```

### Step 5 — Verify API endpoints

```bash
# Health — should show total node count (28)
curl http://localhost:8000/health

# Floor 1 metadata
curl http://localhost:8000/map/floor/1 | python -m json.tool | grep -E '"floor|bounds|connectors"'

# Floor 2 metadata
curl http://localhost:8000/map/floor/2 | python -m json.tool | grep -E '"floor|bounds|connectors"'

# Building floors list
curl http://localhost:8000/buildings/1/floors

# Cross-floor route (node 1 on floor 1 → node 113 on floor 2)
curl "http://localhost:8000/route?from_=1&to=113"

# Search across floors
curl "http://localhost:8000/search?q=meeting"

# QR codes for floor 2
curl "http://localhost:8000/qr-codes/all?floor_id=2"
```

### Step 6 — Start the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

### Step 7 — Smoke test in browser

1. App loads → LocationBar shows "Ground Floor (F1)"
2. Open DevTools → Network → confirm `/buildings/1/floors` called and returns 2 floors
3. Confirm `/map/floor/1` response contains `floorId`, `floorName`, `connectors` array
4. In demo mode (`?demo`): scan `QR_LOBBY_MAIN` → anchors to Ground Floor lobby
5. Click "Cafeteria" POI → route appears
6. Scan `QR_F2_LOBBY` → app switches to Floor 2, re-anchors

### Step 8 — Optional: If you need to migrate without losing existing data

```bash
docker-compose exec backend python -m migrations.add_multifloor_columns
```

This adds all new columns to existing tables without dropping data.

---

## Phase 1: Data Model Refactor (Foundation)

### 1.1 Backend Schema Extensions

**Task 1.1.1: Add new fields to Floor model**
- File: `backend/models.py`
- Add fields:
  - `coordinate_system` (String, default="pixel")
  - `origin_x` (Float, default=0)
  - `origin_y` (Float, default=0)  
  - `scale` (Float, default=1.0) — pixels per meter
  - `elevation_m` (Float, default=0) — floor elevation in meters
  - `default_viewport` (JSON, nullable)
  - `is_accessible` (Boolean, default=True)
- All fields must be nullable or have defaults for backward compatibility

**Task 1.1.2: Add new fields to Node model**
- File: `backend/models.py`
- Add fields:
  - `elevation` (Integer, default=0) — floor level (0=ground, 1=first, -1=basement)

**Task 1.1.3: Add new fields to Edge model**
- File: `backend/models.py`
- Add fields:
  - `edge_type` (String, default="walkable") — "walkable" | "elevator" | "stairs" | "escalator"
  - `floor_change` (Boolean, default=False) — True if edge crosses floors
  - `floor_delta` (Integer, default=0) — +1 for stairs up, -1 for stairs down

### 1.2 Database Migration

**Task 1.2.1: Create Alembic migration script**
- File: `backend/alembic/versions/` (or migration helper)
- Add all new columns as nullable/with defaults
- DO NOT remove existing columns

### 1.3 Seed Data Updates

**Task 1.3.1: Update seed.py to include new fields**
- File: `backend/seed.py`
- Add second floor (Floor 2) with appropriate nodes/edges
- Add elevator/stair connector nodes between floors
- Populate new fields with sensible defaults

**Task 1.3.2: Create seed data for Floor 2**
- File: `backend/seed/nodes.json` — add nodes for floor 2
- File: `backend/seed/edges.json` — add edges including floor connectors

### 1.4 API Payload Extensions

**Task 1.4.1: Extend /map/floor/{floor_id} response**
- File: `backend/routes/map.py`
- Keep existing keys (imageUrl, bounds, nodes, pois, qrCodes)
- Add new keys:
  - `floorId`, `floorName`, `floorNum`
  - `coordinateSystem`, `scale`, `elevationM` (if != default)
  - `connectors` — list of elevator/stair nodes on this floor

**Task 1.4.2: Add floor_id to /search endpoint**
- File: `backend/routes/map.py`
- Add optional `floor_id` query parameter
- Filter results by floor_id when provided
- **NOTE:** Frontend currently searches local floor POIs only; this adds backend filtering

**Task 1.4.3: Ensure /scan returns floorId (ALREADY DONE)**
- File: `backend/routes/scan.py`
- Verify floorId is returned — confirmed on line 44 ✅

### 1.5 Frontend State Additions (Additive Only)

**Task 1.5.1: Add floor registry to useNavStore**
- File: `frontend/src/store/useNavStore.js`
- Add (do NOT replace existing `floor`):
  - `floorsById: Map<number, Floor>` — registry of loaded floors
  - `floorViewportsById: Map<number, {zoom, center}>` — per-floor viewport
  - `currentFloorId: number` — derived/active floor ID
- Keep existing `floor` scalar until Phase 4

**Task 1.5.2: Add multi-floor API functions**
- File: `frontend/src/api/index.js`
- Add `fetchFloors(buildingId)` — get all floors for building
- Modify `fetchFloor` to populate floorsById registry

### 1.6 Testing Phase 1

**Task 1.6.1: Unit tests for schema serialization**
- Test old payload shape still works
- Test new fields are included in response
- Test floorId returned from scan

**Verification Criteria:**
- [ ] Existing single-floor flows work unchanged
- [ ] Database migration applies without data loss
- [ ] New API fields are present but not required
- [ ] Frontend state has additive floor registry

---

## Phase 2: Multi-Floor Support

### 2.1 Multi-Floor Backend Endpoints

**Task 2.1.1: Add GET /buildings/{building_id}/floors**
- File: `backend/routes/map.py` (or new file `backend/routes/buildings.py`)
- Returns list of all floors with basic metadata:
  ```json
  [
    {"id": 1, "floorNum": 1, "name": "Ground Floor", "elevationM": 0, "isAccessible": true},
    {"id": 2, "floorNum": 2, "name": "Second Floor", "elevationM": 3.5, "isAccessible": true}
  ]
  ```

**Task 2.1.2: Add floor_id filter to /qr-codes/all**
- File: `backend/routes/offline.py`
- Add optional `floor_id` query parameter
- Return floor-scoped QR codes

### 2.2 Frontend Floor Registry

**Task 2.2.1: Implement floor registry in useNavStore**
- File: `frontend/src/store/useNavStore.js`
- Replace current single-floor `loadFloor` behavior:
  - Load floor → add to `floorsById` Map
  - Set `currentFloorId` to loaded floor
  - Keep `floor` as alias to `floorsById.get(currentFloorId)`
- Add `loadMultipleFloors(floorIds)` action

**Task 2.2.2: Add floor switching action**
- File: `frontend/src/store/useNavStore.js`
- Add `switchFloor(floorId)` action:
  - Save current viewport to `floorViewportsById`
  - Load new floor if not in registry
  - Restore viewport from `floorViewportsById`
  - Update `currentFloorId`

### 2.3 Viewport Persistence

**Task 2.3.1: Persist viewport per floor in localStorage**
- File: `frontend/src/api/index.js`
- Add functions:
  - `saveFloorViewport(floorId, {zoom, center})`
  - `getFloorViewport(floorId)` 
  - Store under key `qrnav:viewport:{floorId}`

**Task 2.3.2: Integrate viewport persistence in FloorMap**
- File: `frontend/src/components/FloorMap.jsx`
- On floor switch: restore saved viewport
- On viewport change: debounce save to localStorage

### 2.4 Offline Cache Updates

**Task 2.4.1: Update offline cache for multi-floor**
- File: `frontend/src/api/index.js`
- Change cache key from `floor:1` to `floor:{floorId}`
- Cache graph per floor or with floor metadata

### 2.5 Search with Floor Context

**Task 2.5.1: Display floor context in search results**
- File: `frontend/src/store/useNavStore.js`
- Modify `runSearch` to include floor info in results
- Show "Floor 1", "Floor 2" labels

**Verification Criteria:**
- [ ] App loads multiple floors without losing previous floor data
- [ ] Floor switching preserves route and viewport
- [ ] Search results show floor context
- [ ] Offline cache stores floors independently

---

## Phase 3: Inter-Floor Navigation

### 3.1 Connector-Aware Graph Loading

**Task 3.1.1: Load floor context into graph**
- File: `backend/graph.py`
- Modify `load_graph_from_db` to:
  - Load floor_id with nodes
  - Store floor_id in node metadata
  - Identify connector nodes (type = elevator/stairs/escalator)

**Task 3.1.2: Build connector index**
- File: `backend/graph.py`
- Add `connectors: dict[int, list[dict]]` — node_id → [{"floor_id": x, "node_id": y, "type": "elevator"}]
- Index all elevator/stair nodes by the floors they connect

### 3.2 Multi-Floor Pathfinding

**Task 3.2.1: Implement shortest_path_multi()**
- File: `backend/graph.py`
- New method that:
  1. Finds floor of start and end nodes
  2. If same floor: uses existing shortest_path()
  3. If different: finds connector path between floors
  4. Returns path with floor transition markers

**Task 3.2.2: Add connector cost modeling**
- File: `backend/graph.py`
- Elevator edges should have higher cost (simulating wait time)
- Stairs should have cost based on floor_delta

### 3.3 Floor-Aware Instructions

**Task 3.3.1: Add floor-change instruction types**
- File: `backend/routes/routing.py`
- Add to instruction types: `take_elevator`, `take_stairs`, `take_escalator`
- Modify `generate_instructions` to detect floor transitions

**Task 3.3.2: Update instruction text templates**
- File: `backend/routes/routing.py`
- Add templates:
  ```python
  "take_elevator": "Take elevator to Floor {floor_num}",
  "take_stairs": "Take stairs to Floor {floor_num}",
  "take_escalator": "Take escalator to Floor {floor_num}",
  ```

### 3.4 Backend Route Endpoint Update

**Task 3.4.1: Extend /route response**
- File: `backend/routes/routing.py`
- Add to response:
  - `floorTransitions: [{"fromFloor": 1, "toFloor": 2, "connectorNodeId": x, "type": "elevator"}, ...]`
  - Each instruction includes `floorId` field

### 3.5 Frontend Route Updates

**Task 3.5.1: Handle floor transitions in route display**
- File: `frontend/src/store/useNavStore.js`
- Parse `floorTransitions` from route response
- Add `activeFloorId` to route state

**Task 3.5.2: Update client-side offline routing**
- File: `frontend/src/api/index.js`
- Modify `buildOfflineRoute` to handle floor transitions
- Use floor metadata from cached graph

**Verification Criteria:**
- [ ] Route can span floor 1 to floor 2
- [ ] Instructions include "Take elevator to Floor 2"
- [ ] Same-floor routes unchanged
- [ ] Offline fallback supports multi-floor

---

## Phase 4: Map Rendering Migration

### 4.1 SVG Asset Support

**Task 4.1.1: Generate SVG floor plans**
- File: `backend/generate_floorplan.py`
- Modify to output SVG instead of/complementing PNG
- Structure SVG with layers: walls, corridors, POIs, connectors

**Task 4.1.2: Update Floor model for SVG**
- File: `backend/models.py`
- Support both `map_url` (PNG) and `map_svg_url` (SVG)

### 4.2 FloorMap Rendering Updates

**Task 4.2.1: Support SVG in FloorMap**
- File: `frontend/src/components/FloorMap.jsx`
- Detect SVG vs PNG from URL
- Use L.imageOverlay for PNG, L.svgOverlay for SVG
- OR use `<img>` with SVG and custom coordinate handling

**Task 4.2.2: Floor-aware layer management**
- File: `frontend/src/components/FloorMap.jsx`
- Track active floor overlay
- Swap overlays on floor switch without full remount

### 4.3 Per-Floor Viewport Restoration

**Task 4.3.1: Save/restore viewport on floor switch**
- File: `frontend/src/components/FloorMap.jsx`
- On mount: check for saved viewport for current floor
- On floor switch: save current, restore target floor's viewport

### 4.4 Coordinate Transform Centralization

**Task 4.4.1: Refactor toLatLng to accept floor context**
- File: `frontend/src/components/FloorMap.jsx`
- Pass floor bounds instead of relying on closure variable
- Enable floor-agnostic coordinate transforms

**Verification Criteria:**
- [ ] SVG floors render correctly
- [ ] Floor switches don't reset zoom/pan
- [ ] Route overlays work over SVG
- [ ] Markers align with vector coordinates

---

## Phase 5: UI/UX Improvements

### 5.1 Floor Switcher Component

**Task 5.1.1: Create FloorSelector component**
- File: `frontend/src/components/FloorSelector.jsx` (new)
- Dropdown or tab bar showing available floors
- Shows current floor with highlight
- Triggers `switchFloor` action

**Task 5.1.2: Integrate FloorSelector in app**
- File: `frontend/src/App.jsx`
- Place floor selector near map or in header
- Show floor name and number

### 5.2 Cross-Floor Instruction Display

**Task 5.2.1: Create CrossFloorStepCard**
- File: `frontend/src/components/CrossFloorInstruction.jsx` (new)
- Shows elevator/stair instruction prominently
- Displays floor transition animation/icon

**Task 5.2.2: Update InstructionPanel for floor transitions**
- File: `frontend/src/components/InstructionPanel.jsx`
- Detect floor-change instruction types
- Render CrossFloorStepCard instead of regular instruction

### 5.3 Route Visualization Enhancements

**Task 5.3.1: Style connector segments differently**
- File: `frontend/src/components/FloorMap.jsx`
- Detect floor transition edges in route path
- Style differently (dashed, different color)

### 5.4 Location Tracking Across Floors

**Task 5.4.1: Show current floor in LocationBar**
- File: `frontend/src/components/LocationBar.jsx`
- Display current floor name alongside node label

**Task 5.4.2: Handle location updates across floors**
- File: `frontend/src/store/useNavStore.js`
- When scanning QR on different floor, trigger floor switch
- Show "Now on Floor X" notification

**Verification Criteria:**
- [ ] Users can switch floors via UI
- [ ] Floor transitions are clearly communicated
- [ ] Route visualization shows connector segments
- [ ] Location shows floor context

---

## Sprint Clarifying Questions

Before proceeding with implementation, clarify:

1. **Scope Priority**: Should we focus on Phases 1-2 (foundation + multi-floor loading) or attempt full Phase 3 (inter-floor routing) in this sprint?

2. **Seed Data Strategy**: Should Floor 2 be a complete duplicate layout or a different layout? What's the building type being modeled (office, mall, hospital)?

3. **Backward Compatibility**: Is it critical that existing single-floor deployments not break at all, or can we introduce breaking changes with a migration path?

4. **Offline Strategy**: Should offline multi-floor support be implemented now or deferred? Current offline uses localStorage which has size limits.

5. **SVG vs PNG**: Should we start with SVG generation (more work) or improve PNG generation with layers (simpler)?

6. **Testing Approach**: Should unit tests be written first, or can we implement and validate functionally?

---

## Recommended Execution Order

Given the analysis, **Phase 1 (Data Model)** should be the priority for this sprint as it provides the foundation for all other phases. Within Phase 1:

1. **Highest Priority**: Tasks 1.1.1-1.1.3 (schema), 1.2.1 (migration), 1.3.1-1.3.2 (seed)
2. **Medium Priority**: Tasks 1.4.1-1.4.3 (API extensions), 1.5.1-1.5.2 (frontend state)
3. **Lower Priority**: Task 1.6.1 (testing) — can be done alongside

After Phase 1 is complete, Phase 2 (Multi-floor support) becomes straightforward additions on top of the new schema.