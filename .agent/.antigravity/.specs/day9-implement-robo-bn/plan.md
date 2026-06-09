# Day 9 — Robo-BN Integration Plan

## Current State Assessment

### What Is Already Built and Working

**Backend (`backend/routes/chat.py`)** — The full orchestration skeleton exists:
- `CircuitBreaker` class (CLOSED/OPEN/HALF-OPEN, 3-failure threshold, 60s recovery)
- Session store (`sessions` dict, 30-min TTL, `prune_sessions()`)
- `POST /chat` — calls `/api/stt` for audio, calls `/api/navigate`, does POI LIKE resolution, handles `poi_not_found` clarification loop
- `POST /tts/instruction` — proxies to `/api/tts`, passes 406 through

**Frontend** — Fully wired:
- `ChatbotPanel.jsx` — mic recording (press-and-hold), text input, candidate confirmation, degradation banner
- `NavTTSPlayer.jsx` — plays WAV from `/tts/instruction`, 406→browser speech fallback
- `useNavStore.js` — `sendChatQuery`, `selectDestination`, `accessibilityMode` flag applied to all `/route` calls
- `api/index.js` — `sendChatRequest` with 10s timeout

### What Is Missing / Broken

1. **`httpx` not in `requirements.txt`** — The chat route uses `httpx.AsyncClient` but `httpx` is not listed as a dependency. The service will crash at import time.

2. **`ROBO_BN_URL` not in `.env`** — The env var is read in `chat.py` but not set anywhere. Falls back to `localhost:8001` which is fine for dev, but the `.env` needs it for docker-compose.

3. **`/tts/instruction` uses circuit breaker incorrectly** — It calls `circuit_breaker.allow_request()` and records failure on TTS errors. Per the spec, TTS failures must NOT count against the circuit breaker — `NavTTSPlayer` has its own independent fallback.

4. **`/tts/instruction` uses `resp.iter_bytes()`** — This requires a streaming response context but the `httpx.AsyncClient` is scoped inside a `with` block that may close before the stream is consumed. Should buffer the response instead (response is short WAV).

5. **`/chat` does not call `/api/health` at startup** — The backend should probe Robo-BN on startup and expose a `robo_bn_available` flag. Without this, the frontend has no way to know if the chatbot is ready on first load.

6. **`/chat` does not call `/api/detect-language` for text-only input** — When user types text and `language` is `null` (Auto mode), the backend should call `/api/detect-language` to resolve the language before calling `/api/navigate`.

7. **Session language update bug** — After the clarification re-call to `/api/navigate`, the code returns `detected_lang` (the request language) but the clarification response may carry an updated `language` field. The clarify response language should update `detected_lang`.

8. **`pois` table lacks `search_terms` column in seed data** — The POI LIKE query runs against `pois.search_terms`. Need to verify the seed data populates this column, otherwise all POI lookups will return empty.

9. **`docker-compose.yml` does not define `ROBO_BN_URL`** — The compose file needs the env var set for the backend service.

10. **No startup health check for Robo-BN** — The `lifespan` in `main.py` should probe `/api/health` and set a module-level `robo_bn_available` flag, which `circuit_breaker` respects on initial state.

---

## Integration Tasks

### Task 1 — Add `httpx` to dependencies
**File:** `backend/requirements.txt`  
Add `httpx==0.27.0` (pinned). This is a hard blocker — the backend crashes without it.

---

### Task 2 — Add `ROBO_BN_URL` to environment configuration
**Files:** `.env`, `docker-compose.yml`  
- Add `ROBO_BN_URL=http://localhost:8001` to `.env` (for local dev)
- Add `ROBO_BN_URL=http://host.docker.internal:8001` (or the appropriate hostname) to the backend service env in `docker-compose.yml`

---

### Task 3 — Fix `/tts/instruction` — decouple from circuit breaker and fix streaming
**File:** `backend/routes/chat.py`

Current problems:
- TTS errors call `circuit_breaker.record_failure()` — must be removed
- `StreamingResponse(resp.iter_bytes())` with a closed client context — replace with `Response(content=resp.content, media_type="audio/wav")`
- The 406 path returns a `StreamingResponse` when it should return a `JSONResponse`

Fix:
```python
@router.post("/tts/instruction")
async def tts_instruction(req: TTSRequest):
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.post(
                f"{ROBO_BN_URL}/api/tts",
                json={"text": req.text, "language": req.language},
            )
            if resp.status_code == 406:
                from fastapi.responses import JSONResponse
                return JSONResponse(content=resp.json(), status_code=406)
            if resp.status_code >= 500:
                raise HTTPException(status_code=502, detail=resp.text)
            return Response(content=resp.content, media_type="audio/wav")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"TTS error: {str(e)}")
```

Note: No `circuit_breaker` involvement at all.

---

### Task 4 — Add `/api/detect-language` call for text-only Auto input
**File:** `backend/routes/chat.py`

When `req.audio_b64` is absent and `req.language` is `None` (Auto mode), call `/api/detect-language` before `/api/navigate`:

```python
if not req.audio_b64 and text_input and req.language is None:
    try:
        lang_resp = await client.post(
            f"{ROBO_BN_URL}/api/detect-language",
            json={"text": text_input},
            timeout=3.0,
        )
        if lang_resp.status_code == 200:
            detected_lang = lang_resp.json().get("language", "en")
    except Exception:
        pass  # not a circuit-breaker failure — stateless utility endpoint
```

---

### Task 5 — Fix clarification response language propagation
**File:** `backend/routes/chat.py`

After the clarification call succeeds, update `detected_lang` from the clarify response:
```python
clarify_data = clarify_resp.json()
response_text = clarify_data.get("response_text", response_text)
detected_lang = clarify_data.get("language", detected_lang)  # ← add this
```

Also update `session["chat_language"]` from the clarification response.

---

### Task 6 — Add Robo-BN startup health probe to `main.py`
**File:** `backend/main.py`

In the `lifespan` function, after loading the graph, probe `/api/health`:

```python
import httpx as _httpx

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await load_graph_from_db(db)
    print("✅ DB ready, graph loaded")

    # Probe Robo-BN — non-blocking, just sets initial circuit state
    robo_url = os.getenv("ROBO_BN_URL", "http://localhost:8001")
    try:
        async with _httpx.AsyncClient(timeout=5.0) as client:
            h = await client.get(f"{robo_url}/api/health")
            if h.status_code == 200:
                data = h.json()
                print(f"✅ Robo-BN ready — stt={data.get('stt_ready')} tts={data.get('tts_ready')}")
            else:
                print(f"⚠️  Robo-BN health returned {h.status_code}")
    except Exception as e:
        print(f"⚠️  Robo-BN unreachable at startup: {e}")

    yield
```

This is informational only — it does not block startup or trip the circuit breaker. The circuit breaker will open naturally when live requests fail.

---

### Task 7 — Expand `search_terms` in seed data
**File:** `backend/seed.py`

`search_terms` IS populated in `seed.py` but only with `p["label"].lower()` — e.g., `"cafeteria"`, `"elevator bank"`. This is narrow. Common synonyms will miss:
- "cafeteria" ← no match for "canteen", "food", "dining"
- "elevator bank" ← no match for "lift"
- "restroom" ← no match for "bathroom", "toilet", "wc"
- "conference room a" ← no match for "meeting room", "boardroom"

Expand the `search_terms` values per POI to include common synonyms:

```python
SEARCH_TERMS = {
    "Cafeteria":          "cafeteria food dining canteen lunch eat",
    "Elevator Bank":      "elevator bank lift accessible mobility",
    "Restroom":           "restroom bathroom toilet wc washroom",
    "Conference Room A":  "conference room a meeting boardroom presentation",
    "Office Suite 201":   "office suite 201 offices administration",
    "IT Department":      "it department technology support helpdesk",
    "Main Lobby":         "main lobby entrance entry reception front door",
    "Stairwell A":        "stairwell a stairs staircase steps",
}

for p in pois:
    terms = SEARCH_TERMS.get(p["label"], p["label"].lower())
    db.add(POI(
        node_id=p["id"], name=p["label"],
        category=p["type"],
        search_terms=terms,
    ))
```

This is a seed-time change only — no schema change needed.

---

### Task 8 — Add `ROBO_BN_URL` to `.env` and `docker-compose.yml`
**Files:** `.env`, `docker-compose.yml`

`.env` already uses `env_file: .env` in docker-compose, so adding it there is sufficient for both local dev and docker:

```ini
# .env
ROBO_BN_URL=http://localhost:8001
```

For docker (where Robo-BN runs on the host machine, not in a container), the backend needs to reach the host. Update `docker-compose.yml` backend service:

```yaml
backend:
  ...
  extra_hosts:
    - "host.docker.internal:host-gateway"   # Linux support
```

And set in `.env`:
```ini
ROBO_BN_URL=http://host.docker.internal:8001
```

Or keep `localhost:8001` if both services run outside Docker during development.

---

## Files to Change

| File | Change |
|---|---|
| `backend/requirements.txt` | Add `httpx==0.27.0` |
| `.env` | Add `ROBO_BN_URL=http://localhost:8001` |
| `docker-compose.yml` | Add `ROBO_BN_URL` to backend env |
| `backend/routes/chat.py` | Fix TTS handler, add detect-language, fix clarification language, remove TTS from circuit breaker |
| `backend/main.py` | Add Robo-BN health probe to lifespan |
| `backend/seed/nodes.json` or `seed.py` | Verify/fix `search_terms` population |

## Files NOT to Change

- `frontend/` — fully wired, no changes needed
- `backend/graph.py` — untouched
- `backend/models.py` — untouched  
- `backend/routes/routing.py` — untouched (accessibility routing already works)

---

## Verification Checklist

After implementation:
1. `docker-compose up` — backend starts without import errors (httpx present)
2. `curl http://localhost:8000/health` → `{"status":"ok"}`
3. Start Robo-BN; `curl http://localhost:8001/api/health` → `{"status":"ok",...}`
4. `curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"session_id":"test-001","text":"where is the cafeteria","language":"en"}'` → returns `response_text` and `candidates`
5. TTS: `curl -X POST http://localhost:8000/tts/instruction -H "Content-Type: application/json" -d '{"text":"Turn left","language":"en"}' -o test.wav` → valid WAV file
6. TTS Korean: same with `"language":"ko"` → 406 JSON response
7. Open frontend, scan QR, open chatbot, speak "where is the cafeteria" → voice resolves to candidate buttons
8. Confirm candidate → route begins, TTS speaks first instruction
9. Kill Robo-BN — after 3 failed chat requests, amber banner appears, mic is disabled
10. Restart Robo-BN — after 60s, banner clears automatically on next successful request
