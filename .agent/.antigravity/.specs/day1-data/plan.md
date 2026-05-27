## Day 1 — Infrastructure + Data Foundation

Let's break this down properly before you write a single line of code.

---

### What Day 1 Actually Is

Day 1 is not about features. It's about building the **foundation everything else sits on**. If this is wrong, Days 2–7 fight against it constantly. The goal is deceptively simple:

> By end of day, you can hit `GET /route?from=1&to=15` and get back a real path through a real graph loaded from a real database.

Nothing visual. No frontend. Pure plumbing. But it must be **solid**.

---

### The Mental Model First

Before touching code, understand what you're actually building:

```
Floor Plan Image (PNG)
       ↓
  You look at it
       ↓
  Manually identify nodes (junctions, rooms, QR spots)
       ↓
  Record them as (id, x, y, type, label) in nodes.json
       ↓
  Manually draw edges between adjacent nodes
       ↓
  Record them as (from, to) in edges.json
       ↓
  Seed script pushes all this into PostgreSQL
       ↓
  FastAPI loads graph into memory at startup
       ↓
  Dijkstra runs on in-memory graph
       ↓
  /route returns path + raw instructions
```

The database is the **single source of truth**. The in-memory graph is a **derived cache** of it. The seed JSON files are **your raw input format** — think of them as your "map editor" for now.

---

### Project Structure (set this up first, exactly like this)

```
indoor-nav/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py               ← FastAPI app entry
│   ├── db.py                 ← DB connection + session
│   ├── models.py             ← SQLAlchemy table models
│   ├── graph.py              ← Dijkstra + NavGraph class
│   ├── seed.py               ← seeding script
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── routing.py        ← /route endpoint
│   │   ├── scan.py           ← /scan endpoint (stub today)
│   │   └── map.py            ← /map endpoint (stub today)
│   └── seed/
│       ├── floor_plan.png    ← your floor plan image
│       ├── nodes.json
│       ├── edges.json
│       └── qr_codes.json
├── frontend/                 ← empty today, scaffold tomorrow
├── docker-compose.yml
└── .env
```

Structure reasoning: `routes/` is split by domain so each file stays small. `seed/` is co-located with backend because it's backend data, not a shared asset yet.

---

### Step 1 — Docker Compose Setup

This is your local environment. You want PostgreSQL + PostGIS (for future geo queries) and optionally Redis. Start it once, forget about it.

yaml

```yaml
# docker-compose.yml
version: "3.8"

services:
  db:
    image: postgis/postgis:15-3.3
    container_name: indoornav_db
    environment:
      POSTGRES_DB: indoornav
      POSTGRES_USER: nav
      POSTGRES_PASSWORD: nav123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    container_name: indoornav_api
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - ./backend:/app        # hot reload — code changes reflect immediately
    depends_on:
      - db
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  pgdata:
```

bash

```bash
# .env
DATABASE_URL=postgresql+asyncpg://nav:nav123@db/indoornav
SYNC_DATABASE_URL=postgresql://nav:nav123@db/indoornav
```

Why two database URLs? SQLAlchemy needs **async** URL for the API (`asyncpg`) but **sync** URL for the seed script (simpler to run synchronously). The only difference is the driver prefix.

Why `postgis/postgis:15-3.3` and not plain `postgres:15`? PostGIS gives you spatial types (`GEOMETRY`, `GEOGRAPHY`) for future use. Cost is zero — same image, just larger. You'll thank yourself later.

**Dockerfile for backend:**

dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

```
# requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
psycopg2-binary==2.9.9      ← sync driver for seed script
python-dotenv==1.0.1
qrcode[pil]==7.4.2           ← QR generation utility
```

---

### Step 2 — Database Models

python

```python
# models.py
from sqlalchemy import Column, Integer, Float, String, Boolean, JSON, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    pass

class Floor(Base):
    __tablename__ = "floors"
    id         = Column(Integer, primary_key=True)
    building_id = Column(Integer, nullable=False, default=1)
    floor_num  = Column(Integer, nullable=False, default=1)
    name       = Column(String)
    map_url    = Column(String)           # e.g. "/maps/floor1.png"
    bounds     = Column(JSON)             # {minX, minY, maxX, maxY}

class Node(Base):
    __tablename__ = "nodes"
    id         = Column(Integer, primary_key=True)
    floor_id   = Column(Integer, ForeignKey("floors.id"))
    label      = Column(String, nullable=False)
    type       = Column(String, nullable=False)   # junction/poi/elevator/entrance/qr_anchor
    x          = Column(Float, nullable=False)
    y          = Column(Float, nullable=False)
    accessible = Column(Boolean, default=True)
    metadata_  = Column("metadata", JSON)

class Edge(Base):
    __tablename__ = "edges"
    id           = Column(Integer, primary_key=True)
    from_node    = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    to_node      = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    cost         = Column(Float, nullable=False)
    reverse_cost = Column(Float)
    walkable     = Column(Boolean, default=True)
    accessible   = Column(Boolean, default=True)

class QRCheckpoint(Base):
    __tablename__ = "qr_checkpoints"
    id       = Column(Integer, primary_key=True)
    qr_code  = Column(String, unique=True, nullable=False)
    node_id  = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    label    = Column(String)
    floor_id = Column(Integer, ForeignKey("floors.id"))

class POI(Base):
    __tablename__ = "pois"
    id           = Column(Integer, primary_key=True)
    node_id      = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    name         = Column(String, nullable=False)
    category     = Column(String)
    search_terms = Column(Text)

class Event(Base):
    __tablename__ = "events"
    id         = Column(Integer, primary_key=True)
    session_id = Column(String)
    event_type = Column(String)
    payload    = Column(JSON)
    created_at = Column(String)   # ISO string, fine for prototype
```

---

### Step 3 — Database Connection

python

```python
# db.py
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from models import Base

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    """FastAPI dependency — yields a session per request."""
    async with AsyncSessionLocal() as session:
        yield session
```

`init_db()` is called once at app startup. It's idempotent — `CREATE TABLE IF NOT EXISTS` under the hood. Safe to call every time.

---

### Step 4 — The Graph Engine

This is the intellectual core of Day 1. Read this carefully.

python

```python
# graph.py
import heapq
import math
from collections import defaultdict
from typing import Optional

class NavGraph:
    def __init__(self):
        # adjacency list: node_id → [(cost, neighbor_id)]
        self.adj: dict[int, list[tuple[float, int]]] = defaultdict(list)
        # node metadata: node_id → {x, y, label, type}
        self.nodes: dict[int, dict] = {}

    def add_node(self, node_id: int, x: float, y: float, label: str, type_: str):
        self.nodes[node_id] = {"x": x, "y": y, "label": label, "type": type_}

    def add_edge(self, u: int, v: int, cost: float, reverse_cost: Optional[float] = None):
        self.adj[u].append((cost, v))
        rc = reverse_cost if reverse_cost is not None else cost
        self.adj[v].append((rc, u))

    def shortest_path(self, start: int, end: int) -> list[int]:
        if start == end:
            return [start]
        if start not in self.nodes or end not in self.nodes:
            return []

        dist = {start: 0.0}
        prev = {}
        pq = [(0.0, start)]

        while pq:
            d, u = heapq.heappop(pq)
            if u == end:
                break
            if d > dist.get(u, math.inf):
                continue
            for cost, v in self.adj[u]:
                nd = d + cost
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))

        # No path found
        if end not in prev and end != start:
            return []

        # Reconstruct
        path, node = [], end
        while node in prev:
            path.append(node)
            node = prev[node]
        path.append(start)
        return list(reversed(path))

    def euclidean_cost(self, u: int, v: int) -> float:
        n1, n2 = self.nodes[u], self.nodes[v]
        return math.sqrt((n1["x"] - n2["x"])**2 + (n1["y"] - n2["y"])**2)


# Module-level singleton — loaded once at startup
nav_graph = NavGraph()


async def load_graph_from_db(db):
    """Pull nodes + edges from DB, populate in-memory graph."""
    from sqlalchemy import text

    nodes_result = await db.execute(text("SELECT id, x, y, label, type FROM nodes"))
    for row in nodes_result.fetchall():
        nav_graph.add_node(row.id, row.x, row.y, row.label, row.type)

    edges_result = await db.execute(
        text("SELECT from_node, to_node, cost, reverse_cost FROM edges WHERE walkable = true")
    )
    for row in edges_result.fetchall():
        nav_graph.add_edge(row.from_node, row.to_node, row.cost, row.reverse_cost)
```

Why module-level singleton? The graph doesn't change during a demo. Load it once at startup, serve every request from RAM. No DB query per routing request. A 30-node graph takes < 1ms to query.

---

### Step 5 — FastAPI Main App

python

```python
# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db import init_db, AsyncSessionLocal
from graph import load_graph_from_db
from routes import routing, scan, map as map_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    async with AsyncSessionLocal() as db:
        await load_graph_from_db(db)
    print("✅ DB ready, graph loaded")
    yield
    # Shutdown (nothing needed)

app = FastAPI(title="Indoor Nav API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve floor plan images as static files
app.mount("/maps", StaticFiles(directory="seed"), name="maps")

app.include_router(routing.router)
app.include_router(scan.router)
app.include_router(map_router.router)

@app.get("/health")
async def health():
    return {"status": "ok", "nodes": len(__import__("graph").nav_graph.nodes)}
```

The `/health` endpoint tells you immediately if the graph loaded. Hit it first thing after startup.

---

### Step 6 — Routing Endpoint

python

```python
# routes/routing.py
import math
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db import AsyncSessionLocal
from graph import nav_graph

router = APIRouter()

@router.get("/route")
async def get_route(from_: int, to: int):
    # Dijkstra
    path = nav_graph.shortest_path(from_, to)
    if not path:
        raise HTTPException(404, detail=f"No path from {from_} to {to}")

    # Build instructions from path geometry
    instructions = generate_instructions(path)

    # Find QR checkpoints along the path
    checkpoints = []
    async with AsyncSessionLocal() as db:
        for node_id in path[1:-1]:   # exclude start and end
            result = await db.execute(
                text("SELECT qr_code, label FROM qr_checkpoints WHERE node_id = :nid"),
                {"nid": node_id}
            )
            row = result.fetchone()
            if row:
                checkpoints.append({
                    "nodeId": node_id,
                    "qrCode": row.qr_code,
                    "label": row.label
                })

    total_distance = sum(
        nav_graph.euclidean_cost(path[i], path[i+1])
        for i in range(len(path) - 1)
    )

    return {
        "path": path,
        "instructions": instructions,
        "checkpoints": checkpoints,
        "totalDistance": round(total_distance, 1)
    }


def generate_instructions(path: list[int]) -> list[dict]:
    instructions = []
    nodes = nav_graph.nodes

    for i in range(len(path) - 1):
        curr_id = path[i]
        next_id = path[i + 1]
        curr = nodes[curr_id]
        nxt = nodes[next_id]
        dist = nav_graph.euclidean_cost(curr_id, next_id)

        if i == 0:
            turn = "start"
            text_ = f"Start at {curr['label']}, head towards {nxt['label']}"
        elif i == len(path) - 2:
            turn = "destination"
            text_ = f"Arrive at {nxt['label']}"
        else:
            prev = nodes[path[i - 1]]
            turn = compute_turn(prev, curr, nxt)
            text_ = turn_to_text(turn, curr["label"], nxt["label"])

        instructions.append({
            "step": len(instructions) + 1,
            "text": text_,
            "distance": round(dist, 1),
            "turn": turn,
            "nodeId": curr_id
        })

    return instructions


def compute_turn(prev: dict, curr: dict, next_: dict) -> str:
    v1x, v1y = curr["x"] - prev["x"], curr["y"] - prev["y"]
    v2x, v2y = next_["x"] - curr["x"], next_["y"] - curr["y"]
    angle = math.degrees(math.atan2(v2y, v2x) - math.atan2(v1y, v1x))
    if angle > 180: angle -= 360
    if angle < -180: angle += 360
    if abs(angle) < 25: return "straight"
    return "right" if angle > 0 else "left"


def turn_to_text(turn: str, curr_label: str, next_label: str) -> str:
    if turn == "straight":
        return f"Continue straight past {curr_label}"
    if turn == "left":
        return f"Turn left at {curr_label}"
    if turn == "right":
        return f"Turn right at {curr_label}"
    return f"Continue to {next_label}"
```

---

### Step 7 — Seed Data Creation

This is where you actually model your building. Here's the process:

**Get your floor plan:**

- Don't spend more than 30 min on this. Options in order of time cost:
    1. Download a Creative Commons office floor plan PNG from Wikimedia or similar
    2. Sketch one quickly in **Excalidraw** (free, browser-based) — draw rectangles for rooms, lines for corridors, export PNG
    3. Use this minimal one: just corridors forming an H-shape with 6 rooms

**Open the image, start placing nodes:**

Open the floor plan in any tool that shows pixel coordinates (even Preview on Mac shows cursor position). You need `(x, y)` for each node. Record them as you go.

json

```json
// seed/nodes.json  — example for a simple H-shaped floor
[
  {"id": 1,  "x": 240, "y": 380, "type": "entrance",  "label": "Main Lobby",         "floor_id": 1},
  {"id": 2,  "x": 400, "y": 380, "type": "junction",  "label": "Lobby Junction",     "floor_id": 1},
  {"id": 3,  "x": 400, "y": 250, "type": "junction",  "label": "North Corridor West","floor_id": 1},
  {"id": 4,  "x": 600, "y": 250, "type": "junction",  "label": "North Corridor East","floor_id": 1},
  {"id": 5,  "x": 400, "y": 500, "type": "junction",  "label": "South Corridor West","floor_id": 1},
  {"id": 6,  "x": 600, "y": 500, "type": "junction",  "label": "South Corridor East","floor_id": 1},
  {"id": 7,  "x": 600, "y": 380, "type": "junction",  "label": "Center Junction",    "floor_id": 1},
  {"id": 8,  "x": 800, "y": 380, "type": "elevator",  "label": "Elevator Bank",      "floor_id": 1},
  {"id": 9,  "x": 300, "y": 200, "type": "poi",       "label": "Conference Room A",  "floor_id": 1},
  {"id": 10, "x": 700, "y": 200, "type": "poi",       "label": "Office Suite 201",   "floor_id": 1},
  {"id": 11, "x": 300, "y": 560, "type": "poi",       "label": "Restroom",           "floor_id": 1},
  {"id": 12, "x": 700, "y": 560, "type": "poi",       "label": "Cafeteria",          "floor_id": 1},
  {"id": 13, "x": 950, "y": 380, "type": "poi",       "label": "IT Department",      "floor_id": 1},
  {"id": 14, "x": 240, "y": 500, "type": "stairs",    "label": "Stairwell A",        "floor_id": 1}
]
```

json

```json
// seed/edges.json
// cost = Euclidean distance between the node coordinates above
// For prototype: compute it mentally or use a calculator — precision doesn't matter
[
  {"from": 1,  "to": 2,  "cost": 160},
  {"from": 2,  "to": 3,  "cost": 130},
  {"from": 2,  "to": 5,  "cost": 120},
  {"from": 2,  "to": 7,  "cost": 200},
  {"from": 3,  "to": 4,  "cost": 200},
  {"from": 3,  "to": 9,  "cost": 110},
  {"from": 4,  "to": 7,  "cost": 130},
  {"from": 4,  "to": 10, "cost": 110},
  {"from": 5,  "to": 6,  "cost": 200},
  {"from": 5,  "to": 11, "cost": 90},
  {"from": 5,  "to": 14, "cost": 160},
  {"from": 6,  "to": 7,  "cost": 130},
  {"from": 6,  "to": 12, "cost": 90},
  {"from": 7,  "to": 8,  "cost": 200},
  {"from": 8,  "to": 13, "cost": 150}
]
```

json

```json
// seed/qr_codes.json
[
  {"qr_code": "QR_LOBBY_MAIN",   "node_id": 1,  "label": "Main Lobby Entrance",  "floor_id": 1},
  {"qr_code": "QR_ELEV_BANK",    "node_id": 8,  "label": "Elevator Bank",        "floor_id": 1},
  {"qr_code": "QR_CAFETERIA",    "node_id": 12, "label": "Cafeteria Entrance",   "floor_id": 1},
  {"qr_code": "QR_CONF_A",       "node_id": 9,  "label": "Conference Room A",    "floor_id": 1},
  {"qr_code": "QR_CENTER_JCT",   "node_id": 7,  "label": "Center Junction",      "floor_id": 1},
  {"qr_code": "QR_STAIRWELL_A",  "node_id": 14, "label": "Stairwell A",          "floor_id": 1}
]
```

**The seed script:**

python

```python
# seed.py
import json, os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from models import Base, Floor, Node, Edge, QRCheckpoint, POI
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("SYNC_DATABASE_URL"))

def run():
    Base.metadata.drop_all(engine)    # clean slate each seed
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        # Floor
        floor = Floor(id=1, building_id=1, floor_num=1,
                      name="Ground Floor",
                      map_url="/maps/floor_plan.png",
                      bounds={"minX": 0, "minY": 0, "maxX": 2000, "maxY": 1400})
        db.add(floor)
        db.flush()

        # Nodes
        nodes_data = json.load(open("seed/nodes.json"))
        for n in nodes_data:
            db.add(Node(id=n["id"], floor_id=n["floor_id"],
                        label=n["label"], type=n["type"],
                        x=n["x"], y=n["y"]))
        db.flush()

        # Edges
        edges_data = json.load(open("seed/edges.json"))
        for e in edges_data:
            db.add(Edge(from_node=e["from"], to_node=e["to"],
                        cost=e["cost"], reverse_cost=e["cost"]))
        db.flush()

        # QR Checkpoints
        qr_data = json.load(open("seed/qr_codes.json"))
        for q in qr_data:
            db.add(QRCheckpoint(qr_code=q["qr_code"], node_id=q["node_id"],
                                label=q["label"], floor_id=q["floor_id"]))

        # POIs (subset of nodes that are searchable destinations)
        pois = [n for n in nodes_data if n["type"] in ("poi", "elevator", "entrance", "stairs")]
        for p in pois:
            db.add(POI(node_id=p["id"], name=p["label"],
                       category=p["type"],
                       search_terms=p["label"].lower()))

        db.commit()
        print(f"✅ Seeded: {len(nodes_data)} nodes, {len(edges_data)} edges, {len(qr_data)} QR codes")

if __name__ == "__main__":
    run()
```

Run this **inside Docker** (so it connects to the container DB):

bash

```bash
docker compose exec backend python seed.py
```

---

### Step 8 — Verification Sequence

Run these in order. Each one confirms a layer is working before building on it.

bash

```bash
# 1. Start everything
docker compose up --build

# 2. Check DB is up
docker compose exec db psql -U nav -d indoornav -c "\dt"
# Should show: floors, nodes, edges, qr_checkpoints, pois, events

# 3. Seed data
docker compose exec backend python seed.py
# Should print: ✅ Seeded: 14 nodes, 15 edges, 6 QR codes

# 4. Check health (graph loaded)
curl http://localhost:8000/health
# {"status":"ok","nodes":14}

# 5. Test routing — Lobby to Cafeteria
curl "http://localhost:8000/route?from_=1&to=12"
# Should return JSON with path, instructions, checkpoints

# 6. FastAPI auto-docs (very useful for testing)
# Open in browser: http://localhost:8000/docs
```

Expected route response for `from=1 to=12` (Lobby → Cafeteria):

json

```json
{
  "path": [1, 2, 5, 6, 12],
  "instructions": [
    {"step": 1, "text": "Start at Main Lobby, head towards Lobby Junction", "distance": 160.0, "turn": "start"},
    {"step": 2, "text": "Continue straight past Lobby Junction", "distance": 120.0, "turn": "straight"},
    {"step": 3, "text": "Turn right at South Corridor West", "distance": 200.0, "turn": "right"},
    {"step": 4, "text": "Arrive at Cafeteria", "distance": 90.0, "turn": "destination"}
  ],
  "checkpoints": [],
  "totalDistance": 570.0
}
```

If the turn labels are wrong, that's fine for Day 1 — the geometry computation gets tuned on Day 4. What matters today is that **a path comes back**.

---

### What You're Learning on Day 1

These are the concepts this day ingrains. If you don't already know them, this day teaches them by doing:

**1. Async Python patterns** — `asynccontextmanager`, `async def`, `await`, `AsyncSession`. SQLAlchemy 2.0's async interface is different from what most tutorials show. The lifespan pattern for startup/shutdown is the modern FastAPI way (not `@app.on_event`).

**2. Graph theory basics** — Dijkstra's algorithm, adjacency lists, edge cost, path reconstruction from `prev` dict. You're implementing it from scratch, which means you'll actually understand it rather than just calling a library.

**3. The difference between graph storage and graph computation** — DB stores the graph as relational data (nodes table + edges table). In-memory `NavGraph` is the working copy for fast lookups. This separation matters — you query the DB for things like "which nodes have QR codes" but you never query the DB for pathfinding.

**4. Docker Compose for local dev** — Volume mounting so your code changes reflect without rebuilding. `depends_on` for startup ordering. How to exec into a container.

**5. CRS.Simple coordinate thinking** — Right now you're placing nodes in pixel coordinates. Tomorrow when you put these on a Leaflet map with `CRS.Simple`, they'll just work. The mental model you build today (x=pixels right, y=pixels down) is what makes Day 2 smooth.

---

### Common Day 1 Mistakes to Avoid

**Mistake 1: Wrong async URL vs sync URL** Using `asyncpg` driver in seed.py will cause errors because seed.py runs synchronously. Keep `SYNC_DATABASE_URL` for the seed script.

**Mistake 2: Running seed.py from host instead of container** `localhost:5432` from your machine hits the Docker-exposed port. `db:5432` inside Docker hits the service name. The env file uses `db` hostname — only works inside Docker. When running `seed.py` externally, you'd need to temporarily change the host.

**Mistake 3: Not reloading the in-memory graph after re-seeding** If you re-run `seed.py`, the backend's in-memory `nav_graph` still has the old data. Restart the backend container after re-seeding: `docker compose restart backend`.

**Mistake 4: Over-precise node coordinates** Don't spend time getting x,y coordinates exactly right today. Approximate values that look roughly correct visually are good enough. You'll calibrate against the actual floor plan image on Day 2 when you can see them rendered.

**Mistake 5: Too many nodes** Resist the urge to model every room. 12–16 nodes is perfect for Day 1. You can add more later. A sparse graph that routes correctly beats a dense graph that's hard to debug.

---

### End of Day 1 Success Criteria

You're done for the day when:

- `docker compose up` starts without errors
- `curl /health` returns `{"status":"ok","nodes":14}` (or however many you seeded)
- `curl /route?from_=1&to=12` returns a JSON with `path`, `instructions`, and `checkpoints`
- `http://localhost:8000/docs` shows the Swagger UI with your endpoints listed
- Re-running `seed.py` then restarting backend still produces correct routes

Nothing else. No frontend, no QR scanner, no map. Just clean plumbing that works.

---

When you're ready, come back and we'll walk through **Day 2** — which is where this data becomes visual and you see your graph rendered on a floor plan for the first time.