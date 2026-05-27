Day 2 — Frontend Scaffold + Map Rendering
What Day 2 Actually Is
Day 1 built the engine. Day 2 builds the windshield — you make everything visible for the first time.
By end of day you'll have:

A React PWA running in the browser
Your floor plan image displayed as a navigable map
Your nodes rendered as dots on that map
A route drawn as a line between two nodes
A search bar that queries the backend and returns POI results
A navigation instruction panel below the map

This is the day where the project stops feeling abstract. When you see your graph overlaid on the floor plan and a route draws between two rooms, the whole thing clicks into place.

The Core Concept You Need to Understand First
Leaflet.js was built for geographic maps — latitude/longitude coordinates, tiles pulled from OpenStreetMap. You are using none of that. You're using it in CRS.Simple mode, which strips out all the geo projection math and treats the map as a flat 2D canvas where coordinates are just pixel positions.
This one mental model unlocks the whole day:
Normal Leaflet:    coordinates = [latitude, longitude]  e.g. [27.7172, 85.3240]
Your Leaflet:      coordinates = [y_pixels, x_pixels]   e.g. [380, 240]
Two things that will trip you if you don't internalize them now:
First: Leaflet always expects [lat, lng] which maps to [y, x] in your pixel space — not [x, y]. Your nodes.json stores {x: 240, y: 380}. When you pass that to Leaflet, you write [node.y, node.x]. Every single time. Get this wrong and your markers appear mirrored or transposed on the map.
Second: The image bounds you pass to ImageOverlay define the coordinate system. If your floor plan is 2000×1400px, your bounds are [[0, 0], [1400, 2000]] — that's [[minY, minX], [maxY, maxX]]. This number must match what's in your database floors.bounds.

Step 1 — Frontend Project Setup
bashcd indoor-nav
npm create vite@latest frontend -- --template react
cd frontend
npm install leaflet react-leaflet zustand jsqr react-hot-toast
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
Tailwind config:
js// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
}
css/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Critical: Leaflet needs explicit height on its container */
.leaflet-container {
  height: 100%;
  width: 100%;
  background: #f1f5f9;
}
Final folder structure for today:
frontend/src/
├── components/
│   ├── FloorMap.jsx          ← Leaflet map + overlays
│   ├── InstructionPanel.jsx  ← bottom sheet with nav steps
│   ├── SearchBar.jsx         ← destination search
│   └── LocationBar.jsx       ← top bar showing current location
├── store/
│   └── useNavStore.js        ← Zustand global state
├── api/
│   └── index.js              ← all backend fetch calls
├── App.jsx
├── main.jsx
└── index.css
Add Leaflet's CSS — this is a common gotcha that causes invisible maps:
js// main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'   // ← MUST be before your own CSS
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

Step 2 — Zustand State Store
Before building any component, define your state shape. Every component reads from and writes to this store. Get it right here and components stay simple.
js// store/useNavStore.js
import { create } from 'zustand'

export const useNavStore = create((set, get) => ({
  // ── Map data (loaded from backend on startup)
  floorData: null,        // {imageUrl, bounds, nodes, pois}
  nodes: {},              // keyed by id: {id, x, y, label, type}

  // ── Navigation state
  status: 'IDLE',         // IDLE | LOCATED | ROUTING | NAVIGATING | ARRIVED
  currentNodeId: null,    // where the user currently is
  destinationId: null,    // where they want to go
  route: null,            // {path[], instructions[], checkpoints[], totalDistance}
  currentStepIndex: 0,    // which instruction step we're on
  progress: 0,            // 0–100, shown in progress bar

  // ── UI state
  searchResults: [],
  isSearchOpen: false,
  isLoading: false,
  error: null,

  // ── Actions
  setFloorData: (data) => {
    const nodeMap = {}
    data.nodes.forEach(n => { nodeMap[n.id] = n })
    set({ floorData: data, nodes: nodeMap })
  },

  setLocation: (nodeId) => set({
    currentNodeId: nodeId,
    status: 'LOCATED',
    error: null
  }),

  setRoute: (route) => set({
    route,
    status: 'NAVIGATING',
    currentStepIndex: 0,
    progress: 0,
    isLoading: false
  }),

  advanceStep: (nodeId) => {
    const { route, currentStepIndex } = get()
    if (!route) return
    const nextStep = currentStepIndex + 1
    const progress = Math.round((nextStep / route.instructions.length) * 100)
    set({ currentStepIndex: nextStep, progress, currentNodeId: nodeId })
  },

  setArrived: () => set({ status: 'ARRIVED', progress: 100 }),

  setSearchResults: (results) => set({ searchResults: results }),

  startRouting: (destId) => set({
    destinationId: destId,
    status: 'ROUTING',
    isLoading: true,
    isSearchOpen: false
  }),

  reset: () => set({
    status: 'IDLE',
    currentNodeId: null,
    destinationId: null,
    route: null,
    currentStepIndex: 0,
    progress: 0,
    searchResults: [],
    error: null
  }),

  setError: (msg) => set({ error: msg, isLoading: false }),
}))
Why Zustand and not useState scattered across components? Because navigation state is shared across the map, the instruction panel, the search bar, and the QR scanner. Prop-drilling that through 3 component levels is a mess. Zustand gives you a global store with zero boilerplate.

Step 3 — API Layer
All backend calls live in one file. This means if your backend URL changes, you change it in one place.
js// api/index.js
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`)
  return res.json()
}

export const api = {
  getFloorData:  ()           => get('/map/floor/1'),
  getRoute:      (from, to)   => get(`/route?from_=${from}&to=${to}`),
  scan:          (qrCode)     => post('/scan', { qr_code: qrCode }),
  search:        (query)      => get(`/search?q=${encodeURIComponent(query)}`),
  logEvent:      (type, data) => post('/event', { event_type: type, payload: data })
    .catch(() => {}),  // analytics never block the UI
}

Step 4 — Backend Endpoints You Need Today
You need two more endpoints working before the frontend can load. Add these quickly.
GET /map/floor/1 — returns everything the frontend needs to bootstrap:
python# routes/map.py
from fastapi import APIRouter
from sqlalchemy import text
from db import AsyncSessionLocal

router = APIRouter()

@router.get("/map/floor/{floor_id}")
async def get_floor(floor_id: int):
    async with AsyncSessionLocal() as db:
        floor = (await db.execute(
            text("SELECT * FROM floors WHERE id = :fid"), {"fid": floor_id}
        )).fetchone()

        nodes = (await db.execute(
            text("SELECT id, x, y, label, type, accessible FROM nodes WHERE floor_id = :fid"),
            {"fid": floor_id}
        )).fetchall()

        pois = (await db.execute(
            text("""SELECT p.id, p.name, p.category, n.id as node_id
                    FROM pois p JOIN nodes n ON p.node_id = n.id
                    WHERE n.floor_id = :fid"""),
            {"fid": floor_id}
        )).fetchall()

    return {
        "imageUrl": floor.map_url,
        "bounds": floor.bounds,
        "nodes": [dict(n._mapping) for n in nodes],
        "pois":  [dict(p._mapping) for p in pois],
    }
GET /search — simple substring match, good enough for prototype:
python# Add to routes/map.py
@router.get("/search")
async def search_pois(q: str):
    async with AsyncSessionLocal() as db:
        results = (await db.execute(
            text("""SELECT p.name, p.category, n.id as node_id, n.x, n.y
                    FROM pois p JOIN nodes n ON p.node_id = n.id
                    WHERE LOWER(p.search_terms) LIKE :q
                    LIMIT 8"""),
            {"q": f"%{q.lower()}%"}
        )).fetchall()
    return [dict(r._mapping) for r in results]

Step 5 — The Floor Map Component
This is the centrepiece of Day 2. Read carefully.
jsx// components/FloorMap.jsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useNavStore } from '../store/useNavStore'

export function FloorMap() {
  const mapRef    = useRef(null)   // Leaflet map instance
  const mapDivRef = useRef(null)   // DOM element
  const layersRef = useRef({})     // store overlay layers for updates

  const { floorData, nodes, route, currentNodeId } = useNavStore()

  // ── Initialize map once
  useEffect(() => {
    if (!floorData || mapRef.current) return

    const bounds = [
      [floorData.bounds.minY, floorData.bounds.minX],
      [floorData.bounds.maxY, floorData.bounds.maxX]
    ]

    const map = L.map(mapDivRef.current, {
      crs: L.CRS.Simple,          // ← pixel coordinates, no geo projection
      bounds,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,    // prevents panning outside floor plan
      zoomSnap: 0.25,
      minZoom: -2,
      maxZoom: 3,
    })

    L.imageOverlay(floorData.imageUrl, bounds).addTo(map)
    map.fitBounds(bounds)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [floorData])

  // ── Draw all nodes as small dots (debug/orientation aid)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !nodes) return

    layersRef.current.nodeDots?.forEach(l => l.remove())
    layersRef.current.nodeDots = Object.values(nodes).map(node => {
      const color = {
        entrance:   '#10B981',
        elevator:   '#8B5CF6',
        stairs:     '#F59E0B',
        poi:        '#6B7280',
        junction:   '#CBD5E1',
        qr_anchor:  '#F97316',
      }[node.type] || '#CBD5E1'

      return L.circleMarker([node.y, node.x], {  // [y, x] — always
        radius: node.type === 'junction' ? 4 : 7,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 1,
      })
        .bindTooltip(node.label, { permanent: false, direction: 'top' })
        .addTo(map)
    })
  }, [nodes])

  // ── Draw route polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    layersRef.current.routeLine?.remove()
    if (!route) return

    const positions = route.path.map(nid => {
      const n = nodes[nid]
      return [n.y, n.x]
    })

    layersRef.current.routeLine = L.polyline(positions, {
      color: '#2563EB',
      weight: 5,
      opacity: 0.85,
      dashArray: '10 6',
      lineJoin: 'round',
    }).addTo(map)

    // Pan map to show full route
    map.fitBounds(layersRef.current.routeLine.getBounds(), { padding: [40, 40] })
  }, [route])

  // ── Current position marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentNodeId) return

    layersRef.current.posMarker?.remove()
    const node = nodes[currentNodeId]
    if (!node) return

    layersRef.current.posMarker = L.circleMarker([node.y, node.x], {
      radius: 12,
      color: '#1D4ED8',
      fillColor: '#93C5FD',
      fillOpacity: 0.95,
      weight: 3,
    }).addTo(map)

    map.panTo([node.y, node.x], { animate: true, duration: 0.5 })
  }, [currentNodeId])

  return (
    <div ref={mapDivRef} className="w-full h-full" />
  )
}
Why useRef for the Leaflet map instance? Leaflet manages its own DOM — it's not React-aware. If you put the map instance in useState, React re-renders would fight Leaflet's own DOM mutations and cause double-initialization bugs. useRef stores it outside the render cycle.
Why separate useEffect for each overlay? Route changes should not re-initialize the map. Node dots should not redraw when only the route changes. Each useEffect has its own dependency array so it runs independently.

Step 6 — App Layout
jsx// App.jsx
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { FloorMap }         from './components/FloorMap'
import { LocationBar }      from './components/LocationBar'
import { SearchBar }        from './components/SearchBar'
import { InstructionPanel } from './components/InstructionPanel'
import { useNavStore }      from './store/useNavStore'
import { api }              from './api'

export default function App() {
  const { setFloorData, startRouting, setRoute, setError, currentNodeId } = useNavStore()

  // Load floor data on mount
  useEffect(() => {
    api.getFloorData()
      .then(setFloorData)
      .catch(() => setError('Failed to load floor map'))
  }, [])

  // Fetch route whenever destination is selected
  const handleSelectDestination = async (destNodeId) => {
    if (!currentNodeId) {
      // For testing today: hardcode starting location
      useNavStore.getState().setLocation(1)
    }
    const from = useNavStore.getState().currentNodeId || 1
    startRouting(destNodeId)
    try {
      const route = await api.getRoute(from, destNodeId)
      setRoute(route)
    } catch (e) {
      setError('Could not find a route')
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <Toaster position="top-center" />

      {/* Top bar — current location */}
      <LocationBar />

      {/* Search bar */}
      <SearchBar onSelectDestination={handleSelectDestination} />

      {/* Map — takes all remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <FloorMap />
      </div>

      {/* Bottom instruction panel — only when navigating */}
      <InstructionPanel />
    </div>
  )
}

Step 7 — Supporting Components
LocationBar — shows where you are:
jsx// components/LocationBar.jsx
import { useNavStore } from '../store/useNavStore'

export function LocationBar() {
  const { currentNodeId, nodes, status } = useNavStore()
  const node = currentNodeId ? nodes[currentNodeId] : null

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${node ? 'bg-blue-500' : 'bg-slate-300'}`} />
      <span className="text-sm font-medium text-slate-700">
        {node ? node.label : 'Scan a QR code to locate yourself'}
      </span>
      {status === 'NAVIGATING' && (
        <span className="ml-auto text-xs text-blue-600 font-medium">Navigating</span>
      )}
    </div>
  )
}
SearchBar — queries backend as you type:
jsx// components/SearchBar.jsx
import { useState, useEffect } from 'react'
import { useNavStore } from '../store/useNavStore'
import { api } from '../api'

export function SearchBar({ onSelectDestination }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      api.search(query).then(setResults).catch(() => {})
    }, 300)   // debounce — don't fire on every keystroke
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (poi) => {
    onSelectDestination(poi.node_id)
    setQuery(poi.name)
    setResults([])
    setOpen(false)
  }

  return (
    <div className="relative bg-white border-b border-slate-200 px-3 py-2">
      <input
        type="text"
        placeholder="Search destination..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && results.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-lg
                        shadow-lg border border-slate-100 z-[9999] overflow-hidden">
          {results.map(poi => (
            <button
              key={poi.node_id}
              onClick={() => handleSelect(poi)}
              className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50
                         border-b border-slate-100 last:border-0"
            >
              <span className="font-medium">{poi.name}</span>
              <span className="ml-2 text-xs text-slate-400">{poi.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
InstructionPanel — shows current nav step:
jsx// components/InstructionPanel.jsx
import { useNavStore } from '../store/useNavStore'

const TURN_ICONS = {
  left:        '↰',
  right:       '↱',
  straight:    '↑',
  start:       '📍',
  destination: '🏁',
}

export function InstructionPanel() {
  const { status, route, currentStepIndex, progress } = useNavStore()

  if (status === 'ARRIVED') {
    return (
      <div className="bg-green-500 text-white px-4 py-5 text-center">
        <div className="text-2xl mb-1">🎉</div>
        <div className="font-semibold text-lg">You have arrived!</div>
      </div>
    )
  }

  if (!route || status !== 'NAVIGATING') return null

  const step = route.instructions[currentStepIndex]
  if (!step) return null

  return (
    <div className="bg-white border-t border-slate-200 px-4 py-3 space-y-2">
      {/* Current instruction */}
      <div className="flex items-center gap-3">
        <span className="text-2xl w-8 text-center">
          {TURN_ICONS[step.turn] || '↑'}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{step.text}</p>
          <p className="text-xs text-slate-400">
            Step {currentStepIndex + 1} of {route.instructions.length}
            {' · '}{Math.round(step.distance)}m
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Scan prompt if next checkpoint exists */}
      {route.checkpoints.length > 0 && (
        <p className="text-xs text-center text-slate-400">
          📷 Scan QR code at checkpoint to continue
        </p>
      )}
    </div>
  )
}

Step 8 — Connecting Frontend to Backend
Your Vite dev server runs on port 5173. Your backend runs on port 8000. By default, the browser will block cross-origin requests unless you either proxy them through Vite or enable CORS on FastAPI (already done in Day 1).
For dev, add a proxy so all /api calls go through Vite:
js// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/map':    'http://localhost:8000',
      '/route':  'http://localhost:8000',
      '/scan':   'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/event':  'http://localhost:8000',
      '/maps':   'http://localhost:8000',   // static floor plan image
    }
  }
})
Now api.getFloorData() calls /map/floor/1 which Vite proxies to http://localhost:8000/map/floor/1. No CORS issue, no hardcoded ports in the frontend.

Step 9 — Debug Overlay Mode
Add this to FloorMap.jsx — it's invaluable for calibrating your node positions against the floor plan image. Toggle it with ?debug=1 in the URL.
jsx// Inside FloorMap.jsx, add to the node drawing useEffect:
const isDebug = new URLSearchParams(window.location.search).has('debug')

if (isDebug) {
  // Draw edges so you can see if graph connectivity looks right
  layersRef.current.edgeLines?.forEach(l => l.remove())
  layersRef.current.edgeLines = []  // you'd need to fetch edges separately
  
  // Draw node ID labels permanently
  Object.values(nodes).forEach(node => {
    L.marker([node.y, node.x], {
      icon: L.divIcon({
        html: `<span style="font-size:10px;background:white;padding:1px 3px;
                            border-radius:2px;border:1px solid #ccc">${node.id}</span>`,
        className: ''
      })
    }).addTo(map)
  })
}
Open http://localhost:5173?debug=1 and you'll see every node ID labeled on the map. If node 7 is floating in the middle of a wall instead of a corridor junction, you know to fix its x/y in nodes.json, re-seed, and restart.

Step 10 — Verification Sequence
bash# 1. Start both services
docker compose up          # backend on :8000
npm run dev                # frontend on :5173

# 2. Check floor data loads
curl http://localhost:8000/map/floor/1
# Should return {imageUrl, bounds, nodes: [...14 items...], pois: [...]}

# 3. Check search works
curl "http://localhost:8000/search?q=cafe"
# Should return [{name: "Cafeteria", node_id: 12, ...}]

# 4. Open browser: http://localhost:5173
# You should see:
#   - Floor plan image fills the map area
#   - Coloured dots at node positions
#   - Search bar at top

# 5. Type "cafeteria" in search bar
#   - Dropdown shows "Cafeteria" result

# 6. Click Cafeteria from search
#   - Route line draws from node 1 to node 12
#   - Instruction panel slides up at bottom
#   - Step 1 instruction visible with turn icon

Common Day 2 Mistakes
Mistake 1: Blank map / missing floor plan image
The map_url in your DB is /maps/floor_plan.png. FastAPI serves /maps as a static directory pointing to backend/seed/. Make sure floor_plan.png actually exists in backend/seed/. Check: curl http://localhost:8000/maps/floor_plan.png should return the image.
Mistake 2: Map renders but nodes appear in completely wrong positions
Your bounds in the DB must match the actual pixel dimensions of your floor plan PNG. If the image is 1800×1200 but your bounds say {maxX: 2000, maxY: 1400}, everything will be offset. Check: identify floor_plan.png (ImageMagick) or open it and check properties.
Mistake 3: x and y swapped — nodes appear mirrored
Leaflet wants [y, x]. If you wrote [node.x, node.y] anywhere, all markers appear transposed. Search your code for every place you pass coordinates to Leaflet and confirm the order.
Mistake 4: Map container has zero height
Leaflet renders into a div. If that div has no explicit height, the map is invisible. The flex-1 on the map container div handles this — but only if the parent div.h-screen has a defined height. If the map is blank, open DevTools and check the map container's computed height.
Mistake 5: Search returns 0 results
Your search_terms column is populated from p["label"].lower() in the seed script. If you search for "cafeteria" but the label is "Staff Cafeteria", the substring match won't hit unless "cafeteria" appears in search_terms. Fix: in seed.py, set search_terms to all space-separated words from the label.

What You're Learning on Day 2
React component architecture for map apps — why map state lives outside React (useRef), how to bridge a third-party DOM library (Leaflet) with React's render cycle using useEffect + refs.
Zustand patterns — actions co-located with state, why a flat store beats nested state for this kind of sequential navigation flow, how components read from store without prop drilling.
Leaflet's CRS.Simple — the insight that a geo mapping library works perfectly for any 2D flat plane, not just Earth geography. The same Leaflet features (bounds, zoom, pan, overlays, markers, polylines) that work for street maps work for floor plans, game maps, and diagrams.
Debouncing user input — the setTimeout pattern in SearchBar prevents a backend call on every keypress. This is a standard pattern you'll use in every search field you ever build.
Separation of concerns — api/index.js as a single boundary between frontend and backend. All fetch logic in one file, all components just call api.search() without knowing what URL or method that implies.

End of Day 2 Success Criteria

Floor plan displays in browser at localhost:5173
Coloured node dots visible at correct positions on the map
Typing in search bar returns live results from backend
Selecting a destination draws a blue dashed route line on the map
Instruction panel appears at bottom showing step 1 text
Progress bar visible at 0%
?debug=1 mode shows node ID labels on map

When all of that works, Day 3 (QR scanner + full navigation state machine) has a solid visual foundation to build on.