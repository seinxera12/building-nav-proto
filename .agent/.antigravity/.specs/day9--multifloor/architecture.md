# Building Navigation Architecture — Multi-Floor Extension Analysis

## Overview

The building navigation system consists of a FastAPI backend providing graph-based routing through a PostgreSQL database, and a React frontend using Leaflet.js with CRS.Simple for indoor map rendering. The system currently supports single-floor navigation only, with hardcoded floor plan dimensions (2000×1400 pixels) and no floor-level semantics in the graph or routing logic.

---

## 1. Floor Map System

### 1.1 Floor Plan Generation

**File:** `backend/generate_floorplan.py`

Creates 2000×1400 pixel PNG images using PIL. The layout is hardcoded:

- Horizontal corridor at y=380 (80px height), spanning x=180 to x=1020
- Two vertical corridors at x=400 and x=640 (80px width each), spanning y=220 to y=530
- Eight POI rooms with colored fills and borders (Main Lobby, Conference Room A, Office Suite 201, Restroom, Cafeteria, Stairwell A, IT Department, Elevators)
- Output written to `/backend/seed/floor_plan.png`

**Limitation:** Floor plan generation is a static, one-time process. No mechanism exists to generate multiple floor variants or to parameterize floor layouts.

### 1.1.1 Floor Plan Visualization Gap

The current floor plan generation using PIL creates simple colored rectangles — suitable for prototyping but inadequate for real-world enterprise buildings, shopping malls, hospitals, or airports. The visualization has several significant limitations:

1. **No architectural detail** — Walls are single-pixel outlines; rooms are solid color blocks with no furniture, fixtures, or structural elements
2. **No scale accuracy** — Corridors and rooms are sized for visual clarity, not to real-world measurements
3. **No asset library** — No icons for elevators, stairs, restrooms, exits, escalators, or accessibility features
4. **No layering** — Single flattened image; cannot toggle layers (e.g., show/hide furniture, emergency exits)
5. **No multi-floor stacking** — Each floor is a separate static image with no vertical relationship

### 1.1.2 Upgrade Path to Real-World Floor Maps

The system can be upgraded to enterprise-grade floor map visualization with minimal disruption to the existing routing and navigation logic:

#### Phase 1: SVG-Based Floor Plans (Recommended First Step)

**Why SVG over PNG:**

- Scalable without pixelation (crisp at any zoom level)
- Supports CSS styling, animations, and interactivity
- Smaller file size for equivalent detail
- Editable in vector editors (Adobe Illustrator, Inkscape, Figma)
- DOM-manipulable for dynamic overlays (highlight paths, animate markers)

**Migration path:**

1. Replace `generate_floorplan.py` with an SVG template system
2. Store SVG files in `/backend/seed/maps/floor_{floor_num}.svg`
3. Update `Floor` model to reference `.svg` instead of `.png`
4. Modify `FloorMap.jsx` to use `L.imageOverlay` with SVG (Leaflet supports SVG natively via `SVGOverlay` or by referencing SVG URLs)

**Example SVG structure:**
```svg
<svg viewBox="0 0 2000 1400" xmlns="http://www.w3.org/2000/svg">
  <!-- Building outline -->
  <rect x="10" y="10" width="1980" height="1380" fill="#f8fafc" stroke="#475569" stroke-width="5"/>
  
  <!-- Walls layer (class for toggling) -->
  <g class="walls">
    <rect x="360" y="220" width="80" height="310" fill="none" stroke="#64748b" stroke-width="3"/>
    <rect x="560" y="220" width="80" height="310" fill="none" stroke="#64748b" stroke-width="3"/>
  </g>
  
  <!-- Corridors -->
  <rect x="180" y="340" width="840" height="80" fill="#ffffff"/>
  
  <!-- POI icons -->
  <g class="poi" data-id="elevator-1">
    <rect x="760" y="340" width="80" height="80" fill="#fef3c7" stroke="#f59e0b"/>
    <text x="800" y="385" text-anchor="middle" font-size="24">⬇</text>
  </g>
  
  <!-- Accessibility features -->
  <g class="accessibility">
    <circle cx="400" cy="400" r="15" fill="#22c55e"/>
    <text x="400" y="405" text-anchor="middle" font-size="12">♿</text>
  </g>
</svg>
```

#### Phase 2: CAD Integration (For Large Deployments)

For enterprise deployments (hospitals, airports, large malls), integrate with architectural CAD/BIM tools:

1. **Export pipeline:** CAD → SVG/JSON → Database
   - AutoCAD `.dwg` or Revit `.rvt` files → SVG export via Python libraries (ezdxf, ifc4d)
   - Alternatively: JSON floor plan format with wall/polyline/coordinate data

2. **Layer mapping:**
   ```
   CAD Layer    → SVG Group    → Navigation Feature
   -----------------------------------------------
   WALLS        → .walls       → Collision detection
   ROOMS        → .rooms       → POI detection
   ELEVATORS    → .elevators   → Floor connectors
   STAIRS       → .stairs      → Floor connectors
   EXIT_DOORS   → .exits       → Emergency exits
   FURNITURE    → .furniture   → Obstacles
   ```

3. **Tools for conversion:**
   - `ezdxf` (Python): Read/write AutoCAD DXF files
   - `svgwrite` (Python): Generate SVG from coordinate data
   - `OdaFileConverter`: Convert DWG/DXF to intermediate formats

#### Phase 3: 3D Floor Map Integration (Future)

For advanced visualization, consider 3D-aware rendering:

1. **Three.js overlay:** Render 3D floor plan as Leaflet overlay using `CSSTransform` or custom CRS
2. **Layered approach:** Stack floor SVGs vertically with Z-offset, allow toggle between 2D/3D views
3. **Key architecture:** Keep 2D routing separate from 3D visualization — routing always operates on graph nodes, not 3D geometry

**Minimal 3D integration example:**
```javascript
// FloorMap3D.jsx — layered SVG stacks
const floorLayers = floors.map((floor, index) => ({
  floorId: floor.id,
  elevation: floor.elevation || floor.floor_num * 3.5, // meters per floor
  svgUrl: floor.map_url
}));

// 3D view: offset each floor vertically
<ThreeCanvas>
  {floorLayers.map(layer => (
    <Mesh position={[0, layer.elevation * 100, 0]}>
      <SVGMesh url={layer.svgUrl} />
    </Mesh>
  ))}
</ThreeCanvas>
```

#### Phase 4: Multi-Floor Asset Library

Create reusable icons and assets:

| Asset | Use Case | Format |
|-------|----------|--------|
| Elevator | Floor transition | SVG with animation |
| Stairs | Floor transition | SVG with directional arrow |
| Escalator | Floor transition | SVG with direction |
| Restroom | POI | SVG, gender-inclusive |
| Wheelchair | Accessibility | SVG with ramp indicators |
| Exit | Emergency | SVG, photoluminescent style |
| First Aid | POI | SVG |
| Help Desk | POI | SVG |
| escalator_up / escalator_down | Directional | Animated SVG |

Store in `frontend/public/floor-assets/` and reference in SVG via `<use href="/floor-assets/elevator.svg"/>`.

#### Phase 5: Coordinate System Alignment

When upgrading floor plans, establish a real-world coordinate reference:

```python
# In models.py — extend Floor
class Floor(Base):
    # ... existing fields ...
    coordinate_system = Column(String, default="pixel")  # "pixel" | "meter" | "geo"
    origin_x = Column(Float, default=0)     # Real-world X offset (meters)
    origin_y = Column(Float, default=0)     # Real-world Y offset (meters)
    scale = Column(Float, default=1.0)      # Pixels per meter (e.g., 50 = 50px/m)
```

Frontend transforms:
```javascript
function pixelToMeter(pixelCoord, floor) {
  return {
    x: (pixelCoord.x - floor.origin_x) / floor.scale,
    y: (pixelCoord.y - floor.origin_y) / floor.scale
  };
}
```

#### Integration Points Summary

| Component | Change Required | Impact |
|-----------|----------------|--------|
| `generate_floorplan.py` | Replace with SVG template generator | Low — only affects seed data |
| `backend/models.py` | Add `coordinate_system`, `scale`, `origin_*` fields | Medium — migration needed |
| `backend/seed.py` | Generate SVG files instead of PNG | Low — one-time migration |
| `FloorMap.jsx` | Switch to `SVGOverlay` or `<img>` with SVG | Low — Leaflet supports SVG |
| Frontend assets | Add icon library | Low — additive |
| Graph/routing | No changes needed | N/A |

**Recommendation:** Start with Phase 1 (SVG migration) as it provides immediate visual improvement with minimal code change, preserves all existing routing logic, and sets the foundation for Phase 2-5 when enterprise requirements demand it.

### 1.2 Storage and Database Schema

**Files:** `backend/models.py`, `backend/db.py`

```python
# Floor table
class Floor(Base):
    id          # Primary key
    building_id # Default 1
    floor_num   # Integer (e.g., 1, 2, 3)
    name        # Display name
    map_url     # Path to image (e.g., "/maps/floor1.png")
    bounds      # JSON: {minX, minY, maxX, maxY}

# Node table
class Node(Base):
    id          # Primary key
    floor_id    # Foreign key to floors
    label       # Human-readable name
    type        # junction | poi | elevator | stairs | entrance | qr_anchor
    x, y        # Pixel coordinates within floor bounds
    accessible  # Boolean (for accessibility routing)
    metadata_   # JSON blob for extensibility

# Edge table
class Edge(Base):
    id           # Primary key
    from_node    # FK to nodes
    to_node      # FK to nodes
    cost         # Routing cost (typically pixel distance)
    reverse_cost # Cost in opposite direction
    walkable     # Boolean (edges filtered at load time)
    accessible   # Boolean (for accessible routing)
```

**Key observation:** The Edge table has no `floor_id` field. Edges implicitly connect nodes on the same floor since they reference node IDs, but the database does not enforce floor-level isolation.

### 1.3 Floor Plan Loading

**Backend endpoint:** `GET /map/floor/{floor_id}` (defined in `backend/routes/map.py`)

Returns:
```json
{
  "imageUrl": "/maps/floor_plan.png",
  "bounds": { "minX": 0, "minY": 0, "maxX": 2000, "maxY": 1400 },
  "nodes": [{ "id": 1, "floor_id": 1, "x": 100, "y": 200, "label": "Main Lobby", "type": "entrance" }],
  "pois": [...],
  "qrCodes": [...]
}
```

**Frontend API:** `frontend/src/api/index.js` → `fetchFloor(floorId)`

- Network-first strategy with 3-second timeout
- Falls back to localStorage cache when offline
- Caches floor data under a single key — no multi-floor caching

### 1.4 Rendering Pipeline

**File:** `frontend/src/components/FloorMap.jsx`

Uses Leaflet with `CRS.Simple` (pixel-based coordinate system):

```javascript
// Coordinate transformation (lines 9-11)
function toLatLng(node, maxY) {
  return [maxY - node.y, node.x];  // Y inverted for Leaflet
}

// Image bounds setup (lines 215-221)
const bounds = [[-60, -60], [maxY + 60, maxX + 60]];
```

**Rendering layers in z-order:**

1. Floor plan image (`ImageOverlay`)
2. Walked route (dimmed dotted polyline)
3. Remaining route (bright polyline)
4. Active segment highlight (cyan)
5. Previous route ghost (for rerouting)
6. Node markers (`CircleMarker`, color-coded by type)
7. Current location marker (pulsing)
8. Animated movement ghost
9. Destination marker
10. Demo QR anchors

**Node color scheme:**
```javascript
const NODE_COLORS = {
  entrance:  '#3b82f6',
  junction:  '#6b7280',
  elevator:  '#f59e0b',
  stairs:    '#f97316',
  poi:       '#10b981',
  qr_anchor: '#8b5cf6'
};
```

---

## 2. Navigation Engine

### 2.1 Graph Data Structure

**File:** `backend/graph.py`

```python
class NavGraph:
    adj: dict[int, list[tuple[float, int, bool]]]  # node_id → [(cost, neighbor_id, accessible), ...]
    nodes: dict[int, dict]                         # node_id → {x, y, label, type}
```

- Bidirectional edges stored with forward and reverse costs
- Graph loaded on FastAPI startup via `load_graph_from_db()` in `main.py`
- Only walkable edges loaded (`WHERE walkable = true`)

### 2.2 Pathfinding Algorithm

**File:** `backend/graph.py` → `NavGraph.shortest_path()` (lines 20-45)

Implements Dijkstra's algorithm:

- Priority queue: `(distance, node_id)`
- Supports `accessible_only` flag to filter edges where `accessible = false`
- Returns ordered list of node IDs or empty list if no path
- Time complexity: O((V + E) log V)

**Cost function:** Uses the `cost` field from the Edge table, not Euclidean distance. Euclidean distance (`euclidean_cost()`) is only used for total distance calculation in the route response.

### 2.3 Route Computation and Instructions

**File:** `backend/routes/routing.py`

**Endpoint:** `GET /route?from_={fromId}&to={toId}&accessible_only={bool}`

Flow:

1. Call `nav_graph.shortest_path(from_, to, accessible_only)`
2. Generate turn-by-turn instructions via `generate_instructions(path)`
3. Find QR checkpoints along path (`path[1:-1]`, excluding start/end)
4. Calculate total distance as sum of Euclidean distances

**Instruction generation (lines 44-87):**

- First node: `turn = "start"`, text "Start at X, head toward Y"
- Middle nodes: compute turn direction via `compute_turn(prev, curr, next)`
- Last node: `turn = "destination"`, text "Arrive at X"

**Turn computation (lines 90-111):**

- Calculates angle between vectors (prev→curr) and (curr→next)
- Classifies as: `straight` (<30°), `left`, `right`, `u_turn` (>150°)
- Ignores segments shorter than 20 pixels

### 2.4 Client-Side Fallback Routing

**File:** `frontend/src/api/index.js` (lines 100-171)

When offline, the frontend uses a client-side Dijkstra implementation (`shortestPath()`) mirroring the backend logic. Instructions are rebuilt using the same turn computation.

---

## 3. UI Integration

### 3.1 State Management

**File:** `frontend/src/store/useNavStore.js`

**Navigation state (lines 239-270):**
```javascript
{
  status,              // "UNLOCATED" | "ANCHORED" | "ROUTE_PREVIEW" | "NAVIGATING" | "REROUTING" | "ARRIVED"
  currentNodeId,       // User's current location node ID
  currentNode,         // Full node object
  destinationNodeId,   // Target node ID
  destinationNode,     // Full node object
  route,               // {path: [], instructions: [], checkpoints: [], totalDistance}
  previousRoute,       // Stored for rerouting
  currentStep,         // Index into instructions[]
  progress,            // Percentage (0-100)
  remainingDistance,   // Distance from current step to end
  floor,               // Single floor object (scalar, not array)
  floorLoading,        // Loading state
  animatedPosition,    // For smooth movement animation
}
```

**Key structural issue:** `floor` is a single object, not a map or array. Loading a new floor overwrites the entire state.

### 3.2 Location Anchoring Flow

**`anchorLocation()` (lines 366-424):**

1. Validate floor loaded and status allows anchoring
2. If QR code string: call `/scan`, get `nodeId` + label
3. If already navigating: trigger reroute via `applyLocatedNode()`
4. Otherwise: set anchored location via `setAnchoredLocation()`
5. Log event: `location_set` with `entry_method`

### 3.3 Navigation Step Flow

**`advanceStep()` (lines 520-570):**

1. Get next instruction from `route.instructions[currentStep]`
2. If at end: call `completeArrival()`, set status `ARRIVED`
3. Otherwise: increment `currentStep`, recalculate progress
4. Update `currentNodeId` to instruction's `nodeId`
5. Log `checkpoint_passed` if instruction has QR code

### 3.4 Animation System

**File:** `frontend/src/components/FloorMap.jsx` (lines 142-197)

- Triggered when `currentNode.id` changes (outside simulation mode)
- Interpolates position along path using cubic easeInOut
- Duration scales with segment length (450-900ms)
- Calls `completePendingArrival()` when animation completes

---

## 4. Extension Readiness Assessment

### 4.1 Floor Model

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| Storage | `floor` scalar in state | `floors: Map<floorId, Floor>` |
| Loading | `loadFloor(id)` overwrites | `loadFloor(id)` merges/appends |
| Bounds | Hardcoded 2000×1400 | Per-floor bounds in DB |
| Image | Single `map_url` | Per-floor `map_url` |

**Files requiring changes:**

- `backend/models.py`: Add unique constraint on (building_id, floor_num)
- `backend/routes/map.py`: Return multi-floor list or support batch loading
- `frontend/src/store/useNavStore.js`: Convert `floor` to `floors` map
- `frontend/src/api/index.js`: Cache strategy per floor

### 4.2 Node and Edge Model

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| Node floor_id | Exists | Add `elevation` or `floor_level` |
| Edge floor context | Implicit via nodes | Explicit `floor_change` flag |
| Elevator/stairs | `type` only | `connects_to_floors: int[]` |
| Coordinate system | Absolute per-floor | Floor-relative or global grid |

**Files requiring changes:**

- `backend/models.py`: Add `elevation`, `connects_to_floors`, `floor_change` fields
- `backend/seed.py`: Populate new fields for elevator/stair nodes
- `backend/graph.py`: Load floor context, partition by floor
- `backend/routes/routing.py`: Handle floor transitions in instructions

### 4.3 Graph and Routing

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| Graph structure | Single adjacency list | Per-floor subgraphs + connectors |
| Pathfinding | 2D Dijkstra | Multi-floor Dijkstra with floor costs |
| Edge types | Uniform | Special costs for elevator/stairs |
| Instructions | Turn-only | Turn + floor-change types |

**Files requiring changes:**

- `backend/graph.py`: Add floor-aware `shortest_path_multi()` method
- `backend/routes/routing.py`: Detect floor transitions, generate "Take elevator to Floor X" instructions
- `frontend/src/api/index.js`: Client-side multi-floor fallback

### 4.4 Map Rendering

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| Overlay | Single `ImageOverlay` | Layer stack or overlay swap |
| Coordinate transform | Single `maxY` | Per-floor `maxY` lookup |
| Zoom/pan | Lost on floor change | Persist per-floor in localStorage |
| Animation | Linear along path | Floor-change transition |

**Files requiring changes:**

- `frontend/src/components/FloorMap.jsx`: Floor switching logic, layer management, zoom preservation
- `frontend/src/api/index.js`: Cache zoom/pan per floor

### 4.5 QR and Checkpoints

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| QR uniqueness | Global | Floor-scoped or floor-prefixed |
| Checkpoint lookup | Flat list | Grouped by floor |
| Scan result | nodeId | nodeId + floorId |

**Files requiring changes:**

- `backend/routes/scan.py`: Return floor context with scan result
- `backend/routes/offline.py`: Return floor-grouped QR codes
- `frontend/src/store/useNavStore.js`: Disambiguate scan results by floor

### 4.6 Search and POI

| Aspect | Current | Required for Multi-Floor |
|--------|---------|--------------------------|
| Results | Flat list | Grouped by floor or floor-filtered |
| Filter | None | Add floor_id filter |
| POI model | No floor preference | Add `floor_id` or ` floors: int[]` |

**Files requiring changes:**

- `backend/routes/map.py`: Add floor filtering to search
- `backend/models.py`: Add floor affinity to POI
- `frontend/src/store/useNavStore.js`: Show floor context in results

---

## 5. Component Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  FloorMap.jsx                                                    │
│  ├── reads: floor, route, currentNode, status                   │
│  └── renders: ImageOverlay, Polylines, CircleMarkers            │
│        │                                                        │
│        ▼                                                        │
│  useNavStore.js                                                 │
│  ├── floor (scalar)                                             │
│  ├── route, currentNode, destinationNode                        │
│  ├── actions: loadFloor(), anchorLocation(), advanceStep()     │
│  └── calls: api/index.js                                        │
│        │                                                        │
│        ▼                                                        │
│  api/index.js                                                   │
│  ├── fetchFloor(floorId)                                        │
│  ├── getRoute(from, to)                                         │
│  ├── offline fallback: shortestPath() (client-side Dijkstra)    │
│  └── caches: localStorage (single floor)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  routes/routing.py                                              │
│  ├── GET /route                                                 │
│  └── calls: graph.py → shortest_path()                          │
│        │                                                        │
│        ▼                                                        │
│  graph.py                                                       │
│  ├── NavGraph.adj (single adjacency list)                       │
│  ├── NavGraph.nodes                                             │
│  └── shortest_path() — Dijkstra, no floor context               │
│        │                                                        │
│        ▼                                                        │
│  db.py ──▶ PostgreSQL                                           │
│  ├── nodes (floor_id, x, y, type)                               │
│  ├── edges (from_node, to_node, cost)                          │
│  ├── floors (floor_num, map_url, bounds)                        │
│  ├── pois (node_id, name, category)                            │
│  └── qr_checkpoints (qr_code, node_id)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Navigation Data Flow Diagram

```
┌──────────────┐     1. scan QR      ┌──────────────┐
│  QRScanner   │ ──────────────────▶ │  /scan       │
└──────────────┘                     │  endpoint    │
                                     └──────┬───────┘
                                            │ returns node_id + label
                                            ▼
                                     ┌──────────────┐
                                     │  anchorLoc   │
                                     │  action      │
                                     └──────┬───────┘
                                            │ status → ANCHORED
                                            ▼
                                     ┌──────────────┐
                                     │  selectDest  │
                                     │  (POI click) │
                                     └──────┬───────┘
                                            │ route request
                                            ▼
                                     ┌──────────────┐
                                     │  /route      │
                                     │  endpoint    │
                                     └──────┬───────┘
                                            │ returns path + instructions
                                            ▼
                                     ┌──────────────┐
                                     │  setRoute    │
                                     │  action      │
                                     └──────┬───────┘
                                            │ status → NAVIGATING
                                            ▼
                              ┌────────────────────────────┐
                              │   FloorMap.jsx             │
                              │   renders route path       │
                              │   current position marker  │
                              │   destination marker       │
                              └────────────────────────────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │ advanceStep  │
                                     │  action      │
                                     └──────┬───────┘
                                            │ progress update
                                            ▼
                                     ┌──────────────┐
                                     │ ArrivedScreen│
                                     │  (status === │
                                     │   ARRIVED)   │
                                     └──────────────┘
```

---

## 7. Current Limitations

1. **Single-floor state:** `floor` is a scalar; loading a new floor discards the previous
2. **No floor semantics:** Nodes have `type=elevator/stairs` but no `connects_to_floors`
3. **Absolute coordinates:** All floors share 0-2000, 0-1400 pixel space; no floor offset
4. **Single graph:** All nodes/edges loaded into one adjacency list; no floor partitioning
5. **Turn-only instructions:** No floor-change instruction types
6. **Lost map state:** Zoom/pan reset on floor change
7. **Offline single-floor:** Client-side Dijkstra uses cached graph without floor context
8. **QR ambiguity:** Same QR code cannot exist on multiple floors
9. **Search not floor-aware:** POI results mixed across floors
10. **No vertical animation:** Floor changes would appear as instant jumps

---

## 8. Refactor Opportunities

1. **Extract floor loading into reusable service** — Current `loadFloor()` mixes API call with state update; separate concerns.

2. **Add floor context to graph** — Instead of single `nav_graph`, load into `floors[floorId].graph` and `connectors[]`.

3. **Centralize coordinate transforms** — `toLatLng(node, maxY)` should accept floor context, not rely on closure variable.

4. **Persist map viewport per floor** — Store `{ [floorId]: { zoom, center } }` in localStorage.

5. **Instruction generation should be extensible** — Current `compute_turn()` is hardcoded; add `compute_instruction(node, nextNode, floorChange?)` with pluggable types.

6. **QR lookup should include floor** — Add `floor_id` to scan response, validate against expected floor during navigation.

7. **Search should accept floor filter** — Add optional `?floor_id=` to `/search` endpoint.

---

## 9. Risks for Multi-Floor Migration

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Coordinate collision** | Nodes on different floors with same ID render incorrectly | Add floor offset to coordinates or use global grid |
| **Route breaks mid-navigation** | Switching floors clears route state | Preserve route across floor changes, add floor transition UI |
| **Graph loading performance** | Loading all nodes/edges for large buildings | Partition graph by floor, lazy-load on floor switch |
| **Offline fallback** | Client-side Dijkstra doesn't know floors | Cache per-floor subgraphs, build floor-aware fallback |
| **Backward compatibility** | Existing single-floor deployments break | Default to floor 1, feature-flag multi-floor |
| **QR code collision** | Duplicate QR codes across floors | Scope QR codes to floor or use unique prefixes |
| **Instruction mismatch** | Users get confusing "turn" instructions at floor changes | Add explicit floor-change instruction types |
| **Map state loss** | Zoom/pan reset frustrates users | Persist per-floor viewport in localStorage |

---

## 10. Recommended Extension Points

### 10.1 Database Schema Extensions

```python
# In models.py — add to Node
elevation = Column(Integer, default=0)  # Floor level (0=ground, 1=first, -1=basement)
connects_to = Column(JSON)              # [{"floor_id": 2, "node_id": 15}, ...]

# In models.py — add to Edge
floor_change = Column(Boolean, default=False)  # True if edge crosses floors
floor_delta = Column(Integer, default=0)        # +1 for stairs up, -1 for stairs down
```

### 10.2 Graph Extensions

```python
# In graph.py — add method
def shortest_path_multi(self, from_: int, to: int, 
                        accessible_only: bool = False) -> list[int]:
    # 1. Find floor of start and end nodes
    # 2. If same floor: use existing shortest_path
    # 3. If different: find connector nodes (elevators, stairs)
    #    between floors, build composite path
    # 4. Return path with floor-transition markers
```

### 10.3 Instruction Extensions

```python
# In routing.py — extend instruction types
INSTRUCTION_TYPES = ['start', 'straight', 'left', 'right', 'u_turn',
                    'take_elevator', 'take_stairs', 'destination']

def generate_instructions_multi(path, floors_info):
    for i, node in enumerate(path):
        if is_floor_transition(node, path[i+1]):
            yield {
                'turn': 'take_elevator',
                'text': f"Take elevator to Floor {floors_info[next_floor]['name']}",
                'floor_change': True
            }
```

### 10.4 Frontend Store Extensions

```javascript
// In useNavStore.js — convert floor to map
floors: Map<number, Floor>,        // All loaded floors
currentFloorId: number,            // Active floor
floorViewport: Map<number, {zoom, center}>,  // Per-floor zoom/pan

// Add floor switching action
switchFloor: (floorId) => {
  const floor = get().floors.get(floorId);
  const viewport = get().floorViewport.get(floorId);
  set({ currentFloorId: floorId, floor, ...viewport });
}
```

### 10.5 Map Rendering Extensions

```javascript
// In FloorMap.jsx — add floor layer management
const floorLayers = useMemo(() => 
  floors.map(f => ({
    floorId: f.id,
    imageUrl: f.map_url,
    bounds: [[0, 0], [f.bounds.maxY, f.bounds.maxX]]
  })), [floors]);

const activeLayer = floorLayers.find(f => f.floorId === currentFloorId);

// Switch overlay when floor changes
useEffect(() => {
  map.eachLayer(l => { if (l._url) map.removeLayer(l); });
  L.imageOverlay(activeLayer.imageUrl, activeLayer.bounds).addTo(map);
}, [currentFloorId]);
```

---

## 11. Summary

The current architecture is well-structured for single-floor navigation but has tight coupling between floor, map, and route state that will require coordinated changes for multi-floor support. The most significant refactoring needed is:

1. **State:** Convert `floor` scalar → `floors` map with per-floor viewport
2. **Graph:** Add floor context to nodes, edges, and pathfinding
3. **Instructions:** Add floor-change instruction types
4. **Rendering:** Support layer switching or stacking in Leaflet

The extension points identified in Section 10 provide a clear migration path that minimizes disruption to existing single-floor deployments.