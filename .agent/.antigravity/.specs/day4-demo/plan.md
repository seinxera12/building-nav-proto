## Day 4 — Simulation Layer + Instruction Generation Polish

### What Day 4 Actually Is

Days 1–3 built a functional app. The full navigation loop works — scan, route, checkpoint, arrive. But right now demonstrating it requires either physically walking around with a phone or manually tapping QR icons one at a time.

Day 4 builds the **demo engine** — a system that runs the entire navigation journey automatically, with animated movement along the route, scripted QR scans firing at the right moments, and a developer control panel to drive it all.

This is not a user-facing feature. It exists entirely to make stakeholder demos compelling and to let you test the full flow repeatedly without touching a phone.

By end of day you'll have:

- A simulation panel that runs a scripted journey step by step or automatically
- A fake position marker animating smoothly along the route between checkpoints
- Polished human-readable turn instructions generated from graph geometry
- A complete rehearsable demo scenario from lobby to cafeteria
- The app feeling like a live product rather than a prototype

---

### The Core Concept First

The simulation layer sits **outside** the navigation state machine. It doesn't replace it or mock it. It drives it from the outside, exactly like a real user would — by calling `handleScan()`, calling `handleSelectDestination()`, and letting the real state transitions happen.

```
SimulationEngine
      │
      │  calls the same functions a real user would
      ▼
handleScan("QR_LOBBY_MAIN")     ← same as camera scan
handleSelectDestination(12)     ← same as search selection
animateProgress(0, 30, 1200ms)  ← purely visual, no state change
handleScan("QR_ELEV_BANK")      ← same as checkpoint scan
animateProgress(30, 75, 1500ms)
handleScan("QR_CAFETERIA")      ← same as arrival scan
```

This means the simulation is also a **regression test**. If the demo breaks, your state machine broke. They're the same code path.

---

### Step 1 — Fix Instruction Generation First

Before building the simulation, fix the instruction generation on the backend. Right now `compute_turn` uses raw pixel coordinate angles which produces unreliable turn labels on a hand-placed graph. You need to make it robust before the simulation exposes every bad instruction in sequence.

The problem is short edges. When two nodes are close together, the angle computation is noisy — a 15px segment produces wildly different angles than a 150px segment even if they're visually the same corridor. Fix this with a minimum distance threshold and smarter straight-line detection.

```python
# backend/routes/routing.py — replace compute_turn and generate_instructions

import math

def compute_turn(prev: dict, curr: dict, next_: dict) -> str:
    v1x = curr["x"] - prev["x"]
    v1y = curr["y"] - prev["y"]
    v2x = next_["x"] - curr["x"]
    v2y = next_["y"] - curr["y"]

    # If either segment is very short, don't try to compute a turn
    len1 = math.sqrt(v1x**2 + v1y**2)
    len2 = math.sqrt(v2x**2 + v2y**2)
    if len1 < 20 or len2 < 20:
        return "straight"

    # Normalize vectors before computing angle
    v1x, v1y = v1x / len1, v1y / len1
    v2x, v2y = v2x / len2, v2y / len2

    angle = math.degrees(math.atan2(v2y, v2x) - math.atan2(v1y, v1x))
    if angle > 180:  angle -= 360
    if angle < -180: angle += 360

    if abs(angle) < 30:  return "straight"
    if abs(angle) > 150: return "u_turn"
    return "right" if angle > 0 else "left"


def generate_instructions(path: list[int]) -> list[dict]:
    instructions = []
    nodes = nav_graph.nodes

    # Merge consecutive straight segments into one instruction
    pending_distance = 0
    pending_start_node = path[0]

    for i in range(len(path) - 1):
        curr_id = path[i]
        next_id = path[i + 1]
        segment_dist = nav_graph.euclidean_cost(curr_id, next_id)

        if i == 0:
            pending_distance += segment_dist
            continue

        prev_id = path[i - 1]
        turn = compute_turn(nodes[prev_id], nodes[curr_id], nodes[next_id])

        if turn == "straight":
            pending_distance += segment_dist
            continue

        # Emit the accumulated straight segment
        if pending_distance > 0:
            instructions.append({
                "step":     len(instructions) + 1,
                "text":     build_text("straight", nodes[pending_start_node], nodes[curr_id]),
                "distance": round(pending_distance, 1),
                "turn":     "straight",
                "nodeId":   pending_start_node,
            })

        # Emit the turn
        instructions.append({
            "step":     len(instructions) + 1,
            "text":     build_text(turn, nodes[curr_id], nodes[next_id]),
            "distance": round(segment_dist, 1),
            "turn":     turn,
            "nodeId":   curr_id,
        })

        pending_start_node = curr_id
        pending_distance = segment_dist

    # Final segment — arrival
    dest = nodes[path[-1]]
    total_remaining = pending_distance
    instructions.append({
        "step":     len(instructions) + 1,
        "text":     f"Arrive at {dest['label']}",
        "distance": round(total_remaining, 1),
        "turn":     "destination",
        "nodeId":   path[-1],
    })

    return instructions


def build_text(turn: str, curr: dict, next_: dict) -> str:
    templates = {
        "straight":    f"Continue straight toward {next_['label']}",
        "left":        f"Turn left at {curr['label']}",
        "right":       f"Turn right at {curr['label']}",
        "u_turn":      f"Turn around at {curr['label']}",
        "destination": f"Arrive at {curr['label']}",
    }
    return templates.get(turn, f"Continue to {next_['label']}")
```

Verify this manually first:

bash

```bash
curl "http://localhost:8000/route?from_=1&to=12"
```

Read every instruction text out loud. If any of them sound wrong for your floor plan, adjust the node coordinates in `nodes.json`, re-seed, and re-test. Spend 20–30 minutes here. Good instructions are what makes the demo feel real.

---

### Step 2 — Simulation Store

Add simulation state to Zustand separately from navigation state. Keep them cleanly separated — simulation drives navigation, navigation doesn't know about simulation.


```js
// store/useSimStore.js
import { create } from 'zustand'

export const useSimStore = create((set, get) => ({
  // State
  isRunning:    false,
  autoPlay:     false,
  currentStep:  -1,        // -1 = not started
  scenario:     null,      // loaded scenario object
  intervalRef:  null,      // autoplay interval handle

  // Load a scenario
  loadScenario: (scenario) => set({
    scenario,
    currentStep: -1,
    isRunning:   false,
    autoPlay:    false,
  }),

  // Execute next step manually
  nextStep: () => {
    const { scenario, currentStep } = get()
    if (!scenario) return

    const next = currentStep + 1
    if (next >= scenario.steps.length) {
      set({ isRunning: false, autoPlay: false })
      return
    }

    set({ currentStep: next, isRunning: true })
    scenario.steps[next].execute()
  },

  // Autoplay with configurable delay between steps
  startAutoPlay: (delayMs = 2000) => {
    const { nextStep } = get()
    nextStep()   // execute first step immediately

    const ref = setInterval(() => {
      const { currentStep, scenario, autoPlay } = get()
      if (!autoPlay || !scenario) return
      if (currentStep + 1 >= scenario.steps.length) {
        clearInterval(ref)
        set({ autoPlay: false, intervalRef: null })
        return
      }
      nextStep()
    }, delayMs)

    set({ autoPlay: true, intervalRef: ref })
  },

  stopAutoPlay: () => {
    const { intervalRef } = get()
    if (intervalRef) clearInterval(intervalRef)
    set({ autoPlay: false, intervalRef: null })
  },

  reset: () => {
    const { intervalRef } = get()
    if (intervalRef) clearInterval(intervalRef)
    set({ currentStep: -1, isRunning: false, autoPlay: false, intervalRef: null })
  },
}))
```

---

### Step 3 — The Scenario Definition

A scenario is an array of steps. Each step has a label (shown in the panel) and an `execute` function that calls into the real app. The execute functions use the same store actions the real user triggers.


```js
// simulation/scenarios/lobbyToCafeteria.js
import { useNavStore }  from '../../store/useNavStore'
import { useSimStore }  from '../../store/useSimStore'
import { animateProgress } from '../animateProgress'
import { api } from '../../api'

export function buildCafeteriaScenario() {
  // Capture store actions once at scenario build time
  const nav = useNavStore.getState()

  return {
    name: "Lobby → Cafeteria",
    description: "Visitor enters building and navigates to the cafeteria",
    steps: [
      {
        label: "User enters building — scans lobby QR",
        execute: () => nav.handleScan("QR_LOBBY_MAIN"),
      },
      {
        label: "User searches for Cafeteria",
        execute: () => {
          // Simulate search result selection directly
          const dest = Object.values(useNavStore.getState().nodes)
            .find(n => n.label === "Cafeteria")
          if (dest) nav.startRouting(dest.id)
        },
      },
      {
        label: "Route loads — fetching from backend",
        execute: async () => {
          const state  = useNavStore.getState()
          const destId = Object.values(state.nodes).find(n => n.label === "Cafeteria")?.id
          if (!destId) return
          try {
            const route = await api.getRoute(state.currentNodeId, destId)
            state.setRoute(route)
          } catch (e) {
            console.error("Scenario route fetch failed", e)
          }
        },
      },
      {
        label: "Walking east down main corridor...",
        execute: () => animateProgress(0, 35, 1800),
      },
      {
        label: "Scans checkpoint at elevator bank",
        execute: () => useNavStore.getState().handleScan("QR_ELEV_BANK"),
      },
      {
        label: "Turns left — continues south corridor",
        execute: () => animateProgress(35, 65, 1500),
      },
      {
        label: "Approaching cafeteria entrance",
        execute: () => animateProgress(65, 90, 1200),
      },
      {
        label: "Scans cafeteria QR — arrived",
        execute: () => useNavStore.getState().handleScan("QR_CAFETERIA"),
      },
    ],
  }
}
```

---

### Step 4 — The Position Animation

This is the cosmetic layer. It animates a marker smoothly along the route path between checkpoint scans. It does not change any navigation state — it only moves a visual element on the map.

js

```js
// simulation/animateProgress.js
import { useNavStore } from '../store/useNavStore'

let currentAnimation = null

export function animateProgress(fromPct, toPct, durationMs) {
  // Cancel any running animation
  if (currentAnimation) {
    cancelAnimationFrame(currentAnimation)
    currentAnimation = null
  }

  const state = useNavStore.getState()
  const { route, nodes } = state
  if (!route || !nodes) return

  const path       = route.path
  const totalNodes = path.length

  const startIdx = Math.floor((fromPct / 100) * (totalNodes - 1))
  const endIdx   = Math.floor((toPct   / 100) * (totalNodes - 1))
  const segment  = path.slice(startIdx, endIdx + 1)

  if (segment.length < 2) {
    useNavStore.setState({ progress: toPct })
    return
  }

  // Pre-compute cumulative distances along segment
  const dists = [0]
  for (let i = 1; i < segment.length; i++) {
    const n1 = nodes[segment[i - 1]]
    const n2 = nodes[segment[i]]
    const d  = Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2)
    dists.push(dists[i - 1] + d)
  }
  const totalDist = dists.at(-1)

  let startTime = null

  function frame(ts) {
    if (!startTime) startTime = ts
    const elapsed = ts - startTime
    const t       = Math.min(elapsed / durationMs, 1)

    // Ease in-out for natural movement feel
    const eased      = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const targetDist = eased * totalDist

    // Find which segment we're in
    let segIdx = 0
    for (let i = 1; i < dists.length; i++) {
      if (dists[i] >= targetDist) { segIdx = i - 1; break }
      segIdx = i - 1
    }

    const segStart = dists[segIdx]
    const segEnd   = dists[segIdx + 1] ?? dists[segIdx]
    const segLen   = segEnd - segStart
    const segT     = segLen > 0 ? (targetDist - segStart) / segLen : 0

    const n1 = nodes[segment[segIdx]]
    const n2 = nodes[segment[Math.min(segIdx + 1, segment.length - 1)]]

    const interpX = n1.x + (n2.x - n1.x) * segT
    const interpY = n1.y + (n2.y - n1.y) * segT

    // Update animated position and progress bar
    const currentProgress = fromPct + (toPct - fromPct) * eased
    useNavStore.setState({
      animatedPosition: { x: interpX, y: interpY },
      progress: Math.round(currentProgress),
    })

    if (t < 1) {
      currentAnimation = requestAnimationFrame(frame)
    } else {
      currentAnimation = null
    }
  }

  currentAnimation = requestAnimationFrame(frame)
}
```

Add `animatedPosition` to your Zustand nav store initial state:

js

```js
// In useNavStore.js initial state, add:
animatedPosition: null,   // {x, y} — set by animation, null when idle
```

Then in `FloorMap.jsx`, add a second marker that tracks `animatedPosition`:

jsx

```jsx
// In FloorMap.jsx — add this useEffect
const { animatedPosition } = useNavStore()

useEffect(() => {
  const map = mapRef.current
  if (!map) return

  layersRef.current.animMarker?.remove()
  if (!animatedPosition) return

  layersRef.current.animMarker = L.circleMarker(
    [animatedPosition.y, animatedPosition.x],
    {
      radius:      9,
      color:       '#1D4ED8',
      fillColor:   '#BFDBFE',
      fillOpacity: 0.8,
      weight:      2,
    }
  ).addTo(map)

}, [animatedPosition])
```

This gives you two markers during simulation: the blue position dot (last confirmed checkpoint) and the animated ghost dot (simulated walking position between checkpoints). The distinction is actually meaningful — it visually shows the difference between "confirmed location" and "estimated position."

---

### Step 5 — Simulation Panel Component

jsx

```jsx
// components/SimulationPanel.jsx
import { useEffect } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useNavStore }  from '../store/useNavStore'
import { buildCafeteriaScenario } from '../simulation/scenarios/lobbyToCafeteria'

export function SimulationPanel() {
  const {
    scenario, currentStep, isRunning, autoPlay,
    loadScenario, nextStep, startAutoPlay, stopAutoPlay, reset
  } = useSimStore()

  const navReset = useNavStore(s => s.reset)

  // Load scenario on mount
  useEffect(() => {
    loadScenario(buildCafeteriaScenario())
  }, [])

  const handleReset = () => {
    stopAutoPlay()
    reset()
    navReset()
  }

  if (!scenario) return null

  return (
    <div className="absolute top-2 right-2 z-[2000] w-64
                    bg-white/95 backdrop-blur rounded-xl shadow-xl
                    border border-slate-200 overflow-hidden">

      {/* Header */}
      <div className="bg-slate-800 text-white px-3 py-2 flex items-center gap-2">
        <span className="text-xs font-mono">🎬 DEMO</span>
        <span className="text-xs text-slate-400 truncate">{scenario.name}</span>
      </div>

      {/* Step list */}
      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
        {scenario.steps.map((step, i) => (
          <div
            key={i}
            className={`px-3 py-2 text-xs flex items-start gap-2 transition-colors
              ${i === currentStep     ? 'bg-blue-50 text-blue-800 font-medium' : ''}
              ${i  <  currentStep     ? 'text-slate-300'                        : ''}
              ${i  >  currentStep     ? 'text-slate-500'                        : ''}
            `}
          >
            <span className="mt-0.5 shrink-0">
              {i < currentStep  ? '✓' :
               i === currentStep ? '▶' : '○'}
            </span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="px-3 py-2 border-t border-slate-100 flex gap-2">
        {!autoPlay ? (
          <>
            <button
              onClick={nextStep}
              disabled={currentStep >= scenario.steps.length - 1}
              className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1.5
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next ▶
            </button>
            <button
              onClick={() => startAutoPlay(2200)}
              disabled={currentStep >= scenario.steps.length - 1}
              className="flex-1 text-xs bg-slate-700 text-white rounded-lg py-1.5
                         disabled:opacity-40"
            >
              Auto ⏩
            </button>
          </>
        ) : (
          <button
            onClick={stopAutoPlay}
            className="flex-1 text-xs bg-amber-500 text-white rounded-lg py-1.5"
          >
            Pause ⏸
          </button>
        )}
        <button
          onClick={handleReset}
          className="text-xs bg-slate-100 text-slate-600 rounded-lg px-3 py-1.5"
        >
          ↺
        </button>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="px-3 pb-2">
          <div className="w-full bg-slate-100 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(
                  ((currentStep + 1) / scenario.steps.length) * 100
                )}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

Add it to `App.jsx` — only visible in demo mode:

jsx

```jsx
// App.jsx
const isDemoMode = new URLSearchParams(window.location.search).has('demo')

// Inside return, inside the map container div:
{isDemoMode && <SimulationPanel />}
```

---

### Step 6 — Multiple Scenarios

Build a second scenario for the reroute case. This demonstrates the off-route handling which is otherwise hard to show in a live demo.

js

```js
// simulation/scenarios/rerouteDemo.js
export function buildRerouteScenario() {
  return {
    name: "Reroute Demo",
    description: "User takes wrong turn — system recalculates",
    steps: [
      {
        label: "Scan lobby — locate user",
        execute: () => useNavStore.getState().handleScan("QR_LOBBY_MAIN"),
      },
      {
        label: "Select IT Department as destination",
        execute: async () => {
          const state  = useNavStore.getState()
          const dest   = Object.values(state.nodes).find(n => n.label === "IT Department")
          state.startRouting(dest.id)
          const route  = await api.getRoute(state.currentNodeId, dest.id)
          state.setRoute(route)
        },
      },
      {
        label: "Walking — progress to 40%",
        execute: () => animateProgress(0, 40, 1500),
      },
      {
        label: "User scans wrong QR — off route",
        execute: () => useNavStore.getState().handleScan("QR_STAIRWELL_A"),
      },
      {
        label: "System recalculates from new position",
        execute: () => animateProgress(0, 20, 1000),
      },
      {
        label: "User follows new route",
        execute: () => animateProgress(20, 80, 2000),
      },
      {
        label: "Arrives at IT Department",
        execute: () => useNavStore.getState().handleScan("QR_ELEV_BANK"),
      },
    ],
  }
}
```

Add a scenario switcher to the panel header so you can toggle between scenarios during the demo.

---

### Step 7 — Keyboard Shortcuts for Demo Control

When presenting to stakeholders, fumbling with a touchscreen panel mid-demo is awkward. Add keyboard controls so you can drive the simulation with one hand.

js

```js
// hooks/useSimKeyboard.js
import { useEffect } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useNavStore }  from '../store/useNavStore'

export function useSimKeyboard(isDemoMode) {
  useEffect(() => {
    if (!isDemoMode) return

    function onKey(e) {
      const sim = useSimStore.getState()
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault()
          sim.nextStep()
          break
        case 'p':
          sim.autoPlay ? sim.stopAutoPlay() : sim.startAutoPlay(2200)
          break
        case 'r':
          sim.reset()
          useNavStore.getState().reset()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDemoMode])
}
```

Call it in `App.jsx`:

jsx

```jsx
useSimKeyboard(isDemoMode)
```

Now: `Space` or `→` advances one step, `P` toggles autoplay, `R` resets. You can present with just a keyboard.

---

### Verification Sequence

bash

```bash
# 1. Open demo mode
http://localhost:5173?demo=1

# 2. Verify instruction quality first
curl "http://localhost:8000/route?from_=1&to=12"
# Read every instruction text — all should be human-readable

# 3. Manual step-through
# Click "Next" through every step
# Each step: correct thing happens, no console errors

# 4. Autoplay
# Click "Auto" — full journey runs in ~18 seconds
# Position marker animates along route between checkpoints
# Progress bar advances smoothly
# Instructions update at each checkpoint scan
# Arrived screen appears at end

# 5. Reset and run reroute scenario
# Switch to reroute scenario
# Run autoplay — off-route scan triggers recalculating overlay
# New route draws, journey continues

# 6. Keyboard shortcuts
# Space = next step ✓
# P = autoplay ✓
# R = reset ✓

# 7. Non-demo mode still works
# http://localhost:5173 — no simulation panel visible
# Manual QR tap icons still functional
# Real navigation flow unaffected
```

---

### Common Day 4 Mistakes

**Mistake 1: Scenario execute functions capture stale store state** If you write `const nav = useNavStore.getState()` once at scenario build time and close over it, the `nav` object is stale by step 3. Always call `useNavStore.getState()` fresh inside each `execute()` function to get current state.

**Mistake 2: Animation and state machine fighting each other** `animateProgress` only touches `animatedPosition` and `progress` — it must not touch `currentNodeId` or `status`. If it does, it interferes with real checkpoint logic. Keep the animated marker as a purely cosmetic layer.

**Mistake 3: Autoplay interval not cleared on reset** If `intervalRef` is not cleared in `reset()`, the old interval keeps firing after reset, immediately advancing the new scenario before the user wants it to. Always `clearInterval` in reset.

**Mistake 4: Async steps not awaited in autoplay** The autoplay interval fires every 2200ms regardless of whether the previous step's async work finished. If `getRoute` takes 800ms and your autoplay delay is 500ms, steps collide. Either make autoplay delay generous (2000ms+) or make the interval wait for the previous step to resolve before scheduling the next.

**Mistake 5: Simulation panel visible in production** The `?demo=1` guard in `App.jsx` handles this, but double check the panel is completely absent — not just hidden — when `isDemoMode` is false. Stakeholders who get the production URL should never see simulation controls.

---

### What You're Learning on Day 4

**Ease functions for animation** — the difference between linear interpolation (robotic, unnatural) and ease-in-out (natural, human movement feel). The `t < 0.5 ? 2*t*t : -1+(4-2*t)*t` formula is the standard cubic ease-in-out, memorise it.

**Separating simulation from production code** — the entire `simulation/` directory is demo-only infrastructure that drives production code. This is the correct architecture — you're not mocking the state machine, you're operating it. This pattern is also how end-to-end test automation works.

**Polyline interpolation** — computing a smooth position along a multi-segment path using cumulative distance, not just lerping between node indices. This is the same math used in real GPS track smoothing and animation systems.

**Zustand cross-store communication** — `useSimStore` calls actions from `useNavStore`. Stores can read from and call into each other via `getState()`. This is intentional Zustand design — you don't need a single monolithic store.

**Demo engineering as a discipline** — a good demo is not an accident. It's a scripted, rehearsable, controllable system with fallbacks. The keyboard shortcuts, scenario switcher, and reset flow are as important as the animation itself.

---

### End of Day 4 Success Criteria

- `?demo=1` shows simulation panel in top-right corner
- "Next" button steps through scenario one action at a time
- "Auto" runs full journey in ~20 seconds without touching anything
- Position marker animates smoothly along the route between checkpoints
- Progress bar advances in sync with the animation
- Instructions update correctly at each checkpoint step
- Arrived screen appears at the end of the scenario
- Reroute scenario shows recalculating overlay and new route drawing
- `Space`, `P`, `R` keyboard shortcuts all work
- Non-demo mode (`localhost:5173`) shows none of the simulation UI
- All existing QR tap functionality from Day 3 still works unchanged