You are working inside a FastAPI + React/Vite building navigation project. This is Phase 3 of a Japanese localization effort. Phases 1 and 2 translated all static UI strings. Phase 3 translates **POI (Point of Interest) names** — the destination names that appear on the floor map, in search results, in navigation instructions, and in chatbot responses.

POI names are fundamentally different from UI strings: they originate in a backend database seeded from `backend/seed/nodes.json`, flow through a FastAPI REST API, and land in the frontend store and multiple display components. You must NOT change the database, the API, or any routing logic. Instead, you will introduce a single frontend translation map that every display component reads.

---

## Architecture context (read this before touching any file)

### Where POI names come from

All POI names originate in `backend/seed/nodes.json` as `node.label` values. During seeding (`backend/seed.py` lines 97–105), each node whose type is in `{poi, elevator, entrance, stairs, escalator}` gets a row in the `pois` database table with:
- `name` = `node.label`  (the English display name)
- `search_terms` = `node.label.lower()`  (used for LIKE queries)

### How they reach the frontend

1. `GET /map/floor/{floor_id}` — returns `{ id, name, category, node_id }` for every POI on a floor
2. `GET /search?q=...` — returns matching POIs by `LOWER(search_terms) LIKE %q%`, limit 8
3. `GET /chat` — sends `available_pois` (list of all `poi.name` values) to the AI and returns `candidates[].name`

The frontend store (`frontend/src/store/useNavStore.js`) caches floor data including `pois` arrays. Helper `destinationLabel(floor, nodeId)` returns `poi?.name || node?.label || 'Destination'`.

### Where POI names are displayed (all five sites)

| Site | File | How name is accessed |
|------|------|----------------------|
| Floor map tooltip | `frontend/src/components/FloorMap.jsx` line ~936 | `poi?.name \|\| node.label` |
| Search results | `frontend/src/components/SearchBar.jsx` line ~98 | `r.name` |
| Navigation destination | `frontend/src/components/InstructionPanel.jsx` lines ~111–121 | `poi.name \|\| node.label` |
| Chatbot candidates | `frontend/src/components/ChatbotPanel.jsx` line ~175 | `c.name` |
| Location picker | `frontend/src/components/LocationPicker.jsx` line ~170 | `location.label` |

### Why you must not change the backend

- `search_terms` is used for SQL LIKE matching. Changing it to Japanese would break search unless the user types Japanese.
- `name` is used as a display label but also as the value passed to the AI chatbot context (`available_pois`). Changing it in the DB could confuse the AI's intent matching.
- The English names are stable internal identifiers for QR code lookups and routing references.

---

## The translation mechanism you will introduce

A single JSON file at `frontend/public/poi_translations.json` maps every English POI name to its Japanese equivalent. The frontend loads this file once at app startup and stores it in the Zustand store. Every display site calls a `translatePoi(englishName)` helper that returns the Japanese string, or the original English if no translation exists.

This means:
- Zero DB changes
- Zero API changes
- Zero routing logic changes
- One file to maintain
- All five display sites stay in sync automatically

---

## Phase 3a — Extract (read-only)

### Goal
Produce `translation/ui_poi_english.txt` — a clean list of every unique English POI name in the system, ready to hand to a human translator.

### Step 1 — Collect POI names from the seed file

Read `backend/seed/nodes.json`. For every node entry where `type` is one of: `poi`, `elevator`, `entrance`, `stairs`, `escalator` — record its `label` value.

Deduplicate. Sort alphabetically.

### Step 2 — Cross-check with node labels used as fallback

Read `frontend/src/store/useNavStore.js` and all five display-site components listed above. Confirm that no component hardcodes a POI name as a string literal (they should all read from store data). If you find any hardcoded POI names, add them to the list and note the file and line.

### Step 3 — Check GeoJSON (optional, note only)

Check `frontend/dist/assets/geojson/floor-1.json` and `floor-2.json`. GeoJSON features have `name` properties. Note whether any of these names match the seed POI names. Do NOT add GeoJSON names to the translation list — that layer is currently disabled (`enableGeoJSON = false` in FloorMap.jsx). Record the finding in the output summary only.

### Step 4 — Write `translation/ui_poi_english.txt`

Format:
```
# POI NAMES FOR TRANSLATION — Building Navigation Prototype
# Hand this file to the translator. Fill in the Japanese: line for every entry.
# Do NOT change the English: lines. Do NOT reorder entries.
# Return as ui_poi_japanese.txt with one Japanese name per line, same order.

--
[poi_001]
English:  Apparel Co.
Category: poi
Japanese:

--
[poi_002]
English:  Arcade
Category: poi
Japanese:

--
```

Rules:
- IDs are zero-padded sequential slugs (`poi_001`, `poi_002`, …)
- `Category` comes from the node's `type` field — use it so the translator understands context (`elevator`, `entrance`, `stairs`, `escalator`, `poi`)
- `Japanese:` line is intentionally blank — the translator fills it in
- Sort entries alphabetically by English name

### Step 5 — Write `translation/ui_poi_map.json`

This machine-readable file links each `[id]` to the seed file location. It will be used in Phase 3b.

```json
[
  {
    "id": "poi_001",
    "english": "Apparel Co.",
    "category": "poi",
    "seed_file": "backend/seed/nodes.json",
    "node_ids": [42]
  }
]
```

Note: `node_ids` is an array because two nodes may share the same label (e.g., "Restrooms" appears on multiple floors). List all matching node IDs.

### Step 6 — Print extraction summary

```
POI EXTRACTION SUMMARY
======================
Total unique POI names found: N
  From seed file:          N
  Hardcoded in components: N (list any found)

GeoJSON names (not translated — layer disabled): list them

Output files written:
  translation/ui_poi_english.txt
  translation/ui_poi_map.json
```

Do NOT modify any source file during Phase 3a. This is a read-only extraction task.

---

## Phase 3b — Apply (run after translator returns `translation/ui_poi_japanese.txt`)

### Input files

- `translation/ui_poi_english.txt` — the filled-in inventory; each entry has a `Japanese:` line
- `translation/ui_poi_japanese.txt` — flat line-by-line list, one Japanese name per line, same order as `ui_poi_english.txt`
- `translation/ui_poi_map.json` — maps each `[id]` to its English name and node IDs

### Step 1 — Parse translations

Read `ui_poi_english.txt`. Extract a lookup table:
```
english_name → japanese_name
```

Rules:
- Skip any entry where `Japanese:` is blank or missing
- Skip any entry where Japanese value equals English value (log as warning — likely left untranslated)
- Trim whitespace from both values

### Step 2 — Cross-verify with `ui_poi_japanese.txt`

The flat file must have the same line count as the number of non-blank entries in `ui_poi_english.txt`. Spot-check 5 random entries. If counts mismatch or spot-checks fail, STOP and report — do not proceed.

### Step 3 — Write `frontend/public/poi_translations.json`

This is the runtime translation map. Generate it from the verified lookup table:

```json
{
  "Apparel Co.": "アパレル Co.",
  "Arcade": "ゲームセンター",
  "Bookstore": "書店",
  "Central Escalators": "中央エスカレーター",
  "..."
}
```

- Keys are exact English POI names (must match `poi.name` values returned by the API byte-for-byte)
- Values are the Japanese translations
- Do NOT include entries where translation is blank or identical to English

### Step 4 — Add translation loader to the Zustand store

Edit `frontend/src/store/useNavStore.js`.

Add a `poiTranslations` slice to the store state (initial value: `{}`):

```js
poiTranslations: {},
```

Add a `loadPoiTranslations` action that fetches `/poi_translations.json` and stores the result. Call this action once during app initialisation (alongside wherever the floor data is first loaded).

Add a `translatePoi` helper function (NOT a store action — a plain exported function) that the display components will call:

```js
export function translatePoi(englishName, translations) {
  if (!englishName) return englishName;
  return translations[englishName] ?? englishName;
}
```

**Important:** Keep the signature simple. Components pass `englishName` (the string from the API) and `translations` (from `useNavStore(s => s.poiTranslations)`). No magic, no hooks inside the helper.

### Step 5 — Wire the helper into all five display sites

For each of the five display sites, make the minimal change to pass names through `translatePoi`. Do NOT restructure the components. Do NOT change prop shapes, state shape, or logic.

#### 5a. FloorMap.jsx (line ~936)

Before:
```jsx
{poi?.name || node.label}
```
After:
```jsx
{translatePoi(poi?.name || node.label, poiTranslations)}
```

Add `import { translatePoi } from '../store/useNavStore';` at the top.
Add `const poiTranslations = useNavStore(s => s.poiTranslations);` inside the component.

#### 5b. SearchBar.jsx (line ~98)

Before:
```jsx
{r.name}
```
After:
```jsx
{translatePoi(r.name, poiTranslations)}
```

Same import and store selector as 5a.

#### 5c. InstructionPanel.jsx (lines ~111–121)

The destination label is resolved by `destinationLabel(floor, nodeId)` in the store. After that resolution, the result is displayed. Wrap the display value:

Before:
```jsx
{destLabel}
```
After:
```jsx
{translatePoi(destLabel, poiTranslations)}
```

Do NOT change `destinationLabel()` itself — it must keep returning English names because the backend search still uses them.

#### 5d. ChatbotPanel.jsx (line ~175)

Before:
```jsx
{c.name}
```
After:
```jsx
{translatePoi(c.name, poiTranslations)}
```

#### 5e. LocationPicker.jsx (line ~170)

Before:
```jsx
{location.label}
```
After:
```jsx
{translatePoi(location.label, poiTranslations)}
```

**Note on search within LocationPicker:** The component currently searches across `label`, `detail`, and `type` (lines ~22–24). The search must continue to work with English strings since that is what the data contains. Do NOT translate the search input or the data values used for matching — only translate the displayed label text.

### Step 6 — Initialise the translation loader

Find where the app first loads floor data (likely in `App.jsx` or the store's `init` action). Add a call to `loadPoiTranslations()` at the same point so translations are available before any POI names render.

If `loadPoiTranslations` fails (network error, file missing), it should log a warning and leave `poiTranslations` as `{}`. The `translatePoi` helper's `?? englishName` fallback ensures English names display rather than blank.

### Step 7 — Write `translation/poi_replacement_report.txt`

```
POI REPLACEMENT REPORT
======================

Translations loaded into poi_translations.json: N
Skipped — blank Japanese: N
Skipped — identical to English (likely untranslated): N

Display sites patched:
  [ ] FloorMap.jsx
  [ ] SearchBar.jsx
  [ ] InstructionPanel.jsx
  [ ] ChatbotPanel.jsx
  [ ] LocationPicker.jsx

Store changes:
  [ ] poiTranslations state added
  [ ] loadPoiTranslations action added
  [ ] translatePoi helper exported

--- WARNINGS (identical English/Japanese — verify with translator) ---
English value

--- UNTRANSLATED (blank Japanese — will display English) ---
English value
```

---

## Final rules

- Never modify `backend/` files of any kind
- Never modify `backend/seed/nodes.json`
- Never rename, delete, or alter `poi.name` or `node.label` values anywhere in the codebase
- Never change `search_terms` logic or SQL queries
- Never change how `destinationLabel()` or `findPoiForNode()` compute their return values
- Only translate at the display layer — the last moment before text appears in JSX
- If you are unsure whether a string is a POI name or a UI string, check whether it appears in `backend/seed/nodes.json`. If yes, it belongs in Phase 3. If no, it was handled in Phase 1/2.
- Preserve all original file encoding (UTF-8) and line endings
- Never add comments explaining what the change does — the code is self-explanatory
