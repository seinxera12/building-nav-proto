# Implementation Plan: QR Nav UI Upgrade

## Overview

Upgrade the QR Nav frontend from a basic PNG-overlay map with inline overlays to a professional three-layer architecture with animated navigation visuals, polished floating controls, and a consistent design token system. All changes are visual/component-layer only — the backend, navigation graph, pathfinding, and API contracts remain untouched.

Implementation follows the design's priority order: foundational tokens and layout first, then floor plan rendering, then navigation overlays, then UI controls, then optional enhancements.

## Tasks

- [x] 1. Design tokens and full-screen layout foundation
  - [x] 1.1 Add design token CSS custom properties to `index.css`
    - Add floor-plan color tokens (`--fp-wall`, `--fp-hallway`, `--fp-store`, `--fp-featured-store`, `--fp-wall-inner`)
    - Add navigation overlay tokens (`--nav-route`, `--nav-route-walked`, `--nav-location`, `--nav-location-confirm`, `--nav-destination`)
    - Add UI component tokens (`--ui-fab-qr`, `--ui-fab-recenter`, `--ui-card-bg`, `--ui-card-shadow`)
    - Add radius tokens (`--radius-pill`, `--radius-card`, `--radius-fab`)
    - Add transition tokens (`--floor-fade-out`, `--floor-fade-in`, `--state-crossfade`, `--location-fly-duration`)
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 1.2 Update `App.jsx` and `index.css` for full-screen map layout with floating overlays
    - Map container fills full viewport height (`100dvh`) with `inset: 0`
    - All UI elements (header, floor selector, FABs, instruction card, bottom sheet) positioned as absolute/fixed overlays at z-index 1000
    - Ensure `invalidateSize()` and `minZoom` adjustment on panel show/hide without forced re-centering
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 2. FloorPlanLayer — SVG/PNG rendering with fallback
  - [x] 2.1 Create `src/components/FloorPlanLayer.jsx`
    - Renders SVG as Leaflet ImageOverlay when `map_svg_url` is available on floor data
    - Falls back to existing PNG `imageUrl` when SVG is not available (no error thrown)
    - Fitted to existing CRS.Simple pixel coordinate bounds `[[0, 0], [maxY, maxX]]`
    - Handles SVG load errors gracefully (catches error, logs warning, renders PNG)
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 2.2 Create placeholder SVG floor plan files
    - Create `/assets/floors/floor-{id}.svg` placeholders for each floor using realistic geometry
    - SVG viewBox set to `0 0 {maxX} {maxY}` matching floor bounds
    - Style using design token palette (`#2D2D2D` walls, `#F2F2F2` hallways, `#E8E8E8` rooms, `#CCCCCC` strokes)
    - Include amenity symbols (elevator, stairs, entrance) at positions corresponding to connector nodes
    - _Requirements: 2.3, 2.4, 18.1, 18.2_

  - [x] 2.3 Integrate `FloorPlanLayer` into `FloorMap.jsx`
    - Refactor `FloorMap.jsx` to delegate floor plan rendering to `FloorPlanLayer`
    - Replace the direct `ImageOverlay` with the new component
    - Pass `svgUrl`, `pngUrl`, `bounds`, and `floorId` props
    - Maintain three-layer separation (floor plan visual / navigation graph / live overlay)
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ]* 2.4 Write property test for FloorPlanLayer graceful degradation
    - **Property 1: Layer Graceful Degradation**
    - **Validates: Requirements 2.2, 3.4**

- [x] 3. Floor Selector Widget upgrade with fade transitions
  - [x] 3.1 Update `FloorSelector.jsx` with design-token styling and fade transition
    - White background, rounded pill shape, shadow, backdrop blur per design tokens
    - Active floor button: dark fill, white text, scale(1.05) transform
    - Trigger `switchFloor` action on tap; animate floor plan with fade-out (250ms) / fade-in (300ms)
    - Disable other floor buttons during transition to prevent double-switching
    - Vertical pill positioned on left side of map
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2_

  - [x] 3.2 Add floor plan fade transition logic to `FloorPlanLayer`
    - On `floorId` change: fade out current overlay (250ms), swap source, fade in new overlay (300ms)
    - If navigation is active on new floor, redraw route polyline after fade-in completes
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 3.3 Write property tests for Floor Selector rendering and tap behavior
    - **Property 5: Floor Selector Rendering and Active Highlight**
    - **Property 6: Floor Selector Tap Triggers Switch**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 4. AnimatedRoutePolyline component
  - [x] 4.1 Create `src/components/AnimatedRoutePolyline.jsx`
    - Render walked portion with reduced opacity and dashed style
    - Render remaining portion with full opacity and CSS-animated dash pattern (`stroke-dasharray` with flowing animation)
    - Apply primary navigation color (`--nav-route`) from design tokens
    - Add drop-shadow filter for depth against floor plan
    - Show ghost of previous route during REROUTING status
    - Smooth transition on route recalculation (no snapping)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.2 Integrate `AnimatedRoutePolyline` into `FloorMap.jsx`
    - Replace existing inline Polyline rendering (walked/remaining/active segment/previous route) with the new component
    - Pass `walkedPositions`, `remainingPositions`, `previousRoutePositions`, and `status` props
    - _Requirements: 4.1, 4.2_

  - [ ]* 4.3 Write property test for route segment differentiation
    - **Property 4: Route Polyline Segment Differentiation**
    - **Validates: Requirements 4.2**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. PulsingLocationMarker component
  - [x] 6.1 Create `src/components/PulsingLocationMarker.jsx`
    - DivIcon-based marker with three visual elements: expanding pulse ring, white-bordered outer circle, filled inner circle
    - Pulse ring animation: 2-second cycle, expanding ring in `--nav-location` color
    - Inner dot color: `#1565C0` (or `--nav-location` token)
    - On location update: animate smoothly along route path (ease-in-out interpolation) rather than teleporting
    - On update completion: brief flash to green (`--nav-location-confirm`) for 800ms then return to primary color
    - Render above Route_Polyline and below UI overlay elements
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 17.2, 17.3_

  - [x] 6.2 Integrate `PulsingLocationMarker` into `FloorMap.jsx`
    - Replace existing `CurrentLocationMarker` component with the new DivIcon-based marker
    - Connect to `animatedPosition` state for smooth movement
    - Add `flyTo` with 1.2s duration and ease-out curve on position update
    - _Requirements: 17.1, 17.2_

  - [ ]* 6.3 Write property test for minimum touch target size
    - **Property 11: Minimum Touch Target Size**
    - **Validates: Requirements 14.1**

- [x] 7. FABGroup (QR Scan + Re-Center)
  - [x] 7.1 Create `src/components/FABGroup.jsx`
    - QR scan FAB: teal background (`--ui-fab-qr` / `#00897B`), 50px diameter, QR code icon, drop shadow
    - Re-center FAB: positioned below QR FAB, triggers `flyTo` to current location at fit zoom
    - Scale-down on press (active state) for tactile feedback
    - Conditional visibility: QR FAB hidden when scanner is open OR status is ARRIVED; re-center FAB hidden when no anchored location
    - Positioned on right side of map above bottom sheet
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3_

  - [x] 7.2 Integrate `FABGroup` into `App.jsx`
    - Replace existing inline scan-button with the FAB group
    - Wire QR FAB to open existing scanner overlay
    - Wire re-center FAB to `map.flyTo(currentPosition, fitZoom)`
    - Respect `env(safe-area-inset-*)` for devices with notches
    - _Requirements: 7.3, 8.2, 14.2_

  - [ ]* 7.3 Write property tests for FAB conditional visibility
    - **Property 7: QR FAB Conditional Visibility**
    - **Property 8: Re-Center FAB Conditional Visibility**
    - **Validates: Requirements 7.5, 8.3**

- [x] 8. InstructionCard — floating top-of-map card
  - [x] 8.1 Create `src/components/InstructionCard.jsx`
    - Floating card at top of map during active navigation
    - Displays current turn icon, primary instruction text, and distance to next turn
    - Icon swapped based on turn type (left, right, straight, elevator, stairs, escalator, destination, start)
    - Animate out (fade + slide up) and animate in on step change
    - Hidden with `pointer-events: none` when navigation is not active
    - White background, 18px border-radius, card shadow, 16px primary / 12px secondary font
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.2 Integrate `InstructionCard` into `App.jsx`
    - Subscribe to `currentStep`, `route.instructions`, and `status` from useNavStore
    - Show/hide based on navigation status
    - Pass turn type, instruction text, and distance as props
    - _Requirements: 9.1, 9.4_

  - [ ]* 8.3 Write property tests for InstructionCard
    - **Property 9: Instruction Card Turn Icon Mapping**
    - **Property 10: Instruction Card Conditional Visibility**
    - **Validates: Requirements 9.2, 9.4**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. BottomSheet (idle + navigation states)
  - [x] 10.1 Create `src/components/BottomSheet.jsx`
    - Idle state (ANCHORED): current location name, "Update" button, destination search input, quick-access destination pills
    - Navigation state (NAVIGATING): destination name, distance/time estimate, checkpoint info, action buttons ("I've reached X", "I'm lost / Re-anchor"), "Exit" button
    - Crossfade between idle and navigation states (200ms transition)
    - Positioned as absolute overlay above map (not pushing map), rounded top border-radius, shadow, drag handle
    - Map container applies bottom padding equal to BottomSheet height
    - Respect `env(safe-area-inset-bottom)` for notched devices
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3_

  - [x] 10.2 Integrate `BottomSheet` into `App.jsx` replacing/augmenting `InstructionPanel`
    - Wire idle-state actions: update location (opens scanner/picker), search destinations
    - Wire navigation-state actions: "I've reached X" → `advanceStep`, "I'm lost" → re-anchor flow, "Exit" → `cancelNavigation`
    - Connect to existing Zustand store selectors for status, location, destination, progress
    - _Requirements: 10.1, 11.1, 11.3, 16.1, 16.4_

  - [ ]* 10.3 Write unit tests for BottomSheet state transitions
    - Test idle content renders for ANCHORED status
    - Test navigation content renders for NAVIGATING status
    - Test crossfade transition class toggling
    - _Requirements: 10.1, 11.1, 11.2_

- [x] 11. GeoJSON interactive spaces (optional enhancement)
  - [x] 11.1 Create `src/components/GeoJSONSpaces.jsx`
    - Render named spaces as styled polygons on top of SVG floor plan when GeoJSON data is available
    - Display permanent centered tooltip with room name for each polygon with `name` property
    - On tap of polygon with `nodeId` property: invoke `selectDestination(nodeId)`
    - Render nothing (no error) if GeoJSON data is unavailable
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 11.2 Integrate `GeoJSONSpaces` into `FloorMap.jsx`
    - Load optional per-floor GeoJSON from `/assets/geojson/floor-{id}.json`
    - Pass data and `onSelectDestination` handler to component
    - Handle load failures gracefully (component renders nothing)
    - _Requirements: 3.1, 3.4_

  - [ ]* 11.3 Write property tests for GeoJSON interactions
    - **Property 2: GeoJSON Polygon Tap Invokes Navigation**
    - **Property 3: GeoJSON Tooltip Displays Room Name**
    - **Validates: Requirements 3.2, 3.3**

- [x] 12. Navigation graph debug layer (Layer 1 separation)
  - [x] 12.1 Ensure debug nodes/edges only visible with `?debug` URL parameter
    - Verify existing debug-mode rendering is isolated to Layer 1
    - Nodes and edges hidden in production (no `?debug` param)
    - Layer 1 remains completely independent from Layer 0 and Layer 2
    - _Requirements: 1.3, 1.4_

- [x] 13. Preserved navigation behavior verification
  - [x] 13.1 Verify no regressions to existing navigation flows
    - State machine (UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED → ANCHORED) unchanged
    - `advanceStep`, `beginNavigation`, `cancelNavigation`, `completeNavigation` actions functionally identical
    - QR scan during navigation continues to reroute via `anchorLocation`
    - No backend/API contract modifications
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 14. Mobile-first responsive polish
  - [x] 14.1 Ensure all interactive elements meet 42px minimum touch target
    - Audit FABs, floor selector buttons, bottom sheet buttons, instruction card elements
    - Apply `env(safe-area-inset-*)` to BottomSheet, FABs, Floor Selector
    - Verify layout remains functional at viewport widths > 768px without separate desktop redesign
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 15. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Developer handoff documentation
  - [ ] 16.1 Create `DEVELOPER-HANDOFF.md` in project root
    - Document asset pipeline: SVG viewBox dimensions, coordinate alignment, naming conventions for replacing placeholders
    - Document GeoJSON schema expected by `GeoJSONSpaces` component (property names: `type`, `name`, `nodeId`)
    - Specify file paths expected by code (`/assets/floors/floor-{id}.svg`, `/assets/geojson/floor-{id}.json`)
    - List new dependencies added (if any, e.g., `fast-check` for property tests)
    - Document what was changed vs. placeholder, and what was intentionally NOT touched (backend, pathfinding, data schemas)
    - _Requirements: 18.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (11 properties total)
- Unit tests validate specific examples and edge cases
- The backend (Python/FastAPI), navigation graph, pathfinding algorithm, and all API contracts remain unchanged throughout
- Design tokens are foundational — Task 1 must complete before other tasks can reference token variables
