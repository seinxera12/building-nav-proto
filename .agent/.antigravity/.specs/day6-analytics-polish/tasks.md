# Day 6 — Analytics, Polish, Accessibility & Map Stability: Tasks

## Gap analysis (plan vs. actual code)

### What already exists — excluded from tasks
- `html, body, #root { overflow: hidden; overscroll-behavior: none }` — in `index.css`
- `.app { height: 100dvh; display: flex; flex-direction: column }` — correct
- `.app-header { flex-shrink: 0 }` — correct
- `.app-main { flex: 1; min-height: 0; overflow: hidden; position: relative }` — correct
- `<InstructionPanel />` is rendered as a sibling **after** `.app-main`, not inside it — layout containment is already right
- `.floor-map-shell { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden }` — correct
- `maxBoundsViscosity={1}` already set on `MapContainer`
- `floor_plan.png` is 2000×1400 px and bounds are `maxX:2000, maxY:1400` — image and bounds already match
- `.scan-button` already `position: absolute` inside `.app-main` — not a Leaflet element, Leaflet cannot move it
- `.instruction-panel` already has `panel-up` slide-up animation (`@keyframes panel-up`)
- `POST /event` + `logEvent()` fully wired in `api/index.js`
- Events already firing: `qr_scan`, `reroute` (×2), `arrived`, `path_complete`, `manual_location_select`
- `rerouting-overlay` div + spinner already in `App.jsx` and styled in CSS

### What is genuinely missing — drives the tasks below

**Map stability:**
- `touch-action: none` missing from `.floor-map-shell`
- `minZoom` hardcoded to `-2`; plan requires it computed from container/bounds ratio
- `FitBounds` only calls `map.fitBounds()` — no subsequent `map.setView()` with computed center+zoom
- No `map.invalidateSize()` call when instruction panel appears/disappears (status changes)
- No `image-rendering: crisp-edges` on the floor plan image overlay

**Analytics — missing events:**
- `route_request` not fired anywhere
- `route_served` not fired anywhere
- `location_set` (with `entry_method`) not fired
- `offline_mode` transition not fired
- `checkpoint_passed` not fired

**Analytics — backend:**
- `GET /analytics/heatmap` does not exist
- `GET /analytics/summary` does not exist
- No `/admin` frontend page

**Polish:**
- `distanceLabel()` returns raw `"156 px"` — no meter conversion
- Map loading uses spinner+text (`app-loading__spinner`) — no shimmer skeleton
- No `navigator.vibrate` calls anywhere
- Scan timeout (30 s) prompt not implemented

**Rerouting UX:**
- Overlay exists but is single-phase; plan requires: dim map → fade old route → draw new route
- `previousRoute` not stored in Zustand during `REROUTING` state

**Accessibility:**
- No `aria-live` on instruction step container
- No `aria-label` on `MapContainer`
- `instruction-panel__text` font-size is `15px` (below 16 px minimum)

**Error states:**
- QR-not-found error has no recovery path (no auto-open of `EntryPrompt`)
- Camera denied error button says "Use map tap instead" — only useful in demo mode

---

## Tasks

- [x] 1. Complete analytics event instrumentation in `useNavStore`
  - [x] 1.1 Add `route_request` event in `selectDestination`, before the `routeFrom()` call — payload: `{ from_node: currentNodeId, to_node: nodeId }`
  - [x] 1.2 Add `route_served` event inside the `routeFrom` helper, after `computeRoute` resolves successfully — payload: `{ from_node: fromNodeId, to_node: toNodeId, path_length: route.path.length, source: get().offline ? 'cache' : 'network' }`
  - [x] 1.3 Add `location_set` event in `anchorLocation` after a successful QR scan resolves and in `anchorNode` after a successful manual selection — payload: `{ node_id: nodeId, entry_method: 'qr_scan' }` for the QR path and `{ node_id: numericNodeId, entry_method: 'manual_select' }` for the manual path. In `App.jsx`, when `handleScan` is called with `initialLoc` (URL param path), pass a flag so the store emits `entry_method: 'url_param'` instead.
  - [x] 1.4 Add `offline_mode` event in `setOfflineStatus`, only when transitioning **to** offline (`!get().offline && offline === true`) — payload: `{ reason: metadata.reason, cached_at: metadata.cachedAt }`
  - [x] 1.5 Add `checkpoint_passed` event in `advanceStep`, after the step index advances, when the new instruction's `nodeId` matches any entry in `floor.qrCodes` — payload: `{ node_id: newNodeId, step_index: next, progress: progressFromStep(next, totalSteps) }`

- [x] 2. Add backend analytics endpoints
  - [x] 2.1 Create `backend/routes/analytics.py` with `GET /analytics/heatmap` — execute the query: `SELECT n.id, n.x, n.y, n.label, COUNT(*) as scan_count FROM events e JOIN qr_checkpoints q ON e.payload->>'qr_code' = q.qr_code JOIN nodes n ON q.node_id = n.id WHERE e.event_type = 'qr_scan' GROUP BY n.id, n.x, n.y, n.label ORDER BY scan_count DESC`; return list of `{ node_id, x, y, label, scan_count }`
  - [x] 2.2 Add `GET /analytics/summary` in the same file — return `{ total_sessions, total_routes, total_arrivals, completion_rate, top_destination }`. Derive: `total_sessions` = `COUNT(DISTINCT session_id)` from `events`; `total_routes` = `COUNT(*)` where `event_type = 'route_request'`; `total_arrivals` = `COUNT(*)` where `event_type = 'arrived'`; `completion_rate` = arrivals / routes as float (0 if routes = 0); `top_destination` = most common `payload->>'label'` where `event_type = 'arrived'`
  - [x] 2.3 Register the analytics router in `backend/main.py`: add `from routes import analytics as analytics_router` and `app.include_router(analytics_router.router)`
  - [x] 2.4 Add `'/analytics': 'http://localhost:8000'` to `server.proxy` in `vite.config.js`

- [x] 3. Build the `/admin` analytics page
  - [x] 3.1 Create `frontend/src/pages/AdminPage.jsx` — self-contained component that independently calls `fetchFloor(1)`, `GET /analytics/heatmap`, and `GET /analytics/summary` via `useEffect` on mount; holds its own `floor`, `heatmap`, `summary`, and `loading` state
  - [x] 3.2 Render four summary stat cards at the top: Total Sessions, Total Routes, Completion Rate (formatted as `X%`), Most Visited; each is a `div.admin-stat-card` with a label and large value
  - [x] 3.3 Render a Leaflet map (`MapContainer` with `L.CRS.Simple`, same `imageBounds` and `ImageOverlay` pattern as `FloorMap`) displaying the floor plan; overlay a `CircleMarker` for each heatmap entry where `radius = 12 + (scan_count / maxCount) * 28` (range 12–40) and `fillOpacity = 0.3 + (scan_count / maxCount) * 0.5` (range 0.3–0.8); color `#f59e0b`; add a `Tooltip` showing `label: N scans`
  - [x] 3.4 Add a "↻ Refresh" button that re-fetches both analytics endpoints and updates state
  - [x] 3.5 In `frontend/src/main.jsx`, render `<AdminPage />` if `window.location.pathname === '/admin'`, otherwise render `<App />` — no router library needed
  - [x] 3.6 Add admin CSS to `index.css`: `.admin-page` (full-height flex column, dark background, padding), `.admin-header` (top bar with title and refresh button), `.admin-stats` (4-column grid, responsive), `.admin-stat-card` (glass card with label + large value), `.admin-map-wrap` (flex-1, min-height 0)

- [ ] 4. Polish — distance unit conversion
  - [x] 4.1 Add `const PIXELS_PER_METER = 8` at the top of `InstructionPanel.jsx` (floor plan: 2000 px ≈ 250 m, so 8 px/m)
  - [x] 4.2 Replace `distanceLabel(value)` body: convert `value / PIXELS_PER_METER` to meters; return `'~' + Math.round(meters) + 'm'` for values that round to ≥ 1 m, or `'< 1m'` for shorter distances. Remove the `px` suffix entirely.
  - [x] 4.3 Update the walk-time estimate in the `ROUTE_PREVIEW` block: replace `Math.round(totalDistance / 80)` with `Math.max(1, Math.round(totalDistance / PIXELS_PER_METER / 1.4 / 60))` (pixels → meters → seconds at 1.4 m/s → minutes)

- [x] 5. Polish — map loading shimmer skeleton
  - [x] 5.1 In `App.jsx`, replace the `floorLoading` block (the `div.app-loading` with spinner and text) with `<div className="map-skeleton" aria-hidden="true" />`
  - [x] 5.2 Add `.map-skeleton` to `index.css`: `position: absolute; inset: 0; background: linear-gradient(90deg, var(--bg-secondary) 25%, rgba(99,102,241,0.07) 50%, var(--bg-secondary) 75%); background-size: 400% 100%; animation: shimmer 1.5s ease-in-out infinite`; add `@keyframes shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }`

- [ ] 6. Polish — haptic feedback
  - [x] 6.1 In `useNavStore`, in `applyLocatedNode` inside the `!shouldReroute` branch, add `navigator.vibrate?.(80)` immediately after `toast.success(...)` fires
  - [x] 6.2 In `useNavStore`, in `anchorNode`, add `navigator.vibrate?.(80)` immediately after `toast.success(...)` fires (the manual select path)
  - [x] 6.3 In `useNavStore`, in `completeArrival`, add `navigator.vibrate?.(200)` immediately before the `logEvent('arrived', ...)` call

- [x] 7. Polish — QR scan timeout prompt
  - [x] 7.1 In `QRScanner.jsx`, add a `timedOut` state (`useState(false)`). Add a `useEffect` that starts a 30-second `setTimeout` when `status` becomes `'active'` and sets `timedOut(true)` on expiry; clear the timeout on cleanup or if status leaves `'active'`
  - [x] 7.2 When `timedOut === true` and `status === 'active'`, render a `div.qr-scanner__timeout` banner over the scanner (above the viewfinder, below the close button): text "Having trouble? Try selecting your location from the list." and a `btn btn--primary` button "Select Manually" that calls `onClose()`

- [x] 8. Polish — three-phase rerouting UX
  - [x] 8.1 Add `previousRoute: null` to `initialState()` in `useNavStore`. In `applyLocatedNode` and `updateLocation`, when entering `REROUTING`, set `previousRoute: route` (the current route before recalc) alongside `status: 'REROUTING'`. Clear `previousRoute: null` when transitioning back to `NAVIGATING` or cancelling.
  - [x] 8.2 In `FloorMap.jsx`, subscribe to `previousRoute` from `useNavStore`. When `status === 'REROUTING'` and `previousRoute` exists, render the previous route `Polyline` with `opacity: 0.25` and `dashArray: '6, 10'` — this is the "fade" visual. The current `routePositions` polyline (which will be empty during rerouting since `route` is null) renders nothing, so only the faded previous route shows.
  - [x] 8.3 In `index.css`, update `.rerouting-overlay { background: rgba(15, 17, 23, 0.72) }` — increase from current `0.62` to strengthen the dim. Add a CSS transition: `transition: opacity 0.2s ease` so the overlay fades in rather than snapping.
  - [x] 8.4 In `useNavStore`, in `applyLocatedNode`, change the success toast after rerouting from `toast.success(\`Location updated: ${label}\`)` to `toast.success('Route updated')` so the message confirms the new route, not just the position.

- [x] 9. Accessibility
  - [x] 9.1 In `InstructionPanel.jsx`, add `aria-live="polite"` and `aria-atomic="true"` to the `<div className="instruction-panel__step">` element so screen readers announce the new instruction text each time `currentStep` changes
  - [x] 9.2 In `FloorMap.jsx`, add `aria-label="Navigation map"` to the `<MapContainer>` element
  - [x] 9.3 In `App.jsx`, add `role="status"` and `aria-live="polite"` to the `<div className="rerouting-overlay">` element so screen readers announce "Recalculating..." when rerouting begins
  - [x] 9.4 In `index.css`, change `.instruction-panel__text { font-size: 15px }` to `font-size: 16px`

- [x] 10. Error state recovery paths
  - [x] 10.1 In `useNavStore.anchorLocation`, after the QR-not-found catch block sets `error: 'QR code not recognised. Try another anchor.'`, also set `scanErrorRecovery: true` in the store. Add `scanErrorRecovery: false` to `initialState()` and clear it in `setError()`.
  - [x] 10.2 In `App.jsx`, subscribe to `scanErrorRecovery` from `useNavStore`. In the `useEffect` that watches `error`, after `toast.error(error)`, if `scanErrorRecovery` is true also call `setUpdatePromptOpen(true)` and dispatch `setScanErrorRecovery(false)` — this opens the location picker as a recovery action automatically.
  - [x] 10.3 In `QRScanner.jsx`, rename the `qr-scanner__error` state button from "Use map tap instead" to "Select location manually" — it already calls `onClose()` so no logic change is needed, only the label

- [x] 11. Map stability — `touch-action` containment
  - [x] 11.1 In `index.css`, add `touch-action: none` to `.floor-map-shell` — this hands all touch events on the map shell to Leaflet's JavaScript handlers and prevents the browser from attempting native pan/zoom on the container

- [x] 12. Map stability — `invalidateSize` on panel resize
  - [x] 12.1 In `FloorMap.jsx`, add a new internal component `InvalidateSizeOnStatusChange` that calls `useMap()` and subscribes to `status` from `useNavStore`. In a `useEffect` watching `status`, call `map.invalidateSize({ animate: false })` after a `0`-ms `setTimeout` (allowing the DOM to repaint first). Render this component inside `<MapContainer>` alongside `<FitBounds>`. This corrects the map when the instruction panel appears or disappears.

- [x] 13. Map stability — computed initial zoom and center
  - [x] 13.1 In `FloorMap.jsx`, replace the `FitBounds` component's current implementation. After calling `map.fitBounds(bounds, { padding: [30, 30], animate: false })`, also call `map.setView([maxY / 2, maxX / 2], map.getZoom(), { animate: false })` to ensure the floor plan is centered — the midpoint of the `[[0,0],[maxY,maxX]]` bounds is `[maxY/2, maxX/2]` in Leaflet's CRS.Simple lat/lng. This corrects off-center rendering after `fitBounds`.
  - [x] 13.2 In `FloorMap.jsx`, pass `minZoom={-3}` to `MapContainer` (lower floor, ensures the entire 2000×1400 floor plan can fit on small screens without clipping). Keep `maxZoom={3}`. Remove the current hardcoded `minZoom={-2}`.

- [x] 14. Map stability — floor plan rendering quality
  - [x] 14.1 In `index.css`, add a rule targeting the Leaflet image overlay element: `.leaflet-image-layer { image-rendering: crisp-edges; image-rendering: -webkit-optimize-contrast }` — this preserves sharp edges on the schematic floor plan PNG at higher zoom levels instead of blurring
