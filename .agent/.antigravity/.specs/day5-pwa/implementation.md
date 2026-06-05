# Day 5 PWA Implementation

## Step-by-Step Tasks Performed

1. Added backend offline seed endpoints:
   - `GET /qr-codes/all`
   - `GET /graph`
2. Updated QR printout generation so QR images can encode app entry URLs with `?loc=...`.
3. Added a localStorage-backed frontend API layer for floor, scan, route, graph, QR checkpoint, and analytics fallback behavior.
4. Added client-side Dijkstra route fallback that returns the same route shape as the backend.
5. Added background offline seeding for QR checkpoint data, graph data, and common entrance-to-POI routes.
6. Added backend health polling plus browser online/offline listeners.
7. Added offline UI with a persistent banner and stale-cache age indicator.
8. Added URL `loc` initialization and immediate URL cleanup after reading.
9. Added one shared entry/update location prompt for QR scanning and manual QR checkpoint selection.
10. Updated the LocationBar to always expose location update.
11. Configured Vite PWA service worker generation, runtime caching, manifest, and install icons.
12. Verified with frontend lint, frontend production build, and backend syntax parsing.

## What You're Learning on Day 5

### Service Worker Lifecycle

The app now uses `vite-plugin-pwa` to generate a Workbox service worker during production builds. Static app-shell assets are precached at build time, while runtime requests such as floor plan images, route API calls, and QR scan calls are cached as they are requested.

Implemented in:
- `frontend/vite.config.js`
- `frontend/public/pwa-192.png`
- `frontend/public/pwa-512.png`

### Cache Strategy Tradeoffs

Floor plan images use `CacheFirst` because they are stable during a session. Route and QR scan requests use `NetworkFirst` with short timeouts because fresh backend data is preferred, but cached responses are acceptable when offline.

Implemented in:
- `frontend/vite.config.js`
- `frontend/src/api/index.js`

### URL as Application State

Native camera QR scans can open the app with `?loc=QR_CODE`. The app reads that parameter on startup, removes it with `replaceState`, waits for floor data, then sends the QR code through the normal scan handler.

Implemented in:
- `frontend/src/App.jsx`
- `backend/tools/generate_qr.py`

### Progressive Enhancement

Network access is now treated as an enhancement. The API layer tries the backend first, then falls back to localStorage caches. QR scans can resolve from the pre-seeded QR map, and routes can resolve from cached routes or client-side Dijkstra over the cached graph.

Implemented in:
- `frontend/src/api/index.js`
- `frontend/src/hooks/useOfflineSeeding.js`
- `backend/routes/offline.py`

### Unified Component Design

Initial entry and location update share the same prompt component. In entry mode it asks where the user is; in update mode it shows the current location and allows the same scan or manual-select flow.

Implemented in:
- `frontend/src/components/EntryPrompt.jsx`
- `frontend/src/components/LocationBar.jsx`
- `frontend/src/App.jsx`

### Client-Server Algorithm Parity

The backend still computes routes with Python Dijkstra. The frontend now has a JavaScript Dijkstra fallback that uses the cached graph and returns compatible `path`, `instructions`, `checkpoints`, and `totalDistance` data.

Implemented in:
- `backend/graph.py`
- `frontend/src/api/index.js`

## Verification

- `npm run lint` passed.
- `npm run build` passed and generated `dist/sw.js`, `dist/workbox-*.js`, and `dist/manifest.webmanifest`.
- Backend Python source files passed an AST syntax parse check.
