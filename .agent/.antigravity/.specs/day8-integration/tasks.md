# Day 8 — Voice Chatbot Integration: Tasks

## Gap analysis (plan vs. actual code)

### What already exists
- Dijkstra routing on the backend (`backend/graph.py`, `backend/routes/routing.py`).
- Dijkstra routing on the frontend (`frontend/src/api/index.js`).
- State machine for navigation in Zustand (`frontend/src/store/useNavStore.js`).
- Event logging endpoint `/event` and utility `logEvent()` in `frontend/src/api/index.js`.
- Clean layout structure with `.app`, `.app-main`, and floating overlays (`frontend/src/App.jsx`, `frontend/src/index.css`).

### What is missing & needs to be built
1. **Accessibility Routing Support:**
   - The database has an `accessible` column on both `nodes` and `edges`, but the routing logic (`backend/graph.py` and `frontend/src/api/index.js`) does not currently read or filter by it.
   - The `/route` endpoint needs to accept an optional `accessible_only` query parameter.

2. **Backend Chat Integration & Orchestration:**
   - A new orchestration hub endpoint `POST /chat` is needed to handle user queries (text or base64 audio), call the Robo-BN service (for STT and `navigate` intent resolution), perform database POI searches on matches, set session accessibility mode, and return conversational candidate structures.
   - A new proxy endpoint `POST /tts/instruction` is needed to relay instruction text to Robo-BN `/api/tts` and return the synthesised WAV audio.
   - A new `GET /pois` endpoint returning all POIs with search terms, floors, and accessibility tags to feed the Robo-BN startup cache.
   - Server-side circuit breaker and in-memory session mapping to log events and manage temporary chatbot states (e.g., accessibility status, session language).

3. **Frontend Chatbot Panel & Controls:**
   - A brand new `<ChatbotPanel />` sliding panel showing the conversation history, text entry, and a press-to-talk button for microphone capture.
   - Audio capture utility (`getUserMedia` using 16kHz PCM16 format matching Robo-BN STT).
   - A floating action button (FAB) or search-adjacent toggle to open the chatbot panel.
   - Language selector interface (Auto, English, Japanese, Chinese, Korean).
   - Candidate confirmation bottom sheet or list to handle multi-match POI queries.
   - The non-visible `<NavTTSPlayer />` component to monitor Zustand state transitions (anchoring, step advances, arrival) and playback instruction audio.
   - Graceful degradation UI handling connection/LLM failures (Level 1–3).

---

## Tasks

### Backend Tasks (FastAPI)

- [ ] **1. Extend Graph & Route Accessibility Filtering**
  - [ ] 1.1 In [graph.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/graph.py), update `load_graph_from_db` to load the `accessible` property for edges:
    - Change SQL query to `SELECT from_node, to_node, cost, reverse_cost, accessible FROM public.edges WHERE walkable = true`.
    - Change `NavGraph.add_edge` signature to accept `accessible: bool = True` and store it as a 3-tuple `(cost, neighbor_id, accessible)` in `self.adj[u]`.
  - [ ] 1.2 In [graph.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/graph.py), modify `shortest_path` to accept an optional `accessible_only: bool = False` argument. Inside the neighbor traversal loop:
    - Unpack `cost, v, accessible = edge`.
    - Skip traversals if `accessible_only` is true and `accessible` is false.
  - [ ] 1.3 In [routes/routing.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/routes/routing.py), update the `get_route` endpoint definition to accept `accessible_only: bool = False`. Pass this argument down to `nav_graph.shortest_path`.

- [ ] **2. Add the `GET /pois` Endpoint**
  - [ ] 2.1 In [routes/map.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/routes/map.py), define a new endpoint `@router.get("/pois")`.
  - [ ] 2.2 Query all POIs joined with their nodes and floor details:
    ```sql
    SELECT p.id, p.name, p.category, p.search_terms, n.id as node_id, n.accessible as node_accessible, f.name as floor_name, f.floor_num
    FROM public.pois p
    JOIN public.nodes n ON p.node_id = n.id
    JOIN public.floors f ON n.floor_id = f.id
    ```
  - [ ] 2.3 Return the items as a list of dictionaries.

- [ ] **3. Implement the Chat Integration Endpoint (`/chat` & `/tts/instruction`)**
  - [ ] 3.1 Create a new routing file [routes/chat.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/routes/chat.py).
  - [ ] 3.2 Define a circuit breaker helper class to monitor failures talking to Robo-BN (3 failures, 60s timeout, fallback).
  - [ ] 3.3 Set up a lightweight, in-memory backend session store `sessions: dict[str, dict]` tracking `accessibility_mode`, `chat_language`, and `last_accessed` (expire inactive sessions after 30 minutes in a background lifespan task).
  - [ ] 3.4 Implement `POST /chat` endpoint accepting a JSON body:
    - `{audio_b64, text, language, session_id, current_node_id}`
    - If `audio_b64` is provided: Decode it, call Robo-BN `/api/stt` endpoint using `httpx` (multipart form audio payload), retrieve `{text, language}`. If the circuit breaker is open, bypass and return Level 3 offline markers.
    - Call Robo-BN `/api/navigate` using:
      ```json
      {
        "text": text,
        "language": language || session["chat_language"],
        "session_id": session_id,
        "building_context": {
          "current_node_label": current_node_label_from_db,
          "available_pois": [all POI names from DB],
          "floor_name": floor_name
        }
      }
      ```
    - Parse the result `{intent, destination_query, accessibility_flag, response_text, needs_clarification, language}`.
    - If `accessibility_flag` is true, toggle `accessibility_mode = true` in the local session.
    - If `destination_query` is extracted:
      - Query POIs using `LOWER(pois.search_terms) LIKE :q` to match the query.
      - If 0 matches, call Robo-BN `/api/navigate` again injecting `{"poi_not_found": true, "query": destination_query}` to generate a clarification response text.
    - Return payload: `{response_text, language, candidates, needs_confirmation: len(candidates) > 0, accessibility_mode, session_id}`.
  - [ ] 3.5 Implement `POST /tts/instruction` endpoint:
    - Accepts `{text, language}`.
    - Forwards to Robo-BN `/api/tts` via POST request.
    - If Robo-BN returns a `406` (e.g., for Korean fallback), proxy that status with the browser fallback flag. Otherwise, stream the WAV binary back to the client with `audio/wav` headers.
  - [ ] 3.6 Register the new router in [main.py](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/backend/main.py):
    - Import `chat as chat_router`.
    - Call `app.include_router(chat_router.router)`.
  - [ ] 3.7 Add the proxy setting in `vite.config.js` to route backend chat requests correctly:
    - `'^/chat|/tts': 'http://localhost:8000'`

---

### Frontend Tasks (React & Zustand)

- [ ] **4. Extend the Zustand Navigation Store**
  - [ ] 4.1 In [store/useNavStore.js](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/store/useNavStore.js), add the `chatbot` state structure to `initialState()`:
    ```javascript
    chatbot: {
      isOpen: false,
      messages: [],
      isListening: false,
      isProcessing: false,
      isAvailable: true,
      detectedLanguage: 'en',
      selectedLanguage: null,
      accessibilityMode: false,
      sessionId: crypto.randomUUID(),
      candidates: [],
      needsConfirmation: false,
    }
    ```
  - [ ] 4.2 Add actions to handle chatbot interactions:
    - `toggleChat(isOpen)`: Sets `chatbot.isOpen`.
    - `selectLanguage(lang)`: Sets `chatbot.selectedLanguage`.
    - `clearChat()`: Clears message history.
    - `setAccessibilityMode(enabled)`: Sets `chatbot.accessibilityMode`.
  - [ ] 4.3 Add async actions to interact with `/chat`:
    - `sendChatQuery(text, audioBlob)`: Handles network posting to `/chat`. Updates `isProcessing`, appends messages, toggles `accessibilityMode` on response, and sets `candidates`/`needsConfirmation` if matching POIs return. Sets `isAvailable = false` on circuit break / network failure.
  - [ ] 4.4 In `computeRoute` inside [api/index.js](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/api/index.js), support the extra parameter `accessibleOnly`:
    - Update `computeRoute(fromId, toId, accessibleOnly = false)`.
    - Append `&accessible_only=true` if true.
    - Pass down `accessibleOnly` to the offline Dijkstra route fallback.
  - [ ] 4.5 In [store/useNavStore.js](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/store/useNavStore.js), read `get().chatbot.accessibilityMode` and pass it to every call of `computeRoute`.

- [ ] **5. Build the `<ChatbotPanel />` Component**
  - [ ] 5.1 Create [components/ChatbotPanel.jsx](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/components/ChatbotPanel.jsx) as a bottom-sheet panel containing:
    - Scrollable message bubble stream (alternating user/assistant bubbles, auto-scrolling to bottom).
    - Chat close button.
    - Text message input and send button.
    - Waveform voice input trigger (press-to-talk microphone button).
    - Language select dropdown (English, Japanese, Chinese, Korean, Auto).
  - [ ] 5.2 Implement audio capture on voice button click:
    - Capture media via `navigator.mediaDevices.getUserMedia({ audio: true })`.
    - Use `AudioContext` to record/encode audio as 16kHz mono PCM16.
    - Convert captured blob to Base64 and dispatch `sendChatQuery(null, audioB64)`.
    - Add a client-side Speech Recognition API fallback (`webkitSpeechRecognition`) if microphone capture or Robo-BN is unreachable.
  - [ ] 5.3 If `chatbot.isAvailable` is false, show a header banner warning that the voice assistant is offline, disable the voice button, and route queries directly to the client-side search API fallback.
  - [ ] 5.4 Render the POI candidate confirmation card at the bottom of the message stream if `needsConfirmation` is active. Trigger `selectDestination(candidate.node_id)` on confirmation.

- [ ] **6. Build the `<NavTTSPlayer />` Component**
  - [ ] 6.1 Create [components/NavTTSPlayer.jsx](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/components/NavTTSPlayer.jsx) as a non-rendering functional component.
  - [ ] 6.2 Subscribe to navigation status updates:
    - Listen for `status === 'ANCHORED'` (after `UNLOCATED` transition) -> Speak "You are located at [label]"
    - Listen for `status === 'REROUTING'` -> Speak "Recalculating route"
    - Listen for `status === 'ARRIVED'` -> Speak "You have arrived at [label]"
    - Listen for `currentStep` changes while `status === 'NAVIGATING'` -> Speak new step's `inst.text`.
  - [ ] 6.3 Call backend `/tts/instruction` with JSON body `{text, language}`. Receive the binary WAV payload, create a temporary object URL, and play using the HTML5 `Audio` class.
  - [ ] 6.4 Implement an audio playback queue. If a status change or location update is triggered (e.g. `REROUTING` or new location scan), cancel any active playing audio immediately before queuing the new announcement.

- [ ] **7. Integrate Components & Styling**
  - [ ] 7.1 In [App.jsx](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/App.jsx), render `<NavTTSPlayer />` and `<ChatbotPanel />` globally.
  - [ ] 7.2 Add a floating voice button FAB (e.g. 🎙️ icon) in the bottom-right corner (or next to the search bar) that calls `toggleChat(true)`.
  - [ ] 7.3 In [index.css](file:///d:/ai/projects/building_nav/project/prototype/building-nav-proto/frontend/src/index.css), add comprehensive glassmorphism styles:
    - Chatbot panel container sliding transitions (`.chatbot-panel`).
    - Message bubbles (`.chat-bubble--user`, `.chat-bubble--assistant`).
    - Waveform pulse effects during speech recording.
    - Floating mic button layout and degradation banners.
    - POI confirmation button selections.

---

## Verification Plan

### Automated Verification
- Verify backend endpoints load correctly using Python syntax checks:
  ```powershell
  python -m py_compile backend/main.py backend/routes/chat.py backend/routes/routing.py backend/routes/map.py backend/graph.py
  ```
- Run frontend linter and production builds to ensure build system integrity:
  ```powershell
  npm run lint
  npm run build
  ```

### Manual Verification
1. **Chat Interaction:**
   - Tap the float 🎙️ button to reveal the chatbot. Type "find cafeteria" and confirm the candidate.
   - Speak "I need to find the elevator" and confirm it detects accessibility mode.
2. **Audio Verification:**
   - Test step-by-step TTS prompts: scan a location QR code, verify it speaks the anchor confirmation.
   - Advance the route, verify it speaks the turn instructions.
3. **Degradation Testing:**
   - Shut down Robo-BN service. Verify the app displays the voice-assistant unavailable warning and falls back gracefully to manual search queries.
