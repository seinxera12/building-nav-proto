# routes/scan.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ScanRequest(BaseModel):
    qr_code: str


@router.post("/scan")
async def scan_qr(req: ScanRequest):
    """Stub endpoint for QR scan processing — implemented in Day 2+."""
    return {
        "message": "Scan endpoint stub",
        "qr_code": req.qr_code
    }
