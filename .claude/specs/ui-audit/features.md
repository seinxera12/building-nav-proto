# QR Nav — Features & UI Audit

> High-level audit of the indoor navigation prototype as currently implemented.
> Covers what the product does, how the experience is structured, and how the
> backend and frontend deliver each feature. Written for product/design review
> as much as for engineering.

---

## 1. Product Overview

**QR Nav** is a mobile-first indoor wayfinding prototype for a multi-floor
building. A visitor establishes their location by scanning a QR checkpoint (or
picking a spot manually), searches for a destination, and is guided there with
turn-by-turn instructions on an interactive floor map — including automatic
floor transitions via elevators, stairs, and escalators. The app degrades
gracefully offline, supports a multilingual voice/text assistant, and ships
with an analytics dashboard for operators.

**Two entry points** (single-page app, routed by URL path in `main.jsx`):
- `/` — the visitor navigation app
- `/admin` — the analytics/heatmap dashboard

**Tech stack**
- **Frontend:** React + Zustand state store, Leaflet (`CRS.Simple` pixel-space
  maps) via react-leaflet, Vite, react-hot-toast. PWA-leaning with
  localStorage caching.
- **Backend:** FastAPI (async) with SQLAlchemy over Postgres, in-memory
  navigation graph (Dijkstra) loaded at startup, static floor-image serving.
- **External dependency:** "Robo-BN" voice service (STT / navigate / TTS),
  reached over HTTP and guarded by a circuit breaker.

---

## 2. Core User Journey

The app is a **navigation state machine**. Status drives nearly all UI:

```
UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED → (back to) ANCHORED
                          ↑                  ↓
                          └──── REROUTING ───┘
```

| Status | What the user sees |
|---|---|
| **UNLOCATED** | Entry prompt to scan a QR or pick a location. No bottom sheet. Status badge "Unlocated". |
| **ANCHORED** | Map centered on the user. Bottom sheet shows current location, destination search, quick-access pills. |
| **ROUTE_PREVIEW** | Destination summary with distance, walk time, step count, and Begin / Cancel buttons. |
| **NAVIGATING** | Turn-by-turn instruction card, progress, "Next Step" and "I'm lost / Re-anchor" controls. Camera follows the user. |
| **REROUTING** | Full-screen "Recalculating…" overlay; previous route retained until a new one resolves. |
| **ARRIVED** | Arrival screen confirmation; returns to ANCHORED at the destination. |

The status badge in the floating header reflects this state at all times.

---

## 3. Feature Catalog

### 3.1 Location Anchoring (knowing where you are)
- **QR scan anchoring** — camera-based scanner (`QRScanner`) resolves a code to
  a node via `POST /scan`. QR payloads may be raw codes or URLs carrying a
  `?loc=` param (normalized client-side).
- **Deep-link entry** — visiting with `?loc=CODE` auto-anchors on load (a printed
  QR can link straight into the app), then strips the param from the URL.
- **Manual location pick** — `LocationPicker` lets users choose from POIs / QR
  checkpoints when scanning isn't possible; also the recovery path after a
  failed scan.
- **Re-anchoring mid-route** — "I'm lost / Re-anchor" lets a navigating user
  reset position; the app reroutes from the new spot.
- **Cross-floor anchoring** — anchoring to a node on another floor auto-switches
  the active floor.
- Feedback: success toast + haptic vibration on anchor.

**Backend:** `routes/scan.py` (`/scan` resolve, `/event` logging).
**Frontend:** `App.jsx` entry orchestration, `useNavStore.anchorLocation` /
`anchorNode`, `QRScanner`, `LocationPicker`, `EntryPrompt`.

### 3.2 Destination Search
- **Debounced text search** in the bottom sheet ("Where do you want to go?")
  against POI names/categories/search terms (`GET /search`), min 2 chars.
- **Quick-access pills** — one-tap shortcuts (Food Court, Restrooms, Elevator).
- **Cross-floor results** — search spans all floors; results show the floor name.
- **Local fallback** — if backend search fails, the store filters the cached
  floor's POIs client-side.

**Backend:** `routes/map.py` (`/search`, `/pois`).
**Frontend:** `BottomSheet` search UI, `useNavStore.runSearch`, `SearchBar`.

### 3.3 Routing & Turn-by-Turn Guidance
- **Shortest-path routing** — Dijkstra over an in-memory graph
  (`GET /route?from_=&to=`). Cross-floor edges are first-class, so a single
  search naturally produces inter-floor routes.
- **Accessible-only routing** — when accessibility mode is on, inaccessible
  edges are excluded.
- **Turn-by-turn instructions** — server generates human text with turn
  detection (straight / left / right / u-turn) from node geometry, plus
  start/arrive steps.
- **Floor-transition instructions** — special steps like "Take the elevator at
  Elevator Bank to Floor 2," with floor names resolved from the DB.
- **Route metadata** — total walking distance (pixels → meters at ~8 px/m),
  estimated walk time, step count, QR checkpoints along the path, and an
  explicit `floorTransitions` list.
- **Step progression** — "Next Step" advances; passing a checkpoint and
  crossing floors are tracked; arrival is auto-detected at the final step.
- **Auto floor-switching during navigation** — the map follows the route across
  floors and toasts "Now on Floor X" with a connector icon.

**Backend:** `graph.py` (NavGraph, Dijkstra, turn/text helpers),
`routes/routing.py`.
**Frontend:** `useNavStore` (routeFrom / advanceStep / completeArrival),
`InstructionCard`, `InstructionPanel`, `BottomSheet` nav state.

### 3.4 Interactive Floor Map
- **Leaflet pixel-space map** (`CRS.Simple`) with the floor plan as an image /
  SVG overlay; fit-zoom on load to avoid tiny maps on large screens.
- **Node rendering by type** — entrances, POIs, elevators, stairs, escalators,
  QR anchors color-coded; junction nodes hidden (topology only).
- **Animated route polyline** + **pulsing "you are here" marker**.
- **Follow / recenter** — camera follows the user during navigation; a recenter
  FAB re-centers when the user pans away.
- **GeoJSON space overlays** — room/space polygons drawn from per-floor GeoJSON.
- **Per-floor viewport persistence** — zoom/center remembered per floor in
  localStorage.

**Frontend:** `FloorMap`, `FloorPlanLayer`, `GeoJSONSpaces`,
`AnimatedRoutePolyline`, `PulsingLocationMarker`, `mapGeometry.js`.

### 3.5 Multi-Floor Support
- **Floor selector** UI to switch floors manually (`FloorSelector`).
- **Eager multi-floor loading** — floor 1 loads active; remaining floors load in
  the background so cross-floor search/routing is instant.
- **Connector model** — elevators / stairs / escalators are graph nodes with
  cross-floor edges (`floor_change`, `floor_delta`).
- **Distinct "where the map is" vs "where the user is"** — `currentFloorId`
  (viewed) tracked separately from `userLocationFloorId` (physical).

**Backend:** floor/connector columns in `models.py`,
`/buildings/{id}/floors`, `/map/floor/{id}`.
**Frontend:** `useNavStore` (loadFloors / switchFloor), `FloorSelector`.

### 3.6 Voice & Text Assistant (Chatbot)
- **Floating mic FAB** opens a sliding `ChatbotPanel`.
- **Multilingual** — Auto-detect plus English, Japanese, Chinese, Korean.
- **Voice input** — records audio, sends base64 to `/chat`, which calls the
  Robo-BN STT service.
- **Text input** — typed queries as a fallback / alternative.
- **Intent → navigation** — assistant resolves a destination query against POIs
  and returns candidates for confirmation, wiring straight into routing.
- **Accessibility flag** — the assistant can turn on accessible-only routing.
- **TTS playback** — `NavTTSPlayer` speaks instructions via `/tts/instruction`.
- **Graceful degradation** — a circuit breaker yields tiered fallbacks ("type
  your query", "use manual search") when the voice service is unhealthy.

**Backend:** `routes/chat.py` (orchestrator, circuit breaker, session mgmt,
`/chat`, `/tts/instruction`).
**Frontend:** `ChatbotPanel`, `NavTTSPlayer`, `useNavStore` chatbot slice.

### 3.7 Offline Resilience
- **Network-first with cache fallback** — floors, graph, QR list, and routes are
  cached in localStorage; on failure the app serves cached data.
- **Client-side routing fallback** — a full JS Dijkstra (`buildOfflineRoute`)
  recomputes routes and instructions from the cached graph when the backend is
  unreachable.
- **Offline QR resolution** — scans resolve against the cached QR map offline.
- **Offline seeding** — `useOfflineSeeding` pre-fetches graph + QR codes (and can
  warm common routes) so the app is usable without a live backend.
- **Event queue** — analytics events that fail to send are queued and flushed
  later.
- **Offline banner** — `OfflineBanner` surfaces offline state and reason; network
  status tracked by `useNetworkStatus`.

**Backend:** `routes/offline.py` (`/qr-codes/all`, `/graph`).
**Frontend:** `api/index.js` (networkFirst, caching, offline route builder),
`useOfflineSeeding`, `useNetworkStatus`, `OfflineBanner`.

### 3.8 Analytics & Admin Dashboard
- **Event tracking** — the app logs qr_scan, location_set, route_request,
  route_served, reroute, checkpoint_passed, arrived, path_complete,
  offline_mode, accessibility_mode_enabled, navigation_via_chat, etc.
  (`POST /event`).
- **Admin dashboard** (`/admin`) — summary stat cards (total sessions, total
  routes, completion rate, most-visited destination).
- **Scan heatmap** — QR-scan frequency rendered as scaled circle markers over
  the floor image.

**Backend:** `routes/analytics.py` (`/analytics/summary`, `/analytics/heatmap`).
**Frontend:** `pages/AdminPage.jsx`.

### 3.9 Demo / Simulation Mode
- **`?demo` flag** enables a `SimulationPanel`, keyboard-driven walkthrough
  (`useSimKeyboard`), scripted scenarios, and animated progress — for
  presentations without physically walking the building.
- Demo-only tappable QR markers on the map.

**Frontend:** `SimulationPanel`, `useSimKeyboard`, `simulation/scenarios.js`,
`simulation/animateProgress.js`, `store/useSimStore.js`.

---

## 4. UI Surface Inventory

| Surface | Role |
|---|---|
| **Floating header** | Brand (🧭 QR Nav) + live status badge. |
| **Full-screen map** | Primary canvas; floor plan, nodes, route, location marker. |
| **Bottom sheet** | Draggable, snap to collapsed/expanded; mode-aware (idle / preview / navigating). Reports its height so the map pads around it. |
| **Instruction card** | Floating turn-by-turn step with turn icon, text, distance. |
| **Entry prompt / Location picker** | First-run and "update location" flows. |
| **QR scanner** | Camera overlay for scanning checkpoints. |
| **Floor selector** | Manual floor switching. |
| **FAB group** | QR scan + recenter floating buttons (context-gated). |
| **Chatbot FAB + panel** | Voice/text assistant, language picker, candidate confirmation. |
| **Arrived screen** | Destination reached confirmation. |
| **Offline banner** | Connectivity status + reason. |
| **Rerouting overlay** | Blocking "Recalculating…" with `aria-live`. |
| **Simulation panel** | Demo-mode controls (gated behind `?demo`). |
| **Admin dashboard** | Stat cards + scan heatmap (`/admin`). |

---

## 5. UX & Quality Characteristics

- **Mobile-first, gesture-driven** — draggable bottom sheet with velocity/position
  snapping; FABs sized for thumb reach.
- **Accessibility** — ARIA roles/labels throughout (status regions, live regions
  for instructions and rerouting), accessible-only routing, wheelchair-aware
  nodes/edges/floors, dedicated FAB accessibility tests.
- **Feedback** — toasts for anchoring, route updates, floor changes; haptic
  vibration on anchor and arrival.
- **Resilience-by-default** — network-first caching, client-side routing, queued
  events, circuit-breakered voice service mean the core experience survives
  backend/voice outages.
- **Loading & error states** — shimmer skeleton while floors load; retry on floor
  error; per-feature fallbacks.
- **Testing** — substantial Vitest coverage (viewport sync, bottom-sheet drag,
  FAB a11y, state-machine preservation, multifloor, map geometry) plus backend
  multifloor tests.

---

## 6. Data Model (high level)

- **Floor** — image/SVG URL, bounds, coordinate system (pixel/meter/geo), scale,
  elevation, accessibility, default viewport.
- **Node** — typed map point (junction / poi / elevator / entrance / qr_anchor /
  stairs / escalator) with x/y, elevation, accessibility, extensible metadata.
- **Edge** — directed cost + reverse cost, walkable/accessible flags, edge type,
  and floor-transition fields (`floor_change`, `floor_delta`).
- **QRCheckpoint** — maps a scannable code to a node/floor.
- **POI** — named, categorized, searchable place attached to a node.
- **Event** — session-scoped analytics record (type + JSON payload + timestamp).

---

## 7. Notable Gaps / Observations (for review)

- **Single building hard-coded** — building id `1` is assumed throughout
  (`loadFloors(1)`); no building switcher.
- **CORS wide open** (`allow_origins=["*"]`) — flagged in code as "tighten in
  production."
- **Distance is pixel-derived** — a fixed ~8 px/m constant duplicated in
  `App.jsx` and `BottomSheet.jsx`; real-world scale per floor exists in the
  model but isn't used for the displayed distance.
- **Manual step advancement** — "Next Step" is user-driven; there is no live
  positioning/auto-advance between QR checkpoints (expected for a QR-anchored
  prototype).
- **Admin dashboard is single-floor** — heatmap renders floor 1 only.
- **Voice features depend on the external Robo-BN service** — degrade to text /
  manual search when unavailable.

---

*Audit generated from source inspection of `backend/` and `frontend/src/`.*
