# routes/offline.py
from fastapi import APIRouter
from sqlalchemy import text

from db import AsyncSessionLocal

router = APIRouter()


@router.get("/qr-codes/all")
async def get_all_qr_codes(floor_id: int = None):
    """Return QR checkpoints with node data for offline scan lookup."""
    async with AsyncSessionLocal() as db:
        if floor_id:
            rows = (await db.execute(
                text("""
                    SELECT q.qr_code, q.node_id, q.label, q.floor_id,
                           n.x, n.y, n.type, n.accessible, n.elevation
                    FROM public.qr_checkpoints q
                    JOIN public.nodes n ON q.node_id = n.id
                    WHERE q.floor_id = :floor_id
                    ORDER BY q.qr_code
                """),
                {"floor_id": floor_id}
            )).fetchall()
        else:
            rows = (await db.execute(
                text("""
                    SELECT q.qr_code, q.node_id, q.label, q.floor_id,
                           n.x, n.y, n.type, n.accessible, n.elevation
                    FROM public.qr_checkpoints q
                    JOIN public.nodes n ON q.node_id = n.id
                    ORDER BY q.qr_code
                """)
            )).fetchall()

    return [
        {
            "qrCode": row.qr_code,
            "nodeId": row.node_id,
            "label": row.label,
            "floorId": row.floor_id,
            "x": row.x,
            "y": row.y,
            "type": row.type,
            "accessible": row.accessible,
            "elevation": row.elevation,
        }
        for row in rows
    ]


@router.get("/graph")
async def get_graph():
    """Return full navigation graph for client-side offline route fallback."""
    async with AsyncSessionLocal() as db:
        nodes = (await db.execute(
            text("""
                SELECT id, floor_id, x, y, label, type, accessible, elevation
                FROM public.nodes
                ORDER BY id
            """)
        )).fetchall()
        edges = (await db.execute(
            text("""
                SELECT id, from_node, to_node, cost, reverse_cost, walkable, accessible,
                       edge_type, floor_change, floor_delta
                FROM public.edges
                WHERE walkable = true
                ORDER BY id
            """)
        )).fetchall()

    return {
        "nodes": [dict(row._mapping) for row in nodes],
        "edges": [dict(row._mapping) for row in edges],
    }
