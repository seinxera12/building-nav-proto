# building-nav — Architecture Discovery Report

---

## Directory layout (annotated tree)

```
building-nav/
├── .env                          # Runtime secrets: DB connection strings
├── .gitignore
├── AGENTS.md                     # Agent coding standards/rules
├── README.md
├── start.md
├── docker-compose.yml            # Two-service stack: db + backend
├── knowledge.md
│
├── documentation/
│   └── AGENTS.md
│
├── backend/                      # FastAPI application
│   ├── main.py                   # App factory, lifespan, middleware, router registration
│   ├── db.py                     # Async SQLAlchemy engine, session factory, init_db()
│   ├── models.py                 # ORM models: Floor, Node, Edge, QRCheckpoint, POI, Event
│   ├── graph.py                  # In-memory NavGraph (Dijkstra), loaded at startup
│   ├── seed.py                   # One-shot DB seed script (sync, uses SYNC_DATABASE_URL)
│   ├── generate_floorplan.py     # PIL script to generate floor_plan.png
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── routes/
│   │   ├── __init__.py           # (empty)
│   │   ├── routing.py            # GET /route  — shortest path + instructions
│   │   ├── scan.py               # POST /scan, POST /event
│   │   ├── offline.py            # GET /qr-codes/all, GET /graph
│   │   └── map.py                # GET /map/floor/{id}, GET /search
│   ├── seed/
│   │   ├── nodes.json            # 14 nodes (id, x, y, type, label, floor_id)
│   │   ├── edges.json            # 15 directed edges (from, to, cost)
│   │   ├── qr_codes.json         # 6 QR checkpoints
│   │   ├── floor_plan.png        # 2000×1400 px raster map
│   │   └── qr_printouts/         # Generated QR code images
│   └── tools/
│       └── generate_qr.py        # QR code image generation utility
│
└── frontend/                     # React 19 PWA (Vite)
    ├── index.html
    ├── vite.config.js            # Vite + PWA plugin + mkcert + dev proxy
    ├── package.json
    ├── eslint.config.js
    ├── public/
    │   ├── favicon.svg
    │   ├── icons.svg
    │   ├── pwa-192.png
    │   └── pwa-512.png
    └── src/
        ├── main.jsx              # React root, StrictMode
        ├── App.jsx               # Application shell, floor loading, QR scan entry
        ├── App.css / index.css
        ├── api/
        │   └── index.js          # All backend calls + localStorage offline fallbacks
        ├── store/
        │   ├── useNavStore.js    # Zustand: navigation state machine
        │   └── useSimStore.js    # Zustand: demo simulation control
        ├── components/
        │   ├── FloorMap.jsx      # Leaflet/CRS.Simple map, route overlay, node markers
        │   ├── LocationBar.jsx   # Current location display in header
        │   ├── SearchBar.jsx     # Debounced POI search, destination picker
        │   ├── InstructionPanel.jsx  # Route preview + turn-by-turn nav panel
        │   ├── QRScanner.jsx     # Camera/jsQR real-time QR decoder
        │   ├── EntryPrompt.jsx   # Initial/update location picker (QR or list)
        │   ├── ArrivedScreen.jsx # Post-navigation arrival confirmation
        │   ├── OfflineBanner.jsx # Offline/stale-cache status indicator
        │   └── SimulationPanel.jsx   # Demo mode step-through control panel
        ├── hooks/
        │   ├── useNetworkStatus.js   # Online/offline detection, health polling (30s)
        │   ├── useOfflineSeeding.js  # One-time session seed of QR cache + graph
        │   └── useSimKeyboard.js     # Space/P/R keyboard shortcuts for demo mode
        └── simulation/
            ├── scenarios.js      # Two scripted demo scenarios
            └── animateProgress.js # rAF-based position interpolation on map
```

---

## PWA summary

### Manifest config

| Key | Value |
|---|---|
| `name` | QR Nav Indoor Navigation |
| `short_name` | QR Nav |
| `display` | standalone |
| `start_url` / `scope` | `/` |
| `theme_color` / `background_color` | `#0f1117` |
| `icons` | pwa-192.png (192×192), pwa-512.png (512×512 any+maskable) |

### Service worker

Configured via `vite-plugin-pwa` with Workbox, `registerType: autoUpdate`.

**Precached assets** (Workbox `globPatterns`): all `*.{js,css,html,ico,png,svg,webp}` files produced by the Vite build — the entire app shell is available offline.

**Runtime caching rules:**

| URL pattern | Strategy | Cache name | TTL |
|---|---|---|---|
| `/maps/*` | CacheFirst | `floor-plan-images` | 30 days, max 16 entries |
| `/route*` | NetworkFirst (3 s timeout) | `route-api` | 7 days, max 100 entries |
| `/scan*` | NetworkFirst (2 s timeout) | `qr-scan-api` | 7 days, max 100 entries |

Routes not covered by Workbox rules (`/graph`, `/qr-codes/all`, `/map/floor/*`, `/search`, `/event`, `/health`) are handled via an explicit **localStorage-backed fallback** layer in `api/index.js`.

### Offline capability

| Capability | Offline support |
|---|---|
| App shell (JS/CSS/HTML) | ✅ Full — Workbox precache |
| Floor plan image | ✅ CacheFirst (30 days) |
| Route computation | ✅ Falls back to client-side Dijkstra using cached graph |
| QR code resolution | ✅ Falls back to `qrnav:cache:qr-codes` in localStorage |
| Floor data (`/map/floor/1`) | ✅ localStorage NetworkFirst with fallback |
| Full graph download (`/graph`) | ✅ localStorage cache seeded on first load |
| POI search | ⚠️ Client-side filter over cached floor POIs (no server call in offline path) |
| Event logging | ✅ Queued to localStorage, flushed on reconnect |

Offline seeding happens once per session via `useOfflineSeeding`: `fetchAllQrCodes()` + `fetchGraph()` + pre-warm common routes from the entrance node to every POI.

### Map rendering library

**Leaflet 1.9.4 / react-leaflet 5.0.0** with `L.CRS.Simple` (no geographic projection). The floor plan PNG is mounted as an `<ImageOverlay>` on a `[[0,0],[maxY,maxX]]` bounding box. Coordinate conversion: `[leafletLat, leafletLng] = [maxY − pixelY, pixelX]`.

Route polylines, node `CircleMarker`s, destination markers, and animated position dots are all rendered as Leaflet layers on top of the image.

### Location input flows

**QR scan path:**
1. User taps "Scan to Locate" or "📷 Scan QR" in `EntryPrompt`.
2. `QRScanner` opens, requests `getUserMedia` with `facingMode: environment`.
3. jsQR decodes frames via canvas `getImageData` in a `requestAnimationFrame` loop.
4. Raw QR string is passed to `normalizeQrPayload()` — strips the `?loc=` URL parameter if the QR encodes a deep-link URL, else returns the raw string.
5. `POST /scan { qr_code }` resolves the code to a `nodeId` + coordinates.
6. `useNavStore.anchorLocation()` / `applyLocatedNode()` updates state to `ANCHORED`.

**Manual selection path:**
1. User taps "Select from list" in `EntryPrompt`.
2. A searchable list of POIs + QR checkpoints is presented.
3. `useNavStore.anchorNode(nodeId)` sets `ANCHORED` directly.

**Deep-link path:**
- URL parameter `?loc=<qrCode>` is parsed at mount time in `App.jsx`; `handleScan()` fires immediately after floor data loads.

**Demo mode:**
- `?demo` query flag adds tappable 📷 `Marker`s on the map at every QR anchor node.
- Clicking one calls `handleScan(qr_code)` directly, bypassing the camera.

### Destination input

`SearchBar` does a debounced (300 ms) client-side filter over `floor.pois` (no network call). Selecting a result calls `useNavStore.selectDestination(nodeId)` which triggers route computation and transitions to `ROUTE_PREVIEW`.

Map node markers for POIs are also directly clickable in `FloorMap`.

### Navigation instruction display

`InstructionPanel` reads from `useNavStore`:
- **ROUTE_PREVIEW** state: shows total distance, instruction count, and estimated walk time; "Begin" / "Cancel" buttons.
- **NAVIGATING** state: shows current step icon + text, progress bar, remaining distance, "Next" button. The user manually advances each step; there is no GPS-based auto-advance.

Turn icons: 🚀 start, ⬆️ straight, ↩️ left, ↪️ right, 🏁 destination.

### Voice / audio UI

**None exists.** There is no `<audio>` element, no Web Speech API (`speechSynthesis` / `SpeechRecognition`) call, no TTS library, and no microphone access anywhere in the codebase.

---

## Backend API surface

| Method | Path | Purpose | Request | Response |
|---|---|---|---|---|
| `GET` | `/health` | Liveness check; returns in-memory graph node count | — | `{ status: "ok", nodes: <int> }` |
| `GET` | `/route` | Compute shortest path between two nodes | Query: `from_=<int>&to=<int>` | `{ path: int[], instructions: Step[], checkpoints: Checkpoint[], totalDistance: float }` |
| `POST` | `/scan` | Resolve QR code string to map node | Body: `{ qr_code: string }` | `{ nodeId, label, x, y, type, floorId }` |
| `POST` | `/event` | Log a session event (best-effort) | Body: `{ event_type, payload?, session_id? }` | `{ ok: true }` |
| `GET` | `/qr-codes/all` | Full QR checkpoint list for offline seeding | — | `[{ qrCode, nodeId, label, floorId, x, y, type, accessible }]` |
| `GET` | `/graph` | Full nav graph for client-side offline routing | — | `{ nodes: Node[], edges: Edge[] }` |
| `GET` | `/map/floor/{floor_id}` | Floor metadata + nodes + POIs + QR codes | Path: `floor_id: int` | `{ imageUrl, bounds, nodes, pois, qrCodes }` |
| `GET` | `/search` | POI fuzzy search (LIKE on `search_terms`) | Query: `q=<string>` | `[{ name, category, node_id, x, y }]` (max 8) |
| `GET` | `/maps/{filename}` | Static file — serve floor plan images | Path: filename | PNG/image binary |

### Route response shape

```
Step = { step: int, text: string, distance: float, turn: "start"|"straight"|"left"|"right"|"u_turn"|"destination", nodeId: int }
Checkpoint = { nodeId: int, qrCode: string, label: string }
```

---

## Database schema

No PostGIS geometry types are used. All spatial data is stored as plain `Float` columns (`x`, `y`). No pgRouting extension. The coordinate system is pixel-space on the floor plan image (origin top-left, 2000×1400 px).

### `floors`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `building_id` | Integer | NOT NULL, default 1 |
| `floor_num` | Integer | NOT NULL, default 1 |
| `name` | String | nullable |
| `map_url` | String | nullable — e.g. `/maps/floor_plan.png` |
| `bounds` | JSON | nullable — `{ minX, minY, maxX, maxY }` |

### `nodes`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `floor_id` | Integer | FK → floors.id |
| `label` | String | NOT NULL |
| `type` | String | NOT NULL — one of: `junction`, `poi`, `elevator`, `entrance`, `stairs`, `qr_anchor` |
| `x` | Float | NOT NULL — pixel X |
| `y` | Float | NOT NULL — pixel Y (top-down, not inverted) |
| `accessible` | Boolean | default True |
| `metadata` | JSON | nullable — reserved for extra per-node data |

### `edges`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `from_node` | Integer | FK → nodes.id, NOT NULL |
| `to_node` | Integer | FK → nodes.id, NOT NULL |
| `cost` | Float | NOT NULL — pixel distance (manually set in seed) |
| `reverse_cost` | Float | nullable — defaults to `cost` in graph loader |
| `walkable` | Boolean | default True — used to filter edges at load time |
| `accessible` | Boolean | default True |

### `qr_checkpoints`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `qr_code` | String | UNIQUE, NOT NULL — the scannable string |
| `node_id` | Integer | FK → nodes.id, NOT NULL |
| `label` | String | nullable — human-readable location name |
| `floor_id` | Integer | FK → floors.id |

### `pois`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `node_id` | Integer | FK → nodes.id, NOT NULL |
| `name` | String | NOT NULL |
| `category` | String | nullable — e.g. `poi`, `elevator`, `entrance`, `stairs` |
| `search_terms` | Text | nullable — lowercase label, used for LIKE search |

### `events`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `session_id` | String | nullable — browser-generated UUID |
| `event_type` | String | nullable — e.g. `qr_scan`, `reroute`, `arrived` |
| `payload` | JSON | nullable |
| `created_at` | String | nullable — ISO 8601 string |

### Spatial notes

- **No PostGIS geometry columns.** Spatial data is stored as `Float` (x, y) pairs in pixel coordinates.
- **No SRID/CRS.** The coordinate system is image-pixel space, not geographic.
- **No pgRouting.** Routing is done entirely in Python via an in-memory graph loaded at startup.
- The `postgis/postgis:15-3.3` image is used but its spatial extensions are not exercised.

---

## Navigation and routing logic

### Full flow: origin + destination → client receives route

```
1. Client calls GET /route?from_=<nodeId>&to=<nodeId>

2. Backend routing.py:
   a. nav_graph.shortest_path(from_, to)
      - Pure Python Dijkstra on in-memory NavGraph singleton
      - Adjacency list: node_id → [(cost, neighbor_id)]
      - Costs are manually set pixel-distance integers from edges.json
      - Returns ordered list of node IDs or [] if no path
   b. generate_instructions(path)
      - Iterates path nodes; for each intermediate node calls compute_turn()
      - compute_turn(): computes cross-product angle between consecutive 2D vectors
        - |angle| < 30° → "straight"
        - |angle| > 150° → "u_turn"
        - angle > 0 → "right", angle < 0 → "left"
      - build_text(): maps turn enum to English sentence using node labels
   c. DB query: for each intermediate path node, check qr_checkpoints —
      returns nodes with registered QR codes as "checkpoints" for re-anchoring
   d. Computes totalDistance: sum of euclidean_cost() for consecutive path pairs

3. Response JSON: { path, instructions, checkpoints, totalDistance }

4. Client stores route in useNavStore, transitions to ROUTE_PREVIEW

5. User taps "Begin" → status becomes NAVIGATING

6. User manually taps "Next" (advanceStep) for each instruction step.
   - currentNodeId is updated to the instruction's nodeId
   - FloorMap animates position marker along path segment using rAF interpolation
   - Final step calls completeArrival() → status ARRIVED
```

### Multi-floor routing

**Not implemented.** All 14 nodes share `floor_id: 1`. The graph has a single `Stairwell A` and `Elevator Bank` node but there is no cross-floor edge, no floor-switch instruction type, and no floor-change UI.

### Offline routing fallback

When the network call to `/route` fails, `api/index.js:buildOfflineRoute()` runs an identical client-side Dijkstra against the cached graph (`qrnav:cache:graph`) stored in localStorage. Instruction generation logic is duplicated in the client to mirror the server output.

---

## QR anchor system

### Payload format

QR codes encode a plain string. Two formats are supported:

1. **Plain string:** e.g. `QR_LOBBY_MAIN` — used directly as the `qr_code` lookup key.
2. **Deep-link URL:** e.g. `https://app.example.com/?loc=QR_LOBBY_MAIN` — `normalizeQrPayload()` extracts the `loc` parameter.

### How scan maps to DB record

```
jsQR decodes raw string from camera frame
    ↓
normalizeQrPayload() strips URL wrapper if present
    ↓
POST /scan { qr_code: "QR_LOBBY_MAIN" }
    ↓
SELECT q.node_id, q.label, n.x, n.y, n.type, n.floor_id
FROM qr_checkpoints q JOIN nodes n ON q.node_id = n.id
WHERE q.qr_code = :code
    ↓
Returns: { nodeId, label, x, y, type, floorId }
    ↓
Client calls anchorLocation() → sets currentNodeId + ANCHORED state
```

### How position is set

The scanned node's `x`, `y` become the user's current pixel position on the map. Position is **ephemeral** — stored only in Zustand state, never persisted to the database. No user location table exists.

### QR anchor data in the database

`qr_checkpoints` table holds 6 seed records, each linking a `qr_code` string to a `node_id`. During offline seeding, the client also maintains a localStorage mirror (`qrnav:cache:qr-codes`) keyed by `qrCode` string.

### Current seed QR codes

| QR code | Node | Location |
|---|---|---|
| `QR_LOBBY_MAIN` | 1 | Main Lobby Entrance |
| `QR_ELEV_BANK` | 8 | Elevator Bank |
| `QR_CAFETERIA` | 12 | Cafeteria Entrance |
| `QR_CONF_A` | 9 | Conference Room A |
| `QR_CENTER_JCT` | 7 | Center Junction |
| `QR_STAIRWELL_A` | 14 | Stairwell A |

---

## Docker topology

### Services table

| Service | Container name | Image / Build | Ports | Volumes | Depends on |
|---|---|---|---|---|---|
| `db` | `building_nav_db` | `postgis/postgis:15-3.3` | `5433:5432` | `pgdata:/var/lib/postgresql/data` | — |
| `backend` | `buildingnav_api` | `./backend` (Dockerfile) | `8000:8000` | `./backend:/app` (hot-reload) | `db` (healthy) |

No reverse proxy (nginx, Traefik) is present. The frontend is **not** a Docker service; it runs via `npm run dev` on the developer's machine and uses Vite's dev proxy to forward API calls to `localhost:8000`.

### Annotated compose excerpt

```yaml
services:
  db:
    image: postgis/postgis:15-3.3     # Postgres 15 + PostGIS 3.3 (spatial unused)
    environment:
      POSTGRES_DB: indoornav
      POSTGRES_USER: nav
      POSTGRES_PASSWORD: nav123
    ports:
      - "5433:5432"                   # Host port 5433 avoids collision with local PG
    volumes:
      - pgdata:/var/lib/postgresql/data  # Named volume for persistence
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nav -d indoornav"]
      interval: 5s
      retries: 5

  backend:
    build: ./backend                  # Dockerfile in ./backend/
    ports:
      - "8000:8000"
    env_file: .env                    # Injects DATABASE_URL + SYNC_DATABASE_URL
    volumes:
      - ./backend:/app               # Live code mount — uvicorn --reload picks up changes
    depends_on:
      db:
        condition: service_healthy
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### FastAPI startup sequence (lifespan)

1. `await init_db()` — `Base.metadata.create_all` (idempotent DDL).
2. `await load_graph_from_db(db)` — populates the `nav_graph` singleton from `nodes` + `edges` tables.
3. Application begins serving requests.

---

## Configuration surface

### Environment variables (`.env` + `docker-compose.yml`)

| Variable | Where set | Value / Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` / `env_file` | `postgresql+asyncpg://nav:nav123@db/indoornav` — async SQLAlchemy connection string |
| `SYNC_DATABASE_URL` | `.env` / `env_file` | `postgresql://nav:nav123@db/indoornav` — used only by `seed.py` (psycopg2) |
| `POSTGRES_DB` | `docker-compose.yml` | `indoornav` |
| `POSTGRES_USER` | `docker-compose.yml` | `nav` |
| `POSTGRES_PASSWORD` | `docker-compose.yml` | `nav123` |

### Hardcoded / implicit configuration

| Setting | Location | Value |
|---|---|---|
| Backend host/port | `docker-compose.yml` command | `0.0.0.0:8000` |
| DB host port on host | `docker-compose.yml` | `5433` |
| CORS origins | `main.py` | `["*"]` (wildcard — open) |
| Floor plan image size | `generate_floorplan.py` / seed data | `2000 × 1400 px` |
| Floor plan bounds | `seed.py` | `{ minX:0, minY:0, maxX:2000, maxY:1400 }` |
| Vite dev proxy targets | `vite.config.js` | All API paths → `http://localhost:8000` |
| Network health check interval | `useNetworkStatus.js` | 30 000 ms |
| Route API timeout | `api/index.js` | 3 000 ms |
| Scan API timeout | `api/index.js` | 2 000 ms |
| Offline event queue max size | `api/index.js` | 50 events |
| Offline route cache duration | Workbox config | 7 days |
| Floor plan cache duration | Workbox config | 30 days |

---

## Dependency inventory

### Python dependencies (`backend/requirements.txt`)

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.111.0 | ASGI web framework |
| `uvicorn[standard]` | 0.29.0 | ASGI server (with websocket + HTTP/2 extras) |
| `sqlalchemy[asyncio]` | 2.0.30 | ORM + async engine |
| `asyncpg` | 0.29.0 | Async Postgres driver (used by SQLAlchemy async engine) |
| `psycopg2-binary` | 2.9.9 | Sync Postgres driver (used only by `seed.py`) |
| `python-dotenv` | 1.0.1 | `.env` file loading |
| `qrcode[pil]` | 7.4.2 | QR code image generation (`tools/generate_qr.py`) |

### JavaScript dependencies (`frontend/package.json`)

#### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.2.6 | UI framework |
| `react-dom` | ^19.2.6 | DOM renderer |
| `leaflet` | ^1.9.4 | Map rendering library |
| `react-leaflet` | ^5.0.0 | React bindings for Leaflet |
| `jsqr` | ^1.4.0 | Client-side QR code decoder (canvas-based) |
| `zustand` | ^5.0.13 | Lightweight global state management |
| `react-hot-toast` | ^2.6.0 | Toast notification UI |

#### Dev / build

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^8.0.12 | Build tool + dev server |
| `@vitejs/plugin-react` | ^6.0.1 | Vite React transform |
| `vite-plugin-pwa` | ^1.3.0 | Workbox service worker generation |
| `vite-plugin-mkcert` | ^2.0.0 | Local HTTPS (required for camera / PWA install) |
| `eslint` | ^10.3.0 | Linting |
| `eslint-plugin-react-hooks` | ^7.1.1 | React hooks lint rules |
| `eslint-plugin-react-refresh` | ^0.5.2 | HMR safety lint rules |
| `@types/react` | ^19.2.14 | TypeScript types for React |
| `@types/react-dom` | ^19.2.3 | TypeScript types for ReactDOM |
| `globals` | ^17.6.0 | ESLint browser/node globals |

---

## AI/voice integration readiness assessment

### What already exists that helps

| Hook | Detail |
|---|---|
| **`POST /event` endpoint** | Accepts `{ event_type, payload, session_id }` — could carry voice transcript or intent payloads with zero schema change |
| **Session ID** | Browser-generated UUID in localStorage (`qrnav:session-id`) links events across a conversation turn |
| **Structured instruction text** | Every navigation step already has a `text` string (`build_text()`) ready for TTS consumption |
| **`/route` response is already NL-ready** | Instructions are plain English sentences, not raw coordinates |
| **Offline event queue** | Events deferred during offline mode and flushed on reconnect — the same mechanism could queue voice commands |
| **`/search` endpoint** | POI lookup by substring — the natural output of an intent parser |
| **State machine is explicit** | `UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED` maps cleanly to conversational turns |

### Gaps and what needs to be built

#### 1. Voice input (STT)

The app has no microphone access path other than the existing `getUserMedia` call in `QRScanner.jsx` (camera only). A voice feature needs:

- A new React component or hook that opens a separate `getUserMedia` audio stream.
- Either the **Web Speech API** (`SpeechRecognition`) for on-device STT, or streaming audio to a server-side STT service.
- PWA constraint: `getUserMedia` for audio requires HTTPS (already satisfied by `vite-plugin-mkcert` in dev; must be enforced in production).
- Microphone permission is separate from camera permission — users will see a second browser prompt.

#### 2. Intent parsing

No NLP layer exists. A new backend endpoint is needed:

```
POST /voice/command
Body: { transcript: string, session_id: string, nav_status: string }
Response: { intent: "set_location"|"set_destination"|"next_step"|"cancel", entity: string|null }
```

This would either call an external LLM/NLU API or run a lightweight regex/keyword classifier. The `/search` endpoint already handles the "find POI by name" subproblem once an intent is extracted.

#### 3. TTS output

No audio playback exists. Options:

- **Browser `speechSynthesis` API** — zero dependencies, works offline, but voice quality varies by OS. No PWA constraints.
- **Server-side TTS** (e.g., AWS Polly, Google TTS) — higher quality, requires a new endpoint streaming audio or returning a URL/blob.

A new endpoint would be needed for server-side TTS:
```
POST /tts
Body: { text: string, voice?: string }
Response: audio/mpeg stream or { url: string }
```

The `InstructionPanel`'s `inst.text` strings are the primary TTS candidates. No changes to instruction generation are required.

#### 4. Existing endpoints to extend vs. new endpoints

| Endpoint | Action needed |
|---|---|
| `GET /route` | No change needed — response already contains TTS-ready instruction text |
| `POST /scan` | No change needed — could be triggered by a voice "I'm at [location]" intent |
| `GET /search` | No change needed — called after intent parser extracts a destination name |
| `POST /event` | No change needed — voice events can be logged via the existing schema |
| **`POST /voice/command`** | **New** — STT transcript → intent + entity extraction |
| **`POST /tts`** | **New** (optional) — text → speech audio, only if browser `speechSynthesis` is insufficient |
| **`GET /voice/session/{id}`** | **New** (optional) — retrieve conversation context for multi-turn dialogue |

#### 5. PWA / browser constraints

| Constraint | Impact |
|---|---|
| HTTPS required for `getUserMedia` (audio) | Already handled in dev via mkcert; production deployment must use TLS |
| `SpeechRecognition` not available in all browsers | Firefox desktop has no native support; fallback needed |
| PWA `standalone` display mode | Does not restrict audio access; mic prompt still fires normally |
| No background audio processing | Service worker cannot access `getUserMedia`; voice must run in the foreground page |
| Offline TTS | `speechSynthesis` works offline; server-side TTS requires connectivity |

#### 6. Summary assessment

The project is **well-structured for adding voice**. The state machine is clean and its states map directly to conversational contexts. Instruction text is already human-readable. The event system and session ID provide a natural logging and context-threading path. The two missing pieces are (a) a microphone input component and (b) a server-side intent parser endpoint. Neither requires changes to the existing navigation logic, routing algorithm, or database schema.
