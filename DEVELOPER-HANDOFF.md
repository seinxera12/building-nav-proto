# Developer Handoff: QR Nav UI Upgrade

## Overview

This document provides handoff information for the QR Nav UI Upgrade — a visual/component-layer enhancement to the QR Nav indoor navigation app.

## What Was Changed vs. Not Changed

| Area | Status | Notes |
|------|--------|-------|
| **Frontend Components** | ✅ CHANGED | New components: FloorPlanLayer, GeoJSONSpaces, AnimatedRoutePolyline, PulsingLocationMarker, FABGroup, InstructionCard, BottomSheet |
| **Backend (Python/FastAPI)** | ❌ UNCHANGED | No changes to API endpoints, pathfinding, or data schemas |
| **Navigation Graph** | ❌ UNCHANGED | Nodes/edges schemas, Dijkstra pathfinding algorithm unchanged |
| **Zustand Store** | ❌ UNCHANGED | State machine and actions (advanceStep, cancelNavigation, etc.) unchanged |
| **API Contracts** | ❌ UNCHANGED | All API endpoints and response formats unchanged |
| **Floor Selector Widget** | ✅ CHANGED | Updated styling with design tokens, fade transition logic |

## Asset Pipeline

### SVG Floor Plan Files

- **Location:** `frontend/public/assets/floors/floor-{id}.svg`
- **Files:**
  - `frontend/public/assets/floors/floor-1.svg` (Ground Floor)
  - `frontend/public/assets/floors/floor-2.svg` (Second Floor)
- **ViewBox Format:** `0 0 {maxX} {maxY}` (matching floor bounds from backend)
  - Floor 1: `0 0 2000 1400`
  - Floor 2: `0 0 1200 800`
- **Coordinate System:** Pixel coordinates, Y increases downward (matches node data)
- **Style Palette:**
  - Walls: `#2D2D2D` (stroke)
  - Hallways: `#F2F2F2` (fill)
  - Rooms: `#E8E8E8` (fill), `#CCCCCC` (stroke)
- **Amenity Symbols:** Elevator, stairs, entrance icons at connector node positions

**To Replace Placeholders:**
1. Export floor plan artwork as SVG with matching viewBox dimensions
2. Place in `frontend/public/assets/floors/floor-{id}.svg`
3. Update backend `floor.map_svg_url` to point to the new SVG path

### GeoJSON Spaces

- **Location:** `frontend/public/assets/geojson/floor-{id}.json`
- **Schema:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "type": "room",
        "name": "Conference Room A",
        "nodeId": 9
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[x1, y1], [x2, y2], ...]]
      }
    }
  ]
}
```
- **Required Properties:** `type`, `name`, `nodeId`
- **nodeId:** Links to navigation graph node for click-to-navigate

## New Dependencies

- **fast-check** (optional): For property-based tests (not required for MVP)
- Install: `npm install --save-dev fast-check`

## New Component API

### FloorPlanLayer
```jsx
<FloorPlanLayer
  svgUrl={floor.map_svg_url || null}
  pngUrl={floor.imageUrl}
  bounds={[[0, 0], [maxY, maxX]]}
  floorId={floor.floorId}
/>
```

### GeoJSONSpaces
```jsx
<GeoJSONSpaces
  geojsonData={geojsonData}
  onSelectDestination={(nodeId) => selectDestination(nodeId)}
/>
```

### AnimatedRoutePolyline
```jsx
<AnimatedRoutePolyline
  walkedPositions={walkedPositions}
  remainingPositions={remainingPositions}
  previousRoutePositions={previousRoutePositions}
  status={status}
/>
```

### PulsingLocationMarker
```jsx
<PulsingLocationMarker
  position={position}
  isUpdating={isUpdating}
/>
```

### FABGroup
```jsx
<FABGroup
  showQR={true}
  showRecenter={true}
  onQRScan={() => setScannerOpen(true)}
  onRecenter={() => dispatchRecenterEvent()}
/>
```

### InstructionCard
```jsx
<InstructionCard
  visible={visible}
  turnType={turnType}
  primaryText={primaryText}
  secondaryText={secondaryText}
  distance={distance}
  onStepChange={currentStep}
/>
```

### BottomSheet
```jsx
<BottomSheet
  status={status}
  locationName={locationName}
  destinationName={destinationName}
  distanceLabel={distanceLabel}
  stepInfo={stepInfo}
  onUpdateLocation={onUpdateLocation}
  onExit={onExit}
  onReached={onReached}
  onLost={onLost}
/>
```

## CSS Design Tokens

All design tokens are defined in `frontend/src/index.css` under `:root`:

- Floor-plan colors: `--fp-wall`, `--fp-hallway`, `--fp-store`, etc.
- Navigation colors: `--nav-route`, `--nav-location`, etc.
- UI component colors: `--ui-fab-qr`, `--ui-card-bg`, etc.
- Radii: `--radius-pill`, `--radius-card`, `--radius-fab`
- Transitions: `--floor-fade-out`, `--floor-fade-in`, etc.

Use these tokens in any new component CSS for consistency.

## Testing

### Unit Tests
Run: `npm test`

### Property Tests (Optional)
Property tests use `fast-check` and validate:
1. Layer Graceful Degradation (SVG → PNG fallback)
2. GeoJSON Polygon Tap → Navigation
3. GeoJSON Tooltip Displays Room Name
4. Route Polyline Segment Differentiation
5. Floor Selector Rendering and Active Highlight
6. Floor Selector Tap Triggers Switch
7. QR FAB Conditional Visibility
8. Re-center FAB Conditional Visibility
9. Instruction Card Turn Icon Mapping
10. Instruction Card Conditional Visibility
11. Minimum Touch Target Size (42px)

### Build Verification
```bash
npm run build
```

## Known Issues / Notes

- **Pre-existing test failure:** `multifloor.test.js` fails with `window is not defined` due to missing vitest DOM environment — this is pre-existing and unrelated to the UI upgrade.
- **React hooks warnings:** `FloorPlanLayer.jsx` has intentional state updates in useEffect patterns that match existing app code patterns — not issues.

## Next Steps

1. Replace placeholder SVG files with production artwork
2. Add optional GeoJSON room data for interactive spaces
3. Implement property/unit tests for coverage
4. Review and merge to main branch
