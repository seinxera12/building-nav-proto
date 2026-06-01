# Day 4 Implementation Notes

## Goal

Add a demo-only simulation layer that drives the real navigation state machine, plus a small backend fix for more reliable turn instruction generation.

## Current State

- Backend already exposes `/map/floor/{id}`, `/route`, `/scan`, and `/event`.
- Frontend already has the day 3 flow: floor map, search, scan modal, instruction panel, arrived screen, and reroute overlay.
- `useNavStore` is the runtime source of truth for navigation state.
- `FloorMap` is Leaflet-based and already supports demo QR tap markers behind `?demo=1`.

## Main Constraint

The simulation must not become a second navigation system.

- It should call existing store actions like `handleScan()` and `selectDestination()`.
- It should only add visual state for the animated ghost marker.
- It must not replace or duplicate the real navigation state machine.

## Implementation Plan

1. Patch backend instruction generation.
   - Keep the existing instruction-to-node mapping so day 3 UI stays compatible.
   - Improve turn detection with a short-segment threshold and normalized vectors.
   - Use cleaner, human-readable instruction text.

2. Tune the seed graph for a better demo path.
   - The current cafeteria route is shortest through the south corridor.
   - To make the scripted demo hit a real QR checkpoint, increase the `2 -> 5` edge cost so the route to Cafeteria prefers the center junction path.
   - After reseeding, verify `/route?from_=1&to=12` includes a checkpoint at node 7 and still arrives correctly at node 12.

3. Add a separate simulation store.
   - Keep simulation state isolated from navigation state.
   - Track scenario, current step, autoplay, and pending execution state.
   - Make autoplay await async steps so route fetches and animations cannot collide.

4. Add a visual-only animation helper.
   - Animate the ghost marker along `route.path`.
   - Update only `animatedPosition` and progress.
   - Clear the ghost marker on reset, scan, or route changes.

5. Add demo scenarios and a panel.
   - Load a lobby-to-cafeteria scenario by default.
   - Add a reroute scenario that intentionally scans an off-route QR.
   - Show the panel only when `?demo=1` is present.

6. Add keyboard shortcuts for demo control.
   - `Space` or `ArrowRight` advances one step.
   - `P` toggles autoplay.
   - `R` resets both simulation and navigation state.

## Runtime Concerns

- Stale store references can break demo steps if actions are captured once and reused. Always read the latest store state inside each step execution.
- Autoplay must not use a naive fixed interval when step work is async.
- Demo animation is cosmetic only. It must never mutate `currentNodeId`, `route`, or `status`.
- Final arrival is two-phase. Animate the last segment first, then switch to `ARRIVED`, otherwise the overlay hides the movement.
- The simulation panel must not render in production mode.

## Verification Targets

- `http://localhost:5173?demo=1` shows the demo panel.
- `http://localhost:5173` does not.
- `curl /route?from_=1&to=12` returns readable instructions and the intended checkpoint path.
- `Next`, `Auto`, `Pause`, and `Reset` all work without console errors.
- The ghost marker animates, then clears cleanly.
- The final manual `Next` animates into the destination and then opens the arrived overlay without requiring a second click.
