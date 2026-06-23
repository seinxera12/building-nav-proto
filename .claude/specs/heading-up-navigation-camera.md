# Spec: Heading-Up Navigation Camera

**Status:** Draft / ready for implementation
**Area:** `frontend/src/components/FloorMap.jsx` (+ supporting components/CSS)
**Author:** generated for fix/ui branch
**Date:** 2026-06-22

---

## 1. Problem statement

During navigation the camera does not adjust meaningfully as the user advances
through navigation nodes. It only `panTo`s the user position (`FollowCamera`) at a
fixed orientation and zoom. The product wants Google-Maps-style behaviour where:

1. The **map rotates so the next route segment always points "up"** (heading-up).
2. **On anchor** to current location, the camera zooms in to street level (current behaviour — keep).
3. **On choosing a destination** (route preview), the camera zooms **out to fit the whole floor/route**, snugly (not tiny).
4. **After Begin + each "Next"**, the camera is **slightly zoomed in** and **re-oriented** based on the current→next segment direction.

## 2. User story

> As a user, I want the camera angle of navigation to follow the route — the direction
> of the next route segment is always north-up, like Google Maps.
> - When anchored to a current location it zooms in like its currently implemented.
> - When I choose a destination it zooms out to just fit the whole building map and the route.
> - After I begin navigation and tap Next, it zooms in a little and re-orients the
>   camera based on the current→next segment direction.

---

## 3. Current architecture (analysis)

All camera control lives inside `<MapContainer>` as headless child components that call
the Leaflet `map` instance via `useMap()`. Coordinates use `CRS.Simple`; pixel→latlng via
`toLatLng(node, maxY) = [maxY - node.y, node.x]`.

Camera-affecting components, in render order ([FloorMap.jsx](../../frontend/src/components/FloorMap.jsx)):

| Component | Trigger | Action | Keep? |
|---|---|---|---|
| `FitBounds` | mount / floor change (bounds key) | `setMinZoom(fitZoom)` + `setView(center, fitZoom)` unless saved viewport | Keep |
| `FloorViewportPersistence` | floor change + user pan/zoom | save/restore per-floor viewport | Keep |
| `InvalidateSizeOnStatusChange` | status change / resize | `invalidateSize` + recompute minZoom, no recenter | Keep |
| `AnchorToUser` | UNLOCATED → anchored (once) | `flyTo(pos, DEFAULT_FOLLOW_ZOOM=1)` | Keep (req #2) |
| `BeginNavigationSync` | ROUTE_PREVIEW → NAVIGATING | `flyTo(startNode, max(currentZoom, fitZoom))` | **Replace** (req #3/#4) |
| `FollowCamera` | `animatedPosition`/`currentNode` change while `followMode` | `panTo(pos)` | **Extend** (add rotation + zoom) |
| `RecenterOnEvent` | `map:recenter` event (FAB) | `flyTo(currentPos, fitZoom)` + re-enable follow | Extend (reset bearing) |
| `FlyToPosition` | — | no-op (intentionally removed) | Keep as-is |

State machine ([useNavStore.js](../../frontend/src/store/useNavStore.js)):
`UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED → ANCHORED`.
- `selectDestination` → `routeFrom(... 'ROUTE_PREVIEW')` — **this is "chose a location"** (req #3).
- `beginNavigation` → `NAVIGATING`.
- `advanceStep` → updates `currentNode`/`currentStep`, may `switchFloor` — **this is "Next"** (req #4).
- `route.path` = ordered node-id list; `route.instructions[currentStep].nodeId` = current step anchor.

`followMode` (local state in `FloorMap`) is forced `true` on entering NAVIGATING/REROUTING and
disabled by user `dragstart`/`zoomstart`. The recenter FAB re-enables it.

### 3.1 Key constraint — no native rotation
Leaflet 1.9.4 + react-leaflet 5 do **not** support map bearing. **Chosen approach
(confirmed): CSS-transform rotation of the Leaflet map pane**, with counter-rotation of
overlay icons/labels so text stays upright. No new dependencies.

---

## 4. Design

### 4.1 Bearing helper (new, pure)
Add to `FloorMap.jsx` (or a small `mapGeometry.js`):

```js
// Bearing in degrees for the segment from node A to node B, in SCREEN space.
// Screen Y is flipped vs pixel Y (toLatLng), so use (A.y - B.y) for the up axis.
// 0° = next segment points up; positive = clockwise.
function segmentBearingDeg(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = a.y - b.y;           // flip to screen-up
  return Math.atan2(dx, dy) * (180 / Math.PI);
}
```

The "next segment" during navigation = vector from `currentNode` to the **next node on
`route.path`** (look ahead 1–2 nodes; skip zero-length duplicates). Helper:

```js
function nextHeadingNode(route, currentNodeId, nodeById) {
  const path = route?.path || [];
  const i = path.indexOf(currentNodeId);
  if (i < 0) return null;
  for (let j = i + 1; j < path.length; j++) {
    const n = nodeById.get(path[j]);
    if (n && (n.x !== nodeById.get(currentNodeId)?.x || n.y !== nodeById.get(currentNodeId)?.y)) return n;
  }
  return null;
}
```

### 4.2 Rotation mechanism (CSS transform)
New headless component `RotateCamera` (or fold into `FollowCamera`):

- Maintain a `bearing` value (deg) driven by `currentNode → nextHeadingNode`.
- Apply rotation to the **map pane** so the rotation pivots around the container centre,
  and keep the user position panned to centre first (so the pivot is the user):
  ```js
  const pane = map.getPane('mapPane');          // contains tiles/overlays/markers
  pane.style.transformOrigin = '50% 50%';
  pane.style.transition = 'transform 0.4s ease';
  pane.style.transform = `rotate(${-bearing}deg)`;
  ```
- **Counter-rotate upright UI** (POI tooltips, destination tooltip, QR emoji, pulsing
  marker, location-select banner is outside the map so unaffected). Add a CSS var
  `--map-bearing` on the shell and counter-rotate `.leaflet-tooltip`, `.qr-demo-marker`,
  and the pulsing marker icon by `var(--map-bearing)`.
- **Order of operations each update:** `panTo(userPos)` → then set bearing transform.
  Because the pane rotates around the container centre and the user is centred, the user
  stays put and the world spins beneath them.

### 4.3 Corner-clipping mitigation
Rotating a rectangle inside the same rectangle exposes empty corners. Mitigate by:
- Enlarging the visual buffer: the floor-plan/background already extends via `paddedBounds`
  (20% / ≥120px). Increase to cover the rotated diagonal: when rotation is active, ensure
  pan buffer ≥ `(√2 − 1)/2 ≈ 0.21` of the **viewport** diagonal. Add a body/shell class
  `is-rotating` that bumps `maxBounds` padding (computed in `paddedBounds`) and/or an
  overscaled background fill behind the map.
- Keep `maxBoundsViscosity` but relax it while rotating so the recenter pan isn't fought.

### 4.4 Zoom tiers (single source of truth)
Define explicit zoom intents to remove the current `Math.max(currentZoom, fitZoom)` ambiguity:

```js
const ZOOM = {
  ANCHOR_FOLLOW: DEFAULT_FOLLOW_ZOOM,   // 1  — street level on anchor (req #2, unchanged)
  NAV_STEP:      DEFAULT_FOLLOW_ZOOM + 0.5, // slightly zoomed in during nav (req #4)
};
// PREVIEW uses computed fitZoom (req #3) — fit whole floor, snug.
```

### 4.5 Per-state camera behaviour

| State transition | Camera | Bearing |
|---|---|---|
| → ANCHORED (first anchor) | `flyTo(userPos, ZOOM.ANCHOR_FOLLOW)` (existing `AnchorToUser`) | reset to 0 |
| → ROUTE_PREVIEW (chose destination) | **NEW `PreviewFitCamera`**: `flyToBounds(routeBounds, {padding})` clamped to `fitZoom` so whole route/floor fits snug, follow OFF | reset to 0 |
| ROUTE_PREVIEW → NAVIGATING (Begin) | `flyTo(startNode, ZOOM.NAV_STEP)`, follow ON | set to first-segment bearing |
| NAVIGATING `advanceStep`/anim (Next) | `panTo(userPos)` @ `ZOOM.NAV_STEP`, follow ON | animate to `currentNode→nextNode` bearing |
| `map:recenter` FAB | `flyTo(userPos, fitZoom or NAV_STEP)`, follow ON | reset to current segment bearing (nav) / 0 (idle) |
| → ARRIVED | stop following | reset to 0 |
| User pan/zoom | follow OFF (existing) | freeze bearing (do not auto-rotate) |

### 4.6 Route bounds for preview (req #3)
```js
function routeLatLngBounds(route, nodeById, maxY) {
  const pts = (route?.path || [])
    .map(id => nodeById.get(id))
    .filter(Boolean)
    .map(n => toLatLng(n, maxY));
  return pts.length ? L.latLngBounds(pts) : null;
}
```
`PreviewFitCamera` fires on `status === 'ROUTE_PREVIEW'` transition:
`map.flyToBounds(routeBounds ?? imageBounds, { padding: [60,60], maxZoom: fitZoom + 0.5, duration: 0.8 })`.
Falls back to full-floor `imageBounds` when route has no current-floor points.

---

## 5. Implementation steps

1. **Geometry helpers** — add `segmentBearingDeg`, `nextHeadingNode`, `routeLatLngBounds`
   (pure functions, unit-testable).
2. **Zoom constants** — add `ZOOM` table; keep `DEFAULT_FOLLOW_ZOOM` as the anchor source.
3. **`PreviewFitCamera`** (new headless component) — fit-to-route on ROUTE_PREVIEW entry.
   Mount in `<MapContainer>`. Does **not** run while NAVIGATING.
4. **Bearing state** — lift a `bearingDeg` + `setBearingDeg` (or ref) into `FloorMap`;
   compute from `currentNode`/`route` on nav updates; reset on non-nav states.
5. **`RotateCamera`** (new) or extend `FollowCamera`:
   - pan user to centre, apply pane CSS transform, write `--map-bearing` CSS var.
   - freeze on user interaction (reuse existing `followMode` off-switch).
6. **Counter-rotation CSS** — in the map stylesheet, counter-rotate tooltips/markers by
   `var(--map-bearing)`; add `.is-rotating` buffer rules.
7. **Update `BeginNavigationSync`** — change target zoom to `ZOOM.NAV_STEP`, set initial
   bearing; keep its existing cross-floor `switchFloor` logic intact.
8. **Update `RecenterOnEvent`** — reset/restore bearing appropriately.
9. **`paddedBounds`** — widen buffer when rotation active to prevent corner clipping.
10. **Cleanup** — on unmount / status leaving NAVIGATING, clear pane transform
    (`transform = ''`) and `--map-bearing` so idle/preview/admin views are north-up.

---

## 6. Regression analysis (must-not-break)

| Existing behaviour | Risk | Mitigation |
|---|---|---|
| First-anchor zoom (`AnchorToUser`, req #2) | Untouched | Do not modify `AnchorToUser`; bearing reset only. |
| Per-floor viewport save/restore (`FloorViewportPersistence`) | Saved center/zoom stored north-up; restoring while a stale transform is applied would look wrong | Always clear pane transform + reset `--map-bearing` to 0 on floor switch and on leaving NAVIGATING **before** restore. |
| `FitBounds` minZoom math | Rotation buffer must not change `computeFitZoom` inputs | Keep `computeFitZoom` unchanged; buffer affects only `paddedBounds`/CSS. |
| User pan/zoom disables follow | Rotation could fight the user | Bearing freezes when `followMode` is off (reuse `dragstart`/`zoomstart` handler). |
| Marker/tooltip hit-testing | CSS-rotating the pane can offset Leaflet's pixel hit-math → POI/QR clicks land wrong | **Pivot rotation around container centre only while following AND user is centred**; verify click→`selectDestination`/`updateLocation` still hit correct nodes (test 6.1). If hit-testing proves unreliable, gate rotation behind centred-follow only and never during `isSelectingLocation`. |
| `isSelectingLocation` node tap (manual relocate) | Rotation offset could misroute taps | **Disable rotation while `isSelectingLocation`** (force bearing 0 + clear transform). |
| Cross-floor `advanceStep` + `switchFloor` | Floor change mid-nav must re-fit and re-orient | After `switchFloor`, recompute bearing from new floor nodes; clear+reapply transform. |
| Route polyline split / `floorTransitionKey` redraw | Polyline lives in same pane → rotates with map (correct) | No change; verify dash animation still renders. |
| REROUTING ghost route | Should rotate with map | Lives in same pane; fine. |
| Admin/debug views, `?debug`, `?demo` | Should stay north-up | Rotation only active in NAVIGATING (+REROUTING); idle states force bearing 0. |
| Simulation mode (`simActive`) | Sim drives `animatedPosition` differently | Bearing derived from `route.path`+`currentNode`, independent of sim animation; verify sim still advances. |
| Existing tests (`beginNavigation-viewport-sync`, `flytoposition-isolated`, `location-animation-decoupled`) | May assert old zoom/flyTo | Re-run; update assertions only where intent changed (preview fit, nav zoom). Do not weaken decoupling guarantees. |

## 7. Test plan

- **Unit:** `segmentBearingDeg` (cardinal + diagonal cases, screen-Y flip), `nextHeadingNode`
  (skips duplicate-position nodes, end-of-path returns null), `routeLatLngBounds` (empty/1-pt fallback).
- **Component (RTL + leaflet mock):**
  - ROUTE_PREVIEW entry calls `flyToBounds` with route bounds, follow OFF.
  - Begin → `flyTo` at `NAV_STEP` zoom, follow ON, `--map-bearing` set.
  - `advanceStep` updates `--map-bearing` toward next-segment bearing.
  - User `dragstart` freezes bearing + disables follow.
  - `isSelectingLocation` forces bearing 0.
  - Floor switch clears transform before viewport restore.
- **Manual:** POI tap selects correct destination while rotated; recenter FAB restores
  heading-up; corners not clipped at extreme bearings; ARRIVED returns north-up.

## 8. Out of scope
- Compass/north indicator UI (nice-to-have follow-up; cone arrow optional).
- Smoothing bearing with continuous device heading (no sensors here; bearing is segment-derived).
- Replacing Leaflet with a rotation-native renderer.

## 9. Open follow-ups
- If CSS-pane hit-testing proves unreliable in manual test 6.1, fall back to rendering a
  rotating heading-cone on the user marker while keeping the map north-up (degraded mode),
  tracked separately.
</content>
</invoke>
