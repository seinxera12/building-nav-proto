# Multi-Floor Navigation - Setup Instructions

## Prerequisites

- Docker containers running (backend + database)
- Access to the docker-compose services

---

## Option A: Fresh Database (Recommended for Testing)

If you can afford to reset the database, this is the simplest approach:

```bash
# 1. Rebuild and restart the backend to pick up code changes
docker-compose build backend
docker-compose up -d backend

# 2. Run the seed script inside the container
docker-compose exec backend python seed.py
```

This will:
- Drop and recreate all tables with the new schema
- Populate Floor 1 (Ground Floor) and Floor 2 (Second Floor)
- Create 28 nodes (14 per floor), edges including floor connectors, and 12 QR codes

---

## Option B: Existing Database (Migration)

If you have existing data and want to keep it:

```bash
# 1. Rebuild the backend
docker-compose build backend
docker-compose up -d backend

# 2. Run the migration script to add new columns
docker-compose exec backend python -m migrations.add_multifloor_columns
```

This adds the new columns without losing existing data:
- `floors`: map_svg_url, coordinate_system, origin_x, origin_y, scale, elevation_m, default_viewport, is_accessible
- `nodes`: elevation
- `edges`: edge_type, floor_change, floor_delta

**Note:** After migration, you'll need to manually add Floor 2 data or run a modified seed that only adds Floor 2.

---

## Verify the Setup

### Check Database Has Two Floors

```bash
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('SYNC_DATABASE_URL'))
with engine.connect() as conn:
    floors = conn.execute(text('SELECT id, floor_num, name, elevation_m FROM floors ORDER BY floor_num')).fetchall()
    for f in floors:
        print(f'Floor {f[1]}: {f[2]} (elevation: {f[3]}m)')
"
```

Expected output:
```
Floor 1: Ground Floor (elevation: 0.0m)
Floor 2: Second Floor (elevation: 3.5m)
```

### Check Nodes

```bash
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('SYNC_DATABASE_URL'))
with engine.connect() as conn:
    nodes = conn.execute(text('SELECT floor_id, COUNT(*) FROM nodes GROUP BY floor_id ORDER BY floor_id')).fetchall()
    for f, c in nodes:
        print(f'Floor {f}: {c} nodes')
"
```

Expected output:
```
Floor 1: 14 nodes
Floor 2: 14 nodes
```

### Check Floor Connectors

```bash
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('SYNC_DATABASE_URL'))
with engine.connect() as conn:
    # Elevators
    elev = conn.execute(text('SELECT floor_id, label FROM nodes WHERE type='elevator' ORDER BY floor_id')).fetchall()
    print('Elevators:', [(e[0], e[1]) for e in elev])
    # Stairs  
    stairs = conn.execute(text('SELECT floor_id, label FROM nodes WHERE type='stairs' ORDER BY floor_id')).fetchall()
    print('Stairs:', [(s[0], s[1]) for s in stairs])
"
```

Expected output:
```
Elevators: [(1, 'Elevator Bank'), (2, 'Elevator Bank')]
Stairs: [(1, 'Stairwell A'), (2, 'Stairwell A')]
```

### Check Edge Types

```bash
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('SYNC_DATABASE_URL'))
with engine.connect() as conn:
    edges = conn.execute(text(\"SELECT edge_type, floor_change, COUNT(*) FROM edges GROUP BY edge_type, floor_change\")).fetchall()
    for e in edges:
        print(f'{e[0]} (floor_change={e[1]}): {e[2]} edges')
"
```

Expected output:
```
walkable (floor_change=False): 30 edges
elevator (floor_change=True): 2 edges
stairs (floor_change=True): 2 edges
```

---

## Testing the API

### Get Floor 1

```bash
curl http://localhost:8000/map/floor/1 | jq '.floorName, .floorNum, .elevationM'
```

### Get Floor 2

```bash
curl http://localhost:8000/map/floor/2 | jq '.floorName, .floorNum, .elevationM'
```

### Get All Floors for Building

```bash
curl http://localhost:8000/buildings/1/floors | jq
```

### Search with Floor Filter

```bash
curl "http://localhost:8000/search?q=room&floor_id=1" | jq
```

### QR Codes by Floor

```bash
# Floor 1 QRs
curl "http://localhost:8000/qr-codes/all?floor_id=1" | jq '.[].label'

# Floor 2 QRs  
curl "http://localhost:8000/qr-codes/all?floor_id=2" | jq '.[].label'
```

---

## Testing in Browser

1. Start the frontend: `cd frontend && npm run dev`
2. Open http://localhost:5173
3. Scan QR code: `QR_LOBBY_MAIN` (Floor 1)
4. Select a destination on Floor 1 (e.g., Cafeteria)
5. Test navigation works as before

---

## Rollback (If Needed)

To revert to single-floor mode:

```bash
# Drop and recreate with old seed (you'd need the old seed.py)
# Or manually remove Floor 2:
docker-compose exec backend python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('SYNC_DATABASE_URL'))
with engine.connect() as conn:
    conn.execute(text('DELETE FROM floors WHERE id = 2'))
    conn.execute(text('DELETE FROM nodes WHERE floor_id = 2'))
    conn.execute(text('DELETE FROM qr_checkpoints WHERE floor_id = 2'))
    conn.commit()
print('Floor 2 removed')
"
```

---

## Troubleshooting

### "relation 'floors' does not exist"
→ Run the migration first: `docker-compose exec backend python -m migrations.add_multifloor_columns`

### "Duplicate key value violates unique constraint"
→ The database already has data. Use Option B (migration) instead of Option A.

### Frontend not loading floor data
→ Clear localStorage in browser DevTools → Application → Local Storage → Clear

### QR codes not found on Floor 2
→ Make sure you scanned a Floor 2 QR code (QR_F2_LOBBY, QR_F2_ELEV, etc.)