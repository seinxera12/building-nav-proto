# QR Nav — UI Direction Guide

**Version 1.0 | Floor Plan Upgrade & UI Overhaul**

---

## Overview

This guide addresses five upgrade areas for the QR Nav building navigation app, with a primary focus on replacing the CMS-style Leaflet.js box rendering with a real-building floorplan visual layer. The key constraint respected throughout: **the backend navigation graph (nodes, edges, coordinates) does not change.** Only the visual rendering layer above it is replaced or augmented.

---

## 1. FLOOR MAP VISUAL OVERHAUL (Primary Concern)

### 1.1 Architecture: Three-Layer Map Model

The current map likely has one undifferentiated layer rendering both the building geometry and the navigation overlays. The upgrade separates these into three discrete Leaflet layers, each with a clear responsibility:

```
Leaflet Map Container
├── Layer 0 — Floor Plan Visual Layer  [REPLACE THIS ENTIRELY]
│     ├── Building shell (walls, outer perimeter)
│     ├── Store/room polygons with fills and labels
│     ├── Hallway fills and corridor geometry
│     └── Amenity icons (escalator, elevator, restroom, entrance)
│
├── Layer 1 — Navigation Graph Layer   [KEEP UNCHANGED]
│     ├── Nodes (invisible in production, shown only in debug mode)
│     └── Edges (invisible in production, shown only in debug mode)
│
└── Layer 2 — Live Navigation Overlay  [AUGMENT WITH ANIMATION]
      ├── Current location marker (pulsing blue dot)
      ├── Route polyline (animated dashed line)
      └── Destination marker (green pin)
```

Layers 1 and 2 already exist and continue to work exactly as they do today. Only Layer 0 is being replaced.

---

### 1.2 Floor Plan Rendering: Recommended Approach (Hybrid SVG + GeoJSON)

There are three viable methods. The hybrid approach below is recommended because it delivers professional visual quality quickly while remaining maintainable.

#### Option A — SVG File Overlay (fastest to high quality)

Design the floor plan for each floor as a single SVG file (in Figma, Illustrator, or Inkscape). Load it as a Leaflet image overlay fitted to the map's coordinate bounds.

```javascript
// One-time setup per floor
const floorBounds = [[minLat, minLng], [maxLat, maxLng]];

// The SVG is a pre-designed file — stores, walls, labels are all baked in
const svgUrl = `/assets/floors/floor-1f.svg`;
const floorPlanLayer = L.imageOverlay(svgUrl, floorBounds, {
  opacity: 1,
  interactive: false,   // pass touch/mouse events through to map for panning
  className: 'floor-plan-overlay'
});

floorPlanLayer.addTo(map);

// Navigation layers (nodes, edges, route) added on top — unchanged
routeLayer.addTo(map);
locationMarker.addTo(map);
```

**Pros:** Easiest path to production-quality visuals; design team can work in Figma independently of the codebase; per-floor SVGs can be versioned and swapped.

**Cons:** Non-interactive rooms (tapping a room does not auto-navigate unless you add a separate hit-target layer); updating store names requires editing the SVG.

---

#### Option B — GeoJSON Styled Polygons (best long-term maintainability)

Each room, hallway, and structural element is a GeoJSON feature with a `type` property. Leaflet renders them with custom styles. Store labels are rendered as tooltips.

```javascript
// floorplan-1f.geojson — lives alongside existing node/edge JSON
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "type": "store",
        "name": "CHANEL",
        "number": "101",
        "nodeId": "store-101"     // ← links to existing navigation graph node
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng1,lat1],[lng2,lat1],[lng2,lat2],[lng1,lat2],[lng1,lat1]]]
      }
    },
    {
      "type": "Feature",
      "properties": { "type": "hallway" },
      "geometry": { "type": "Polygon", "coordinates": [[...]] }
    },
    {
      "type": "Feature",
      "properties": { "type": "wall" },
      "geometry": { "type": "Polygon", "coordinates": [[...]] }
    }
  ]
}
```

```javascript
// Render with Leaflet
const styleMap = {
  store:   { fillColor: '#E8E8E8', color: '#333333', weight: 2,   fillOpacity: 1 },
  hallway: { fillColor: '#F2F2F2', color: '#BDBDBD', weight: 0.5, fillOpacity: 1 },
  wall:    { fillColor: '#2D2D2D', color: '#2D2D2D', weight: 0,   fillOpacity: 1 },
  elevator:{ fillColor: '#CCCCCC', color: '#666666', weight: 1,   fillOpacity: 1 },
};

L.geoJSON(floorplanData, {
  style: (feature) => styleMap[feature.properties.type] || {},
  onEachFeature: (feature, layer) => {
    const { name, number, nodeId } = feature.properties;
    if (name) {
      // Permanent centered label; Leaflet manages scaling
      layer.bindTooltip(
        `<div class="store-label"><span class="store-number">${number}</span><span class="store-name">${name}</span></div>`,
        { permanent: true, direction: 'center', className: 'store-tooltip' }
      );
    }
    if (nodeId) {
      layer.on('click', () => initiateNavigationTo(nodeId));
    }
  }
}).addTo(map);
```

**Pros:** Rooms become tappable navigation targets; store data can be managed separately from geometry; easy to update labels, types, and IDs.

**Cons:** Requires defining polygon coordinates for every room, which is tedious but only done once per building floor.

---

#### RECOMMENDED: Hybrid (Option A shell + Option B named spaces)

1. **Static SVG as background** — the outer walls, perimeter, structural columns, escalator/elevator symbols, and toilet/entrance icons. This file changes rarely.
    
2. **GeoJSON for named interactive spaces** — store polygons with names, numbers, and `nodeId` references, rendered on top of the SVG. These can be updated via CMS.
    
3. **Navigation graph (nodes, edges) sits above both** — completely unchanged.
    

This means the SVG handles the "building shell" look with zero code complexity, and GeoJSON handles the dynamic, interactive, data-driven parts.

---

### 1.3 SVG Floor Plan Design Specifications

When drawing or commissioning the floor plan SVGs, use these design tokens derived from the reference image:

#### Color Tokens

```css
/* Building structure */
--fp-wall-fill:         #2D2D2D;   /* outer walls, thick dividers */
--fp-wall-inner:        #555555;   /* thin interior partition walls */
--fp-store-fill:        #E8E8E8;   /* individual retail unit fill */
--fp-store-stroke:      #CCCCCC;   /* store boundary dividers */
--fp-hallway-fill:      #F2F2F2;   /* main walkable corridor */
--fp-void-fill:         #EBEBEB;   /* non-floor area (shafts, voids) */
--fp-featured-store:    #E2EDF5;   /* slightly blue tint for highlighted store */

/* Amenity icons */
--fp-elevator-fill:     #D0D0D0;
--fp-escalator-stripe:  #AAAAAA;
--fp-restroom-fill:     #C8D8E8;

/* Text on map */
--fp-label-primary:     #1A1A1A;   /* store number: bold 14px */
--fp-label-secondary:   #555555;   /* store name: regular 10px */
--fp-label-sub:         #888888;   /* sublabel / Japanese text: 8px */
```

#### SVG Structure Template

```xml
<svg viewBox="0 0 1000 800" xmlns="http://www.w3.org/2000/svg"
     font-family="'Inter', 'Noto Sans JP', sans-serif">

  <!-- 1. Background fill (sets the "floor" color) -->
  <rect width="1000" height="800" fill="#F2F2F2"/>

  <!-- 2. Outer building wall (thick filled polygon) -->
  <polygon points="..." fill="#2D2D2D"/>

  <!-- 3. Hallway polygon (subtracts from wall to show walkable space) -->
  <polygon points="..." fill="#F2F2F2"/>

  <!-- 4. Store units (each as a polygon with fill + stroke) -->
  <g class="store-units">
    <polygon id="store-101" points="..."
             fill="#E8E8E8" stroke="#CCCCCC" stroke-width="1"/>
    <!-- ... -->
  </g>

  <!-- 5. Store labels (number + name + optional sublabel) -->
  <g class="store-labels">
    <text x="120" y="140" font-size="16" font-weight="700" fill="#1A1A1A">101</text>
    <text x="120" y="158" font-size="10" font-weight="400" fill="#555">CHANEL</text>
  </g>

  <!-- 6. Amenity symbols -->
  <g class="amenities">
    <!-- Escalator: hatched rectangle rotated 45° -->
    <g transform="translate(340,200) rotate(45)">
      <rect width="30" height="20" fill="#CCCCCC" stroke="#888" stroke-width="1"/>
      <!-- hatching lines -->
      <line x1="5" y1="0" x2="5" y2="20" stroke="#888" stroke-width="0.5"/>
      <line x1="10" y1="0" x2="10" y2="20" stroke="#888" stroke-width="0.5"/>
      <!-- arrow indicator -->
      <polygon points="..." fill="#888"/>
    </g>

    <!-- Elevator: square with "E" or standard icon -->
    <rect x="..." y="..." width="24" height="24" rx="3"
          fill="#D0D0D0" stroke="#888" stroke-width="1"/>
    <text x="..." y="..." font-size="10" fill="#555">E</text>
  </g>

</svg>
```

#### Realistic Layout Guidance

The floor plan must reflect real-world mall geometry, not a grid. Key principles:

- **Irregular polygon stores** — corner stores have diagonal cuts; anchor stores span larger irregular footprints; not everything is a rectangle.
- **Zigzag corridors** — hallways should bend and widen at junctions, not be straight-line grids.
- **Dead ends and alcoves** — service corridors, loading bays, utility areas shown as dark fills reinforce realism.
- **Varying store widths** — small kiosk units (3–4m wide) next to large anchor stores (15m+ wide) creates the visual rhythm of a real mall.
- **Legible hierarchy** — anchor/flagship stores get a subtly different fill (`--fp-featured-store`) to signal their importance.

---

### 1.4 Coordinate Mapping

The navigation graph uses a coordinate system (likely lat/lng in a custom projected CRS, or pixel coordinates). The SVG overlay must be fitted to the same bounding box.

```javascript
// Your existing node data already defines the coordinate space:
// const nodes = [ { id: 'n1', lat: 35.6812, lng: 139.7671 }, ... ]

// Compute bounds from node data — don't hardcode
const lats = nodes.map(n => n.lat);
const lngs = nodes.map(n => n.lng);
const bounds = [
  [Math.min(...lats) - padding, Math.min(...lngs) - padding],
  [Math.max(...lats) + padding, Math.max(...lngs) + padding]
];

// SVG viewBox coordinates must be drawn to match this same space
// If using a custom CRS (L.CRS.Simple with pixel coords):
const pixelBounds = L.bounds([0,0], [mapWidth, mapHeight]);
```

If the project uses `L.CRS.Simple` (pixel coordinates), the SVG's `viewBox` values map directly. If using real lat/lng with a standard CRS, account for the Mercator projection distortion when drawing the SVG geometry (draw slightly wider than tall).

---

## 2. NAVIGATION ROUTE VISUALIZATION

### 2.1 Animated Route Line (Replace Static Polyline)

The current basic polyline should become an animated flowing dashed line, matching the blue dashed route in the reference image.

```javascript
// Remove old static polyline, replace with this:
const routeCoords = getRouteCoordinates(); // unchanged — from existing path-finding

// Create SVG path element and attach CSS animation
const routePath = L.polyline(routeCoords, {
  color: '#2196F3',
  weight: 4,
  opacity: 0.9,
  dashArray: '12 8',        // 12px dash, 8px gap
  dashOffset: '0',
  lineCap: 'round',
  lineJoin: 'round',
  className: 'nav-route-line'
}).addTo(map);
```

```css
/* Applied to the SVG path Leaflet generates inside the polyline layer */
.nav-route-line {
  stroke-dasharray: 12 8;
  stroke-dashoffset: 0;
  animation: routeFlow 0.7s linear infinite;
  filter: drop-shadow(0 2px 4px rgba(33, 150, 243, 0.4));
}

@keyframes routeFlow {
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -20; }
}
```

Note: Leaflet renders polylines as SVG `<path>` elements inside a `<svg>` overlay. The `className` option on the polyline propagates to the `<path>` element, making the CSS animation straightforward.

---

### 2.2 Current Location Marker (Pulsing Blue Dot)

Replace any static circle marker with a custom DivIcon that uses CSS animation:

```javascript
const locationIcon = L.divIcon({
  className: '',    // prevent Leaflet's default white box
  html: `
    <div class="location-dot-wrapper">
      <div class="location-dot-pulse"></div>
      <div class="location-dot-outer"></div>
      <div class="location-dot-inner"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const locationMarker = L.marker(currentCoords, {
  icon: locationIcon,
  zIndexOffset: 1000
}).addTo(map);
```

```css
.location-dot-wrapper {
  position: relative;
  width: 32px; height: 32px;
}

/* Expanding ring pulse */
.location-dot-pulse {
  position: absolute;
  top: 4px; left: 4px;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: rgba(21, 101, 192, 0.25);
  animation: locationPulse 2s ease-out infinite;
}

/* Outer ring (white border) */
.location-dot-outer {
  position: absolute;
  top: 8px; left: 8px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

/* Inner filled dot */
.location-dot-inner {
  position: absolute;
  top: 11px; left: 11px;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #1565C0;
}

@keyframes locationPulse {
  0%   { transform: scale(1); opacity: 0.8; }
  70%  { transform: scale(2.2); opacity: 0.1; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

---

### 2.3 Smooth Location Update Animation

When the user's position updates (after QR scan or re-anchor), do not teleport the marker. Use Leaflet's `flyTo` with a smooth easing:

```javascript
function updateLocation(newCoords) {
  // 1. Pan the map smoothly to new location
  map.flyTo(newCoords, map.getZoom(), {
    animate: true,
    duration: 1.2,         // seconds
    easeLinearity: 0.2     // low = more ease-out curve
  });

  // 2. Animate the marker itself sliding to new position
  const currentPos = locationMarker.getLatLng();
  const frames = 30;
  let frame = 0;

  const animate = () => {
    frame++;
    const t = frame / frames;
    const ease = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;  // ease-in-out

    locationMarker.setLatLng([
      currentPos.lat + (newCoords[0] - currentPos.lat) * ease,
      currentPos.lng + (newCoords[1] - currentPos.lng) * ease
    ]);

    if (frame < frames) requestAnimationFrame(animate);
    else locationMarker.setLatLng(newCoords);
  };

  requestAnimationFrame(animate);

  // 3. Brief "location updated" flash on the dot
  const dotInner = document.querySelector('.location-dot-inner');
  dotInner.style.background = '#4CAF50';
  setTimeout(() => { dotInner.style.background = '#1565C0'; }, 800);
}
```

---

## 3. FLOOR SWITCH PANEL (Left Side Pill)

### 3.1 HTML Structure

```html
<div class="floor-selector" id="floorSelector" aria-label="Floor selector">
  <!-- Floors rendered dynamically from building config -->
  <button class="floor-btn" data-floor="2F" aria-label="Floor 2">2F</button>
  <div class="floor-divider"></div>
  <button class="floor-btn active" data-floor="1F" aria-label="Floor 1">1F</button>
  <div class="floor-divider"></div>
  <button class="floor-btn" data-floor="B1" aria-label="Basement 1">B1</button>
</div>
```

### 3.2 CSS

```css
.floor-selector {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: #FFFFFF;
  border-radius: 24px;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.floor-btn {
  width: 42px;
  height: 42px;
  border-radius: 18px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: #666666;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floor-btn:hover {
  background: #F0F0F0;
  color: #1A1A1A;
}

.floor-btn.active {
  background: #1C1C1E;
  color: #FFFFFF;
  font-weight: 700;
  transform: scale(1.05);
}

.floor-divider {
  width: 28px;
  height: 1px;
  background: #E0E0E0;
}
```

### 3.3 Floor Transition Logic

When a floor is switched, animate the floor plan layer out and in:

```javascript
const floorSVGs = {
  'B1': '/assets/floors/floor-b1.svg',
  '1F': '/assets/floors/floor-1f.svg',
  '2F': '/assets/floors/floor-2f.svg',
};

let currentFloorLayer = null;

async function switchFloor(floorId) {
  // 1. Fade out current floor plan
  if (currentFloorLayer) {
    const el = currentFloorLayer.getElement();
    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    await delay(250);
    map.removeLayer(currentFloorLayer);
  }

  // 2. Load new floor plan SVG
  currentFloorLayer = L.imageOverlay(floorSVGs[floorId], floorBounds, {
    opacity: 0,
    interactive: false,
    className: 'floor-plan-overlay'
  });
  currentFloorLayer.addTo(map);

  // 3. Fade in new floor plan
  await delay(50);
  const el = currentFloorLayer.getElement();
  el.style.transition = 'opacity 0.3s ease';
  el.style.opacity = '1';

  // 4. If there is navigation active on this floor, redraw route
  if (activeNavigation && activeNavigation.floor === floorId) {
    redrawRouteForFloor(floorId);
  }

  // 5. Update floor button states
  document.querySelectorAll('.floor-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.floor === floorId);
  });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

---

## 4. QR SCAN & CHAT FLOATING ACTION BUTTONS

### 4.1 HTML Structure

These are positioned as a vertical FAB group on the right side of the map, above the zoom controls:

```html
<!-- Zoom controls (existing — move to match reference position) -->
<div class="map-zoom-controls" id="mapZoom">
  <button class="zoom-btn" id="zoomIn" aria-label="Zoom in">+</button>
  <button class="zoom-btn" id="zoomOut" aria-label="Zoom out">−</button>
</div>

<!-- New FAB group below zoom controls -->
<div class="map-fab-group" id="mapFabs">
  <button class="map-fab fab-qr" id="fabQR" aria-label="Scan QR code">
    <!-- QR SVG icon -->
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white"
         stroke-width="2" stroke-linecap="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
      <path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2"/>
    </svg>
  </button>
  <button class="map-fab fab-chat" id="fabChat" aria-label="Open navigation guide">
    <!-- Chat/compass SVG icon -->
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  </button>
</div>
```

### 4.2 CSS

```css
/* Existing zoom controls — reposition to match reference */
.map-zoom-controls {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-60%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1000;
}

.zoom-btn {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: none;
  background: #FFFFFF;
  font-size: 20px;
  font-weight: 300;
  color: #1A1A1A;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}

.zoom-btn:active { transform: scale(0.92); }

/* New FABs */
.map-fab-group {
  position: absolute;
  right: 14px;
  bottom: 260px;  /* adjust so it sits above bottom sheet */
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1000;
}

.map-fab {
  width: 50px; height: 50px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.map-fab:active {
  transform: scale(0.92);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.fab-qr   { background: #00897B; }  /* teal — matches reference */
.fab-chat { background: #1C1C1E; }  /* near-black — matches reference */
```

---

## 5. NAVIGATION INSTRUCTION CARD (Turn-by-Turn Visual)

### 5.1 HTML Structure

This card sits as an absolute overlay at the top of the map, only visible during active navigation.

```html
<div class="nav-instruction-card hidden" id="navInstructionCard">
  <div class="nav-turn-icon" id="navTurnIcon">
    <!-- Icon swapped dynamically: turn-left, turn-right, straight, elevator, escalator -->
    <svg class="turn-arrow" ...></svg>
  </div>
  <div class="nav-instruction-text">
    <span class="nav-primary" id="navPrimary">Turn Left</span>
    <span class="nav-secondary" id="navSecondary">then go straight</span>
  </div>
  <div class="nav-distance" id="navDistance">45m</div>
</div>
```

### 5.2 CSS

```css
.nav-instruction-card {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  background: #FFFFFF;
  border-radius: 18px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  z-index: 1000;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.nav-instruction-card.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
}

.nav-turn-icon {
  width: 48px; height: 48px;
  background: #EBF4FF;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-turn-icon svg { width: 28px; height: 28px; color: #1565C0; }

.nav-instruction-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-primary {
  font-size: 16px;
  font-weight: 700;
  color: #1A1A1A;
  line-height: 1.2;
}

.nav-secondary {
  font-size: 12px;
  color: #666666;
}

.nav-distance {
  font-size: 14px;
  font-weight: 600;
  color: #2196F3;
  flex-shrink: 0;
}
```

### 5.3 Instruction Icon Set

Define a set of SVG icons for each navigation action type. These are swapped into `.nav-turn-icon` based on the current step's `action` field:

|Action Key|Icon Description|Background Color|
|---|---|---|
|`turn-left`|Arrow bending left|`#EBF4FF` (blue)|
|`turn-right`|Arrow bending right|`#EBF4FF` (blue)|
|`straight`|Arrow pointing up|`#EBF4FF` (blue)|
|`elevator-up`|Elevator box with up arrow|`#F3E5F5` (purple)|
|`elevator-down`|Elevator box with down arrow|`#F3E5F5` (purple)|
|`escalator-up`|Diagonal stripes + up arrow|`#E8F5E9` (green)|
|`escalator-down`|Diagonal stripes + down arrow|`#E8F5E9` (green)|
|`destination`|Filled flag / pin|`#E8F5E9` (green)|
|`arrive`|Checkmark circle|`#E8F5E9` (green)|

```javascript
// When a navigation step changes, call this:
function updateInstructionCard(step) {
  const card = document.getElementById('navInstructionCard');
  const icon = document.getElementById('navTurnIcon');
  const primary = document.getElementById('navPrimary');
  const secondary = document.getElementById('navSecondary');
  const distance = document.getElementById('navDistance');

  // Animate out
  card.style.opacity = '0';
  card.style.transform = 'translateY(-6px)';

  setTimeout(() => {
    primary.textContent = step.primaryInstruction;       // e.g. "Turn Left"
    secondary.textContent = step.secondaryInstruction;   // e.g. "then go straight"
    distance.textContent = `${step.distanceMeters}m`;
    icon.innerHTML = turnIcons[step.action];             // swap SVG icon
    icon.style.background = turnIconBg[step.action];

    // Animate in
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    card.classList.remove('hidden');
  }, 200);
}
```

---

## 6. BOTTOM SHEET STATES

Two distinct states share the same bottom sheet component. The key is using CSS class toggling to switch between them with smooth animation.

### 6.1 Idle State (Location Set)

```html
<div class="bottom-sheet" id="bottomSheet">
  <div class="sheet-handle"></div>

  <!-- STATE: idle -->
  <div class="sheet-state" id="stateIdle">
    <div class="location-row">
      <div class="location-info">
        <span class="location-label">Your location is set</span>
        <div class="location-name">
          <svg class="location-pin" .../>  <!-- teal pin icon -->
          <span id="currentLocationName">Main Entrance, Floor 1</span>
        </div>
      </div>
      <button class="btn-update" id="btnUpdate">Update</button>
    </div>
    <div class="search-bar">
      <svg class="search-icon" .../>
      <input type="text" placeholder="Search for a destination...."
             id="searchInput" autocomplete="off"/>
      <button class="mic-btn" id="micBtn" aria-label="Voice search">
        <svg .../>
      </button>
    </div>
    <div class="quick-pills" id="quickPills">
      <button class="pill">Main Entrance</button>
      <button class="pill">Cafeteria</button>
      <button class="pill">Parking</button>
    </div>
  </div>

  <!-- STATE: navigation active (hidden by default) -->
  <div class="sheet-state hidden" id="stateNav">
    <div class="nav-header">
      <div class="nav-dest-info">
        <svg class="nav-flag" .../>  <!-- green flag icon -->
        <div>
          <span class="nav-dest-name" id="navDestName">Main Entrance</span>
          <span class="nav-dest-meta" id="navDestMeta">110m · 2 min</span>
        </div>
      </div>
      <button class="btn-exit" id="btnExit">Exit</button>
    </div>
    <div class="nav-checkpoint">
      <div class="checkpoint-icon">✓</div>
      <div class="checkpoint-info">
        <span class="checkpoint-name" id="checkpointName">Edit(h)</span>
        <span class="checkpoint-step" id="checkpointStep">Step 1 of 4</span>
      </div>
    </div>
    <div class="nav-actions">
      <button class="btn-reached" id="btnReached">I've reached Channel</button>
      <button class="btn-lost" id="btnLost">I'm lost / Re-anchor</button>
    </div>
  </div>
</div>
```

### 6.2 State Transition

```javascript
function setNavigationState(isNavigating, navData = {}) {
  const stateIdle = document.getElementById('stateIdle');
  const stateNav = document.getElementById('stateNav');

  if (isNavigating) {
    // Populate nav data
    document.getElementById('navDestName').textContent = navData.destination;
    document.getElementById('navDestMeta').textContent = navData.eta;
    document.getElementById('btnReached').textContent =
      `I've reached ${navData.destination}`;

    // Crossfade
    stateIdle.style.opacity = '0';
    setTimeout(() => {
      stateIdle.classList.add('hidden');
      stateNav.classList.remove('hidden');
      stateNav.style.opacity = '0';
      requestAnimationFrame(() => { stateNav.style.opacity = '1'; });
    }, 200);
  } else {
    stateNav.style.opacity = '0';
    setTimeout(() => {
      stateNav.classList.add('hidden');
      stateIdle.classList.remove('hidden');
      stateIdle.style.opacity = '0';
      requestAnimationFrame(() => { stateIdle.style.opacity = '1'; });
    }, 200);
  }
}
```

---

## 7. MAP CONTAINER & OVERALL LAYOUT

### 7.1 Full-Screen Map (Like Google Maps)

The map must fill the full viewport. The bottom sheet floats above it as an overlay, not pushing the map up:

```css
/* Reset and full-height layout */
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }

#app {
  position: relative;
  width: 100%;
  height: 100vh;           /* full screen */
  height: 100dvh;          /* dynamic viewport height (mobile safe) */
}

/* Leaflet map fills entire container */
#map {
  position: absolute;
  inset: 0;                /* top: 0; left: 0; right: 0; bottom: 0 */
  z-index: 0;
}

/* All overlay elements sit above the map */
.floor-selector,
.map-zoom-controls,
.map-fab-group,
.nav-instruction-card { z-index: 1000; }

/* Bottom sheet floats above map — NOT in flow, NOT pushing map */
.bottom-sheet {
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  background: #FFFFFF;
  border-radius: 20px 20px 0 0;
  padding: 10px 18px 32px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  /* Leaflet map padding: map.setOptions({ paddingBottomRight: [0, sheetHeight] })
     ensures route lines aren't hidden under the sheet */
}

.sheet-handle {
  width: 40px; height: 4px;
  background: #D0D0D0;
  border-radius: 2px;
  margin: 0 auto 14px;
}
```

### 7.2 Prevent Bottom Sheet from Hiding Route

When navigation is active, tell Leaflet to pad the map viewport so route lines and the location marker don't render under the bottom sheet:

```javascript
const BOTTOM_SHEET_HEIGHT = 280; // pixels

function applyMapPadding() {
  map.setView(map.getCenter(), map.getZoom(), {
    paddingBottomRight: [0, BOTTOM_SHEET_HEIGHT]
  });
}
```

---

## 8. IMPLEMENTATION PRIORITY ORDER

Execute in this sequence to get visible improvements fastest:

|Priority|Task|Effort|Visual Impact|
|---|---|---|---|
|**1**|Full-screen map container (CSS fix)|Low|High|
|**2**|SVG floor plan overlay (design + load)|Medium|Very High|
|**3**|Pulsing location dot (CSS animation)|Low|Medium|
|**4**|Animated route line (CSS dasharray)|Low|High|
|**5**|Floor selector pill (HTML/CSS)|Low|Medium|
|**6**|QR + Chat FAB buttons (HTML/CSS)|Low|Medium|
|**7**|Navigation instruction card|Medium|High|
|**8**|Bottom sheet state transitions|Medium|Medium|
|**9**|Floor transition animation (fade)|Low|Medium|
|**10**|Smooth flyTo on location update|Low|Medium|
|**11**|GeoJSON interactive store polygons|High|Low (incremental)|

Items 1–4 alone will produce a dramatic visual improvement.

---

## 9. DEPENDENCIES & TOOLING

No new Leaflet plugins are required. All animations use native CSS and standard Leaflet APIs. Optional additions:

- **`leaflet.smooth-marker-bouncing`** — for a bounce effect when the location marker is first set (npm: `leaflet.smooth-marker-bouncing`).
- **`leaflet-geometryutil`** — for computing bearing/heading from route edges to determine the correct turn icon dynamically (npm: `leaflet-geometryutil`).
- **`Figma` or `Inkscape`** — for designing and exporting the per-floor SVG files.
- **`SVGO`** — for optimizing SVG file sizes before deployment (`npm i -g svgo`).

---

## 10. DESIGN TOKENS SUMMARY

```css
:root {
  /* Map colors */
  --fp-wall:               #2D2D2D;
  --fp-wall-inner:         #555555;
  --fp-store:              #E8E8E8;
  --fp-hallway:            #F2F2F2;
  --fp-featured-store:     #E2EDF5;

  /* Navigation */
  --nav-route:             #2196F3;
  --nav-location:          #1565C0;
  --nav-destination:       #2E7D32;

  /* UI Components */
  --ui-primary:            #1C1C1E;
  --ui-surface:            #FFFFFF;
  --ui-teal:               #00897B;
  --ui-red:                #D32F2F;
  --ui-blue-light:         #E3F2FD;

  /* Typography */
  --font-sans:             'Inter', 'Noto Sans JP', -apple-system, sans-serif;
  --text-label:            11px;
  --text-body:             14px;
  --text-heading:          16px;
  --text-store-number:     16px;
  --text-store-name:       10px;

  /* Radii */
  --radius-pill:           24px;
  --radius-card:           18px;
  --radius-btn:            12px;

  /* Shadows */
  --shadow-float:          0 4px 16px rgba(0,0,0,0.15);
  --shadow-card:           0 6px 20px rgba(0,0,0,0.18);
}
```

---

_This guide provides a complete technical blueprint for the QR Nav UI upgrade. Each section is self-contained so individual engineers can implement components in parallel. The backend navigation graph (nodes, edges, coordinates, pathfinding) remains entirely unchanged throughout._