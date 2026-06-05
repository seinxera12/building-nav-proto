# routes/analytics.py
from fastapi import APIRouter
from sqlalchemy import text

from db import AsyncSessionLocal

router = APIRouter()


@router.get("/analytics/heatmap")
async def get_heatmap():
    """QR scan counts per node, joined to node coordinates for map overlay."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            text("""
                SELECT n.id        AS node_id,
                       n.x,
                       n.y,
                       n.label,
                       COUNT(*)    AS scan_count
                FROM   public.events          e
                JOIN   public.qr_checkpoints  q ON e.payload->>'qr_code' = q.qr_code
                JOIN   public.nodes           n ON q.node_id = n.id
                WHERE  e.event_type = 'qr_scan'
                GROUP  BY n.id, n.x, n.y, n.label
                ORDER  BY scan_count DESC
            """)
        )).fetchall()

    return [
        {
            "node_id":    row.node_id,
            "x":          row.x,
            "y":          row.y,
            "label":      row.label,
            "scan_count": row.scan_count,
        }
        for row in rows
    ]


@router.get("/analytics/summary")
async def get_summary():
    """Aggregate navigation stats for the admin dashboard."""
    async with AsyncSessionLocal() as db:
        sessions_row = (await db.execute(
            text("SELECT COUNT(DISTINCT session_id) AS total FROM public.events")
        )).fetchone()

        routes_row = (await db.execute(
            text("SELECT COUNT(*) AS total FROM public.events WHERE event_type = 'route_request'")
        )).fetchone()

        arrivals_row = (await db.execute(
            text("SELECT COUNT(*) AS total FROM public.events WHERE event_type = 'arrived'")
        )).fetchone()

        top_dest_row = (await db.execute(
            text("""
                SELECT payload->>'label' AS destination, COUNT(*) AS cnt
                FROM   public.events
                WHERE  event_type = 'arrived'
                  AND  payload->>'label' IS NOT NULL
                GROUP  BY destination
                ORDER  BY cnt DESC
                LIMIT  1
            """)
        )).fetchone()

    total_sessions = sessions_row.total if sessions_row else 0
    total_routes   = routes_row.total   if routes_row   else 0
    total_arrivals = arrivals_row.total if arrivals_row else 0
    completion_rate = round(total_arrivals / total_routes, 2) if total_routes > 0 else 0.0
    top_destination = top_dest_row.destination if top_dest_row else None

    return {
        "total_sessions":  total_sessions,
        "total_routes":    total_routes,
        "total_arrivals":  total_arrivals,
        "completion_rate": completion_rate,
        "top_destination": top_destination,
    }
