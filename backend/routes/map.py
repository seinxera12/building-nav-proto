# routes/map.py
from fastapi import APIRouter
from sqlalchemy import text
from db import AsyncSessionLocal

router = APIRouter()


@router.get("/map/floor/{floor_id}")
async def get_floor(floor_id: int):
    async with AsyncSessionLocal() as db:
        floor = (await db.execute(
            text("SELECT id, building_id, floor_num, name, map_url, bounds FROM public.floors WHERE id = :fid"), {"fid": floor_id}
        )).fetchone()

        nodes = (await db.execute(
            text("SELECT id, x, y, label, type, accessible FROM public.nodes WHERE floor_id = :fid"),
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

    return {
        "imageUrl": floor.map_url,
        "bounds": floor.bounds,
        "nodes": [dict(n._mapping) for n in nodes],
        "pois":  [dict(p._mapping) for p in pois],
        "qrCodes": [dict(q._mapping) for q in qr_codes],
    }


@router.get("/search")
async def search_pois(q: str):
    async with AsyncSessionLocal() as db:
        results = (await db.execute(
            text("""SELECT p.name, p.category, n.id as node_id, n.x, n.y
                    FROM public.pois p JOIN public.nodes n ON p.node_id = n.id
                    WHERE LOWER(p.search_terms) LIKE :q
                    LIMIT 8"""),
            {"q": f"%{q.lower()}%"}
        )).fetchall()
    return [dict(r._mapping) for r in results]
