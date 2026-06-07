# routes/chat.py
import os
import time
import base64
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from db import AsyncSessionLocal

router = APIRouter()

ROBO_BN_URL = os.getenv("ROBO_BN_URL", "http://localhost:8001")


# Simple Circuit Breaker
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.state = "CLOSED"  # CLOSED, OPEN, HALF-OPEN
        self.last_state_change = time.time()

    def record_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            self.last_state_change = time.time()

    def allow_request(self) -> bool:
        if self.state == "OPEN":
            if time.time() - self.last_state_change > self.recovery_timeout:
                self.state = "HALF-OPEN"
                return True
            return False
        return True


circuit_breaker = CircuitBreaker()

# Session Management
# session_id -> {accessibility_mode, chat_language, last_accessed}
sessions: dict[str, dict] = {}
SESSION_EXPIRY = 1800  # 30 minutes


def prune_sessions():
    now = time.time()
    expired = [sid for sid, s in sessions.items() if now - s["last_accessed"] > SESSION_EXPIRY]
    for sid in expired:
        sessions.pop(sid, None)


class ChatRequest(BaseModel):
    audio_b64: str | None = None
    text: str | None = None
    language: str | None = None
    session_id: str
    current_node_id: int | None = None


class TTSRequest(BaseModel):
    text: str
    language: str


@router.post("/chat")
async def chat_orchestrator(req: ChatRequest):
    prune_sessions()

    # Initialize session
    sid = req.session_id
    if sid not in sessions:
        sessions[sid] = {
            "accessibility_mode": False,
            "chat_language": req.language or "en",
            "last_accessed": time.time(),
        }
    else:
        sessions[sid]["last_accessed"] = time.time()
        if req.language:
            sessions[sid]["chat_language"] = req.language

    session = sessions[sid]

    # Check circuit breaker
    if not circuit_breaker.allow_request():
        return {
            "response_text": "The voice assistant is temporarily limited. Please use manual search.",
            "language": session["chat_language"],
            "candidates": [],
            "needs_confirmation": False,
            "accessibility_mode": session["accessibility_mode"],
            "session_id": sid,
            "chatbot_available": False,
        }

    text_input = req.text
    detected_lang = req.language or session["chat_language"]

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. If audio is provided, call STT
        if req.audio_b64:
            try:
                audio_bytes = base64.b64decode(req.audio_b64)
                # Call Robo-BN POST /api/stt
                files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
                stt_resp = await client.post(f"{ROBO_BN_URL}/api/stt", files=files)
                if stt_resp.status_code == 200:
                    stt_data = stt_resp.json()
                    text_input = stt_data.get("text", "")
                    detected_lang = stt_data.get("language", detected_lang)
                    session["chat_language"] = detected_lang
                    circuit_breaker.record_success()
                else:
                    raise Exception(f"STT returned {stt_resp.status_code}")
            except Exception:
                circuit_breaker.record_failure()
                # Return Level 2 degradation: STT failed, but chatbot might be available by text
                return {
                    "response_text": "I had trouble understanding the audio. Please type your query.",
                    "language": session["chat_language"],
                    "candidates": [],
                    "needs_confirmation": False,
                    "accessibility_mode": session["accessibility_mode"],
                    "session_id": sid,
                    "chatbot_available": True,
                }

        if not text_input:
            return {
                "response_text": "I didn't hear anything. Could you please speak again?",
                "language": session["chat_language"],
                "candidates": [],
                "needs_confirmation": False,
                "accessibility_mode": session["accessibility_mode"],
                "session_id": sid,
                "chatbot_available": True,
            }

        # 2. Get building context (POIs and current location)
        current_node_label = "Main Lobby"
        floor_name = "Ground Floor"
        poi_names = []

        async with AsyncSessionLocal() as db:
            if req.current_node_id:
                node_res = await db.execute(
                    text("SELECT label, floor_id FROM public.nodes WHERE id = :nid"),
                    {"nid": req.current_node_id},
                )
                row = node_res.fetchone()
                if row:
                    current_node_label = row.label
                    floor_res = await db.execute(
                        text("SELECT name FROM public.floors WHERE id = :fid"),
                        {"fid": row.floor_id},
                    )
                    frow = floor_res.fetchone()
                    if frow and frow.name:
                        floor_name = frow.name

            pois_res = await db.execute(text("SELECT name FROM public.pois"))
            poi_names = [p.name for p in pois_res.fetchall()]

        # 3. Call Robo-BN /api/navigate
        navigate_payload = {
            "text": text_input,
            "language": detected_lang,
            "session_id": sid,
            "building_context": {
                "current_node_label": current_node_label,
                "available_pois": poi_names,
                "floor_name": floor_name,
            },
        }

        try:
            nav_resp = await client.post(f"{ROBO_BN_URL}/api/navigate", json=navigate_payload)
            if nav_resp.status_code == 200:
                nav_data = nav_resp.json()
                circuit_breaker.record_success()
            else:
                raise Exception(f"Navigate returned {nav_resp.status_code}")
        except Exception:
            circuit_breaker.record_failure()
            # Circuit breaker/timeout fallback
            return {
                "response_text": "The voice assistant is temporarily unavailable. Please use manual search.",
                "language": session["chat_language"],
                "candidates": [],
                "needs_confirmation": False,
                "accessibility_mode": session["accessibility_mode"],
                "session_id": sid,
                "chatbot_available": False,
            }

        # Parse output from Robo-BN
        intent = nav_data.get("intent", "general")
        destination_query = nav_data.get("destination_query")
        accessibility_flag = nav_data.get("accessibility_flag", False)
        response_text = nav_data.get("response_text", "")
        needs_clarification = nav_data.get("needs_clarification", False)

        if accessibility_flag:
            session["accessibility_mode"] = True

        candidates = []
        if intent == "navigation" and destination_query:
            # Resolve destination query against pois table
            async with AsyncSessionLocal() as db:
                results = (await db.execute(
                    text("""SELECT p.name, p.category, n.id as node_id, n.x, n.y
                            FROM public.pois p JOIN public.nodes n ON p.node_id = n.id
                            WHERE LOWER(p.search_terms) LIKE :q
                            LIMIT 8"""),
                    {"q": f"%{destination_query.lower()}%"},
                )).fetchall()
                candidates = [dict(r._mapping) for r in results]

            if not candidates:
                # 0 matches: call Robo-BN /api/navigate again with not_found indicator
                clarify_payload = {
                    "text": f"Clarify: The user wants to go to '{destination_query}', but no POIs match this query.",
                    "language": detected_lang,
                    "session_id": sid,
                    "building_context": {
                        "current_node_label": current_node_label,
                        "available_pois": poi_names,
                        "floor_name": floor_name,
                        "poi_not_found": True,
                        "query": destination_query,
                    },
                }
                try:
                    clarify_resp = await client.post(f"{ROBO_BN_URL}/api/navigate", json=clarify_payload)
                    if clarify_resp.status_code == 200:
                        clarify_data = clarify_resp.json()
                        response_text = clarify_data.get("response_text", response_text)
                except Exception:
                    pass

        return {
            "response_text": response_text,
            "language": detected_lang,
            "candidates": candidates,
            "needs_confirmation": len(candidates) > 0,
            "accessibility_mode": session["accessibility_mode"],
            "session_id": sid,
            "chatbot_available": True,
        }


@router.post("/tts/instruction")
async def tts_instruction(req: TTSRequest):
    if not circuit_breaker.allow_request():
        raise HTTPException(status_code=503, detail="TTS service unavailable")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{ROBO_BN_URL}/api/tts",
                json={"text": req.text, "language": req.language},
            )
            if resp.status_code == 200:
                return StreamingResponse(resp.iter_bytes(), media_type="audio/wav")
            elif resp.status_code == 406:
                return StreamingResponse(resp.iter_bytes(), status_code=406, media_type="application/json")
            else:
                raise Exception(f"TTS returned status {resp.status_code}")
        except Exception as e:
            circuit_breaker.record_failure()
            raise HTTPException(status_code=503, detail=f"TTS error: {str(e)}")
