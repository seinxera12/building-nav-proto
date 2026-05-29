Day 3 — QR Scanner + Navigation State Machine
What Day 3 Actually Is
Days 1 and 2 built the map and the routing. But the app has no way to actually use any of it yet. There's no location, no anchor, no way for a user to say "I am here."
Day 3 fixes that. It's the day the app becomes interactive.
By end of day you'll have:

A working camera-based QR scanner in the browser
The backend /scan endpoint resolving QR codes to map positions
The full navigation state machine wired up and running
A complete end-to-end flow: scan QR → see location on map → search destination → get route → scan checkpoint → advance instructions → scan arrival → see completion screen
Printed QR codes you can physically test with your phone camera

This is the most satisfying day of the week. Everything built so far connects.

The Core Concept to Understand First
The QR code is not a tracking device. It is a location declaration. When a user scans a QR code on a wall, they are telling the system: "I am at this exact node right now." The system trusts that completely and updates state accordingly.
This changes how you think about errors. A wrong scan isn't a sensor drift — it's a user at the wrong location. The correct response is to accept it as true, check if it's on the expected route, and either advance normally or reroute. The system never argues with a scan.
QR code on wall → encodes a string like "QR_LOBBY_MAIN"
         ↓
Camera reads that string
         ↓
POST /scan {qr_code: "QR_LOBBY_MAIN"}
         ↓
Backend looks up: which node does this QR belong to?
         ↓
Returns: {nodeId: 1, label: "Main Lobby", x: 240, y: 380}
         ↓
Frontend: "The user is at node 1. Update map position."
The QR code string itself carries no coordinate data. It's just an ID. All meaning comes from the backend lookup table. This means QR codes can be reprinted and reassigned to different locations without changing the physical codes — just update the database row.

The HTTPS Problem — Solve This First
getUserMedia (the camera API) requires a secure context. That means either localhost or https://. If you try to open the app on your phone over plain http://192.168.x.x:5173, the browser will silently refuse to provide camera access with no useful error message.
For development, Vite can serve over HTTPS using a locally trusted certificate.
bashnpm install -D vite-plugin-mkcert
js// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [react(), mkcert()],
  server: {
    host: true,       // expose on local network, not just localhost
    proxy: {
      '/map':    'http://localhost:8000',
      '/route':  'http://localhost:8000',
      '/scan':   'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/event':  'http://localhost:8000',
      '/maps':   'http://localhost:8000',
    }
  }
})
mkcert generates a locally trusted SSL certificate on first run. After that, your dev server runs on https://localhost:5173 and also on https://192.168.x.x:5173 — accessible from your phone on the same WiFi network with real camera access.
Test this before writing any scanner code. Open https://YOUR_LOCAL_IP:5173 on your phone and confirm the browser doesn't show a certificate error. If it does, you need to install the mkcert root certificate on your device — the mkcert docs cover this for iOS and Android.

Step 1 — Backend /scan Endpoint
This is short. The scan endpoint does one thing: look up a QR string and return the node it belongs to.
python# routes/scan.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from db import AsyncSessionLocal

router = APIRouter()

class ScanRequest(BaseModel):
    qr_code: str

@router.post("/scan")
async def scan_qr(req: ScanRequest):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                SELECT q.node_id, q.label, n.x, n.y, n.type, n.floor_id
                FROM qr_checkpoints q
                JOIN nodes n ON q.node_id = n.id
                WHERE q.qr_code = :code
            """),
            {"code": req.qr_code}
        )
        row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"QR code '{req.qr_code}' not registered"
        )

    return {
        "nodeId":  row.node_id,
        "label":   row.label,
        "x":       row.x,
        "y":       row.y,
        "type":    row.type,
        "floorId": row.floor_id,
    }
Test it immediately:
bashcurl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"qr_code": "QR_LOBBY_MAIN"}'

# Expected:
# {"nodeId": 1, "label": "Main Lobby", "x": 240.0, "y": 380.0, ...}

curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"qr_code": "QR_FAKE_CODE"}'

# Expected: 404 {"detail": "QR code 'QR_FAKE_CODE' not registered"}

Step 2 — The QR Scanner Component
This is the most technically involved component in the whole project. Read it in three parts: camera setup, scan loop, and cleanup.
jsx// components/QRScanner.jsx
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export function QRScanner({ onScan, onClose, onError }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)      // requestAnimationFrame id
  const streamRef = useRef(null)      // MediaStream — needed for cleanup

  const [status, setStatus] = useState('requesting')
  // 'requesting' | 'active' | 'error'

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },  // rear camera
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          }
        })

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('active')
        scanLoop()

      } catch (err) {
        if (cancelled) return
        console.error('Camera error:', err)
        setStatus('error')
        onError?.(err.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : 'Camera unavailable'
        )
      }
    }

    function scanLoop() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || cancelled) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          { inversionAttempts: 'dontInvert' }  // faster, works for standard QR
        )

        if (code?.data) {
          stopCamera()
          onScan(code.data)
          return
        }
      }

      rafRef.current = requestAnimationFrame(scanLoop)
    }

    function stopCamera() {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    startCamera()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* Video feed */}
      <video
        ref={videoRef}
        playsInline          // required on iOS — without this it goes fullscreen
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Hidden canvas for pixel analysis */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Viewfinder overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-64 h-64">
          {/* Corner markers */}
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
            <div
              key={pos}
              className={`absolute w-8 h-8 border-white border-4
                ${pos.includes('top')    ? 'top-0'    : 'bottom-0'}
                ${pos.includes('left')   ? 'left-0 border-r-0 border-b-0'
                                         : 'right-0 border-l-0 border-b-0'}
                ${pos.includes('bottom') && pos.includes('left')  ? 'border-r-0 border-t-0' : ''}
                ${pos.includes('bottom') && pos.includes('right') ? 'border-l-0 border-t-0' : ''}
              `}
            />
          ))}
          {/* Scan line animation */}
          {status === 'active' && (
            <div className="absolute left-0 right-0 h-0.5 bg-blue-400 opacity-80
                            animate-bounce top-1/2" />
          )}
        </div>
      </div>

      {/* Status text */}
      <div className="absolute bottom-24 left-0 right-0 text-center">
        {status === 'requesting' && (
          <p className="text-white text-sm">Requesting camera access...</p>
        )}
        {status === 'active' && (
          <p className="text-white text-sm opacity-70">
            Point at a QR code
          </p>
        )}
        {status === 'error' && (
          <p className="text-red-400 text-sm">Camera unavailable</p>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white text-3xl font-light
                   w-10 h-10 flex items-center justify-center"
      >
        ✕
      </button>
    </div>
  )
}
Why playsInline on the video tag? On iOS Safari, without playsInline, the video opens in the native fullscreen player, completely hiding your UI. This one attribute keeps video rendering inside the page.
Why willReadFrequently: true on the canvas context? You're calling getImageData on every animation frame. Without this hint, Chrome will keep the canvas in GPU memory and read it back on every frame — very slow. This flag tells the browser to keep it in CPU memory where sequential reads are fast.
Why requestAnimationFrame instead of setInterval? RAF syncs with the display refresh rate (60fps), pauses when the tab is hidden, and cancels cleanly. setInterval fires even when the tab is hidden and stacks up calls. For a scan loop reading camera frames, RAF is always the right choice.

Step 3 — The Navigation State Machine
This is the brain of the application. It lives in the Zustand store as a handler that processes every QR scan and decides what to do based on current state.
First, add the handleScan action to your store:
js// store/useNavStore.js — add this action
handleScan: async (qrCode) => {
  const state    = get()
  const { status, route, currentNodeId } = state

  // ── Always post analytics (fire and forget)
  api.logEvent('qr_scan', { qr_code: qrCode, status })

  let scanResult
  try {
    scanResult = await api.scan(qrCode)
  } catch (err) {
    // 404 = unregistered QR code
    set({ error: 'QR code not recognised. Try another checkpoint.' })
    return
  }

  const { nodeId, label, x, y } = scanResult

  // ── IDLE: first scan sets location anchor
  if (status === 'IDLE' || status === 'LOCATED') {
    set({
      currentNodeId: nodeId,
      status: 'LOCATED',
      error: null,
    })
    toast.success(`📍 Located: ${label}`)
    return
  }

  // ── NAVIGATING: mid-route checkpoint scan
  if (status === 'NAVIGATING' && route) {
    const routeNodeIds  = route.path
    const checkpointIds = route.checkpoints.map(c => c.nodeId)
    const destNodeId    = routeNodeIds.at(-1)

    // Case 1: Arrived at destination
    if (nodeId === destNodeId) {
      set({
        status:        'ARRIVED',
        currentNodeId: nodeId,
        progress:      100,
      })
      api.logEvent('arrived', { destination_node: nodeId, label })
      return
    }

    // Case 2: Expected checkpoint on this route
    if (checkpointIds.includes(nodeId)) {
      const cpIndex = checkpointIds.indexOf(nodeId)

      // Find which instruction step this checkpoint corresponds to
      const stepIndex = route.instructions.findIndex(
        ins => ins.nodeId === nodeId
      )

      const newStepIndex = stepIndex >= 0
        ? stepIndex + 1
        : get().currentStepIndex + 1

      const progress = Math.round(
        (newStepIndex / route.instructions.length) * 100
      )

      set({
        currentNodeId:    nodeId,
        currentStepIndex: newStepIndex,
        progress,
        error: null,
      })

      const nextInstruction = route.instructions[newStepIndex]
      if (nextInstruction) {
        toast(`${TURN_ICONS[nextInstruction.turn]} ${nextInstruction.text}`, {
          duration: 3000
        })
      }

      api.logEvent('checkpoint_scan', { node_id: nodeId, step: newStepIndex })
      return
    }

    // Case 3: Node is on the route but not a marked checkpoint
    // (user at a junction that wasn't designated a checkpoint)
    if (routeNodeIds.includes(nodeId)) {
      const nodeIndexInRoute = routeNodeIds.indexOf(nodeId)
      const progress = Math.round(
        (nodeIndexInRoute / routeNodeIds.length) * 100
      )
      set({ currentNodeId: nodeId, progress })
      return
    }

    // Case 4: Off-route — reroute
    set({ status: 'REROUTING', currentNodeId: nodeId })
    toast('Recalculating route...', { icon: '🔄' })

    try {
      const destId   = routeNodeIds.at(-1)
      const newRoute = await api.getRoute(nodeId, destId)
      set({
        status:           'NAVIGATING',
        route:            newRoute,
        currentStepIndex: 0,
        progress:         0,
      })
      api.logEvent('reroute', { from_node: nodeId, to_node: destId })
    } catch {
      set({ status: 'NAVIGATING', error: 'Could not recalculate route' })
    }
  }
},
Add TURN_ICONS as a constant above the store:
jsconst TURN_ICONS = {
  left: '↰', right: '↱', straight: '↑', start: '📍', destination: '🏁'
}

Step 4 — Wiring the Scanner into the App
Add a scan button that opens the scanner, and a handler that processes the result.
jsx// App.jsx — add scan button and scanner overlay
import { useState } from 'react'
import { QRScanner } from './components/QRScanner'
import { useNavStore } from './store/useNavStore'
import toast from 'react-hot-toast'

export default function App() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const { handleScan, status } = useNavStore()

  const onScanSuccess = async (qrCode) => {
    setScannerOpen(false)
    await handleScan(qrCode)
  }

  const onScanError = (msg) => {
    setScannerOpen(false)
    toast.error(msg)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">

      {/* Scanner overlay — full screen when open */}
      {scannerOpen && (
        <QRScanner
          onScan={onScanSuccess}
          onClose={() => setScannerOpen(false)}
          onError={onScanError}
        />
      )}

      <LocationBar />
      <SearchBar onSelectDestination={handleSelectDestination} />

      <div className="flex-1 relative overflow-hidden">
        <FloorMap />

        {/* Scan button — floats over map */}
        <button
          onClick={() => setScannerOpen(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2
                     bg-blue-600 hover:bg-blue-700 text-white
                     px-6 py-3 rounded-full shadow-lg
                     flex items-center gap-2 text-sm font-semibold
                     z-[1000] transition-colors"
        >
          <span className="text-lg">📷</span>
          {status === 'IDLE' ? 'Scan to Locate' : 'Scan Checkpoint'}
        </button>
      </div>

      <InstructionPanel />
    </div>
  )
}
The scan button label changes based on state. "Scan to Locate" when the user has no position yet. "Scan Checkpoint" when navigating. Small detail, but it guides the user's mental model.

Step 5 — Arrived Screen
Add a reset flow so the demo can loop cleanly.
jsx// components/ArrivedScreen.jsx
import { useNavStore } from '../store/useNavStore'

export function ArrivedScreen() {
  const { status, route, nodes, reset } = useNavStore()
  if (status !== 'ARRIVED') return null

  const destId   = route?.path?.at(-1)
  const destNode = destId ? nodes[destId] : null

  return (
    <div className="absolute inset-0 bg-white z-40 flex flex-col
                    items-center justify-center gap-4 p-8">
      <div className="text-6xl">🎉</div>
      <h2 className="text-2xl font-bold text-slate-800 text-center">
        You have arrived!
      </h2>
      {destNode && (
        <p className="text-slate-500 text-center">
          Welcome to {destNode.label}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-6 bg-blue-600 text-white px-8 py-3
                   rounded-full font-semibold text-sm"
      >
        Navigate Again
      </button>
    </div>
  )
}
Add <ArrivedScreen /> inside the map container div in App.jsx.

Step 6 — Generate and Print QR Codes
You need physical QR codes to test the scanner with a real device. Run this script inside the backend container.
python# backend/tools/generate_qr.py
import qrcode
import json
import os

os.makedirs("seed/qr_printouts", exist_ok=True)
data = json.load(open("seed/qr_codes.json"))

for cp in data:
    img = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    img.add_data(cp["qr_code"])
    img.make(fit=True)

    qr_img = img.make_image(fill_color="black", back_color="white")
    filename = f"seed/qr_printouts/{cp['qr_code']}.png"
    qr_img.save(filename)
    print(f"Generated: {filename}  ({cp['label']})")

print(f"\n✅ {len(data)} QR codes in seed/qr_printouts/")
bashdocker compose exec backend python tools/generate_qr.py
This writes PNG files to backend/seed/qr_printouts/. Open them on your desktop and scan them with your phone camera pointed at the screen — jsQR handles screen-displayed QR codes reliably. No printing required for development testing.
For a physical demo, print at minimum 6×6cm. The border=4 quiet zone (white space around the code) is important — codes right to the edge of a page are hard to scan.

Step 7 — The Manual Fallback
On iOS Safari below 16.4, and in some embedded browser environments, getUserMedia will fail or be unavailable. You need a fallback that keeps the demo functional even when the camera doesn't work.
Add tappable QR markers directly on the floor map. When tapped in demo mode, they trigger the same scan handler as a real camera scan.
jsx// Inside FloorMap.jsx, add to the node-rendering useEffect:
const isDemoMode = new URLSearchParams(window.location.search).has('demo')
const { handleScan } = useNavStore.getState()

// Add QR anchor markers as tappable icons
const qrNodes = Object.values(nodes).filter(n =>
  n.type === 'qr_anchor' || n.type === 'entrance' ||
  n.type === 'elevator'  || n.type === 'poi'
)

layersRef.current.qrMarkers?.forEach(l => l.remove())
layersRef.current.qrMarkers = qrNodes.map(node => {
  const icon = L.divIcon({
    html: `<div style="
      background: #F97316; color: white; border-radius: 50%;
      width: 28px; height: 28px; display: flex;
      align-items: center; justify-content: center;
      font-size: 14px; cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">📷</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })

  return L.marker([node.y, node.x], { icon })
    .addTo(map)
    .on('click', () => {
      // Find the QR code for this node from floorData
      const floorData = useNavStore.getState().floorData
      // We need QR codes in floorData — add them to /map/floor/1 response
      const qrEntry = floorData?.qrCodes?.find(q => q.node_id === node.id)
      if (qrEntry) handleScan(qrEntry.qr_code)
    })
})
For this to work, the /map/floor/1 endpoint needs to also return QR codes. Add to the backend:
python# In routes/map.py, inside get_floor():
qr_codes = (await db.execute(
    text("SELECT qr_code, node_id, label FROM qr_checkpoints WHERE floor_id = :fid"),
    {"fid": floor_id}
)).fetchall()

# Add to return dict:
"qrCodes": [dict(q._mapping) for q in qr_codes],
Now ?demo=1 mode shows orange camera icons on every QR checkpoint node. Tapping one triggers a real scan handler call — the exact same code path as a camera scan.

Step 8 — Error States and Edge Cases
These aren't polished features — they're the minimum to prevent the demo from dying silently.
Camera permission denied:
jsx// In QRScanner.jsx status === 'error' branch, show this:
<div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4 p-8">
  <div className="text-4xl">📵</div>
  <p className="text-white text-center text-sm">
    Camera access was denied. Please allow camera access in your browser settings.
  </p>
  <button onClick={onClose} className="text-blue-400 underline text-sm">
    Use map tap instead
  </button>
</div>
QR code not found:
The handleScan function already catches the 404 and sets error. Display it:
jsx// In App.jsx, above the scan button:
{error && (
  <div className="absolute bottom-20 left-4 right-4 bg-red-500 text-white
                  text-xs text-center py-2 rounded-lg z-[1001]"
       onClick={() => useNavStore.getState().setError(null)}>
    {error} — tap to dismiss
  </div>
)}
Rerouting visual feedback:
When status === 'REROUTING', show a brief overlay:
jsx{status === 'REROUTING' && (
  <div className="absolute inset-0 bg-white/70 z-30
                  flex items-center justify-center gap-2">
    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent
                    rounded-full animate-spin" />
    <span className="text-sm font-medium text-slate-700">Recalculating...</span>
  </div>
)}

Verification Sequence
bash# 1. Backend /scan endpoint
curl -X POST http://localhost:8000/scan \
  -H "Content-Type: application/json" \
  -d '{"qr_code": "QR_LOBBY_MAIN"}'
# Returns: {nodeId: 1, label: "Main Lobby", ...}

# 2. Generate QR images
docker compose exec backend python tools/generate_qr.py
# Check: backend/seed/qr_printouts/ has .png files

# 3. Open app on desktop: http://localhost:5173?demo=1
#    Orange camera icons visible on map
#    Tap lobby icon → location anchors, dot appears
#    Search "cafeteria" → select it → route draws
#    Tap a checkpoint icon → instruction advances
#    Tap cafeteria icon → arrived screen shows

# 4. Open app on phone: https://YOUR_LOCAL_IP:5173
#    Tap "Scan to Locate"
#    Point at QR_LOBBY_MAIN.png on your screen
#    Camera scans → location anchors on map
#    Search destination → route draws
#    Tap "Scan Checkpoint" → scan QR_ELEV_BANK.png
#    Instruction advances

Common Day 3 Mistakes
Mistake 1: playsInline missing on iOS
Without playsInline, video hijacks the whole screen on iPhone. It's not obvious why the scanner "disappears." Add playsInline muted and it stays in-page.
Mistake 2: Scan loop keeps running after successful scan
If cancelAnimationFrame is not called on scan success, the loop continues scanning on a stopped camera, spamming onScan with the same QR code. The return statement after onScan(code.data) in the scan loop prevents this — make sure it's there.
Mistake 3: Stream not stopped when scanner closes
If onClose is called without stopping the MediaStream, the camera indicator light stays on and the stream holds the camera open. The cleanup in useEffect return handles this — but only if the component unmounts cleanly. Verify by opening and closing the scanner and checking the camera indicator goes off.
Mistake 4: handleScan called before floorData loads
If the user somehow triggers a scan before the floor data has loaded from the backend, nodes will be empty and the map position update will silently fail. Guard in handleScan: if !state.floorData, show a loading message.
Mistake 5: State machine falls through without matching a case
If status is some unexpected value, handleScan does nothing and the user sees no feedback. Add a catch-all at the end of handleScan for any unhandled state:
jsconsole.warn(`Unhandled scan in status: ${status}`, scanResult)

What You're Learning on Day 3
The MediaDevices API and browser camera access — getUserMedia constraints, facingMode, stream lifecycle, and why you must stop tracks explicitly or the camera stays open.
requestAnimationFrame for real-time processing — how RAF creates a scan loop that syncs with the display, pauses automatically when hidden, and cancels cleanly. Contrast with the naive setInterval approach and why RAF is superior here.
State machine thinking — the handleScan function is a pure state transition function: given current status + scan input → produce new status + side effects. This is the same pattern used in Redux reducers, XState, and game engines. You're building the mental model for it here.
Error handling that doesn't crash the demo — every failure path (404, camera denied, off-route) has a graceful fallback. The app never hard-crashes. For demos especially, silent degradation matters more than perfect error reporting.
The QR-as-declaration pattern — understanding that a QR code is not a sensor reading but a user assertion, and why that changes how you handle wrong scans vs. sensor drift in a real positioning system.

End of Day 3 Success Criteria

POST /scan returns correct node data for every QR code in seed data
Camera opens when scan button is tapped on phone
Scanning QR_LOBBY_MAIN anchors location dot on map
Scanning a mid-route checkpoint advances the instruction step
Scanning an off-route checkpoint triggers rerouting
Scanning the destination QR shows the arrived screen
Tapping "Navigate Again" resets the full state
?demo=1 mode shows tappable QR icons on map as fallback
Camera indicator light goes off when scanner is closed

At end of Day 3, the entire navigation loop is functional. Days 4–7 add simulation, offline support, polish, and deployment — but the core product is working today.