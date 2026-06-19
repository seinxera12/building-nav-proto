# Requirements Document

## Introduction

The QR Nav UI Upgrade replaces the current basic floor-plan rendering (a static PNG image overlay) with a professional three-layer visual architecture, adds animated navigation overlays, and introduces polished UI controls (floor selector widget, floating action buttons, instruction cards, bottom-sheet states). The upgrade targets the visual/CSS/component layer only — the backend navigation graph, pathfinding algorithms, node/edge data schemas, and API contracts remain unchanged.

The application is a React/Vite frontend using Leaflet.js (CRS.Simple with pixel coordinates), Zustand for state management, and a Python/FastAPI backend. The app supports multi-floor navigation with QR-code-based location anchoring.

## Glossary

- **Map_Container**: The Leaflet.js MapContainer component that renders the indoor floor plan and all overlay layers using CRS.Simple (pixel coordinates where Y is inverted).
- **Floor_Plan_Layer**: The base visual layer (Layer 0) displaying building geometry — walls, rooms, corridors, and amenity icons — rendered as an SVG image overlay or GeoJSON polygons.
- **Navigation_Graph_Layer**: The logical layer (Layer 1) containing nodes and edges used for pathfinding; invisible in production, shown only in debug mode.
- **Live_Overlay_Layer**: The interactive layer (Layer 2) showing the current location marker, animated route polyline, and destination marker during navigation.
- **Floor_Selector_Widget**: A vertical pill-shaped control overlaid on the map that allows users to switch between building floors.
- **Location_Marker**: The pulsing animated dot indicating the user's current anchored position on the map.
- **Route_Polyline**: The animated dashed line drawn on the map representing the computed navigation path from origin to destination.
- **Instruction_Card**: A floating card overlay displaying the current turn-by-turn navigation step with icon, text, and distance.
- **Bottom_Sheet**: A bottom-anchored panel that displays idle-state location info or active-navigation progress depending on the app state.
- **FAB**: A floating action button positioned on the map for quick access to QR scanning or re-centering.
- **SVG_Floor_Plan**: A pre-designed SVG file representing one floor's building shell (walls, corridors, amenity symbols) fitted to the Leaflet CRS.Simple coordinate bounds.
- **GeoJSON_Spaces**: Interactive room/store polygons rendered as a GeoJSON layer on top of the SVG shell, linking named spaces to navigation graph nodes via `nodeId`.
- **Design_Tokens**: Standardized CSS custom properties defining colors, spacing, typography, and radii used consistently across all UI components.

## Requirements

### Requirement 1: Three-Layer Map Architecture Separation

**User Story:** As a developer, I want the map rendering separated into three discrete layers (floor plan visual, navigation graph, live overlay), so that visual upgrades never require touching navigation logic.

#### Acceptance Criteria

1. THE Map_Container SHALL render exactly three conceptual layers: Floor_Plan_Layer at z-index bottom, Navigation_Graph_Layer in the middle, and Live_Overlay_Layer on top.
2. WHEN the Floor_Plan_Layer is replaced or updated, THE Navigation_Graph_Layer and Live_Overlay_Layer SHALL continue to function without modification.
3. THE Navigation_Graph_Layer SHALL display nodes and edges only WHILE a debug query parameter is present in the URL.
4. THE Live_Overlay_Layer SHALL render the Location_Marker, Route_Polyline, and destination marker above all other layers.

### Requirement 2: SVG Floor Plan Rendering

**User Story:** As a user, I want to see a professional-quality building floor plan instead of a basic PNG image, so that I can visually orient myself within the building.

#### Acceptance Criteria

1. THE Map_Container SHALL load a per-floor SVG file as a Leaflet image overlay fitted to the existing CRS.Simple pixel coordinate bounds (matching the current `bounds.maxX` and `bounds.maxY` values from floor data).
2. WHEN the SVG floor plan file is not available for a floor, THE Map_Container SHALL fall back to the existing PNG image overlay without error.
3. THE SVG_Floor_Plan SHALL use the design token color palette: `#2D2D2D` for outer walls, `#F2F2F2` for hallway fills, `#E8E8E8` for room fills, and `#CCCCCC` for room boundary strokes.
4. THE SVG_Floor_Plan SHALL include amenity symbols (elevator, stairs, entrance) at positions corresponding to the navigation graph's connector nodes.
5. THE Floor_Plan_Layer SHALL accept the SVG overlay without requiring changes to node coordinates, edge definitions, or the pathfinding algorithm.

### Requirement 3: GeoJSON Interactive Spaces (Optional Enhancement)

**User Story:** As a user, I want to tap on a named room or store on the floor plan to navigate there directly, so that I do not need to use the search bar for visible destinations.

#### Acceptance Criteria

1. WHERE GeoJSON room polygon data is available, THE Map_Container SHALL render named spaces as styled polygons on top of the SVG_Floor_Plan.
2. WHEN a user taps a GeoJSON polygon that has a `nodeId` property, THE system SHALL invoke the existing `selectDestination` action with that node ID.
3. THE GeoJSON_Spaces layer SHALL display a permanent centered tooltip showing the room name for each polygon with a `name` property.
4. IF GeoJSON data is not available for a floor, THEN THE Map_Container SHALL render only the SVG_Floor_Plan without error.

### Requirement 4: Animated Route Polyline

**User Story:** As a user navigating through the building, I want to see an animated flowing route line on the map, so that the direction of travel is visually obvious.

#### Acceptance Criteria

1. WHILE navigation is active, THE Route_Polyline SHALL render with a CSS-animated dash pattern (stroke-dasharray with flowing animation) in the primary navigation color (`#2196F3` or the existing indigo accent).
2. THE Route_Polyline SHALL visually differentiate the walked portion (dimmed/dotted) from the remaining portion (bright/animated).
3. THE Route_Polyline SHALL include a drop-shadow filter to provide depth against the floor plan.
4. WHEN a route is recalculated, THE Route_Polyline SHALL transition smoothly rather than snapping to the new path.

### Requirement 5: Pulsing Location Marker

**User Story:** As a user, I want my current location shown as an animated pulsing dot, so that I can easily distinguish it from static map elements.

#### Acceptance Criteria

1. WHEN the user's location is anchored, THE Location_Marker SHALL render as a pulsing blue dot with an expanding ring animation (2-second cycle).
2. THE Location_Marker SHALL consist of three visual elements: an outer expanding pulse ring, a white-bordered outer circle, and a filled inner circle in the primary location color (`#1565C0` or the existing `--accent-indigo`).
3. WHEN the user's location updates to a new node, THE Location_Marker SHALL animate smoothly along the route path to the new position rather than teleporting.
4. THE Location_Marker SHALL render above the Route_Polyline and below UI overlay elements.

### Requirement 6: Floor Selector Widget

**User Story:** As a user in a multi-floor building, I want a compact floor selector on the map, so that I can switch floors without navigating away from the map view.

#### Acceptance Criteria

1. WHILE more than one floor is loaded, THE Floor_Selector_Widget SHALL display as a vertical pill on the left side of the map with one button per floor.
2. THE Floor_Selector_Widget SHALL highlight the active floor button with a distinct background (dark fill, white text) and scale transform.
3. WHEN a user taps a floor button, THE Floor_Selector_Widget SHALL trigger the existing `switchFloor` action and animate the floor plan transition with a fade-out/fade-in effect (250ms out, 300ms in).
4. WHILE the floor is switching, THE Floor_Selector_Widget SHALL disable other floor buttons to prevent rapid double-switching.
5. THE Floor_Selector_Widget SHALL use a white background with rounded corners, shadow, and backdrop blur matching the UI direction guide's design tokens.

### Requirement 7: QR Scan Floating Action Button

**User Story:** As a user, I want a prominent QR scan button always accessible on the map, so that I can quickly re-anchor my location at any time.

#### Acceptance Criteria

1. THE FAB for QR scanning SHALL be positioned on the right side of the map above the bottom sheet.
2. THE FAB SHALL display a QR code icon on a teal (`#00897B`) circular background with 50px diameter and drop shadow.
3. WHEN the user taps the QR FAB, THE system SHALL open the existing QR scanner overlay.
4. THE FAB SHALL scale down on press (active state) to provide tactile feedback.
5. WHILE the QR scanner is open or navigation status is ARRIVED, THE FAB SHALL be hidden.

### Requirement 8: Re-Center Map FAB

**User Story:** As a user who has panned away from my location, I want a button to snap the map back to my current position, so that I can quickly re-orient myself.

#### Acceptance Criteria

1. THE re-center FAB SHALL be positioned below or adjacent to the QR scan FAB.
2. WHEN the user taps the re-center FAB, THE Map_Container SHALL animate (flyTo) to center on the current Location_Marker position at the computed fit zoom level.
3. IF the user has no anchored location, THEN THE re-center FAB SHALL be hidden or disabled.

### Requirement 9: Navigation Instruction Card

**User Story:** As a user following turn-by-turn directions, I want a floating instruction card at the top of the map showing my current step, so that I can see directions without looking at the bottom panel.

#### Acceptance Criteria

1. WHILE navigation is active, THE Instruction_Card SHALL display at the top of the map with the current turn icon, primary instruction text, and distance to the next turn.
2. THE Instruction_Card SHALL swap its icon based on the step's turn type (left arrow, right arrow, straight arrow, elevator, stairs, destination flag).
3. WHEN the navigation step advances, THE Instruction_Card SHALL animate out (fade + slide up) and then animate in with the new instruction content.
4. WHILE navigation is not active, THE Instruction_Card SHALL be hidden with `pointer-events: none`.
5. THE Instruction_Card SHALL use a white background with 18px border-radius, 6px–20px card shadow, and the design token font sizes (16px primary, 12px secondary).

### Requirement 10: Bottom Sheet Idle State

**User Story:** As a user with a set location but no active navigation, I want the bottom sheet to show my current location and a search bar, so that I can easily start navigating somewhere.

#### Acceptance Criteria

1. WHILE the navigation status is ANCHORED, THE Bottom_Sheet SHALL display the user's current location name, an "Update" button, a destination search input, and quick-access destination pills.
2. THE Bottom_Sheet SHALL float above the map as an absolute overlay (not pushing the map container) with a rounded top border-radius and shadow.
3. THE Bottom_Sheet SHALL include a drag handle at the top for visual affordance.
4. THE Map_Container SHALL apply bottom padding equal to the Bottom_Sheet height so that route lines and markers are not hidden behind it.

### Requirement 11: Bottom Sheet Navigation State

**User Story:** As a user actively navigating, I want the bottom sheet to show my destination, progress, and action buttons, so that I can confirm checkpoints and signal if I am lost.

#### Acceptance Criteria

1. WHILE the navigation status is NAVIGATING, THE Bottom_Sheet SHALL display the destination name, distance/time estimate, current checkpoint info, and action buttons ("I've reached X", "I'm lost / Re-anchor").
2. WHEN the state transitions between idle and navigating, THE Bottom_Sheet SHALL crossfade between the two content states with a 200ms transition.
3. THE Bottom_Sheet SHALL include an "Exit" button that triggers the existing `cancelNavigation` action.

### Requirement 12: Full-Screen Map Layout

**User Story:** As a mobile user, I want the map to fill my entire screen with UI elements floating above it, so that I have maximum map visibility for orientation.

#### Acceptance Criteria

1. THE Map_Container SHALL fill the full viewport height (using `100dvh` for mobile safety) with the map positioned at `inset: 0`.
2. THE app header, Floor_Selector_Widget, FAB buttons, Instruction_Card, and Bottom_Sheet SHALL all be positioned as absolute/fixed overlays above the map at z-index 1000.
3. WHEN the bottom panel slides in or out, THE Map_Container SHALL call `invalidateSize()` and adjust `minZoom` without forcibly re-centering the user's viewport.

### Requirement 13: Design Token Consistency

**User Story:** As a developer, I want all new UI components to use a shared set of CSS design tokens, so that the visual language is consistent and maintainable.

#### Acceptance Criteria

1. THE application stylesheet SHALL define CSS custom properties for all color, spacing, typography, radius, and shadow values used by the upgrade components.
2. THE design tokens SHALL include floor-plan colors (wall, hallway, store, featured), navigation colors (route, location, destination), and UI component colors (surface, primary, teal, red).
3. WHEN a design token value is changed, all components referencing that token SHALL update automatically without per-component CSS edits.

### Requirement 14: Mobile-First Responsive Layout

**User Story:** As a mobile user, I want the interface optimized for touch interaction on small screens, while still being usable on desktop during development, so that the primary mobile audience has the best experience.

#### Acceptance Criteria

1. THE interface layout SHALL be designed mobile-first with touch targets of at least 42px minimum dimension for all interactive elements.
2. THE Bottom_Sheet, FABs, and Floor_Selector_Widget SHALL respect `env(safe-area-inset-*)` values for devices with notches or rounded corners.
3. WHILE the viewport width exceeds 768px, THE layout SHALL remain functional and visually appropriate without requiring a separate desktop redesign.

### Requirement 15: Floor Plan Transition Animation

**User Story:** As a user switching between floors, I want a smooth visual transition rather than an abrupt swap, so that the context change feels deliberate and polished.

#### Acceptance Criteria

1. WHEN the user switches floors via the Floor_Selector_Widget, THE current floor plan overlay SHALL fade out over 250ms before being removed.
2. WHEN the new floor plan overlay is added, THE Map_Container SHALL fade it in over 300ms.
3. IF navigation is active on the new floor, THEN THE Route_Polyline SHALL redraw for the visible floor segment after the floor plan fade-in completes.

### Requirement 16: Preserved Navigation Behavior

**User Story:** As a product owner, I want all existing navigation flows (route computation, step advancement, rerouting, arrival, QR scanning) to continue working exactly as before, so that the UI upgrade introduces zero functional regressions.

#### Acceptance Criteria

1. THE upgrade SHALL NOT modify the Zustand navigation store's state machine (UNLOCATED → ANCHORED → ROUTE_PREVIEW → NAVIGATING → ARRIVED → ANCHORED).
2. THE upgrade SHALL NOT modify the backend pathfinding algorithm, node/edge schemas, or API contracts.
3. WHEN a QR code is scanned during navigation, THE system SHALL continue to reroute using the existing `anchorLocation` action without change.
4. THE `advanceStep`, `beginNavigation`, `cancelNavigation`, and `completeNavigation` store actions SHALL remain functionally identical after the upgrade.

### Requirement 17: Smooth Location Update Animation

**User Story:** As a user who re-anchors via QR scan, I want the map and my location marker to glide smoothly to the new position, so that I maintain spatial awareness during the update.

#### Acceptance Criteria

1. WHEN the user's position is updated (via QR scan or manual selection), THE Map_Container SHALL use Leaflet's `flyTo` with a 1.2-second duration and ease-out curve to pan to the new coordinates.
2. WHEN the Location_Marker moves to a new position, THE marker SHALL animate along intervening route path nodes using the existing `animatedPosition` state with ease-in-out interpolation.
3. WHEN the location update completes, THE Location_Marker inner dot SHALL briefly flash a confirmation color (green) for 800ms before returning to the primary location color.

### Requirement 18: Placeholder Asset Pipeline

**User Story:** As a developer, I want clearly labeled placeholder floor plan SVGs included so that the visual pipeline can be tested end-to-end, with clear documentation on how to swap in production assets.

#### Acceptance Criteria

1. THE implementation SHALL include placeholder SVG floor plan files for each floor that use realistic (non-rectangular) geometry styled per the design token palette.
2. THE placeholder SVGs SHALL be stored at a documented path (e.g., `/assets/floors/floor-{id}.svg`) that the code references.
3. THE developer handoff documentation SHALL specify the exact SVG viewBox dimensions, coordinate alignment requirements, and naming conventions needed to replace placeholders with production art.
