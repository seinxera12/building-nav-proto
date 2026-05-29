# QR Nav Prototype Knowledge Base

## 1. Project Orientation

### What This Project Is

`qr-nav-proto` is an indoor navigation prototype. A user scans a QR code placed at a known building location, chooses a destination, and receives a shortest-path route over a floor-plan map.

The QR code does not contain coordinates. It contains a stable identifier such as `QR_LOBBY_MAIN`. The backend resolves that identifier to a node in the building graph. This design keeps physical QR codes simple and lets the database remain the source of truth for location meaning.

Assumption about intent: this repo appears to be a staged prototype built across "Day 1", "Day 2", and "Day 3" milestones. The goal is likely demo velocity and learnability rather than production hardening.

### Who This Is For

The app is written for people navigating an indoor space where GPS is unreliable. The developer-facing structure is written for a small team or solo developer iterating quickly on routing, QR anchoring, and map UI.

### Stack

Backend:

- FastAPI exposes HTTP endpoints because it gives quick async APIs, automatic OpenAPI docs, and simple request models.
- SQLAlchemy stores the building graph in PostgreSQL because nodes, edges, floors, QR checkpoints, POIs, and events are relational records with clear foreign-key relationships.
- PostgreSQL/PostGIS runs through Docker Compose. PostGIS is not actively used in queries yet, but it leaves room for future spatial modeling without changing the database image.
- An in-memory Python graph runs Dijkstra because the prototype graph is tiny and routing can be answered faster and more simply from RAM than from repeated SQL traversal.

Frontend:

- Vite + React renders the single-page app because the UI is interactive, stateful, and browser-camera dependent.
- React Leaflet renders a static floor-plan image as a map using `CRS.Simple`, because Leaflet already gives zoom, pan, overlays, markers, tooltips, and polylines for 2D coordinate spaces.
- Zustand stores navigation state because location, route, search, scanner, and instruction UI all need shared state without prop drilling.
- `jsQR` decodes QR codes from camera frames because the app needs client-side scanning without a native mobile wrapper.
- `react-hot-toast` displays lightweight feedback when scans locate the user, advance instructions, or trigger rerouting.

### Repo Map

Root owns cross-service setup and operator docs:

- `docker-compose.yml` starts the database and backend.
- `.env` provides backend database URLs inside Docker.
- `start.md` documents the daily runbook.
- `AGENTS.md` describes the desired analysis style for agent-generated documentation.
- `.agent/.antigravity/.specs/` keeps milestone planning and completion notes.

`backend/` owns API, database models, graph loading, routing, seeding, and generated map/QR assets.

`frontend/` owns the browser app, map rendering, QR scanner, navigation state machine, search UI, and production build output.

## 2. Boot & Entry Points

### Docker Boot Sequence

1. `docker compose up --build -d` starts `db`.
2. The `db` service uses `postgis/postgis:15-3.3` and creates database `indoornav`, user `nav`, and password `nav123`.
3. The database healthcheck runs `pg_isready -U nav -d indoornav`.
4. The `backend` service waits until the database is healthy.
5. The backend container mounts `./backend:/app`, so source edits on the host appear immediately inside the container.
6. The backend command starts Uvicorn with reload: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`.

Why this order matters: `main.py` initializes tables and loads the in-memory graph at startup. If PostgreSQL is not ready, the backend cannot create tables or load nodes.

### Backend Entry Point

`backend/main.py` is the backend runtime entry point.

The FastAPI `lifespan()` function runs before serving requests:

1. `init_db()` creates all SQLAlchemy tables if they do not exist.
2. `AsyncSessionLocal()` opens an async session.
3. `load_graph_from_db(db)` reads `public.nodes` and `public.edges`.
4. `nav_graph` is populated in memory.
5. Routers serve requests after the graph load completes.

Why lifespan is used: FastAPI's lifespan hook is the modern startup/shutdown mechanism. It makes graph loading part of application initialization instead of lazy-loading during the first route request.

Important consequence: if `seed.py` is run after the backend is already running, the database changes but the in-memory graph does not refresh. Restart the backend after seeding.

### Frontend Entry Point

`frontend/src/main.jsx` mounts the React app:

1. React creates a root at `document.getElementById('root')`.
2. `<App />` renders inside `StrictMode`.
3. `App.jsx` calls `loadFloor(1)` on mount.
4. `loadFloor()` calls `fetchFloor(1)`.
5. Vite proxies `/map/floor/1` to `http://localhost:8000/map/floor/1`.
6. The returned floor data populates the Zustand store.
7. `FloorMap` renders the image overlay and markers from store state.

Why Vite proxy is used: frontend calls can use relative URLs like `/route` and `/scan`, which avoids hardcoding backend ports in the browser app and avoids CORS friction during development.

### Environment Variables

`.env` defines:

- `DATABASE_URL=postgresql+asyncpg://nav:nav123@db/indoornav`
- `SYNC_DATABASE_URL=postgresql://nav:nav123@db/indoornav`

`DATABASE_URL` is used by `backend/db.py` with SQLAlchemy async engine. It uses the `asyncpg` driver because FastAPI route execution is async.

`SYNC_DATABASE_URL` is used by `backend/seed.py` with SQLAlchemy sync `create_engine()`. It uses the sync PostgreSQL driver because seeding is a simple command-line task and does not need async control flow.

Non-obvious decision: both URLs use host `db`, not `localhost`. That works inside Docker Compose because `db` is the service name. Running backend scripts directly on the host with this `.env` will fail unless the URL host is changed or overridden.

### Other Entry Points

- `backend/seed.py` resets and loads database records from JSON seed files.
- `backend/tools/generate_qr.py` reads `seed/qr_codes.json` and writes QR PNGs.
- `backend/generate_floorplan.py` creates the floor-plan PNG, but the current code prints success without saving the image. That script is either incomplete or the existing PNG was generated by an earlier version.
- `frontend/vite.config.js` controls dev server HTTPS, LAN hosting, and backend proxying.

## 3. System Architecture & Data Flow

### Core Data Pipeline

1. Seed JSON files describe the building graph.
2. `seed.py` writes those files into PostgreSQL tables.
3. Backend startup loads nodes and walkable edges into `nav_graph`.
4. Frontend loads floor data from `/map/floor/1`.
5. User scans or taps a QR checkpoint.
6. Backend resolves the QR string to a node.
7. Frontend stores that node as the current location.
8. User searches and selects a destination.
9. Backend computes a shortest path from current node to destination.
10. Frontend draws the route and displays step-by-step instructions.
11. Later QR scans either advance progress, mark arrival, or trigger rerouting.

### Numbered Request Lifecycle: Initial Floor Load

1. Browser loads `index.html`.
2. `main.jsx` renders `App`.
3. `App` runs `loadFloor(1)` in `useEffect`.
4. `loadFloor()` calls `fetchFloor(1)`.
5. `fetchFloor()` sends `GET /map/floor/1`.
6. Vite dev server proxies `/map` to backend port `8000`.
7. `routes/map.py:get_floor()` queries:
   - `public.floors` for map metadata,
   - `public.nodes` for all nodes on the floor,
   - `public.pois` joined to `public.nodes` for searchable destinations,
   - `public.qr_checkpoints` for demo QR markers.
8. Backend returns `imageUrl`, `bounds`, `nodes`, `pois`, and `qrCodes`.
9. Zustand stores the floor object.
10. `FloorMap` converts pixel coordinates into Leaflet coordinates and renders the floor.

Why this request returns all map bootstrap data at once: the frontend can render the floor, nodes, search metadata, and demo QR markers without making several startup requests.

### Numbered Request Lifecycle: First QR Scan

1. User taps `Scan to Locate`.
2. `App` renders `QRScanner`.
3. `QRScanner` calls `navigator.mediaDevices.getUserMedia()`.
4. Camera stream is assigned to a `<video>`.
5. A `requestAnimationFrame` loop draws video frames onto a hidden `<canvas>`.
6. `jsQR()` inspects pixel data from the canvas.
7. When a QR string is decoded, scanner stops the camera tracks and calls `onScan(qrCode)`.
8. `App` closes the scanner and awaits `handleScan(qrCode)`.
9. `handleScan()` calls `scanQR(qrCode)`.
10. `scanQR()` sends `POST /scan` with `{ "qr_code": "..." }`.
11. `routes/scan.py:scan_qr()` joins `public.qr_checkpoints` to `public.nodes`.
12. Backend returns node ID, label, x/y coordinates, type, and floor ID.
13. In `IDLE` or `LOCATED`, `handleScan()` updates `currentNodeId`, `currentNode`, and status `LOCATED`.
14. `LocationBar` and `FloorMap` react to store changes and show the user's current location.

Why the frontend trusts the scan: a QR code mounted at a known physical place is treated as a location declaration. The app does not estimate drift or confidence.

### Numbered Request Lifecycle: Search and Route

1. User types at least two characters into `SearchBar`.
2. A 300ms debounce waits for typing to pause.
3. `runSearch(query)` calls `searchPOIs(query)`.
4. `searchPOIs()` sends `GET /search?q=...`.
5. Backend searches `public.pois.search_terms` with case-normalized `LIKE`.
6. Results include POI name, category, node ID, and coordinates.
7. User selects a destination result.
8. `selectDestination(nodeId)` checks that `currentNodeId` exists.
9. It sets the destination, clears search UI, and marks route loading.
10. It calls `computeRoute(currentNodeId, nodeId)`.
11. `computeRoute()` sends `GET /route?from_=...&to=...`.
12. `routes/routing.py:get_route()` asks `nav_graph.shortest_path()` for node IDs.
13. Backend builds turn instructions from path geometry.
14. Backend queries QR checkpoints along intermediate path nodes.
15. Backend sums Euclidean segment distances and returns route data.
16. Store saves the route and status becomes `NAVIGATING`.
17. `FloorMap` draws route and destination markers.
18. `InstructionPanel` displays the first instruction and progress bar.

Why route computation is split this way: the shortest path is fast in memory, while checkpoint metadata remains relational in the database.

### Numbered Request Lifecycle: Scan During Navigation

1. User scans or taps another QR checkpoint.
2. `handleScan()` resolves the QR through `/scan`.
3. If scanned node is the route destination, store status becomes `ARRIVED`.
4. If scanned node is one of `route.checkpoints`, store advances to the following instruction and recalculates progress.
5. If scanned node is on `route.path` but not a checkpoint, store updates current location and progress based on its index in the path.
6. If scanned node is not on the route, store status becomes `REROUTING`.
7. Store calls `computeRoute(scannedNodeId, originalDestinationId)`.
8. On success, route is replaced and status returns to `NAVIGATING`.
9. On failure, status returns to `NAVIGATING` and error becomes `Could not recalculate route`.

Non-obvious decision: off-route QR scans are accepted as truth and used to reroute instead of being rejected. This follows the "QR as location declaration" model.

## 4. Data Models & Storage Decisions

### `Base`

Fields/definition:

- `metadata = MetaData(schema="public")`

Why: the PostGIS image can include other schemas such as `tiger`, and explicit `public` schema prevents ambiguous table resolution. This is especially relevant for generic table names like `edges`.

Storage type rationale: SQLAlchemy `MetaData` schema config applies consistently to every model, avoiding repeated schema strings in each table definition.

### `Floor`

Fields:

- `id: Integer primary key` gives each floor a stable identifier for API paths like `/map/floor/1`.
- `building_id: Integer` leaves room for multiple buildings while keeping the prototype to one building.
- `floor_num: Integer` stores human/building floor order separately from database ID.
- `name: String` stores display text such as `Ground Floor`.
- `map_url: String` stores the static image URL returned to the frontend.
- `bounds: JSON` stores `{minX, minY, maxX, maxY}` for the image coordinate system.

Why these storage types:

- Numeric IDs and floor numbers are integers because they are exact identifiers/order values.
- `map_url` and `name` are strings because they are opaque display/config values.
- `bounds` is JSON because it is a small structured object that the frontend consumes directly and does not currently need relational querying.

Non-obvious decision: bounds live in the database instead of the frontend. That keeps the floor image and coordinate space together as backend-provided map metadata.

### `Node`

Fields:

- `id: Integer primary key` makes nodes stable route/path references.
- `floor_id: Integer ForeignKey("floors.id")` links each node to a floor.
- `label: String, nullable=False` provides user-facing and instruction-facing text.
- `type: String, nullable=False` categorizes the node as `junction`, `poi`, `elevator`, `entrance`, `stairs`, or similar.
- `x: Float, nullable=False` stores horizontal pixel position on the floor image.
- `y: Float, nullable=False` stores vertical pixel position on the floor image.
- `accessible: Boolean` leaves room for accessibility-aware routing.
- `metadata_: JSON mapped to column "metadata"` leaves room for arbitrary node annotations.

Why these storage types:

- `x` and `y` are floats because map coordinates may eventually require fractional positions even though seed data currently uses integers.
- `type` is a string instead of an enum for prototype flexibility; new node categories can be introduced without migrations.
- `metadata` is JSON because experimental per-node attributes can be added without schema churn.

Non-obvious decision: nodes use image pixel coordinates, not GPS or projected coordinates. This matches Leaflet `CRS.Simple` and the static floor-plan image.

### `Edge`

Fields:

- `id: Integer primary key` gives each edge a row identity independent of node pair.
- `from_node: Integer ForeignKey("nodes.id")` stores start node.
- `to_node: Integer ForeignKey("nodes.id")` stores end node.
- `cost: Float` stores traversal cost from `from_node` to `to_node`.
- `reverse_cost: Float` optionally stores traversal cost in the opposite direction.
- `walkable: Boolean` determines whether the graph loader includes the edge.
- `accessible: Boolean` leaves room for accessible route filtering.

Why these storage types:

- Costs are floats because distances and weighted routing penalties may be fractional.
- `reverse_cost` exists because real buildings can have asymmetric movement, such as escalators, one-way flows, or temporary restrictions.
- Booleans support simple filters without deleting graph data.

Non-obvious decision: `NavGraph.add_edge()` always adds both directions and uses `reverse_cost` when present. The database stores directed fields, but the prototype graph behaves bidirectionally by default.

### `QRCheckpoint`

Fields:

- `id: Integer primary key` gives each checkpoint row a database identity.
- `qr_code: String unique nullable=False` stores the scanned QR payload.
- `node_id: Integer ForeignKey("nodes.id")` links the QR code to a navigation node.
- `label: String` stores display text for scanner responses and QR markers.
- `floor_id: Integer ForeignKey("floors.id")` lets floor-data requests return only relevant QR checkpoints.

Why these storage types:

- `qr_code` is a string because QR payloads are identifiers, not numeric IDs.
- Unique constraint prevents two physical locations from using the same QR payload.
- `node_id` is the authoritative location mapping because routing operates on graph nodes.

Non-obvious decision: QR payloads do not encode coordinates. That avoids stale physical QR codes if node coordinates are corrected later.

### `POI`

Fields:

- `id: Integer primary key` gives each searchable destination a row identity.
- `node_id: Integer ForeignKey("nodes.id")` ties the POI to the route graph.
- `name: String nullable=False` stores display text.
- `category: String` mirrors node type or destination category.
- `search_terms: Text` stores lowercase searchable text.

Why these storage types:

- POIs are separate from nodes because not every graph node should be searchable.
- `search_terms` is text because the prototype uses substring search and does not need a normalized search table yet.
- `node_id` links search results directly to routing destinations.

Non-obvious decision: `seed.py` auto-generates POIs from nodes of types `poi`, `elevator`, `entrance`, and `stairs`. This avoids maintaining a separate POI seed file, but it means changing node types affects search behavior.

### `Event`

Fields:

- `id: Integer primary key` gives each logged event a row identity.
- `session_id: String` optionally groups user/demo events.
- `event_type: String` stores names like `qr_scan`, `checkpoint_scan`, `arrived`, or `reroute`.
- `payload: JSON` stores event details without requiring a schema per event type.
- `created_at: String` stores an ISO timestamp.

Why these storage types:

- `payload` is JSON because analytics events vary in shape.
- `created_at` is a string because the prototype only needs readable ISO timestamps and avoids timezone/database timestamp complexity.

Non-obvious decision: event logging is best-effort. Frontend `logEvent()` catches errors and does not block navigation because analytics failure should not break demo flow.

## 5. Notable Methods & Design Patterns

### FastAPI Lifespan Startup

Where: `backend/main.py:lifespan()`

What it does: before accepting requests, it creates database tables and loads the in-memory graph from database rows.

How it does it: it awaits `init_db()`, opens `AsyncSessionLocal()`, calls `load_graph_from_db(db)`, then yields control to FastAPI.

Why this approach: route requests can assume `nav_graph` already exists. The health endpoint can report graph node count immediately.

Alternative: lazy-load the graph on first `/route` request. That would reduce startup work but create first-request latency and more complex concurrency guards.

Landmine: `load_graph_from_db()` does not clear `nav_graph` before adding nodes/edges. If it were called more than once in the same process, adjacency lists could duplicate edges.

### SQLAlchemy Async Session Factory

Where: `backend/db.py`

What it does: creates an async engine and sessionmaker from `DATABASE_URL`.

How it does it: `create_async_engine()` builds the engine and `async_sessionmaker(engine, expire_on_commit=False)` produces request-scoped sessions.

Why this approach: FastAPI endpoints are async, so database calls can yield control while waiting on I/O.

Alternative: use synchronous SQLAlchemy in endpoints. That would be simpler for beginners but can block the async server worker during database access.

### Sync Seed Script

Where: `backend/seed.py:run()`

What it does: recreates all tables and repopulates them from seed JSON.

How it does it: calls `Base.metadata.drop_all(engine)`, `Base.metadata.create_all(engine)`, opens a sync `Session`, inserts one floor, inserts nodes, inserts edges, inserts QR checkpoints, derives POIs from selected node types, and commits.

Why this approach: a clean-slate seed is predictable for demos and avoids migration complexity in a prototype.

Alternative: use Alembic migrations plus upserts. That would be safer for persistent data but heavier for early prototyping.

Landmine: `drop_all()` destroys event logs and any manual DB edits. Do not run it casually against a database with data worth keeping.

### In-Memory Graph Singleton

Where: `backend/graph.py:nav_graph`

What it does: stores node metadata and adjacency lists in process memory.

How it does it: module-level `nav_graph = NavGraph()` is populated at backend startup by `load_graph_from_db()`.

Why this approach: the graph is tiny, mostly static, and queried often during routing; RAM lookup is simpler and faster than recursive SQL or repeated joins.

Alternative: compute paths directly in PostgreSQL/PostGIS or use a graph library like NetworkX. PostgreSQL would centralize data but complicate query logic; NetworkX would add a dependency but provide richer algorithms.

Landmine: the graph is a cache, not the source of truth. Database changes are invisible until backend restart or an explicit reload function is added.

### Dijkstra Shortest Path

Where: `backend/graph.py:NavGraph.shortest_path()`

What it does: returns a list of node IDs from start to end with lowest total edge cost.

How it does it: initializes a priority queue with the start node, relaxes neighbor distances, stores predecessors in `prev`, and reconstructs the path backward from end to start.

Why this approach: Dijkstra is appropriate for non-negative weighted edges, which matches corridor distance costs.

Alternative: A* search could use Euclidean distance as a heuristic and scale better for larger graphs. For 14 nodes, Dijkstra is easier to inspect and fast enough.

Landmine: edge costs must be non-negative. Negative costs would invalidate Dijkstra's correctness.

### Turn Instruction Generation

Where: `backend/routes/routing.py:generate_instructions()`, `compute_turn()`, `turn_to_text()`

What it does: converts a path of node IDs into human-readable navigation steps.

How it does it: for each node in the path, it compares previous/current/next coordinates, computes vector angle delta with `atan2`, treats angles under 25 degrees as straight, and maps left/right/straight to text.

Why this approach: it derives instructions from geometry instead of requiring manual instruction text for every edge.

Alternative: store explicit edge instructions in the database. That would be more accurate for real buildings but much more manual to maintain.

Landmine: image coordinates have Y increasing downward. Turn direction can feel counterintuitive if coordinate-system assumptions change.

### QR Scan Resolution

Where: `backend/routes/scan.py:scan_qr()`

What it does: maps a scanned QR string to a node location.

How it does it: joins `public.qr_checkpoints` to `public.nodes` by `node_id`, filters by `qr_code`, and returns camelCase fields to match frontend expectations.

Why this approach: the QR code remains an opaque identifier and all location meaning is database-controlled.

Alternative: encode node IDs or coordinates directly into QR payloads. That would reduce one backend lookup but makes printed QR codes harder to change safely.

### Event Logging

Where: `backend/routes/scan.py:log_event()` and `frontend/src/api/index.js:logEvent()`

What it does: records prototype analytics events without affecting navigation.

How it does it: frontend posts event type and payload; backend inserts a JSON payload and UTC ISO timestamp into `public.events`; frontend catches network errors.

Why this approach: demo analytics are useful, but navigation should still work if logging fails.

Alternative: remove event persistence and log only to console. That would simplify the backend but lose route/scan history.

### Zustand Store as Navigation State Machine

Where: `frontend/src/store/useNavStore.js`

What it does: stores floor data, current location, destination, route, progress, search state, and scan behavior.

How it does it: `create((set, get) => ({ ...state, ...actions }))` defines fields and actions in one module. `handleScan()` reads current status and route, resolves a QR, and transitions state based on `IDLE`, `LOCATED`, `NAVIGATING`, `REROUTING`, or `ARRIVED`.

Why this approach: the same scan can mean different things depending on current navigation status, so centralizing transitions prevents components from each inventing their own scan behavior.

Alternative: XState could model transitions more formally. That would improve explicitness but add learning and dependency overhead.

Landmine: React components call store selectors independently. Renaming store fields without updating all selectors will break UI silently or at runtime.

### React Leaflet + `CRS.Simple`

Where: `frontend/src/components/FloorMap.jsx`

What it does: renders the floor-plan PNG as a pan/zoom map and overlays nodes/routes.

How it does it: creates a `MapContainer` with `L.CRS.Simple`, displays `ImageOverlay`, converts each node with `toLatLng(node, maxY)`, draws `CircleMarker`s, draws `Polyline`s for route and active segment, and shows demo QR `Marker`s when URL contains `?demo=1`.

Why this approach: Leaflet supplies robust interaction primitives while `CRS.Simple` lets the app use image pixel coordinates instead of geographic coordinates.

Alternative: draw everything on `<canvas>` or SVG. That would give total rendering control but require implementing pan, zoom, hit testing, and tooltips.

Non-obvious decision: `toLatLng()` maps `[lat, lng]` to `[maxY - node.y, node.x]`. This flips the Y axis so image-space Y-down coordinates align with Leaflet's coordinate behavior.

### QR Scanner Loop

Where: `frontend/src/components/QRScanner.jsx`

What it does: decodes QR codes from the browser camera.

How it does it: opens `getUserMedia()`, plays the stream in a video element, draws each frame to a hidden canvas inside `requestAnimationFrame`, extracts pixel data with `getImageData()`, and passes it to `jsQR()`.

Why this approach: it uses browser-native camera APIs and avoids a native app or server-side image upload.

Alternative: use a higher-level scanner library. That might reduce code but can obscure cleanup and device behavior.

Landmine: camera access requires a secure context. `localhost` works, but LAN phone testing needs HTTPS, which is why `vite-plugin-mkcert` is configured.

### Vite HTTPS + Proxy

Where: `frontend/vite.config.js`

What it does: serves the frontend over HTTPS, exposes it on the LAN, and forwards API paths to the backend.

How it does it: uses `react()` and `mkcert()` plugins, sets `server.host = true`, and proxies `/map`, `/route`, `/scan`, `/search`, `/event`, and `/maps` to `http://localhost:8000`.

Why this approach: mobile browser camera APIs need HTTPS, and relative API URLs keep frontend code environment-agnostic.

Alternative: configure CORS and direct `VITE_API_URL` calls to the backend. That works, but LAN and HTTPS setup become easier to get wrong.

## 6. Module Map

### Root

Owns local orchestration, shared docs, and repo-level setup.

Does not own app runtime logic. Backend behavior lives in `backend/`; browser behavior lives in `frontend/src/`.

Key files:

- `docker-compose.yml` owns service wiring for local PostGIS and FastAPI.
- `.env` owns Docker-internal database connection settings.
- `start.md` owns manual operation instructions.
- `knowledge.md` owns this onboarding reference.

### `.agent/.antigravity/.specs/`

Owns project planning history and milestone implementation notes.

Does not own runtime behavior. The app does not import these files.

Key directories:

- `day1-data/` explains backend/data foundation.
- `day2-frontend/` explains frontend map scaffold.
- `day3-qr/` explains QR scanner and navigation state machine.

### `backend/`

Owns backend app startup, API registration, database schema, graph logic, seed logic, and backend-local assets.

Does not own browser UI state, map rendering components, or camera access.

Key files:

- `main.py` owns FastAPI app construction and startup graph loading.
- `db.py` owns async database engine/session creation.
- `models.py` owns database table definitions.
- `graph.py` owns in-memory graph representation and pathfinding.
- `seed.py` owns destructive clean-slate database seeding.
- `requirements.txt` owns Python dependency pins.
- `Dockerfile` owns backend image construction.
- `generate_floorplan.py` owns floor-plan drawing intent, but current implementation does not save the image.

### `backend/routes/`

Owns HTTP route modules.

Does not own persistent model definitions or frontend state transitions.

Key files:

- `map.py` owns floor bootstrap data and POI search endpoints.
- `routing.py` owns route computation response shape and instruction generation.
- `scan.py` owns QR lookup and event logging endpoints.
- `__init__.py` marks the directory as an importable package.

### `backend/seed/`

Owns prototype map data and generated map/QR image assets.

Does not own database insertion logic; `backend/seed.py` reads this directory and writes records.

Key files:

- `nodes.json` owns graph nodes and image coordinates.
- `edges.json` owns graph connectivity and traversal costs.
- `qr_codes.json` owns QR-to-node mappings.
- `floor_plan.png` owns the visual floor-plan base image.
- `qr_printouts/` owns generated QR PNG files.

### `backend/tools/`

Owns backend utility scripts that are not part of the request-serving API.

Does not own app startup.

Key file:

- `generate_qr.py` reads QR seed data and writes QR printout images.

### `frontend/`

Owns frontend package metadata, dev/build configuration, public assets, and build output.

Does not own backend API implementation or database schema.

Key files:

- `package.json` owns npm scripts and dependency declarations.
- `package-lock.json` owns exact installed dependency versions.
- `vite.config.js` owns dev server behavior, HTTPS, LAN hosting, and API proxying.
- `eslint.config.js` owns lint rules.
- `index.html` owns the browser document shell.
- `dist/` owns generated production assets.
- `node_modules/` owns installed dependencies and should not be manually edited.

### `frontend/public/`

Owns static assets served from the web root.

Does not own React component imports.

Key files:

- `favicon.svg` provides the browser favicon.
- `icons.svg` provides symbol definitions, though current UI does not appear to rely on them.

### `frontend/src/`

Owns the React application source.

Does not own generated build output or backend data.

Key files:

- `main.jsx` owns React root mounting.
- `App.jsx` owns top-level UI composition and scanner overlay wiring.
- `index.css` owns active app styling.
- `App.css` appears to be leftover Vite/template styling and is not imported by `App.jsx`.

### `frontend/src/api/`

Owns the frontend/backend HTTP boundary.

Does not own UI state transitions beyond throwing or swallowing request errors.

Key file:

- `index.js` defines fetch wrappers for floor data, search, route computation, QR scan, and event logging.

### `frontend/src/components/`

Owns presentational and interaction components.

Does not own long-lived navigation state; components read and mutate state through `useNavStore`.

Key files:

- `FloorMap.jsx` owns map rendering and coordinate conversion.
- `QRScanner.jsx` owns camera stream lifecycle and QR decoding.
- `SearchBar.jsx` owns debounced destination search UI.
- `InstructionPanel.jsx` owns route instruction display and manual step navigation.
- `LocationBar.jsx` owns current-location display.
- `ArrivedScreen.jsx` owns arrival overlay and reset button.

### `frontend/src/store/`

Owns client-side navigation state and state transitions.

Does not own DOM rendering or backend persistence.

Key file:

- `useNavStore.js` owns floor loading, search, destination selection, routing, QR scan transitions, rerouting, arrival, cancellation, and reset.

### `frontend/src/assets/`

Owns imported static assets.

Does not own public-root assets or runtime map images.

Key files:

- `hero.png`, `react.svg`, and `vite.svg` appear to be unused or leftover assets in the current app.

## 7. Gotchas, Conventions & Landmines

### Run Context Gotchas

- `.env` database hosts use `db`, which only resolves inside Docker Compose. Host-run scripts need different URLs.
- `seed.py` is destructive because it calls `drop_all()`. It removes tables before recreating them.
- After seeding, restart the backend so `nav_graph` reloads current database rows.
- `docker compose up` may start with zero graph nodes if the DB has tables but no seeded rows. Check `/health`.
- Vite may use port `5175` if `5173` and `5174` are busy. Trust the printed dev-server URL.

### Coordinate System Gotchas

- Seed node coordinates are image pixels with X right and Y down.
- Leaflet coordinate arrays are `[lat, lng]`, not `[x, y]`.
- This app converts image coordinates with `[maxY - y, x]`.
- Floor `bounds.maxX` and `bounds.maxY` must match the PNG dimensions. Current `floor_plan.png` is `2000x1400`.
- If nodes appear mirrored, floating, or transposed, inspect every coordinate conversion before changing data.

### Graph/Data Gotchas

- The database is the source of truth, but the running backend routes from the in-memory graph.
- `load_graph_from_db()` does not clear previous graph state before loading. Treat it as startup-only unless fixed.
- `walkable = true` controls which edges are loaded into the route graph.
- `accessible` exists on nodes and edges but is not currently used in pathfinding.
- Edge `cost` in seed data is manually supplied. It is not automatically computed from coordinates.
- POIs are derived from node types during seeding. Changing a node type can add/remove it from search.

### API Shape Gotchas

- The route endpoint expects query parameter `from_`, not `from`, because `from` is a Python keyword.
- Backend scan response uses camelCase fields like `nodeId` and `floorId` for frontend convenience.
- `GET /map/floor/{floor_id}` assumes the floor exists. It does not guard against missing floor rows before reading `floor.map_url`.
- Search requires at least two characters on the frontend, even though the backend endpoint can accept shorter values.
- Event logging should never be used as a source of navigation truth.

### QR/Scanner Gotchas

- Camera access requires HTTPS except on `localhost`.
- Phone testing should use the HTTPS network URL printed by Vite, such as `https://192.168.x.x:5175`.
- `playsInline` is required so iOS keeps video inside the scanner UI.
- The scanner must stop media tracks on close or successful scan; otherwise the camera can stay active.
- Unknown QR codes intentionally do not mutate route or location state.
- Demo mode is enabled with `?demo=1` and uses tappable QR markers instead of camera input.
- Debug labels are enabled with `?debug=1`.

### Frontend State Gotchas

- The store status values are `IDLE`, `LOCATED`, `NAVIGATING`, `REROUTING`, and `ARRIVED`.
- Destination selection requires `currentNodeId`. Without a prior scan, the store sets an error instead of routing.
- Manual `Next` and `Back` buttons update `currentNodeId` to match instruction nodes. This is useful for demos but is not the same as real physical movement.
- `handleScan()` is the central scan state machine. Do not duplicate scan interpretation in components.
- `reset()` clears the full navigation flow and returns to `IDLE`.

### Styling/UI Gotchas

- `frontend/src/index.css` is the active app stylesheet.
- `frontend/src/App.css` appears to be unused template residue.
- The UI uses emoji icons heavily. Replacing them with an icon system would require coordinated JSX and CSS updates.
- Leaflet needs explicit container height. The app achieves this through full-height root/body and flex layout.

### Generated and Vendor Files

- `frontend/node_modules/` is installed dependency content; do not edit it.
- `frontend/dist/` is generated build output; changes there should usually come from `npm run build`.
- `backend/__pycache__/` and `backend/routes/__pycache__/` are Python bytecode caches.
- QR printout PNGs are generated from `backend/tools/generate_qr.py`; regenerate them after changing `qr_codes.json`.

### Security and Production Gaps

- CORS allows all origins. That is convenient for local demos but too broad for production.
- Database credentials are committed in `.env`. That is acceptable only for a local prototype.
- Event payloads are generic JSON and not validated beyond being a dict.
- There is no authentication or authorization.
- `/event` can insert arbitrary event names and payloads.
- Search uses simple `LIKE`, not full-text search or ranking.
- The app does not validate that a QR code physically belongs where it was scanned. It trusts backend registration and user scanning.

### Assumptions About Intent

- The project favors transparent prototype code over production-grade abstractions.
- PostGIS was chosen for future spatial capability, not because current routing uses geometry columns.
- Zustand was chosen to keep state simple without Redux or a formal statechart dependency.
- The graph singleton was chosen because the current building graph is static during a demo.
- QR identifiers were kept opaque so physical QR codes can outlive coordinate corrections.
- The Day 1-3 documents are planning history, not always exact descriptions of the current code.
