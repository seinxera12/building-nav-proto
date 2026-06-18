# routes/map.py
from fastapi import APIRouter, Query
from sqlalchemy import text
from db import AsyncSessionLocal

router = APIRouter()


@router.get("/map/floor/{floor_id}")
async def get_floor(floor_id: int):
    async with AsyncSessionLocal() as db:
        floor = (await db.execute(
            text("""SELECT id, building_id, floor_num, name, map_url, map_svg_url, bounds,
                          coordinate_system, origin_x, origin_y, scale, elevation_m, is_accessible
                   FROM public.floors WHERE id = :fid"""),
            {"fid": floor_id}
        )).fetchone()

        nodes = (await db.execute(
            text("SELECT id, x, y, label, type, accessible, elevation FROM public.nodes WHERE floor_id = :fid"),
            {"fid": floor_id}
        )).fetchall()

        pois = (await db.execute(
            text("""SELECT p.id, p.name, p.category, n.id as node_id
                    FROM public.pois p JOIN public.nodes n ON p.node_id = n.id
                    WHERE n.floor_id = :fid"""),
            {"fid": floor_id}
        )).fetchall()

        qr_codes = (await db.execute(
            text("""SELECT qr_code, node_id, label
                    FROM public.qr_checkpoints
                    WHERE floor_id = :fid"""),
            {"fid": floor_id}
        )).fetchall()
        
        # Get connectors (elevator/stairs/escalator nodes) on this floor
        connectors = (await db.execute(
            text("""SELECT id, label, type, x, y
                    FROM public.nodes
                    WHERE floor_id = :fid AND type IN ('elevator', 'stairs', 'escalator')"""),
            {"fid": floor_id}
        )).fetchall()

    return {
        "floorId": floor.id,
        "floorName": floor.name,
        "floorNum": floor.floor_num,
        "imageUrl": floor.map_url,
        "imageSvgUrl": floor.map_svg_url,
        "bounds": floor.bounds,
        "coordinateSystem": floor.coordinate_system,
        "scale": floor.scale,
        "elevationM": floor.elevation_m,
        "isAccessible": floor.is_accessible,
        "nodes": [dict(n._mapping) for n in nodes],
        "pois": [dict(p._mapping) for p in pois],
        "qrCodes": [dict(q._mapping) for q in qr_codes],
        "connectors": [dict(c._mapping) for c in connectors],
    }


@router.get("/search")
async def search_pois(q: str, floor_id: int = None):
    async with AsyncSessionLocal() as db:
        if floor_id:
            results = (await db.execute(
                text("""SELECT p.name, p.category, n.id as node_id, n.x, n.y, n.floor_id, f.name as floor_name
                        FROM public.pois p 
                        JOIN public.nodes n ON p.node_id = n.id
                        JOIN public.floors f ON n.floor_id = f.id
                        WHERE LOWER(p.search_terms) LIKE :q AND n.floor_id = :floor_id
                        LIMIT 8"""),
                {"q": f"%{q.lower()}%", "floor_id": floor_id}
            )).fetchall()
        else:
            results = (await db.execute(
                text("""SELECT p.name, p.category, n.id as node_id, n.x, n.y, n.floor_id, f.name as floor_name
                        FROM public.pois p 
                        JOIN public.nodes n ON p.node_id = n.id
                        JOIN public.floors f ON n.floor_id = f.id
                        WHERE LOWER(p.search_terms) LIKE :q
                        LIMIT 8"""),
                {"q": f"%{q.lower()}%"}
            )).fetchall()
    
    return [
        {
            **dict(r._mapping),
            "floorId": r.floor_id,
            "floorName": r.floor_name
        }
        for r in results
    ]


@router.get("/pois")
async def get_pois():
    async with AsyncSessionLocal() as db:
        results = (await db.execute(
            text("""SELECT p.id, p.name, p.category, p.search_terms, n.id as node_id, n.accessible as node_accessible, f.name as floor_name, f.floor_num
                    FROM public.pois p
                    JOIN public.nodes n ON p.node_id = n.id
                    JOIN public.floors f ON n.floor_id = f.id""")
        )).fetchall()
    return [dict(r._mapping) for r in results]


@router.get("/buildings/{building_id}/floors")
async def get_building_floors(building_id: int):
    """Get all floors for a building."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            text("""SELECT id, floor_num, name, elevation_m, is_accessible, map_url, map_svg_url, bounds
                    FROM public.floors 
                    WHERE building_id = :bid
                    ORDER BY floor_num"""),
            {"bid": building_id}
        )).fetchall()

    return [
        {
            "id": row.id,
            "floorNum": row.floor_num,
            "name": row.name,
            "elevationM": row.elevation_m,
            "isAccessible": row.is_accessible,
            "imageUrl": row.map_url,
            "imageSvgUrl": row.map_svg_url,
            "bounds": row.bounds,
        }
        for row in rows
    ]