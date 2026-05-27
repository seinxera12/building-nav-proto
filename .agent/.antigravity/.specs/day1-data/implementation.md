# Day 1 — Implementation Complete: Setup & Run Guide

> **Status:** All source code, seed data, and Docker configuration files are implemented.  
> **What remains:** Build the Docker containers and run the verification sequence.

---

## What Was Implemented

All files from the [Day 1 plan](./plan.md) have been implemented. Here's the complete inventory:

### Infrastructure Files (NEW)

| File | Purpose |
|------|---------|
| [`docker-compose.yml`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/docker-compose.yml) | PostGIS database + FastAPI backend containers |
| [`backend/Dockerfile`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/Dockerfile) | Python 3.11-slim container with pip deps |
| [`.env`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/.env) | Dual DB connection URLs (async + sync) |

### Backend Core (IMPLEMENTED)

| File | What It Does |
|------|--------------|
| [`backend/requirements.txt`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/requirements.txt) | FastAPI, SQLAlchemy async, asyncpg, psycopg2, dotenv, qrcode |
| [`backend/models.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/models.py) | 6 SQLAlchemy tables: Floor, Node, Edge, QRCheckpoint, POI, Event *(was already done)* |
| [`backend/db.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/db.py) | Async engine, session factory, `init_db()`, `get_db()` dependency |
| [`backend/graph.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/graph.py) | `NavGraph` class with Dijkstra's algorithm, adjacency list, euclidean distance, `load_graph_from_db()` |
| [`backend/main.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/main.py) | FastAPI app — lifespan startup (init DB + load graph), CORS, static files, router includes, `/health` |

### API Endpoints (IMPLEMENTED)

| File | Endpoint | Description |
|------|----------|-------------|
| [`backend/routes/routing.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/routes/routing.py) | `GET /route?from_=<int>&to=<int>` | Dijkstra shortest path + turn-by-turn instructions + QR checkpoints |
| [`backend/routes/scan.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/routes/scan.py) | `POST /scan` | Stub — echoes QR code back (Day 2+) |
| [`backend/routes/map.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/routes/map.py) | `GET /map` | Stub — returns placeholder (Day 2+) |
| [`backend/routes/__init__.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/routes/__init__.py) | — | Package marker (empty) |

### Seed Data (POPULATED)

| File | Contents |
|------|----------|
| [`backend/seed/nodes.json`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/seed/nodes.json) | 14 nodes — H-shaped office floor with entrance, junctions, elevator, POIs, stairs |
| [`backend/seed/edges.json`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/seed/edges.json) | 15 edges — bidirectional connections with Euclidean cost approximations |
| [`backend/seed/qr_codes.json`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/seed/qr_codes.json) | 6 QR anchor points at key locations |
| [`backend/seed.py`](file:///d:/ai/projects/building_nav/project/prototype/qr-nav-proto/backend/seed.py) | Sync seeding script — drops/creates tables, loads all JSON, generates POIs |

---

## Project Structure

```
qr-nav-proto/
├── docker-compose.yml          ← PostGIS + Backend services
├── .env                        ← DATABASE_URL + SYNC_DATABASE_URL
├── backend/
│   ├── Dockerfile              ← Python 3.11-slim
│   ├── requirements.txt        ← All Python deps
│   ├── main.py                 ← FastAPI app entry point
│   ├── db.py                   ← Async DB engine + session
│   ├── models.py               ← SQLAlchemy table definitions
│   ├── graph.py                ← NavGraph + Dijkstra algorithm
│   ├── seed.py                 ← Database seeding script
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── routing.py          ← GET /route (main endpoint)
│   │   ├── scan.py             ← POST /scan (stub)
│   │   └── map.py              ← GET /map (stub)
│   └── seed/
│       ├── nodes.json          ← 14 nodes
│       ├── edges.json          ← 15 edges
│       └── qr_codes.json       ← 6 QR anchors
└── frontend/                   ← Empty (Day 2)
```

---

## How to Set Up and Run

### Prerequisites

- **Docker Desktop** installed and running
- **curl** or a browser for testing endpoints

### Step 1: Build and Start Containers

```bash
cd d:\ai\projects\building_nav\project\prototype\qr-nav-proto

# Build and start in detached mode
docker compose up --build -d
```

This starts two containers:
- `indoornav_db` — PostgreSQL 15 with PostGIS, port 5432
- `indoornav_api` — FastAPI on Python 3.11, port 8000

We configured a container `healthcheck` on `indoornav_db` using `pg_isready` so that `indoornav_api` waits to start up until the database is fully ready to accept connections. This prevents "Connection refused" errors during initialization.

The backend volume-mounts `./backend:/app` so code changes reflect immediately via uvicorn's `--reload`.

### Step 2: Verify Database is Up

```bash
docker compose exec db psql -U nav -d indoornav -c "\dt"
```

Expected output — 6 tables:
```
         List of relations
 Schema |      Name       | Type  | Owner
--------+-----------------+-------+-------
 public | edges           | table | nav
 public | events          | table | nav
 public | floors          | table | nav
 public | nodes           | table | nav
 public | pois            | table | nav
 public | qr_checkpoints  | table | nav
```

### Step 3: Seed the Database

```bash
docker compose exec backend python seed.py
```

Expected output:
```
✅ Seeded: 14 nodes, 15 edges, 6 QR codes
```

### Step 4: Restart Backend (Load Graph into Memory)

```bash
docker compose restart backend
```

This is needed because the in-memory graph was loaded at startup (before seeding). After re-seeding, the backend must restart to pick up the new data.

> **Note:** On subsequent runs, if you seed before starting the backend, the graph loads automatically and no restart is needed.

### Step 5: Test Health Endpoint

```bash
curl http://localhost:8000/health
```

Expected:
```json
{"status": "ok", "nodes": 14}
```

### Step 6: Test Routing

```bash
# Lobby → Cafeteria
curl "http://localhost:8000/route?from_=1&to=12"
```

Expected response:
```json
{
  "path": [1, 2, 5, 6, 12],
  "instructions": [
    {"step": 1, "text": "Start at Main Lobby, head towards Lobby Junction", "distance": 160.0, "turn": "start", "nodeId": 1},
    {"step": 2, "text": "Continue straight past Lobby Junction", "distance": 120.0, "turn": "straight", "nodeId": 2},
    {"step": 3, "text": "Turn right at South Corridor West", "distance": 200.0, "turn": "right", "nodeId": 5},
    {"step": 4, "text": "Arrive at Cafeteria", "distance": 90.0, "turn": "destination", "nodeId": 6}
  ],
  "checkpoints": [],
  "totalDistance": 570.0
}
```

More test routes:
```bash
# Lobby → IT Department (long path through elevator bank)
curl "http://localhost:8000/route?from_=1&to=13"

# Conference Room A → Cafeteria (cross-building)
curl "http://localhost:8000/route?from_=9&to=12"

# Invalid route (should return 404)
curl "http://localhost:8000/route?from_=1&to=999"
```

### Step 7: Explore Swagger Docs

Open in browser: **http://localhost:8000/docs**

This shows the auto-generated FastAPI documentation with all endpoints:
- `GET /health` — system health check
- `GET /route` — shortest path routing
- `POST /scan` — QR scan stub
- `GET /map` — map data stub

---

## Architecture: Data Flow Pipeline

```
┌──────────────────────┐
│   seed/nodes.json    │
│   seed/edges.json    │──── JSON files (your "map editor")
│   seed/qr_codes.json │
└──────────┬───────────┘
           │
     seed.py (sync)
           │
           ▼
┌──────────────────────┐
│     PostgreSQL       │
│  (PostGIS 15-3.3)    │──── Single source of truth
│                      │
│  floors              │
│  nodes    ←─FK──→    │
│  edges    ←─FK──→    │
│  qr_checkpoints      │
│  pois                │
│  events              │
└──────────┬───────────┘
           │
  load_graph_from_db()
   (async, at startup)
           │
           ▼
┌──────────────────────┐
│   NavGraph (RAM)     │
│                      │──── Derived cache for fast queries
│  adj: dict[int, []]  │
│  nodes: dict[int, {}]│
└──────────┬───────────┘
           │
    Dijkstra's algorithm
           │
           ▼
┌──────────────────────┐
│   GET /route         │
│                      │──── Returns path + instructions
│  path: [1, 2, 5, 6] │
│  instructions: [...]  │
│  checkpoints: [...]   │
│  totalDistance: 570.0  │
└──────────────────────┘
```

**Key principle:** The database is the source of truth. The in-memory `NavGraph` is a derived cache loaded once at startup. Pathfinding never hits the database — only checkpoint lookups do.

---

## Key Design Decisions

1. **Two DB URLs** — `asyncpg` for the FastAPI async runtime, `psycopg2` for the synchronous seed script. Same database, different Python drivers.

2. **Module-level graph singleton** — `nav_graph = NavGraph()` in `graph.py`. Loaded once, serves all requests from RAM. A 14-node graph queries in microseconds.

3. **Bidirectional edges** — Every edge has both `cost` and `reverse_cost` (set equal for now). This allows one-way corridors later without schema changes.

4. **Turn detection via atan2** — `compute_turn()` uses vector math on three consecutive nodes to determine left/right/straight. Threshold: ±25° = straight. This will be fine-tuned on Day 4.

5. **POIs auto-generated from nodes** — Nodes with types `poi`, `elevator`, `entrance`, `stairs` automatically get POI records in the seed script. This avoids maintaining a separate POI list.

6. **Schema Isolation (public schema)** — The PostGIS Docker image pre-configures a schema called `tiger` containing an `edges` table. To prevent name resolution conflicts where SQLAlchemy tries to drop `tiger.edges` instead of ours, we isolate all prototype tables explicitly within the `public` schema (via `Base.metadata = MetaData(schema="public")`) and qualify raw SQL text queries as `public.nodes` / `public.edges`.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `connection refused` on port 5432 | Wait 10-15 seconds for PostgreSQL to initialize |
| `{"nodes": 0}` from /health | Run `seed.py` then `docker compose restart backend` |
| Seed script fails with `asyncpg` error | Make sure seed.py uses `SYNC_DATABASE_URL`, not `DATABASE_URL` |
| Graph returns wrong paths after re-seeding | Restart the backend: `docker compose restart backend` |
| Port 5432 already in use | Stop any local PostgreSQL: `net stop postgresql` or change the port in docker-compose.yml |
| Port 8000 already in use | Change the port mapping in docker-compose.yml: `"8001:8000"` |

---

## What's Next: Day 2

Day 2 is where this data becomes **visual**:
- Frontend scaffold (Vite + React or plain HTML/JS)
- Leaflet.js map with `CRS.Simple` coordinate system
- Floor plan image overlay
- Nodes and edges rendered on the map
- Route visualization (highlighted path)
- The node coordinates from `nodes.json` will map directly to pixel positions on the floor plan image
