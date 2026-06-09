# Chat Feature — Implementation & Usage Guide

**Covers:** Day 8 (frontend chat UI + TTS player) and Day 9 (Robo-BN backend integration)  
**Audience:** Developers working on building-nav and anyone setting up the application for the first time

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Component Map](#2-architecture--component-map)
3. [Two Pipelines](#3-two-pipelines)
4. [Backend Implementation — `routes/chat.py`](#4-backend-implementation--routeschatpy)
   - 4.1 [Circuit Breaker](#41-circuit-breaker)
   - 4.2 [Session Store](#42-session-store)
   - 4.3 [`POST /chat` — Orchestration Flow](#43-post-chat--orchestration-flow)
   - 4.4 [`POST /tts/instruction` — TTS Proxy](#44-post-ttsinstruction--tts-proxy)
5. [Frontend Implementation](#5-frontend-implementation)
   - 5.1 [ChatbotPanel.jsx](#51-chatbotpaneljsx)
   - 5.2 [NavTTSPlayer.jsx](#52-navttsplayerjsx)
   - 5.3 [Zustand Store — chatbot slice](#53-zustand-store--chatbot-slice)
   - 5.4 [API layer — sendChatRequest](#54-api-layer--sendchatrequest)
6. [Robo-BN API Contracts](#6-robo-bn-api-contracts)
7. [Degradation Behaviour](#7-degradation-behaviour)
8. [POI Search Terms](#8-poi-search-terms)
9. [Configuration Reference](#9-configuration-reference)
   - 9.1 [building-nav `.env`](#91-building-nav-env)
   - 9.2 [docker-compose overrides](#92-docker-compose-overrides)
   - 9.3 [Robo-BN `.env`](#93-robo-bn-env)
10. [Startup & Run Guide](#10-startup--run-guide)
11. [User Guide — Using the Chat Feature](#11-user-guide--using-the-chat-feature)
12. [Smoke Test Checklist](#12-smoke-test-checklist)

---

## 1. System Overview

The chat feature adds a voice and text navigation assistant to the building-nav PWA. The user can speak or type a destination in natural language ("where's the cafeteria?", "I need accessible routes") and the system resolves it to a POI, starts routing, and speaks each turn instruction aloud.

The assistant is powered by **Robo-BN**, a separate service that owns all AI capabilities: speech-to-text (STT via Groq Whisper), intent classification, conversational response generation (LLM), and text-to-speech (TTS via Kokoro). Building-nav owns POI resolution, routing, and the circuit breaker. The browser never talks to Robo-BN directly.

```
Browser (PWA)
    │  POST /chat  (JSON, 10s timeout)
    │  POST /tts/instruction  (JSON → WAV)
    ▼
building-nav backend  (FastAPI, port 8000)
    │  POST /api/stt        (multipart, audio bytes)
    │  POST /api/navigate   (JSON, intent + context)
    │  POST /api/tts        (JSON → WAV bytes)
    │  POST /api/detect-language  (JSON, text-only path)
    │  GET  /api/health     (startup probe)
    ▼
Robo-BN  (FastAPI, port 8001)
```

---

## 2. Architecture & Component Map

| Layer | File | Responsibility |
|---|---|---|
| Backend route | `backend/routes/chat.py` | `POST /chat` orchestration, `POST /tts/instruction` proxy, circuit breaker, session store |
| Backend startup | `backend/main.py` | Robo-BN health probe on lifespan startup |
| Backend seed | `backend/seed.py` | POI `search_terms` with synonyms for LIKE matching |
| Frontend UI | `frontend/src/components/ChatbotPanel.jsx` | Bottom-sheet chat panel, mic recording, candidate confirmation |
| Frontend TTS | `frontend/src/components/NavTTSPlayer.jsx` | Non-rendering component, plays nav instructions via WAV or browser TTS |
| Frontend state | `frontend/src/store/useNavStore.js` | `chatbot` slice: messages, session ID, accessibility mode, availability flag |
| Frontend API | `frontend/src/api/index.js` | `sendChatRequest` — POSTs to `/chat` with 10s timeout |

---

## 3. Two Pipelines

The chat feature runs two completely independent pipelines that share the same Robo-BN server.

### Pipeline A — Conversational Destination Resolution

Triggered when the user types or speaks in `ChatbotPanel`. Involves STT (if audio), intent classification, and LLM response. Stateful — Robo-BN maintains conversation history per `session_id`.

```
User speaks / types
  → POST /chat {audio_b64 | text, session_id, current_node_id, language}
  → [if audio] POST /api/stt  →  {text, language}
  → [if text + Auto lang] POST /api/detect-language  →  {language}
  → POST /api/navigate  →  {intent, destination_query, accessibility_flag, response_text}
  → [if navigation intent] SQL LIKE query on pois.search_terms
  → [if 0 matches] POST /api/navigate (poi_not_found: true)  →  clarification text
  → return {response_text, candidates[], needs_confirmation, accessibility_mode}
```

**Latency budget:** must complete within 10 seconds (hard browser timeout in `sendChatRequest`).

### Pipeline B — Navigation Instruction TTS

Triggered automatically by `NavTTSPlayer` on Zustand state transitions. No LLM, no session, completely stateless.

```
Zustand status changes (ANCHORED / step advance / REROUTING / ARRIVED)
  → POST /tts/instruction {text, language}
  → POST /api/tts  →  WAV bytes  (or 406 for Korean)
  → play audio / fallback to window.speechSynthesis
```

**Latency budget:** under 3 seconds preferred. TTS failures never block navigation.

---

## 4. Backend Implementation — `routes/chat.py`

### 4.1 Circuit Breaker

```python
class CircuitBreaker:
    failure_threshold = 3     # consecutive failures before opening
    recovery_timeout  = 60.0  # seconds before HALF-OPEN probe
```

States: `CLOSED → OPEN → HALF-OPEN → CLOSED`

**What counts as a failure:** any exception or non-200 from `/api/stt` or `/api/navigate`.

**What does NOT count:** `/api/tts` errors (any status), `/api/detect-language` errors, `/api/health` timeouts. These all have their own independent fallbacks.

When open, `/chat` immediately returns:
```json
{
  "chatbot_available": false,
  "response_text": "The voice assistant is temporarily limited. Please use manual search."
}
```
The frontend sets `chatbot.isAvailable = false`, shows the amber degradation banner, and disables the mic button. Text search still works via the existing `/search` endpoint. The circuit auto-recovers after 60 seconds without any restart needed.

### 4.2 Session Store

```python
sessions: dict[str, dict] = {}
SESSION_EXPIRY = 1800  # 30 minutes

# Per session:
# {
#   "accessibility_mode": False,   # sticky — once True, stays True for the session
#   "chat_language":      "en",    # updated from every navigate/clarify response
#   "last_accessed":      float,   # unix timestamp, used for TTL pruning
# }
```

This is separate from Robo-BN's own conversation history. Building-nav only tracks navigation state (accessibility mode and detected language). Robo-BN tracks the full message history for LLM context.

Both sides use the same `session_id` UUID, generated once per browser session by `crypto.randomUUID()` in `useNavStore.js` on app load.

Sessions are pruned lazily on each `/chat` request via `prune_sessions()`.

### 4.3 `POST /chat` — Orchestration Flow

The five steps in order:

**Step 1 — STT (audio path only)**

Decodes the base64 audio blob and posts raw bytes to Robo-BN as a multipart file upload. The browser records `audio/webm` but the multipart header says `audio/wav` — Robo-BN ignores the content-type and detects format from magic bytes, so this is safe.

On success: `text_input` and `detected_lang` are updated from the STT response.  
On failure: circuit breaker records a failure, returns a degraded response with `chatbot_available: true` (text input still works).

**Step 2 — Language detection (text-only + Auto mode)**

Only runs when there is no audio AND `req.language is None` (the user selected "Auto" in the language picker). Calls `/api/detect-language` with the typed text. Silent failure — if the call fails, `detected_lang` falls back to the session default. Does not count as a circuit-breaker failure.

**Step 3 — Build building context from DB**

Queries `nodes` and `floors` to get the current node label and floor name. Queries `pois` to get all POI names for the `available_pois` list injected into the LLM prompt. Defaults to "Main Lobby" / "Ground Floor" if `current_node_id` is not provided.

**Step 4 — `/api/navigate`**

Sends the text, language, session ID, and building context to Robo-BN. On success: updates `detected_lang` from the response (Robo-BN may correct the detected language), applies `accessibility_flag` to the session, stores `chat_language`.  
On failure: circuit breaker records a failure, returns `chatbot_available: false`.

**Step 5 — POI resolution + optional clarification**

If `intent == "navigation"` and `destination_query` is non-null, runs:
```sql
SELECT p.name, p.category, n.id as node_id, n.x, n.y
FROM pois p JOIN nodes n ON p.node_id = n.id
WHERE LOWER(p.search_terms) LIKE '%{destination_query}%'
LIMIT 8
```

If zero results: makes a second call to `/api/navigate` with `poi_not_found: true` and the failed query. Robo-BN bypasses the intent classifier and returns a clarification response. `destination_query` will be `null` in the clarification response — no third call, no loop. The clarification response language also updates `detected_lang` and `session["chat_language"]`.

**Response shape:**
```json
{
  "response_text":      "I found the Cafeteria on the ground floor. Shall I navigate you there?",
  "language":           "en",
  "candidates":         [{"name": "Cafeteria", "category": "poi", "node_id": 12, "x": 700, "y": 560}],
  "needs_confirmation": true,
  "accessibility_mode": false,
  "session_id":         "...",
  "chatbot_available":  true
}
```

### 4.4 `POST /tts/instruction` — TTS Proxy

Intentionally **not** wired to the circuit breaker. `NavTTSPlayer` handles all TTS failure scenarios independently.

```
POST /tts/instruction {text, language}
  → POST /api/tts {text, language}
  → 200: Response(content=wav_bytes, media_type="audio/wav")
  → 406: JSONResponse({"fallback": "browser_tts", "language": "ko"}, status_code=406)
  → 5xx: HTTPException(502)
```

The full WAV bytes are buffered with `resp.content` before the httpx client closes. Previous implementation used `StreamingResponse(resp.iter_bytes())` which could fail after the client context exited.

Korean (`language: "ko"`) always returns 406 — Robo-BN has no Kokoro voice for Korean. `NavTTSPlayer` detects the 406 and calls `window.speechSynthesis` with `lang: "ko-KR"`.

---

## 5. Frontend Implementation

### 5.1 ChatbotPanel.jsx

A bottom-sheet panel that slides up from the bottom of the screen when the user taps the 🎤 FAB.

**Voice input:** Press-and-hold the mic button. `MediaRecorder` captures `audio/webm`. On release, the blob is converted to a base64 string and sent to `sendChatQuery(null, b64)`. The mic button is disabled when `chatbot.isAvailable` is false.

**Text input:** Type in the text field and press Enter or the send button. Calls `sendChatQuery(text, null)`.

**Language selector:** Dropdown with Auto / English / 日本語 / 中文 / 한국어. "Auto" sends `language: null` to the backend, triggering the detect-language call. A specific language selection pins all subsequent requests to that language.

**Candidate confirmation:** When the backend returns `needs_confirmation: true`, confirmation buttons render for each candidate POI. Tapping one calls `selectDestination(nodeId)` which starts the routing flow, then closes the panel.

**Degradation banner:** Shown when `chatbot.isAvailable` is false. The amber bar tells the user to use text search or category browse instead.

### 5.2 NavTTSPlayer.jsx

A non-rendering React component (returns `null`) that monitors Zustand state and fires TTS requests automatically.

| State transition | Text spoken |
|---|---|
| `UNLOCATED → ANCHORED` | "You are located at {node.label}" |
| `NAVIGATING` + step change | `route.instructions[currentStep].text` |
| `→ REROUTING` | "Recalculating route" |
| `→ ARRIVED` | "You have arrived at {destination name}" |

For each event it calls `POST /tts/instruction`. On a 406 response it calls `fallbackSpeak()` which uses `window.speechSynthesis`. On any network error or 5xx it also falls back to browser TTS. Audio from a previous instruction is cancelled immediately when a higher-priority event fires (e.g. reroute interrupts a step instruction).

`NavTTSPlayer` only fires when `chatbot.isAvailable` is true. If the circuit is open and the user is mid-navigation, they still see the text instructions on screen but won't hear them until Robo-BN recovers.

### 5.3 Zustand Store — chatbot slice

```javascript
chatbot: {
  isOpen:           false,         // panel open state
  messages:         [],            // [{role, text, timestamp}]
  isListening:      false,         // mic recording in progress
  isProcessing:     false,         // waiting for /chat response
  isAvailable:      true,          // false when circuit is open
  detectedLanguage: 'en',          // updated from backend responses
  selectedLanguage: null,          // null = Auto; 'en'/'ja'/'zh'/'ko' = pinned
  accessibilityMode: false,        // sticky — enables accessible_only routing
  sessionId:        '<uuid>',      // generated once on app load
  candidates:       [],            // POI candidate list from last /chat response
  needsConfirmation: false,        // show candidate buttons
}
```

`accessibilityMode` flows into all `computeRoute` calls:
```javascript
const accessibleOnly = get().chatbot?.accessibilityMode || false;
const route = await computeRoute(fromNodeId, toNodeId, accessibleOnly);
```
This means once Robo-BN detects an accessibility need ("I'm in a wheelchair"), all routes — including reroutes — automatically use accessible edges only, for the remainder of the session.

### 5.4 API layer — sendChatRequest

```javascript
export async function sendChatRequest(body) {
  return fetchJson('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 10000);  // 10-second timeout
}
```

The 10-second timeout covers the full round trip: network → STT → LLM → response. If the backend does not respond in time, `sendChatQuery` catches the error, sets `chatbot.isAvailable = false`, and appends a fallback message.

---

## 6. Robo-BN API Contracts

Building-nav calls five Robo-BN endpoints. All are server-to-server; the browser never calls them directly.

### `POST /api/stt`

```
Content-Type: multipart/form-data
Field: file  (raw audio bytes, filename="audio.wav")
```

Response:
```json
{"text": "I want to go to the cafeteria", "language": "en"}
```

`language` is always ISO 639-1 (`en`, `ja`, `zh`, `ko`). Whisper's ISO 639-2 codes are normalised by Robo-BN.

### `POST /api/navigate`

Normal turn:
```json
{
  "text": "where is the cafeteria",
  "language": "en",
  "session_id": "<uuid>",
  "building_context": {
    "current_node_label": "Main Lobby",
    "available_pois": ["Cafeteria", "Elevator Bank", ...],
    "floor_name": "Ground Floor"
  }
}
```

Clarification turn (0 POI matches):
```json
{
  "text": "Clarify: The user wants to go to 'blue section', but no POIs match this query.",
  "language": "en",
  "session_id": "<uuid>",
  "building_context": {
    "current_node_label": "Main Lobby",
    "available_pois": [...],
    "floor_name": "Ground Floor",
    "poi_not_found": true,
    "query": "blue section"
  }
}
```

Response:
```json
{
  "intent":             "navigation",
  "destination_query":  "cafeteria",
  "accessibility_flag": false,
  "response_text":      "I found the Cafeteria on the ground floor. Shall I navigate you there?",
  "needs_clarification": false,
  "language":           "en",
  "session_id":         "<uuid>"
}
```

Intent values: `navigation`, `accessibility_request`, `general`, `out_of_scope`, `clarify`.  
`destination_query` is a short noun phrase (1–4 words) safe to use directly in SQL LIKE. It is `null` on clarification responses.

### `POST /api/tts`

```json
{"text": "Turn left at the elevator bank", "language": "en"}
```

Response: `200 audio/wav` binary, or `406 {"fallback": "browser_tts", "language": "ko"}` for Korean.

### `GET /api/health`

```json
{"status": "ok", "tts_ready": true, "stt_ready": true}
```

Called once at building-nav startup. Informational only — does not affect circuit breaker state.

### `POST /api/detect-language`

```json
{"text": "エレベーターはどこですか"}
```

Response: `{"language": "ja"}`. Stateless, Unicode-range based detection. Returns one of `en`, `ja`, `zh`, `ko`.

---

## 7. Degradation Behaviour

| Level | Condition | User experience |
|---|---|---|
| 0 — Full | Robo-BN operational | Voice + text chat, spoken TTS instructions |
| 1 — TTS down | `/api/tts` failing, LLM OK | Chat works; nav instructions shown as text only, no audio |
| 2 — STT down, LLM OK | `/api/stt` fails 3× | Amber banner; mic disabled; text input still calls `/api/navigate` |
| 3 — Robo-BN unreachable | STT or navigate fails 3× | Amber banner; mic disabled; text input disabled; manual POI search only |

Level 1 is handled entirely by `NavTTSPlayer` — it catches any TTS error and falls back to `window.speechSynthesis`. This does not affect the circuit breaker.

Levels 2–3 are handled by the circuit breaker in `chat.py`. After 3 consecutive STT or navigate failures, the circuit opens for 60 seconds. On the next request after 60 seconds (HALF-OPEN), if it succeeds the circuit closes and `chatbot_available: true` is returned — the frontend restores the mic and clears the banner automatically.

---

## 8. POI Search Terms

The `pois.search_terms` column is what the LIKE query runs against. It is populated by `seed.py` and includes synonyms beyond the POI name so natural language queries match:

| POI name | search_terms |
|---|---|
| Cafeteria | cafeteria food dining canteen lunch eat cafe |
| Elevator Bank | elevator bank lift accessible mobility |
| Restroom | restroom bathroom toilet wc washroom |
| Conference Room A | conference room a meeting boardroom presentation |
| Office Suite 201 | office suite 201 offices administration |
| IT Department | it department technology support helpdesk tech |
| Main Lobby | main lobby entrance entry reception front door |
| Stairwell A | stairwell a stairs staircase steps |

If you add new POIs, add a matching entry to `SEARCH_TERMS` in `seed.py` before running the seed script. The `destination_query` from Robo-BN is used raw in `LIKE '%{query}%'` — no further NLP is applied on the building-nav side.

---

## 9. Configuration Reference

### 9.1 building-nav `.env`

```ini
# Required for DB (existing)
DATABASE_URL=postgresql+asyncpg://nav:nav123@db/indoornav
SYNC_DATABASE_URL=postgresql://nav:nav123@db/indoornav

# Robo-BN service URL — added in Day 9
# Local dev (both services running outside Docker):
ROBO_BN_URL=http://localhost:8001
# LAN testing (Robo-BN on another machine):
# ROBO_BN_URL=http://192.168.1.50:8001
```

`ROBO_BN_URL` defaults to `http://localhost:8001` if not set. The docker-compose override (below) takes precedence inside the container.

### 9.2 docker-compose overrides

The backend container cannot reach `localhost:8001` on the host. The compose file overrides `ROBO_BN_URL` using `host.docker.internal`:

```yaml
backend:
  environment:
    - ROBO_BN_URL=http://host.docker.internal:8001
  extra_hosts:
    - "host.docker.internal:host-gateway"   # required on Linux
```

`host.docker.internal` is built into Docker Desktop on Mac/Windows. The `extra_hosts` line adds the alias on Linux where it is not available by default.

### 9.3 Robo-BN `.env`

Set these in the Robo-BN project's `.env` before starting it:

```ini
SERVER_PORT=8001
GROQ_API_KEY=<your-groq-api-key>          # required for STT
BUILDING_NAV_ORIGIN=http://localhost:8000  # CORS allowed origin
```

`BUILDING_NAV_ORIGIN` must be set to the building-nav backend's origin. In dev with both services on the same machine, `http://localhost:8000`. In a Docker setup where building-nav backend is containerised, set it to the backend's host-accessible address.

---

## 10. Startup & Run Guide

### Prerequisites

- Docker and Docker Compose (for the DB + backend container path)
- Python 3.11+ with a virtual environment (for Robo-BN, which runs on the host)
- A Groq API key (free tier works; get one at console.groq.com)
- Node.js 18+ (for the frontend dev server)

### Step 1 — Configure Robo-BN

In the Robo-BN project directory, edit `.env`:

```ini
SERVER_PORT=8001
GROQ_API_KEY=your_groq_key_here
BUILDING_NAV_ORIGIN=http://localhost:8000
```

### Step 2 — Start Robo-BN

```bash
# From the Robo-BN project root
venv/Scripts/python.exe -m uvicorn server.main:app --host 0.0.0.0 --port 8001 --reload
```

Wait for this log line before proceeding:
```
INFO  server.pipeline  — SERVER ready  port=8001
```

TTS warm-up takes 3–5 seconds after startup. The health endpoint will show `"tts_ready": false` briefly — this is expected.

### Step 3 — Configure building-nav `.env`

Ensure `backend/.env` (or the root `.env`) contains:

```ini
DATABASE_URL=postgresql+asyncpg://nav:nav123@db/indoornav
SYNC_DATABASE_URL=postgresql://nav:nav123@db/indoornav
ROBO_BN_URL=http://localhost:8001
```

### Step 4 — Start building-nav backend + DB

```bash
# From the building-nav project root
docker-compose up
```

On first run, seed the database:

```bash
docker exec buildingnav_api python seed.py
```

The backend logs will show:
```
✅ DB ready, graph loaded
✅ Robo-BN ready — stt=True tts=True
```

If Robo-BN is not running yet, you'll see `⚠️ Robo-BN unreachable` — this is non-fatal. Start Robo-BN and the circuit will close on the first successful chat request.

### Step 5 — Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Step 6 — Verify everything is connected

```bash
# building-nav health
curl http://localhost:8000/health

# Robo-BN health
curl http://localhost:8001/api/health

# Test a chat request (text input, no audio)
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-001",
    "text": "where is the cafeteria",
    "language": "en"
  }'
# Expected: {"response_text": "...", "candidates": [...], "chatbot_available": true}

# Test TTS
curl -s -X POST http://localhost:8000/tts/instruction \
  -H "Content-Type: application/json" \
  -d '{"text": "Turn left at the elevator bank", "language": "en"}' \
  --output test.wav
# Expected: test.wav is a valid WAV file

# Test TTS Korean fallback
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/tts/instruction \
  -H "Content-Type: application/json" \
  -d '{"text": "좌회전", "language": "ko"}'
# Expected: 406
```

---

## 11. User Guide — Using the Chat Feature

### Opening the assistant

Tap the 🎤 microphone button in the bottom-right corner of the navigation screen. The chat panel slides up from the bottom.

### Voice input

Press and hold the 🎤 button inside the panel to record. A red 🔴 indicator shows recording is active. Release to send. The assistant processes the audio (typically 3–6 seconds for STT + LLM) and responds in the chat bubble.

### Text input

Type your query in the text field at the bottom of the panel and press Enter or the ➤ button. Text input always works even when the mic is disabled.

### Language selection

Tap the 🌐 button in the panel header to choose a language:

- **Auto** — language is detected automatically from your speech or text. Recommended for multilingual environments.
- **English / 日本語 / 中文 / 한국어** — pins the language for the session. Useful if auto-detection makes mistakes.

Korean navigation instructions will be spoken using your device's built-in speech synthesis (browser TTS fallback), since Kokoro does not support Korean.

### What you can say

The assistant understands destination queries, accessibility needs, and general building questions:

| What you say | What happens |
|---|---|
| "Where is the cafeteria?" | Routes to Cafeteria |
| "I need to find the lift" | Routes to Elevator Bank (matches "lift" synonym) |
| "I'm in a wheelchair, take me to the elevator" | Enables accessible routes + routes to Elevator Bank |
| "Where's the bathroom?" | Routes to Restroom (matches "bathroom" synonym) |
| "Find me a meeting room" | Routes to Conference Room A (matches "meeting" synonym) |
| "How do I get to IT?" | Routes to IT Department |
| "Take me somewhere to eat" | Routes to Cafeteria (matches "eat" synonym) |
| Multi-turn: "I need food" → "The first one" | Remembers context across turns |

### Confirming a destination

When the assistant finds matching destinations it shows confirmation buttons — tap one to start navigation. The panel closes and turn-by-turn instructions begin.

### During navigation

Each step is spoken aloud automatically (Pipeline B / `NavTTSPlayer`). You don't need to keep the chat panel open. The audio plays when:

- You scan a QR code to anchor your location
- You advance to the next navigation step
- The route is recalculated
- You arrive at the destination

### The amber degradation banner

If the assistant shows "⚠️ Voice assistant offline", Robo-BN is temporarily unreachable. The mic button is disabled but text search still works. The banner clears automatically when Robo-BN recovers (within ~60 seconds of coming back online).

---

## 12. Smoke Test Checklist

Run these manually after any configuration change or deployment:

- [ ] `curl http://localhost:8000/health` → `{"status":"ok"}`
- [ ] `curl http://localhost:8001/api/health` → `{"status":"ok","tts_ready":true,"stt_ready":true}`
- [ ] Text chat: POST `/chat` with `text="where is the cafeteria"` → `candidates` non-empty, `chatbot_available: true`
- [ ] TTS English: POST `/tts/instruction` with `language="en"` → 200 WAV binary
- [ ] TTS Korean: POST `/tts/instruction` with `language="ko"` → 406 JSON `{"fallback":"browser_tts"}`
- [ ] Circuit breaker: stop Robo-BN, send 3 chat requests → 4th request returns `chatbot_available: false` immediately
- [ ] Circuit recovery: restart Robo-BN, wait 60s, send chat request → `chatbot_available: true`, banner clears
- [ ] Accessibility: say "I need accessible routes" → `accessibility_mode: true` in response; subsequent routes use `accessible_only=true`
- [ ] Language Auto: type Japanese text with language=null → response language detected as `ja`
- [ ] POI synonym: say "I need a toilet" → Restroom candidate returned
