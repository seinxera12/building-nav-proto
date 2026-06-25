# Floorplan UI Translation — Overview & Decisions

This directory plans the replacement of the prototype's generic POI names (e.g. "Apparel Co.", "Tech Hub") with the **real tenant names** of the One Fukuoka building, and the layering of **Japanese** display names on top — while keeping **English search** fully working.

Read the plans in order:

1. `00-overview.md` (this file) — decisions, data model, why the original Phase 3 spec changes
2. `01-poi-data-replacement.md` — Phase A: replace POI names in the seed data + reseed the DB
3. `02-bilingual-display-and-search.md` — Phase B: Japanese display overlay + bilingual search dropdown

---

## What changed vs. the original `instruction_phase3.md`

The original Phase 3 spec assumed POI names were **fixed** and only needed a display-layer Japanese overlay — it explicitly forbade touching the DB or seed file. The user has now overridden that:

> "the poi names are to be changed into a new one, so first populate the database with the new names (just replace the names, the structure and edges can be the same)."

So the new requirement is **two-layered**:

- **Layer 1 (data):** Replace the English POI `label`/`name` values with real tenant names. Keep all node IDs, coordinates, types, and edges identical — only the `label` strings change.
- **Layer 2 (display):** Overlay Japanese names at render time, exactly as the original Phase 3 spec designed (`poi_translations.json` + `translatePoi` helper).

The `instruction_phase3.md` mechanism (translation map + helper + five display sites) is **still used** — we are not throwing it away. We are prepending a data-replacement phase before it, and extending the search to be bilingual.

---

## The three-value model for every POI

Each POI now carries three conceptual values. The existing DB schema already supports all three with **no migration** — we reuse the existing `name` and `search_terms` columns plus a new JSON overlay file.

| Value | Where it lives | Example | Purpose |
|-------|----------------|---------|---------|
| **Canonical name** (`pois.name`) | DB, seeded from `nodes.json` `label` | `CHANEL` | Internal identifier; sent to AI chatbot context; the join key for the Japanese overlay |
| **Search terms** (`pois.search_terms`) | DB | `chanel シャネル fashion luxury` | What `LIKE` queries match against — includes English + Japanese + keywords so users can search in either language |
| **Japanese display** (`poi_translations.json`) | `frontend/public/` | `シャネル` | What the user sees on the map / search / instructions |

**Why keep the canonical `name` in English/Latin (the tenant's own spelling):**

- Tenant brand names (CHANEL, Patou, MoMA Design Store, NIKE) are proper nouns the brands themselves write in Latin script. Using them as the canonical `name` keeps the AI chatbot context clean (it already receives `available_pois` = list of `name`).
- The canonical `name` is the **byte-for-byte join key** into `poi_translations.json`. Keeping it stable and Latin-script avoids encoding-fragility in the join.
- QR lookups and routing reference nodes by **id**, not label, so renaming labels is safe (verified: `routes/routing.py` builds instruction text from `node.label`, but the destination label shown to the user is re-resolved on the frontend through `translatePoi`).

**Why `search_terms` is the bilingual search key (not `name`):**

The backend `/search` and chat intent-resolution both query `WHERE LOWER(p.search_terms) LIKE :q` (`backend/routes/map.py:73,83` and `backend/routes/chat.py:222`). `search_terms` is a **dedicated, already-existing field** built for exactly this. By packing English name + Japanese name + romaji + category keywords into it, a user typing either `chanel` **or** `シャネル` matches the same POI — with zero query-logic changes.

---

## Bilingual search dropdown

The user asked:

> "in the search for destination, user should be able to search by the english translation, and maybe while shown in the search drop down, it should show both language?"

**Answer: yes, both are achievable with minimal changes.**

- **Search by English:** handled entirely by `search_terms` containing the English name (Phase A). No frontend change needed for matching.
- **Show both languages in the dropdown:** the dropdown already has a two-line layout (`search-bar__item-name` + `search-bar__item-cat`, see `SearchBar.jsx:97-103`). We render the **Japanese** name on the primary line and the **English** canonical name on the secondary line (alongside the category/floor). The API already returns `name`; we display `translatePoi(name)` as primary and `name` as secondary.

No new API fields are strictly required because `name` (English) already comes back and the Japanese is resolved client-side via the overlay. (Phase B details an optional `name_en`/`name_ja` API enrichment if we later want server-side bilingual data, but the default plan keeps the API untouched.)

---

## Node-count reconciliation (critical — read before Phase A)

The new-name list in `translation/floorplan/new_poi.txt` does **not** line up 1:1 with the existing POI nodes. This must be resolved deliberately, not guessed. Current structure:

### Floor 1 — 20 POI-type nodes
- **6 infrastructure:** id 1 (Main Entrance, entrance), 15 (North Entrance, entrance), 2 (Elevator Bank, elevator), 3 (Central Escalators, escalator), 4 (Stairwell NW, stairs), 5 (Stairwell SE, stairs)
- **14 retail POIs:** ids 16–29

### Floor 1 — new names available: 17
- **Tenants (retail/F&B):** CHANEL, Valextra, MUCHA, Hirotaka, Spica・ALBION, EDIT(h), NIWAKA, THE CONTINENTAL ROYAL&Goh, PIERRE MARCOLINI, THE CAFE by ONE FUKUOKA HOTEL (10)
- **Infrastructure / non-retail:** Grand Lobby, Office Conference, Office Sky Lobby Elevator, Car Drop-off, ONE FUKUOKA HOTEL Entrance, One Fukuoka Bldg. Bicycle Parking (6)
- → 16 distinct usable; some map to infra nodes, some to retail nodes.

### Floor 2 — 24 POI-type nodes
- **4 infrastructure:** id 101 (elevator), 102 (escalator), 103 (stairs), 104 (stairs)
- **20 retail POIs:** ids 116–135

### Floor 2 — new names available: 21
All 21 are tenants → maps cleanly onto the 20 retail POIs (one spare; pick the best 20, or assign the 21st to a retail-typed infra slot — see Phase A rules).

### Reconciliation rules (full detail in `01-poi-data-replacement.md`)
- Map **infrastructure new-names to infrastructure nodes by type** (e.g. "Office Sky Lobby Elevator" → an elevator node; "Car Drop-off" / "Grand Lobby" → entrance nodes; "ONE FUKUOKA HOTEL Entrance" → entrance node).
- Map **tenant new-names to retail `poi` nodes**, preferring to keep spatially-sensible groupings (cosmetics/jewelry cluster, F&B cluster near food concourse).
- If retail nodes **outnumber** available tenant names on a floor, **invent plausible additional tenant names** consistent with a luxury Fukuoka retail building (the user explicitly authorized: *"create new poi names if … the current list is not sufficient to fill up all the current nodes structure"*). Document every invented name in the report.
- If tenant names **outnumber** nodes, drop the least-relevant or merge duplicates (e.g. two hotel-entrance-like names) and document the choice.
- **Never** rename `junction`-type nodes — they are not POIs and are not seeded into the `pois` table.

---

## Files touched (summary)

**Phase A (data):**
- `backend/seed/nodes.json` — edit `label` values only (NOT ids/coords/types/edges)
- `backend/seed.py` — extend POI seeding to build richer `search_terms` (English + Japanese + keywords)
- Reseed the database (run the seed script)

**Phase B (display + search):**
- `frontend/public/poi_translations.json` — new file (canonical English → Japanese)
- `frontend/src/store/useNavStore.js` — `poiTranslations` state, `loadPoiTranslations` action, `translatePoi` export
- `frontend/src/components/FloorMap.jsx`, `SearchBar.jsx`, `InstructionPanel.jsx`, `ChatbotPanel.jsx`, `LocationPicker.jsx` — wire `translatePoi`; SearchBar additionally shows English subline
- `frontend/src/App.jsx` (or store init) — call `loadPoiTranslations()` at startup

**Explicitly NOT touched:**
- Node ids, coordinates, types, elevations
- `backend/seed/edges.json` (graph structure)
- Routing/pathfinding logic
- Any `junction` node
