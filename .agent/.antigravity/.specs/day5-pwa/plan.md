Day 5 — Offline-First + PWA Shell + App Entry Flow
What Day 5 Actually Is
Days 1–4 built a fully working navigation app. Everything assumes a network connection and that the user knows to open the app first. Day 5 solves two separate but related problems: what happens when the network drops mid-navigation, and how does a user actually get into the app in the first place.
Both problems are about the same thing — app initialisation and resilience. How the app starts, what state it starts with, and whether it keeps working when conditions aren't ideal.
By end of day you'll have:

App installable to phone homescreen as a PWA
Floor plan and all static assets cached after first visit
QR lookup and routing working fully offline
Graceful offline/online state visible to the user
Physical QR codes that open the app and auto-set location when scanned with the native camera
A clean fallback entry flow for users who open via URL directly
Location update options available regardless of how the user entered


The Mental Model for Caching
Two separate caching systems work together.
Service Worker (Workbox) intercepts every network request the browser makes and decides whether to serve from cache or go to network based on rules you define. Invisible to the user.
localStorage is explicit data you pre-fetch and store yourself on first load — QR codes, the navigation graph, common routes. Your deliberate offline data strategy.
Service Worker:   catches all asset requests automatically
                  floor plan images → CacheFirst
                  API responses → NetworkFirst with timeout fallback

localStorage:     data you explicitly pre-seed
                  QR code map, nav graph, pre-computed routes
                  survives browser restart, queryable by your code
You need both. The service worker only caches what was actually requested during a session. If a user loads the lobby and goes offline, it hasn't cached the elevator checkpoint QR lookup because they never scanned it. The explicit pre-seeding fills that gap.

The App Entry Model
There are two ways a user arrives at the app. The experience should feel seamless in both cases, but the initialisation path is different.
Entry via QR scan (native camera)
        │
        URL contains ?loc=QR_LOBBY_MAIN
        │
        App opens → reads loc param → auto-sets location
        │
        User is immediately located on map
        │
        Option to update location always visible

Entry via direct URL (typed or shared link)
        │
        URL has no loc param
        │
        App opens → prompts user to set location
        │
        Two options: scan a nearby QR, or select manually from list
        │
        Once set, navigation proceeds normally
Both paths converge at the same state — status: LOCATED with a known currentNodeId. Everything after that is identical.

Step 1 — QR Codes Now Encode URLs
The physical QR codes on the walls change from encoding a plain string to encoding a full URL.
Before:   QR_LOBBY_MAIN
After:    https://your-app.com/?loc=QR_LOBBY_MAIN
The qr_code values in the database stay exactly the same. The backend /scan endpoint stays exactly the same. handleScan stays exactly the same. Only what gets printed into the physical QR image changes — and one flag in generate_qr.py.
Update the generation script to accept a base URL:
bashpython tools/generate_qr.py --base-url https://your-app.vercel.app
# For local testing:
python tools/generate_qr.py --base-url https://192.168.1.10:5173
The script encodes {base_url}/?loc={qr_code} for each checkpoint. Regenerate and reprint before the demo with the correct URL.

Step 2 — URL Parameter Initialisation
On app load, read the loc parameter before rendering anything meaningful. Hold it until floor data is ready, then fire it through the normal scan handler.
The initialisation sequence:
App mounts
    │
    ├── extract ?loc=QR_LOBBY_MAIN from URL
    ├── clean URL immediately → replaceState removes the param
    │       (prevents re-applying location on page refresh)
    │
    ├── load floor data (network or cache)
    ├── seed offline data
    │
    └── floor data ready?
            │
            ├── loc param found → call handleScan(locParam)
            │       → status becomes LOCATED automatically
            │       → map pans to location
            │       → "update location" option appears
            │
            └── no loc param → show entry flow prompt
The URL cleanup is important. Without it, if a user refreshes mid-navigation, the app resets their position to the entrance even if they're on the other side of the building.

Step 3 — Entry Flow for Direct URL Users
When no loc param is present, the app shows an entry prompt instead of jumping straight to the map. It should not block the map from loading — render the map behind it, just without a position marker.
The prompt offers two options side by side:
Option A — Scan nearby QR
Opens the in-app QR scanner exactly as Day 3 built it. User scans the nearest wall QR. Location sets normally. Prompt dismisses.
Option B — Select my location
Opens a searchable list of all QR checkpoint nodes — entrances, elevator lobbies, major junctions. User picks the one closest to where they are. Location sets to that node. Prompt dismisses.
The list for Option B is not all nodes — only nodes that have a QR checkpoint registered. These are the physical anchor points a user could realistically identify themselves at. Junction nodes with no QR and no label are excluded.
Entry prompt UI:

┌──────────────────────────────────────┐
│  Where are you?                      │
│                                      │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  📷         │  │  📍           │  │
│  │  Scan QR    │  │  Select from  │  │
│  │  nearby     │  │  list         │  │
│  └─────────────┘  └───────────────┘  │
│                                      │
│  [Search entrances, lobbies...]      │
│  ○ Main Lobby                        │
│  ○ Elevator Bank                     │
│  ○ Stairwell A                       │
│  ○ Conference Room A                 │
└──────────────────────────────────────┘
The search field filters the list in real time from the pre-loaded data — no network call needed.

Step 4 — Location Update Flow
Regardless of how the user entered, the ability to update their location is always available. This covers:

User who entered via QR but scanned the wrong one
User who selected manually but picked the wrong location
User who has walked a long distance and wants to re-anchor precisely
User handing the phone to someone else at a different location

Where the update option lives: A small "Update location" link in the LocationBar component, next to the current location label. Always visible. Tapping it opens the same entry prompt from Step 3 — scan or select — but pre-filled with the current location highlighted.
After updating: If the user is mid-navigation with an active route, updating location triggers a reroute automatically from the new position to the same destination. The user doesn't need to re-select their destination — the app handles it.
LocationBar:

[ 🔵 Main Lobby  ·  Update ↗ ]

Tap "Update" →

┌──────────────────────────────────────┐
│  Update your location                │
│                                      │
│  Currently: Main Lobby               │
│                                      │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  📷 Scan QR │  │  📍 Select    │  │
│  └─────────────┘  └───────────────┘  │
└──────────────────────────────────────┘
The same component handles both initial entry and location update — controlled by a prop indicating whether it's first-entry or update mode. The only difference is the title text and whether the current location is pre-highlighted in the list.

Step 5 — Vite PWA Plugin and Caching Strategy
Install vite-plugin-pwa which wraps Workbox and handles service worker generation automatically.
Configure four caching rules:
Static assets — pre-cached at install time. All JS bundles, CSS, HTML, icons. After first visit, the app shell loads instantly from cache regardless of network.
Floor plan images — CacheFirst. These never change during a session. Serve from cache, update silently in background.
Route API responses — NetworkFirst with 3-second timeout. Try network for fresh routes, fall back to cached response if unavailable.
QR scan lookups — NetworkFirst with 2-second timeout. Prefer fresh but accept cached.
The web app manifest enables installability — app name, icons, display: standalone removes browser chrome. Generate 192×192 and 512×512 icon PNGs before building.

Step 6 — Explicit Offline Data Seeding
On first load with a network connection, pre-seed critical data into localStorage silently in the background.
What gets seeded:
The full QR checkpoint map — every qr_code string mapped to its node data. This ensures any QR scan resolves offline regardless of which checkpoints the user has visited.
The full navigation graph — all nodes and edges. Enables client-side Dijkstra as routing fallback.
Routes from the main entrance to every POI — covers the most common navigation requests without any network call.
When seeding runs: After floor data loads, in a useOfflineSeeding hook in App.jsx. Checks a localStorage flag to skip if already seeded in this session. Runs silently — never blocks the UI or shows a loading state.
Two new backend endpoints needed:

GET /qr-codes/all — returns all QR checkpoints with node data
GET /graph — returns full nodes and edges list

Both are read-only, called once per session, cached aggressively.

Step 7 — Offline-Aware API Layer
Wrap every API call with fallback logic. The pattern is consistent:
Try network with timeout
    → success: cache response in localStorage, return it
    → failure: check localStorage for cached version
               → found: flag offline state, return cached
               → not found: client-side computation (routing only)
                            → still nothing: surface meaningful error
The scan fallback is a localStorage lookup against the pre-seeded QR map.
The route fallback tries cached responses first, then runs client-side Dijkstra against the cached graph — the same algorithm from Day 1, ported to JavaScript in about 30 lines.
The offline flag lives in Zustand. The API layer sets it. UI components react to it.

Step 8 — Network Status Detection
navigator.onLine is unreliable — it returns true if any network exists, even if your backend is unreachable. Use a health ping instead.
Poll GET /health every 30 seconds with a 3-second timeout. Success means truly online. Timeout means treat as offline regardless of what the browser reports. Also listen to native online/offline events for obvious cases like airplane mode.
On reconnect: clear offline flag, flush queued analytics events, background-refresh floor data and route cache silently.

Step 9 — Offline UI
Offline banner — persistent yellow strip below the header. "Offline — using cached data." Disappears automatically on reconnect with a brief "Back online" toast.
Stale data indicator — if cached data is more than 24 hours old, show subtle label on the banner: "Cached 2 days ago — may be outdated."
What works fully offline: Floor plan display, QR scanning, location anchoring, routing, turn-by-turn instructions, progress tracking, arrived screen, location update flow.
What degrades offline: Search results limited to cached queries, analytics queue locally and sync on reconnect, new POIs or map updates not visible.

Step 10 — Offline Event Queue
Analytics events fired while offline queue in localStorage. On reconnect, flush the queue — send each event to the backend in sequence. The queue stays small in practice (5–10 events between offline and reconnect). No complex management needed.

How Everything Connects
User scans wall QR with native camera
        │
        Browser opens: https://app.com/?loc=QR_LOBBY_MAIN
        │
        App loads → extracts loc param → cleans URL
        │
        Floor data loads (network or service worker cache)
        │
        Offline seeding runs in background
        │
        handleScan("QR_LOBBY_MAIN") fires
        │
        Status → LOCATED, map shows position
        │
        "Update location" always visible in LocationBar

User opens via direct URL (no loc param)
        │
        App loads → no loc param found
        │
        Entry prompt renders over map
        │
        User scans nearby QR  ──┐
            or                  ├── handleScan() fires
        User selects from list ─┘       │
                                    Status → LOCATED
                                    Entry prompt dismisses

Network drops mid-navigation
        │
        Health ping fails → setOffline(true)
        │
        Offline banner appears
        │
        QR scan → localStorage QR map lookup
        Route request → cached response or client-side Dijkstra
        Analytics → queued in localStorage
        │
        Network returns → banner clears, queue flushes

What You're Learning on Day 5
Service worker lifecycle — install, activate, fetch interception phases. Why pre-caching happens at build time and runtime caching happens per request.
Cache strategy tradeoffs — CacheFirst vs NetworkFirst and why the right choice depends on how often data changes and how much staleness is acceptable.
URL as application state — using query parameters to pass state into the app on load, and why cleaning the URL after reading prevents stale state on refresh.
Progressive enhancement — designing every data fetch with a local fallback so network is an enhancement, not a requirement. Full network: fresh data, full features. No network: pre-seeded data, core navigation intact.
Unified component design — the entry prompt and location update flow share the same component. Same UI, same logic, different context. This is the right instinct — resist building two separate things when one parameterised component handles both.
Client-server algorithm parity — running Dijkstra in both Python (server) and JavaScript (client). A real architectural tradeoff: two implementations to maintain, but genuine offline routing capability.

End of Day 5 Success Criteria

Physical QR encodes full URL — native camera scan opens app in browser
App auto-locates when opened from QR URL
URL parameter cleaned after reading — refresh does not reset location
Direct URL entry shows entry prompt with scan and manual select options
Manual select list shows only QR checkpoint nodes, filterable by search
"Update location" visible in LocationBar at all times
Updating location mid-navigation triggers automatic reroute
Service worker visible in DevTools → Application → Service Workers
Airplane mode after first load — floor plan displays, QR resolves, route returns
Offline banner appears on network drop, clears on reconnect
Queued analytics events sync after reconnect
App installs to phone homescreen, runs without browser chrome