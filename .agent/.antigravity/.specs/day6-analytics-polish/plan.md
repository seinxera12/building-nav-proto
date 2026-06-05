## Day 6 — Analytics, Polish, and Accessibility

### What Day 6 Actually Is

Days 1–5 built a complete, functional, offline-capable navigation app. Day 6 is about making it **believable as a real product** and **provable as a real system**.

There are two audiences for Day 6 work. The first is stakeholders seeing the demo — they need to see a polished, confident UI that feels production-quality, not a prototype. The second is technical stakeholders asking "how do we know this works at scale" — they need to see data flowing, events captured, and analytics visualised.

Day 6 also handles the unglamorous but critical work of making sure the app doesn't break in ways that kill a live demo — error states, edge cases, rerouting UX, and basic accessibility.

By end of day you'll have:

- Every user action captured as an analytics event in the database
- An admin heatmap page showing QR scan frequency on the floor map
- UI polished to a level that reads as production-quality in a demo
- Smooth rerouting experience with visual feedback
- Error states that degrade gracefully rather than crashing
- Basic accessibility that doesn't embarrass the demo on a screen reader

---

### The Mental Model First

Day 6 has three distinct workstreams that run somewhat in parallel. Understand what each one is trying to prove before writing code.

**Analytics** proves the data pipeline works end to end. Stakeholders asking "how would you know where people go, where they get lost, which routes are popular" need a concrete answer — not a whiteboard diagram but actual event data in a database with a visualisation on screen. Even with 20 simulated events, a heatmap on the floor plan is more convincing than any slide.

**Polish** is not vanity. In a demo, rough edges pull attention away from the product and toward the prototype. A loading flash, a misaligned button, an instruction text that wraps awkwardly — these become what people remember. Polish removes distractions so the navigation flow is what stakeholders focus on.

**Accessibility** in a prototype context is not about full WCAG compliance. It's about three specific things: the instruction text is readable on a phone in a corridor (size and contrast), the app doesn't break if a screen reader announces something unexpected, and the demo doesn't fail on a device with larger text settings.

---

### Part 1 — Analytics

#### What Gets Tracked

Every meaningful navigation event becomes a row in the `events` table. The events you care about for this prototype:

|Event|Fired When|Key Payload Data|
|---|---|---|
|`qr_scan`|Any QR resolves successfully|qr_code, node_id, status at time of scan|
|`route_request`|User selects a destination|from_node, to_node, timestamp|
|`route_served`|Route returns from backend or cache|from, to, path length, source (network/cache)|
|`checkpoint_passed`|Mid-route QR scan advances step|node_id, step_index, route progress %|
|`arrived`|Final destination QR scanned|destination_node, total_duration_ms|
|`reroute`|Off-route scan triggers recalculation|unexpected_node, original_destination|
|`offline_mode`|App falls back to offline|reason, cached_data_age|
|`location_set`|Initial location anchored|node_id, entry_method (qr_url/scan/manual)|

The `entry_method` field on `location_set` is specifically valuable — it tells you what proportion of users arrived via wall QR vs typed URL vs in-app scan. This is real product intelligence.

#### Event Client Architecture

The analytics client is a fire-and-forget wrapper that **never blocks the UI**. If the event POST fails, it queues (from Day 5's offline queue). If the queue flush fails, it silently drops. Analytics latency and reliability are never the user's problem.

The client lives in `src/analytics/index.js` — separate from the API layer. It generates a session ID once per app launch (stored in sessionStorage, not localStorage — sessions reset on app close), attaches it to every event, and handles the offline queue from Day 5.

Instrument every state transition in the Zustand store rather than in components. This guarantees events fire regardless of which UI path triggered the transition. `handleScan` fires `qr_scan`. `setRoute` fires `route_served`. `setArrived` fires `arrived`. The components themselves fire nothing — they just call store actions.

#### Backend Event Endpoint

The existing `POST /event` endpoint from Day 1 is sufficient. Add one new endpoint for the admin heatmap:

`GET /analytics/heatmap` — returns QR scan counts grouped by node, joined to node coordinates:

sql

```sql
SELECT n.id, n.x, n.y, n.label, COUNT(*) as scan_count
FROM events e
JOIN qr_checkpoints q ON e.payload->>'qr_code' = q.qr_code
JOIN nodes n ON q.node_id = n.id
WHERE e.event_type = 'qr_scan'
GROUP BY n.id, n.x, n.y, n.label
ORDER BY scan_count DESC
```

Also add `GET /analytics/summary` returning aggregate stats — total routes requested, total arrivals, most popular destination, average route completion rate. These numbers appear on the admin page alongside the heatmap.

#### Admin Heatmap Page

Build a separate route `/admin` in the frontend. Not linked from the main app — accessed by direct URL only. Stakeholders who want to see the data layer get shown this page separately.

The heatmap renders on the same Leaflet floor map component. Each QR checkpoint node gets a circle overlay where radius and opacity scale with scan count. A node scanned 10 times has a larger, more opaque circle than one scanned twice.

The visual effect is immediately readable — hot spots emerge on the map showing where people enter, where they get confused (multiple scans at the same checkpoint suggests users scanning repeatedly), and which destinations are most popular.

Above the map, show four summary cards: total sessions, total routes, completion rate (arrivals / routes), most visited destination. These are the numbers a product manager or building manager would actually care about.

Seed the events table with realistic-looking simulated data before the demo. Run the cafeteria scenario through the simulation panel 8–10 times. Run the reroute scenario 3–4 times. This gives you enough data for the heatmap to look meaningful rather than sparse.

---

### Part 2 — UI Polish

#### What Polish Actually Means Here

Polish is not visual redesign. The Tailwind-based UI from Days 2–4 is already clean. Polish means fixing the specific rough edges that would pull attention during a demo.

#### Loading States

The app currently has loading gaps where the UI is blank or partially rendered. Three places need skeletons or spinners:

**Map loading** — between app mount and floor data arriving, the map container is empty. Show a subtle shimmer skeleton in the map area. One animated grey rectangle filling the map container. Disappears when `floorData` is set in the store.

**Route loading** — between selecting a destination and the route arriving, nothing happens visually. The instruction panel doesn't appear and the map doesn't change. Add a loading state to the instruction panel area: a spinning indicator and "Finding route..." text. Tied to `status === 'ROUTING'` in the store.

**Scan processing** — between the QR scanning and the scan result returning from the backend, there's a brief pause where nothing happens. Show a "Locating..." overlay on the scanner for this 200–500ms gap. Prevents users from thinking the scan failed and trying again.

#### Transition Animations

Three specific transitions need smoothing:

**Route drawing** — currently the polyline appears instantly. Add a CSS transition or a short Leaflet animation so the route "draws" onto the map over 400ms. This is a cosmetic effect but it draws the eye to the route and makes the action feel intentional.

**Instruction panel appearance** — the panel appears abruptly when navigation starts. Animate it sliding up from the bottom using CSS `transform: translateY` with a transition. Standard mobile pattern that feels native.

**Rerouting overlay** — the recalculating state needs a clear visual: dim the map slightly, show a centred spinner with "Recalculating..." text, then animate the new route drawing in. Currently this transition is abrupt. The sequence should feel like: pause → think → new answer.

#### Instruction Text Quality

Read every instruction the system generates for your demo route out loud. Fix any that sound robotic or confusing. Common issues:

Node labels that are too technical — "Junction Node 7" should never appear in an instruction. If your graph has junction nodes without meaningful labels, give them corridor names: "North Corridor", "East Wing Junction".

Distance units — raw pixel distances like "156.3 units" are meaningless. Apply a scale factor. Measure one corridor on your floor plan image, estimate its real-world length, compute pixels-per-meter, and apply that conversion globally. Even rough values ("approximately 30 meters") are better than pixel counts.

Duplicate consecutive instructions — "Continue straight" followed immediately by "Continue straight" should be merged. The instruction generation polish from Day 4 handles most of this, but verify with your actual demo route.

#### Haptic Feedback

One line of code, significant impact on mobile feel:

js

```js
navigator.vibrate?.(100)  // on successful QR scan
navigator.vibrate?.(200)  // on arrival
```

Add after `handleScan` succeeds and after `setArrived`. The `?.` means it silently does nothing on desktop or unsupported browsers.

#### Toast Notification Audit

Review every toast notification that fires during the demo flow. Each one should be:

- Visible long enough to read (minimum 2500ms)
- Not overlapping with the instruction panel on small screens
- Using appropriate tone — success for good news, neutral for state changes, no alarming red for minor issues

Remove any toasts that fire too frequently or say something the UI already shows visually.

---

### Part 3 — Rerouting UX

Rerouting currently works functionally but the experience is abrupt. Polish it into a three-phase transition:

**Phase 1 — Acknowledge (instant):** The moment an off-route scan is detected, show the recalculating overlay and stop the current instruction panel from showing stale information. The user needs immediate feedback that something happened.

**Phase 2 — Compute (100–800ms):** The backend fetches the new route. The overlay shows a spinner. The old route line stays on the map but fades to 30% opacity — it's still there but clearly no longer active.

**Phase 3 — Present:** The new route draws in over 400ms. The old route removes. The instruction panel updates to step 1 of the new route. The overlay dismisses. A toast confirms: "Route updated."

The key insight is that Phase 1 happens synchronously — before any async work. Users forgive loading delays when they get immediate acknowledgement that their action was received.

---

### Part 4 — Error States

These are the failure modes that would kill a live demo. Each needs a graceful handling path.

**QR code not in database** — currently shows a generic error. Change to: "QR code not recognised. Try scanning again or select your location manually." Include a button that opens the location selection prompt from Day 5.

**Route not found** — no path exists between two nodes. Should not happen on a well-connected graph, but handle it: "Couldn't find a route. The path may be temporarily unavailable." Offer to try a different destination.

**Camera permission denied** — currently shows an error message. Add a "Select location manually" button directly in the error state so the user has an immediate alternative.

**Floor data fails to load** — if the backend is down and no cache exists, the map is empty. Show a full-screen error: "Unable to load map. Please check your connection." With a retry button. Don't leave a blank screen.

**Scan timeout** — if the camera is open for more than 30 seconds without a scan, show a gentle prompt: "Having trouble scanning? Try selecting your location from the list." This prevents users staring at an active camera waiting for something to happen.

---

### Part 5 — Accessibility

Three specific things that matter for the demo context:

**Instruction text size and contrast** — the instruction panel will be read in a building corridor, possibly in mixed lighting, possibly by someone glancing at the phone while walking. Minimum 16px for instruction text. Minimum 4.5:1 contrast ratio against the panel background. Check this against your current Tailwind classes — `text-sm` is 14px, which is too small for the primary instruction. Bump to `text-base` minimum.

**`aria-live` for instruction updates** — when the instruction changes (checkpoint scanned, step advances), a screen reader won't announce it unless the element has `aria-live="polite"`. Add this to the instruction text container. This one attribute makes the app navigable for visually impaired users without any other changes.

**Map markers have labels** — Leaflet circle markers have no accessible label by default. Add `title` attributes to marker layers and `aria-label` to the map container. Not full screen reader support, but prevents accessibility audit failures that look bad in a demo.

**Large text compatibility** — test the UI with the phone's text size set to largest. Does the instruction panel overflow? Does the search bar truncate? Fix any layouts that break at large text sizes. Flexbox layouts handle this better than fixed heights.

---

### How Everything Connects on Day 6

```
User action (scan, select destination, arrive)
        │
        Store action fires (handleScan, setRoute, setArrived)
        │
        ├── Navigation state updates → UI reacts
        │       │
        │       ├── Animated transitions (route draw, panel slide)
        │       ├── Haptic feedback on mobile
        │       └── Toast notification
        │
        └── Analytics event fires (fire and forget)
                │
                ├── Network available → POST /event → events table
                └── Offline → localStorage queue → sync on reconnect

Admin opens /admin
        │
        GET /analytics/heatmap → grouped scan counts per node
        GET /analytics/summary → aggregate stats
        │
        Heatmap circles render on floor map
        Summary cards show above map
```

---

### Seeding Realistic Demo Data

Before the demo, run the simulation panel enough times to produce meaningful analytics. Suggested sequence:

```
Run cafeteria scenario × 8    → populates main route data
Run reroute scenario × 3      → shows reroute events
Manually scan different QRs   → adds variety to heatmap
```

This gives you roughly 80–100 events in the database. Enough for the heatmap to show clear hot spots (lobby, elevator bank, cafeteria entrance) and for the summary stats to look real (8 routes, 7 completions, 87% completion rate).

---

### What You're Learning on Day 6

**Instrumentation architecture** — firing analytics from store actions rather than components guarantees complete capture regardless of UI path. This is the correct pattern used in production analytics systems.

**Demo data strategy** — understanding that a demo with sparse data is less convincing than a demo with seeded data, and that seeding is a legitimate and standard practice for prototype validation.

**The cost of rough edges** — polish is not decoration. In a stakeholder demo, visual rough edges shift attention from what the product does to how unfinished it looks. Smooth transitions and correct loading states are functional requirements for a demo.

**Progressive disclosure of errors** — every error state should offer the user a path forward, not a dead end. "QR not recognised" with a manual fallback button keeps the user in the app. "QR not recognised" alone sends them to the browser's back button.

**Accessibility as robustness** — `aria-live` is not just for screen readers. It reflects a component that correctly signals state changes to anything listening — automated tests, accessibility tools, and browsers. Adding it is a sign of a well-structured component.

### Part 6 — UI Stability and Map Layout Fix

#### What the Problem Actually Is

The current implementation treats the entire viewport as a Leaflet canvas. When the user pinches or pans, everything moves — the scan button, the instruction panel, the search bar. This happens because Leaflet's container div is either taking over the full screen or its z-index and positioning is not properly isolated from the rest of the UI.

The fix is not a visual redesign. It is a **layout containment problem**. The map must be locked inside its designated region. Everything outside that region must be in a separate fixed or static layer that Leaflet cannot touch.

---

#### The Correct Layout Model

The app should behave like Google Maps on mobile — UI chrome is bolted to the screen, only the map content inside the map region moves:

```
┌─────────────────────────────┐  ← fixed, never moves
│  LocationBar                │
│  SearchBar                  │
├─────────────────────────────┤
│                             │  ← map region only
│     Leaflet renders here    │    pan and zoom confined here
│     only this moves         │
│                             │
│     [📷 Scan Button]        │  ← absolutely positioned OVER
│                             │    map, but inside map region
├─────────────────────────────┤
│  InstructionPanel           │  ← fixed, never moves
└─────────────────────────────┘  ← fixed, never moves
```

The critical rule: **the Leaflet container div must have `position: relative`, explicit `height`, `overflow: hidden`, and must never be a flex child that can stretch or shrink**. Everything outside the map container must use `position: fixed` or be a static sibling in a controlled flex column.

---

#### Root Layout Fix

The app shell needs explicit height distribution so the map region gets a calculated, stable height and the chrome regions are fixed-size:

```
App shell:         height: 100dvh  (dynamic viewport height, handles mobile browser bars)
LocationBar:       height: 48px    fixed, shrink-0
SearchBar:         height: 52px    fixed, shrink-0
Map container:     flex-1          takes all remaining space, overflow hidden
InstructionPanel:  height: auto    max-height capped, shrink-0
```

Use `100dvh` not `100vh`. On mobile browsers, `100vh` includes the browser's address bar height and causes the bottom of the app to be hidden behind it. `dvh` dynamically accounts for the visible viewport.

The scan button sits inside the map container with `position: absolute`, `bottom: 16px`, `left: 50%`, `transform: translateX(-50%)`, `z-index: 1000`. It floats visually over the map but is not a Leaflet element — Leaflet cannot move it.

---

#### Map Initialisation Fix

The default Leaflet initialisation for `CRS.Simple` with an image overlay has two rendering problems in practice:

**Problem 1 — Wrong initial zoom and centering.** `map.fitBounds()` on the image bounds often results in the floor plan rendering too small, partially off-screen, or with excess whitespace. It tries to fit the entire image into the container but doesn't account for the instruction panel and header stealing height.

Fix: After `fitBounds`, explicitly call `map.setView(centerPoint, calculatedZoom)` where `centerPoint` is the midpoint of your floor bounds and `calculatedZoom` is computed to fill the container width minus a small padding.

**Problem 2 — Map reflows when instruction panel appears.** When the instruction panel slides in at the bottom, the map container loses height. Leaflet doesn't know this happened and the map renders incorrectly — tiles misalign, the view shifts.

Fix: Call `map.invalidateSize()` every time the instruction panel appears, disappears, or changes height. Wire this to the `status` value in the Zustand store via a `useEffect` that watches for `NAVIGATING` and `IDLE`.

---

#### Pinch and Zoom Containment

Leaflet handles its own touch events, but on mobile the browser's native scroll and pinch can interfere. Two things prevent this:

Set `touch-action: none` on the Leaflet container div. This tells the browser to hand all touch events to JavaScript without attempting native scroll or zoom.

Set `maxBoundsViscosity: 1.0` on the Leaflet map options. This creates a hard boundary at the floor plan edges — the user cannot pan outside the floor plan image. Without this, users can drag the floor plan completely off screen.

Also set sensible zoom limits. `minZoom` should be whatever zoom level shows the complete floor plan at app start. `maxZoom` should be around 3 — enough to read room labels but not so close that the image pixelates badly. Compute `minZoom` programmatically at initialisation based on the ratio of the container size to the floor plan bounds.

---

#### Floor Plan Rendering Quality

PNG floor plans scale up poorly in Leaflet's image overlay — at higher zoom levels they become visibly pixelated. Two options depending on what your floor plan source is:

**If PNG:** Set the image CSS to `image-rendering: crisp-edges` for architectural/schematic plans (clean lines, no photos). This preserves hard edges rather than blurring them on scale-up. For photo-realistic plans use the default (browser-smoothed).

**If SVG is available:** Swap `ImageOverlay` for an SVG overlay. SVG scales infinitely without pixelation. This is the correct long-term solution. For the prototype, use whichever you have — but flag SVG as the production target.

Also: the floor plan image should be pre-sized correctly. If your PNG is 800×600 but your map bounds are `2000×1400`, Leaflet stretches it. Make sure the image dimensions match the bounds you defined in the database. If they don't match, either resize the image or adjust the bounds.

---

#### Separate FloorMap Rendering Logic

If fixing the existing `FloorMap.jsx` risks breaking the working node/route/marker logic, extract the rendering initialisation into a separate concern:

**`useMapInstance.js`** — a custom hook responsible only for creating and destroying the Leaflet map instance, applying the image overlay, setting bounds and zoom, and calling `invalidateSize` on resize. Returns the `mapRef`.

**`useMapLayers.js`** — a custom hook that takes the `mapRef` and handles all overlay drawing — nodes, route lines, position marker, animated position. Depends on `mapRef` being ready.

**`FloorMap.jsx`** — becomes a thin shell that mounts the div, calls both hooks, and renders nothing else.

This separation means you can rewrite the initialisation logic in `useMapInstance` without touching any of the routing or marker logic in `useMapLayers`. The working navigation logic is fully isolated from the rendering fix.

---

#### Scroll Lock on Body

When the app is open, the document body should not scroll. If the body scrolls, the entire app can be dragged up and down on mobile, creating the unstable canvas feel the user described.

Add to `index.css`:

css

```css
html, body, #root {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;   /* prevents pull-to-refresh interfering */
}
```

`overscroll-behavior: none` specifically kills the rubber-band scroll effect on iOS that can make the whole app feel like it's floating.

---

#### Testing the Fix

The stability fix should be verified against these specific behaviours before moving on:

- Pinch to zoom on the map — only map content scales, LocationBar and InstructionPanel stay fixed
- Pan the map to the edge — map stops at floor plan boundary, does not scroll off screen
- Select a destination — InstructionPanel slides in, map redraws correctly without shifting
- Rotate phone — layout reflows correctly, map resizes and calls `invalidateSize`
- Scroll gesture starting on a button — does not propagate to map pan
---

### End of Day 6 Success Criteria

- Every navigation event stored in the database during simulation run
- `/admin` page shows heatmap with visible hot spots on floor plan
- Admin summary cards show accurate aggregate numbers
- Map loading skeleton visible on first load before floor data arrives
- Route draws with animation rather than appearing instantly
- Instruction panel slides up when navigation starts
- Rerouting shows three-phase transition — acknowledge, compute, present
- All error states have a recovery action button, no dead ends
- Instruction text minimum 16px, readable at arm's length
- `aria-live` on instruction text container
- Haptic feedback fires on scan success and arrival on mobile
- Demo run with seeded data — heatmap shows at least 5 distinct hot spots
- Full demo flow end to end with no console errors