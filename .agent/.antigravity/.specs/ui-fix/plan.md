## UI issue

Currently, the floor map rendered is not UI fit, i.e in larger screens and mobile screens both, the map is small inside a large white canvas, can be zoomed out or panned to corners and nearly disappear and so on. 

## Fix

UI should be made compatible to screens, fit around the corners and zoomable inside the map like google maps, but not zoom out so much smaller size. 




## Map fix
Step 1 — Redraw floor plan image
         Match your existing node coordinate positions
         Export at your exact bounds pixel dimensions
         Replace backend/seed/floor_plan.png

Step 2 — Update node coordinates if needed
         If you moved any room locations while redrawing
         Update nodes.json, re-run seed.py, restart backend

Step 3 — Improve route line rendering in useMapLayers.js
         Two-layer polyline with halo effect
         Rounded caps and joins

Step 4 — Replace circle markers with type-specific markers
         POI pins, QR icons, pulsing position dot
         Junction dots made invisible or minimal

Step 5 — Add walked/remaining route split
         Read currentNodeId from store
         Split polyline at current position

Step 6 — CSS background and floor plan shadow
         Leaflet background colour
         Drop shadow on image overlay