# Day 8 — Voice Chatbot Integration: Implementation

## What Was Done

### Status at start of day 8
All backend tasks (1–3) and frontend store/component tasks (4–6) were already implemented. The remaining gap was wiring the new components into the application shell and providing their CSS.

### Changes made in this session

#### `frontend/src/App.jsx`
- Imported `ChatbotPanel` and `NavTTSPlayer`.
- Added `toggleChat` and `chatbotOpen` selectors from the store.
- Rendered `<NavTTSPlayer />` at the top of the component tree (non-rendering, mounts once).
- Rendered `<ChatbotPanel />` below the `<InstructionPanel />`.
- Added a floating action button (`.chatbot-fab`) in the bottom-right of the map area that calls `toggleChat(true)`. The FAB hides itself when the panel is open.

#### `frontend/src/index.css`
Added all chatbot-specific style classes:
- `.chatbot-fab` — violet gradient FAB, absolutely positioned in the map area.
- `.chatbot-panel` — fixed bottom-sheet with slide-up animation, glassmorphism background.
- `.chatbot-panel__header`, `__title-row`, `__title`, `__close` — panel header layout.
- `.chatbot-panel__lang-wrap`, `__lang-btn`, `__lang-menu`, `__lang-item` — language selector dropdown.
- `.chatbot-panel__banner` — amber degradation banner when Robo-BN is unreachable.
- `.chatbot-panel__messages`, `__empty` — scrollable message stream.
- `.chat-bubble`, `.chat-bubble--user`, `.chat-bubble--assistant` — alternating message bubbles.
- `.chat-bubble--loading`, `.chat-bubble__dots` — animated three-dot loading indicator.
- `.chatbot-panel__candidates`, `__candidates-title`, `__candidate-btn` — POI confirmation card.
- `.chatbot-panel__input-bar`, `__text-input` — bottom input row.
- `.chatbot-panel__mic-btn`, `__mic-btn--active` — press-to-talk button with pulse animation.
- `.chatbot-panel__send-btn` — send button.
- Responsive overrides at ≤600px.

#### `frontend/src/components/ChatbotPanel.jsx` (minor cleanup)
- Removed two unused variable declarations (`currentLang`, `detectedLang`) that were flagged by the linter after the `currentLang` variable was found to be unused in the JSX.

---

## System Architecture (as built)

```
User (voice/text)
    │
    ▼
ChatbotPanel (frontend)
    │  POST /chat  {audio_b64 | text, session_id, current_node_id, language}
    ▼
backend/routes/chat.py  ← orchestration hub
    ├─ POST Robo-BN /api/stt  (if audio)
    ├─ POST Robo-BN /api/navigate  (intent classification + entity extraction)
    ├─ POI resolution against DB  (LIKE search on search_terms)
    └─ Returns {response_text, candidates, needs_confirmation, accessibility_mode, language}
    │
    ▼
useNavStore.sendChatQuery()
    ├─ Appends messages to chatbot.messages
    ├─ Sets chatbot.accessibilityMode if returned true
    └─ Sets candidates / needsConfirmation for confirmation UI

NavTTSPlayer (frontend, non-rendering)
    │  Watches Zustand: status, currentStep
    │  POST /tts/instruction  {text, language}
    ▼
backend/routes/chat.py  ← TTS proxy
    │  POST Robo-BN /api/tts
    └─ Returns WAV bytes (or 406 for Korean → browser speechSynthesis fallback)
```

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Wired `ChatbotPanel`, `NavTTSPlayer`, and FAB |
| `frontend/src/index.css` | Added all chatbot/FAB CSS classes |
| `frontend/src/components/ChatbotPanel.jsx` | Removed two unused variable declarations |

---

## Files Already Implemented (no changes needed)

| File | What it does |
|------|--------------|
| `backend/graph.py` | Loads `accessible` column per edge; `shortest_path(accessible_only=)` |
| `backend/routes/routing.py` | `GET /route?accessible_only=true` passes flag to Dijkstra |
| `backend/routes/map.py` | `GET /pois` full join with floor + node accessibility |
| `backend/routes/chat.py` | Circuit breaker, session store, `POST /chat`, `POST /tts/instruction` |
| `backend/main.py` | Chat router registered |
| `frontend/src/store/useNavStore.js` | Full `chatbot` state, `sendChatQuery`, accessibility passed to all `computeRoute` calls |
| `frontend/src/api/index.js` | `computeRoute(fromId, toId, accessibleOnly)` |
| `frontend/src/components/ChatbotPanel.jsx` | Bottom-sheet panel, press-to-talk, language selector, candidate confirmation |
| `frontend/src/components/NavTTSPlayer.jsx` | Non-rendering TTS player, WAV playback + browser fallback |
| `frontend/vite.config.js` | Proxy entries for `/chat` and `/tts` |

---

## How to Run

### Prerequisites

1. **Robo-BN service** must be running and accessible (the STT/LLM/TTS backend). Configure its URL in the environment:
   ```
   ROBO_BN_URL=http://localhost:7860   # or wherever Robo-BN is deployed
   ```
   Set this in `backend/.env` or as an environment variable before starting the backend.

2. **PostgreSQL** must be running with the seeded schema. From the project root:
   ```powershell
   docker-compose up -d db
   cd backend
   python seed.py
   ```

### Start the backend
```powershell
cd backend
uvicorn main:app --reload --port 8000
```

The backend exposes:
- `GET  /health` — sanity check
- `GET  /route` — Dijkstra routing (now with `?accessible_only=true`)
- `GET  /pois` — full POI list for Robo-BN startup cache
- `POST /chat` — chatbot orchestration hub
- `POST /tts/instruction` — TTS proxy

### Start the frontend
```powershell
cd frontend
npm install
npm run dev
```

Vite dev server proxies all `/chat` and `/tts` requests to `http://localhost:8000`.

### Degradation without Robo-BN
If Robo-BN is not running:
- The backend circuit breaker will open after 3 failed calls and return `chatbot_available: false` in the response.
- The frontend store sets `chatbot.isAvailable = false`.
- `ChatbotPanel` shows the amber offline banner, disables the mic button, and routes text queries directly to the existing `/search` endpoint (manual search continues to work normally).
- `NavTTSPlayer` falls back to the browser's `window.speechSynthesis` for all TTS.

### Production notes
- `ROBO_BN_URL` should be set to the Robo-BN server's LAN/internal address. Robo-BN is never exposed to the public internet directly — all access is server-to-server through the building-nav backend.
- CORS on the building-nav backend currently allows all origins (`*`). Tighten this to your frontend domain before deploying publicly.
- The in-memory session store in `chat.py` resets on every backend restart. This is acceptable for the prototype — no conversation history is persisted by design (FR-017).
- Korean TTS (`ko`) returns 406 from Robo-BN and the frontend falls back to browser TTS. A local Korean TTS model is the production path.

---

## Verification

### Automated (run from project root)
```powershell
# Backend syntax
python -m py_compile backend/main.py backend/routes/chat.py backend/routes/routing.py backend/routes/map.py backend/graph.py

# Frontend build
cd frontend
npm run build
```

Both pass as of this implementation.

### Manual
1. Open the app — a 🎙️ FAB should appear in the bottom-right of the map.
2. Tap the FAB — the chatbot panel slides up with "Navigation Assistant" header.
3. Type "find cafeteria" and press send — the assistant should respond and show a candidate confirmation card.
4. Tap the candidate — the chatbot closes and routing begins to that destination.
5. Scan a QR code anchor — `NavTTSPlayer` should speak "You are located at [label]".
6. Advance a navigation step — TTS speaks the next instruction.
7. Shut down Robo-BN — the amber "Voice assistant offline" banner should appear in the chatbot panel.
