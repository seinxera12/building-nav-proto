# UI Fix Brief

## Scope

Stop transient warnings and scanner errors from rendering as blocking overlays, and keep navigation flow state intact across step progression.

## Changes

- Route transient nav and scanner messages through `react-hot-toast` instead of a persistent banner.
- Keep selection-mode guidance inside the map selection affordance rather than the global error channel.
- Preserve the existing navigation state machine so `Next`/step progression does not reset the app shell.

## Notes

- `App.jsx` now clears store errors after surfacing them as toasts.
- `useNavStore.js` no longer stores the location-selection hint as a blocking error.
- The old bottom error banner was removed so map, search, and instruction controls stay usable.

## Floor Map Viewport Fix

- Kept the Leaflet floor map at a stable zoom/pan state across navigation steps by fitting bounds only when the floor image changes, not on every store update.
- Added `maxBounds` and `maxBoundsViscosity` so the floor cannot be dragged off-screen into an empty state.
- Added a lightweight `Recenter` control for users who want to return to the full floor view without losing their current context.
- Reused node and QR lookups through memoized maps to reduce repeated linear scans during rendering.
