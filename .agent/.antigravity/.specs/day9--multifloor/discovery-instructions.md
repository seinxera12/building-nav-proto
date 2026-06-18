Analyse the current project and create a technical architecture document focused on indoor navigation and floor map rendering.

Investigate and document:

1. Floor Map System
- How floor maps are created, stored, loaded, and rendered.
- SVG generation pipeline and source data.
- Leaflet.js integration and customizations.
- Coordinate systems, scaling, transformations, and viewport handling.

2. Navigation Engine
- How navigation nodes, edges, routes, and wayfinding logic are represented.
- Route calculation algorithms and data structures.
- How location updates affect route recalculation.
- Current assumptions that limit navigation to a single floor.

3. UI Integration
- State management architecture.
- How map state, user location, destination selection, and route overlays are synchronized.
- Relevant components, services, hooks, stores, and event flows.

4. Extension Readiness Assessment
Identify all areas that would require changes to support:
- Multiple floors
- Floor switching
- Inter-floor navigation
- Elevators, escalators, stairs as connection points
- Routes spanning multiple floors

Deliverables:
- Architecture overview
- Component dependency diagram
- Navigation data flow diagram
- Current limitations
- Refactor opportunities
- Risks for multi-floor migration
- Recommended extension points

Focus on implementation details and code locations rather than high-level summaries.