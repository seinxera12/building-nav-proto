# routes/scan.py
from datetime import datetime, timezone
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from db import AsyncSessionLocal

router = APIRouter()


class ScanRequest(BaseModel):
    qr_code: str


class EventRequest(BaseModel):
    event_type: str = Field(..., min_length=1)
    payload: dict | None = None
    session_id: str | None = None


@router.post("/scan")
async def scan_qr(req: ScanRequest):
    """Resolve a QR code string to its registered map node."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                SELECT q.node_id, q.label, n.x, n.y, n.type, n.floor_id
                FROM public.qr_checkpoints q
                JOIN public.nodes n ON q.node_id = n.id
                WHERE q.qr_code = :code
            """),
            {"code": req.qr_code},
        )
        row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"QR code '{req.qr_code}' not registered",
        )

    return {
        "nodeId": row.node_id,
        "label": row.label,
        "x": row.x,
        "y": row.y,
        "type": row.type,
        "floorId": row.floor_id,
    }


@router.post("/event")
async def log_event(req: EventRequest):
    """Record a best-effort prototype event without affecting navigation flow."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("""
                INSERT INTO public.events (session_id, event_type, payload, created_at)
                VALUES (:session_id, :event_type, CAST(:payload AS json), :created_at)
            """),
            {
                "session_id": req.session_id,
                "event_type": req.event_type,
                "payload": json.dumps(req.payload or {}),
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        await db.commit()

    return {"ok": True}
