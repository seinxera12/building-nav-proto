# Multi-Floor Navigation — Sprint Completion Summary

## Status: Phases 1–3 + 5 COMPLETE | Phase 4 DEFERRED

---

## What Was Implemented

### Backend

| Component | File | Changes |
|-----------|------|---------|
| **Data Model** | `models.py` | Floor: +8 fields (map_svg_url, coordinate_system, origin_x/y, scale, elevation_m, default_viewport, is_accessible). Node: +elevation. Edge: +edge_type, floor_change, floor_delta |
| **Graph Engine** | `graph.py` | NavGraph stores floor_id + elevation per node; connector index by floor; `path_with_floors()` helper; Dijkstra handles cross-floor edges natively |
| **Routing** | `routes/routing.py` | Floor-aware instruction generation; new turn types (elevator/stairs/escalator); `floorId` on every instruction; `floorTransitions[]` in response; `build_transition_text()` |
| **Map API** | `routes/map.py` | `/map/floor/{id}` returns full floor metadata + connectors; `/search` has optional floor_id filter + returns floorName; `/buildings/{id}/floors` endpoint |
| **Offline API** | `routes/offline.py` | `/qr-codes/all` supports floor_id filter; `/graph` returns elevation, edge_type, floor_change, floor_delta |
| **Seed** | `seed.py` + `seed/*.json` | 2 floors, 28 nodes, 34 edges (4 connectors), 12 QR codes, 16 POIs; auto-generates floor images on run |
| **Floor Plans** | `generate_floorplan.py` | Generates `floor1.png` (2000×1400) + `floor2.png` (1200×800) with distinct layouts |
| **Health** | `main.py` | `/health` returns node count, floor count, connector count |

### Frontend

| Component | File | Changes |
|-----------|------|---------|
| **State** | `useNavStore.js` | `floorsById` registry; `currentFloorId`; `loadFloors()`; `switchFloor()` with full load; `findNodeAnyFloor()` helper; cross-floor `selectDestination`, `anchorNode`, `advanceStep` |
| **API Layer** | `api/index.js` | `fetchFloors()`; viewport persistence (save/get); floor-aware offline `buildOfflineRoute` with `floorId` per instruction + `floorTransitions` |
| **Map** | `FloorMap.jsx` | Floor-filtered polylines (current floor only); proportional padded bounds; `FloorViewportPersistence` with debounce + `onHasSaved`; stable `FitBounds` (no forced re-centre); reduced viscosity (0.6) and finer zoom steps (0.25) |
| **Floor Selector** | `FloorSelector.jsx` | Vertical pill stack; highlights active floor; async switch |
| **Instructions** | `InstructionPanel.jsx` | `CrossFloorStepCard` for elevator/stairs/escalator steps; transition badges in route preview; new turn icons |
| **Location** | `LocationBar.jsx` | Shows floor name badge (e.g., "Ground Floor (F1)") |
| **Search** | `SearchBar.jsx` | Passes `floorId` to `selectDestination`; shows floor name per result |
| **App Shell** | `App.jsx` | Calls `loadFloors(1)` on mount; renders `<FloorSelector />`; wired to `loadFloors` for retry |
| **Proxy** | `vite.config.js` | Added `/buildings`, `/pois` proxy rules |
| **CSS** | `index.css` | Floor selector styles; cross-floor instruction card; `.search-bar` pointer-events passthrough |

---

## Key Architectural Decisions

1. **Single Dijkstra for all floors** — Connector edges (elevator/stairs) have `floor_change=True` and explicit costs, so the graph naturally finds multi-floor paths without a separate `shortest_path_multi()` method.

2. **Eager floor loading** — All floors are fetched on app startup. This ensures `floorsById` is populated for cross-floor lookups without latency during navigation.

3. **`instruction.floorId` drives floor switching** — The backend annotates every instruction with its floor. The frontend's `advanceStep()` reads this directly and calls `switchFloor()` when it changes.

4. **Viewport persistence per floor** — Saved to localStorage on debounced moveend/zoomend. Restored when switching back to a previously visited floor. First visit uses `FitBounds` auto-center.

5. **Polyline floor filtering** — Route paths span multiple floors but the map only renders segments where both consecutive nodes are on the active floor.

---

## Bug Fixes Applied

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Dijkstra ValueError `cost, v = edge` | Edge tuples grew from 3 to 6 elements | Unpack all 6 explicitly |
| Floor images 404 | Old code wrote `floor_plan.png`, seed expected `floor1.png` | Regenerated with correct filenames |
| `/buildings/1/floors` → HTML 500 | Vite had no proxy rule for `/buildings` | Added to proxy config |
| Cross-floor QR scan → null node | `findNode` only searched current floor | Added `switchFloor()` before lookup |
| Search results "not on this floor" | `selectDestination` used `findNode(floor)` | Added `findNodeAnyFloor` + `targetFloorId` |
| Map jump/pan blocked | `InvalidateSizeOnStatusChange` forcibly re-centred; bounds too tight | Removed forced re-centre; 20% proportional padding; viscosity 0.6 |
| Search bar blocks map dragging | No `pointer-events: none` on search-bar container | Added passthrough + `pointer-events: all` on input/dropdown |

---

## What Remains (Phase 4 — Deferred)

| Task | Description | Priority |
|------|-------------|----------|
| 4.1.1 | Generate SVG floor plans alongside PNG | Low — PNG works fine |
| 4.2.1 | Prefer `imageSvgUrl` in FloorMap if present | Low — single-line change when SVGs exist |
| 4.4.1 | Refactor `toLatLng` to accept floor context (not rely on closure) | Low — only needed for simultaneous multi-floor rendering |

These are visual polish items. The navigation system is fully functional with PNG floor plans.

---

## Going Forward

### Immediate next steps (if continuing)
1. **Generate SVG floor plans** — better resolution, CSS-stylable rooms, layer toggles
2. **Real coordinate system** — replace pixel-based coords with meters; enable BLE/WiFi positioning
3. **Admin panel floor management** — upload floor images, define nodes/edges via GUI

### Medium-term features
- 3D floor stack visualization (Three.js layered SVGs)
- Accessibility routing preference toggle (avoid stairs, prefer elevators)
- Real-time position tracking (BLE beacons replacing QR checkpoints)
- Multi-building support (building selector → floors → navigation)

### Architecture changes needed for scale
- Partition graph per floor in backend (lazy-load; current eager approach doesn't scale past ~5 floors)
- Move to server-sent events for real-time position updates
- Add floor plan asset pipeline (CAD → SVG → coordinate extraction)

---

## Setup Commands (Quick Reference)

```bash
docker-compose build backend
docker-compose up -d backend
docker-compose exec backend python seed.py
cd frontend && npm run dev
```

Test cross-floor: `curl "http://localhost:8000/route?from_=1&to=113"`

Clear browser localStorage before testing to avoid stale cache conflicts.
