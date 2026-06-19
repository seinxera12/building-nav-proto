## Instructions for Coding Agent: QR Nav UI Upgrade

### Context You Have Access To

1. The current project codebase (full repo access)
2. Recent UI/ multifloor updates/changes '../day9--multifloor/completion.md'
2. `ui_direction_guide.md` — the target UI/UX direction (floor plan rendering, animations, FABs, instruction cards, bottom sheet states, design tokens)
3. This instruction set

Your job is **not** to implement the direction guide blindly. Your job is to reconcile it with what already exists, then execute a plan that upgrades the visual layer without breaking or duplicating the navigation logic that already works.

---

### Phase 1 — Analysis (do this before writing any code)

1. Read `qrnav-ui-direction-guide.md` in full. Note especially Section 1 (three-layer map model), Section 7 (map container/layout), and Section 8 (priority order) — these have the highest architectural impact.
2. Audit the current codebase and answer these questions explicitly, in writing, before proceeding:
    - **Map engine**: Confirm it's Leaflet.js. Identify the CRS in use (`L.CRS.Simple` with pixel coordinates, or a real lat/lng CRS). This determines how floor plan overlays must be coordinate-fitted (see guide Section 1.4).
    - **Navigation graph**: Locate where nodes, edges, and floor metadata are defined (file/DB/API). Identify the exact shape of a node object and an edge object. Do not modify this schema.
    - **Pathfinding**: Locate the function(s) that compute a route between two nodes. Confirm input/output shape (so the new route-rendering layer can consume it without changes).
    - **Floor switching**: Find existing logic for changing the visible floor, if any. Even if it's primitive, identify the function signatures so the new floor selector UI calls into the existing logic rather than re-implementing floor-switching from scratch.
    - **Rendering layers**: Identify what currently renders as "the floor" — likely a CMS-driven Leaflet layer made of rectangles. Confirm whether this is GeoJSON, hardcoded shapes, or DB-driven, and how it's currently coupled (or not) to the navigation graph.
    - **Existing markers/overlays**: Find the current location marker and route polyline rendering code.
    - **State management**: Identify how the app tracks "idle" vs "navigating" state, and how the bottom sheet/UI currently reflects that state.
3. Produce a short **Compatibility Map** (a table is fine, inline in your response to the user, not necessarily a file) that lists each section of the direction guide against: _Compatible as-is / Needs adapter / Conflicts with existing architecture_. Flag anything in the guide that assumes a different architecture than what you found (e.g., if the project doesn't use Leaflet at all, or nodes don't carry coordinates compatible with SVG-overlay fitting).
4. **Stop and report** this analysis before proceeding to implementation if you find any hard conflicts (e.g., backend nodes have no usable coordinate system, or floors are not modeled as discrete layers at all). Otherwise, proceed to Phase 2.

---

### Phase 2 — Implementation Plan

1. Using the priority order in guide Section 8 as a starting point, produce a revised, project-specific implementation plan. Adjust ordering/effort estimates based on what Phase 1 revealed (e.g., if floor switching doesn't exist yet at all, that becomes a prerequisite before floor plan overlays can be tested across floors).
2. Explicitly separate tasks into:
    - **Pure frontend/visual changes** (CSS, new components, animations) — low risk, no backend coordination needed.
    - **Frontend changes that consume existing backend data** (route rendering, location marker, floor plan polygons keyed to nodes) — must match existing data shapes exactly; do not request backend changes for these.
    - **Items requiring new assets or new data that does NOT yet exist** (e.g., per-floor SVG files, GeoJSON room polygons, turn-instruction icon set, amenity icon assets) — these require developer/design input and are out of your scope to fabricate with real building accuracy. Flag these clearly (see Phase 4).
3. For the floor plan rendering specifically (guide Section 1), default to the **Hybrid approach** recommended in the guide (static SVG shell + GeoJSON for interactive named spaces) _unless_ your Phase 1 audit shows the project already has a working GeoJSON/polygon data source for rooms — in that case, prefer extending what exists over introducing a new SVG pipeline.
4. Confirm your plan does not require changes to: node/edge schemas, pathfinding algorithms, or any API contracts, unless absolutely unavoidable. If unavoidable, call it out as a separate, isolated task with explicit justification.
5. Present the finalized plan as a checklist before you start writing code.

---

### Phase 3 — Build & Validate

1. Implement in the order from your Phase 2 plan. Keep the three-layer separation (floor plan visual / navigation graph / live overlay) intact — do not let visual and logic layers become coupled in ways that make future map updates require touching navigation code.
2. After each major task (floor plan overlay, animated route, location marker animation, floor selector, FABs, instruction card, bottom sheet states), validate:
    - The feature renders correctly at the current state of building data (even if placeholder SVGs are used).
    - Existing navigation behavior is unaffected: route computation, step-by-step progression, "I've reached X", "I'm lost / re-anchor", and exit-navigation flows all still function exactly as before.
    - No regressions in floor switching, zoom/pan, or QR scan flow (even if the QR scan trigger itself is a placeholder button for now).
3. Where you cannot test against real building geometry because final floor plan assets don't exist yet, use clearly-labeled placeholder/mock assets (simple but realistic shapes, not just rectangles) so the visual pipeline can be verified end-to-end. Do not block implementation on waiting for final art.
4. Do a final pass against the guide's Section 10 design tokens to confirm color/spacing/typography consistency across all new components.

---

### Phase 4 — Developer-Facing Documentation

Create a markdown file (e.g. `DEVELOPER-HANDOFF.md`) in the project root that tells the human developer exactly what they need to do on their end. This must include, at minimum:

1. **Assets the developer needs to provide or commission**, with exact specs:
    - Per-floor SVG floor plan files (which floors, expected viewBox/coordinate alignment instructions referencing the project's actual CRS as found in Phase 1, naming convention, file path expected by the code).
    - Any GeoJSON room/store polygon data needed, with the exact schema your code expects (property names like `type`, `name`, `number`, `nodeId` — adjusted to match what Phase 1 found, not assumed).
    - Icon assets needed (turn-left/right, elevator, escalator, destination, etc.) if not built as inline SVG already.
2. **Commands to run**, e.g.:
    - Install any new dependencies you added (exact `npm install` lines).
    - Any build/lint/test commands needed to verify the changes locally.
    - Any data-seeding or mock-data generation scripts you created for placeholder floor plans.
3. **What was changed vs. what was left as placeholder**, so the developer knows what's production-ready vs. what needs their follow-up (e.g., "floor plan SVGs are placeholder rectangles styled to spec — swap in final art at `/assets/floors/`").
4. **What was intentionally NOT touched** — explicitly state that node/edge schemas, pathfinding logic, and [any other backend systems confirmed in Phase 1] were left unchanged, so the developer can verify this claim is accurate.
5. **Known gaps or guide items not implemented**, with reasons (e.g., "GeoJSON interactive store polygons (guide Section 1.2 Option B) deferred — current data source has no per-room coordinate data; flagged for developer to source").

This file is the single source of truth the developer reads to know what to do next — it must be accurate to what you actually built, not a copy of the direction guide's aspirations.

---

### Ground Rules Throughout

- Never invent or guess at the shape of existing navigation data — read the actual code/schema first.
- Never modify pathfinding, node/edge data structures, or API contracts unless Phase 1 proves there's no other way, and even then, isolate and flag it.
- Prefer extending existing patterns in the codebase over introducing new libraries/patterns, except where the direction guide explicitly requires new capability (e.g., SVG overlay rendering) that doesn't exist yet.
- If something in the direction guide can't be implemented without information only the developer has (real building floor plans, actual store layouts), don't fabricate fictional building data as if final — use clearly labeled placeholders and document the gap.

### Interface

The main web-interface goal is mobile-first, even though it should be responsive to be mobile-first and still be able to run from windows desktop for development and testing.