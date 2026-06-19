# Bugfix Requirements Document

## Introduction

The `qr-nav-ui-upgrade` spec was partially implemented to move the QR Nav frontend from a basic PNG-overlay map to a polished three-layer architecture with animated overlays, a floating bottom sheet, floating action buttons, a floor selector, and an instruction card. The implementation is incomplete and has introduced a set of UI, navigation, rendering, and state-management regressions: floor switching renders incorrectly, the bottom sheet behaves as a static full overlay instead of a draggable slider, two location overlays still use the legacy entry UI, a legacy top bar with obsolete controls remains, "Begin Navigation" does not sync the viewport, floating action buttons are obscured or gated incorrectly, and the location-update animation visually drags the entire map (and its POI markers) along with the moving location dot.

This document captures the bug conditions for each known regression so they can be systematically validated (fix checking) and so that working behavior is preserved (preservation checking). It defines what currently happens, what should happen, and what must remain unchanged. It does not define the audit methodology, root-cause analysis, technical design, or implementation plan — those belong to the design and tasks phases.

The regressions below are grounded in the current implementation:
- `frontend/src/App.jsx` — app shell, header (`app-header` + `LocationBar`), FAB wiring, overlay state (`updatePromptOpen`, `EntryPrompt`).
- `frontend/src/components/FloorMap.jsx` — Leaflet map, floor-plan layer, route polyline split, `FlyToPosition`, position animation loop.
- `frontend/src/components/FloorPlanLayer.jsx` — SVG/PNG overlay with fade transition on `floorId` change.
- `frontend/src/components/BottomSheet.jsx` — idle/preview/navigation bottom sheet (drag handle is visual only).
- `frontend/src/components/FABGroup.jsx`, `LocationBar.jsx`, `EntryPrompt.jsx`, `FloorSelector.jsx`, `PulsingLocationMarker.jsx`.
- `frontend/src/store/useNavStore.js` — Zustand state machine and actions (`beginNavigation`, `switchFloor`, `updateLocation`, `advanceStep`).

## Bug Analysis

### Current Behavior (Defect)

Floor rendering and floor switching:

1.1 WHEN the user switches floors (e.g., Floor 1 ↔ Floor 2) via the Floor_Selector_Widget THEN the system renders correctly only for the initially loaded floor and the newly selected floor's plan, markers, and overlays do not render correctly.

1.2 WHEN a floor switch occurs during route generation, active navigation, or a location update THEN the system fails to redraw the route polyline, location marker, and POI/QR markers consistently for the now-visible floor.

1.3 WHEN floor data transitions between absent and present (e.g., during load or switch) THEN the system executes a React hook (`useRef`/`handleHasSaved`) after an early `return null` in `FloorMap`, producing unstable render behavior that can corrupt floor-switch rendering.

Bottom sheet behavior:

1.4 WHEN the Bottom_Sheet is displayed THEN the system renders it as a large fixed overlay with a non-interactive drag handle, and it cannot be dragged, snapped to height states, or collapsed/expanded by the user.

1.5 WHILE the navigation state first becomes active THEN the Bottom_Sheet (initial navigation state) occupies excessive screen space, obscuring the map.

Stale/legacy overlays:

1.6 WHEN the user opens the "Update location" overlay THEN the system displays the legacy `EntryPrompt` UI rather than the upgraded UI.

1.7 WHEN the app needs the user's starting location ("Where are you?") THEN the system displays the legacy `EntryPrompt` UI rather than the upgraded UI.

Legacy top bar and navigation-state reflection:

1.8 WHILE the app is running THEN the system renders the legacy top bar (`app-header` + `LocationBar`) containing obsolete controls, including a redundant "Update" button that duplicates the Bottom_Sheet's update action.

1.9 WHEN the navigation status changes (UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED) THEN the legacy top bar does not reflect the current navigation state correctly.

Begin Navigation viewport synchronization:

1.10 WHEN the user taps "Begin Navigation" THEN the system does not immediately synchronize the map viewport/camera and floor to the correct starting floor and position.

Floating action button accessibility:

1.11 WHILE the Bottom_Sheet is in certain (expanded/large) states THEN the QR button and Reset/Re-center view button are obscured or inaccessible behind the sheet, and safe-area insets and minimum touch targets are not reliably respected.

1.12 WHILE the app is not in demo mode THEN the QR scan FAB is gated off entirely (its visibility requires demo mode), so users cannot re-anchor via the QR FAB during normal use.

Location-update animation coupling:

1.13 WHEN the user's location updates (via QR scan or manual selection) and the location dot animates to the new position THEN the system pans the entire map in lockstep with the location animation, causing POI markers to visually move and temporarily misalign relative to the floor plan (camera tracking is coupled to the location animation).

### Expected Behavior (Correct)

Floor rendering and floor switching:

2.1 WHEN the user switches floors (Floor 1 ↔ Floor 2) via the Floor_Selector_Widget THEN the system SHALL correctly render the selected floor's plan, markers, and overlays for every floor, not only the initially loaded floor.

2.2 WHEN a floor switch occurs during route generation, active navigation, or a location update THEN the system SHALL redraw the route polyline, location marker, and POI/QR markers consistently for the now-visible floor.

2.3 WHEN floor data transitions between absent and present THEN the system SHALL invoke all React hooks unconditionally (no hooks after an early return) so that floor-switch rendering is stable.

Bottom sheet behavior:

2.4 WHEN the Bottom_Sheet is displayed THEN the system SHALL behave as a draggable slider that responds to drag gestures and supports defined snap/height states (e.g., collapsed and expanded).

2.5 WHILE the navigation state first becomes active THEN the Bottom_Sheet SHALL occupy a compact, appropriate amount of screen space that preserves map visibility.

Stale/legacy overlays:

2.6 WHEN the user opens the "Update location" overlay THEN the system SHALL display the upgraded location-update UI consistent with the new design system.

2.7 WHEN the app needs the user's starting location ("Where are you?") THEN the system SHALL display the upgraded entry UI consistent with the new design system.

Legacy top bar and navigation-state reflection:

2.8 WHILE the app is running THEN the system SHALL remove the obsolete top-bar controls (including the redundant "Update" button) so that location-update actions are not duplicated.

2.9 WHEN the navigation status changes THEN the surviving header/status surface SHALL reflect the current navigation state correctly.

Begin Navigation viewport synchronization:

2.10 WHEN the user taps "Begin Navigation" THEN the system SHALL immediately synchronize the map viewport/camera and floor to the correct starting floor and position.

Floating action button accessibility:

2.11 WHILE the Bottom_Sheet is in any state THEN the QR button and Reset/Re-center view button SHALL remain visible, tappable, and positioned above the sheet, respecting safe-area insets and a minimum 42px touch target.

2.12 WHILE the app is in normal (non-demo) use AND the user has a context where re-anchoring is valid THEN the QR scan FAB SHALL be available so the user can re-anchor via QR.

Location-update animation coupling:

2.13 WHEN the user's location updates and the location dot animates to the new position THEN the system SHALL animate the location dot smoothly without dragging the entire map in lockstep, so that POI markers and the floor plan remain visually stable and aligned (camera tracking decoupled from the location animation).

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the navigation state machine transitions occur (UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED → ANCHORED) THEN the system SHALL CONTINUE TO use the existing Zustand store actions (`beginNavigation`, `advanceStep`, `cancelNavigation`, `completeNavigation`, `anchorLocation`, `selectDestination`) without changes to their semantics.

3.2 WHEN a route is requested or recalculated THEN the system SHALL CONTINUE TO use the existing backend pathfinding, node/edge schemas, and API contracts unchanged.

3.3 WHEN the user remains on a single floor and does not switch floors THEN the system SHALL CONTINUE TO render that floor's plan, route polyline, location marker, and POI/QR markers correctly.

3.4 WHEN a QR code is scanned during navigation THEN the system SHALL CONTINUE TO reroute via the existing `anchorLocation`/`updateLocation` flow.

3.5 WHEN the Floor_Selector_Widget is shown with more than one loaded floor THEN the system SHALL CONTINUE TO list one button per floor and highlight the active floor.

3.6 WHEN navigation is active THEN the system SHALL CONTINUE TO display the Instruction_Card with the correct turn icon, instruction text, and distance for the current step.

3.7 WHEN the location marker is shown THEN the system SHALL CONTINUE TO render the three-layer pulsing marker and the green confirmation flash on update completion.

3.8 WHEN the user re-centers via the Re-center FAB or "Fit" control THEN the system SHALL CONTINUE TO fly the map to the current anchored position at the computed fit zoom.
