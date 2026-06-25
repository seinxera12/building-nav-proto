# Phase A — POI Data Replacement (seed + reseed)

Replace the generic prototype POI names with real One Fukuoka tenant names. Change **only** `label` strings in `backend/seed/nodes.json`; keep every id, coordinate, type, elevation, and edge identical. Then enrich `search_terms` during seeding so search works in English **and** Japanese. Then reseed the DB.

> Authority: the user said *"just replace the names, the structure and edges can be the same"* and *"carefully select / filter / create new poi names if some of the names are incorrect / duplicate / not relevant to the building or if the current list is not sufficient to fill up all the current nodes structure."* Use that latitude — but document every decision.

---

## Step 0 — Read inputs

- `translation/floorplan/new_poi.txt` — the new names (English: Japanese pairs), grouped by floor
- `backend/seed/nodes.json` — current nodes (the only file whose `label`s change)
- `backend/seed.py` lines 97–105 — current POI seeding (to be extended)

Parse `new_poi.txt` into a list of `{ english, japanese, inferred_type }` per floor. Infer type from the name:
- contains "Entrance" / "Drop-off" / "Lobby" → `entrance`
- contains "Elevator" → `elevator`
- contains "Bicycle Parking" → treat as a `poi` (amenity) unless a spare amenity node exists
- everything else → `poi` (retail / F&B / service tenant)

---

## Step 1 — Build the node→name assignment table (do this BEFORE editing)

Produce an explicit assignment table and write it to `translation/floorplan/poi_assignment.md` for human review. Do **not** edit `nodes.json` until this table is complete and internally consistent.

### Hard rules
1. **Only POI-type nodes change.** A node's `type` is in `{poi, elevator, entrance, stairs, escalator}`. `junction` nodes are never touched.
2. **Type must match.** A new name inferred as `entrance` may only be assigned to an `entrance` node; `elevator`→`elevator`; etc. Tenant (`poi`) names go on `poi` nodes.
3. **Preserve id, x, y, type, floor_id, elevation.** Only `label` changes.
4. **No duplicate labels within a floor** unless the real building genuinely repeats them (restrooms/elevators may legitimately repeat — keep generic functional names like "Restrooms" for those rather than a tenant name).
5. **Keep functional infra readable.** Stairwells, elevators, and restrooms should keep clear functional names (e.g. "Elevator Bank", "Restrooms", "Stairwell NW") OR an appropriate new-name infra label — but never a fashion-brand name. These still get Japanese overlays in Phase B.

### Floor 1 assignment (20 POI nodes)

Infrastructure nodes — assign infra new-names where they fit, else keep current functional label:
| id | type | current label | assign |
|----|------|---------------|--------|
| 1  | entrance | Main Entrance | `Grand Lobby` (main public entrance) |
| 15 | entrance | North Entrance | `Car Drop-off` (vehicular entrance) |
| 2  | elevator | Elevator Bank | keep `Elevator Bank` (or `Office Sky Lobby Elevator` if it best matches this bank) |
| 3  | escalator | Central Escalators | keep `Central Escalators` |
| 4  | stairs | Stairwell NW | keep `Stairwell NW` |
| 5  | stairs | Stairwell SE | keep `Stairwell SE` |

> Note: "ONE FUKUOKA HOTEL Entrance" and "Office Conference" / "Office Sky Lobby Elevator" / "One Fukuoka Bldg. Bicycle Parking" are extra infra-ish names with no matching dedicated node. Options, in priority order: (a) assign to the best-fitting infra node above if clearly better than the current label; (b) assign to a retail `poi` node only if the name is a real visitable destination (the Hotel Entrance and Bicycle Parking are plausible POIs); (c) drop and document. Prefer keeping the map legible.

Retail `poi` nodes (ids 16–29, 14 nodes) — assign the 10 tenant names, then fill the remaining 4 with the leftover plausible destinations (Hotel Entrance, Bicycle Parking) and **invented** tenants consistent with a luxury Fukuoka building. Keep spatial sense: ids 19/20/21 are the cosmetics/jewelry/optics cluster → assign beauty/jewelry tenants (MUCHA, Hirotaka, Spica・ALBION, NIWAKA, PIERRE MARCOLINI); id 22 stays `Restrooms`; ids 27/28 are food-court nodes → assign F&B (THE CAFE by ONE FUKUOKA HOTEL); id 29 stays `Information Desk`.

| id | current label | category | suggested assign |
|----|---------------|----------|------------------|
| 16 | Northgate Department Store | poi | `CHANEL` |
| 17 | Apparel Co. | poi | `Valextra` |
| 18 | Tech Hub | poi | `EDIT(h)` |
| 19 | Cosmetics | poi | `Spica・ALBION` |
| 20 | Jewelry | poi | `Hirotaka` |
| 21 | Optics | poi | `NIWAKA` |
| 22 | Restrooms | poi | keep `Restrooms` |
| 23 | Electronics | poi | `MUCHA` |
| 24 | FreshMart Supermarket | poi | `THE CONTINENTAL ROYAL&Goh` |
| 25 | Pharmacy | poi | `PIERRE MARCOLINI` |
| 26 | City Bank | poi | `ONE FUKUOKA HOTEL Entrance` |
| 27 | Food Court West | poi | `THE CAFE by ONE FUKUOKA HOTEL` |
| 28 | Food Court East | poi | invent, e.g. `One Fukuoka Bldg. Bicycle Parking` or a plausible F&B tenant |
| 29 | Information Desk | poi | keep `Information Desk` |

> The table above is a **starting recommendation**, not a mandate. The implementing agent must finalize it using judgment, keep functional nodes functional, and record the final mapping + any invented names in `poi_assignment.md`.

### Floor 2 assignment (24 POI nodes)
- Infra ids 101–104 → keep functional labels (`Elevator Bank`, `Central Escalators`, `Stairwell NW`, `Stairwell SE`).
- Retail ids 116–135 (20 nodes) → assign the 21 Floor-2 tenant names; the list has one spare, so pick the best-fitting 20 and drop/merge one (document which). Keep functional nodes functional: id 122 stays `Restrooms`, id 128 stays `Restroom (West)`, id 135 stays `Information Desk`, id 125 may stay `Management Office`, id 126 may stay `Storage`. That frees the count so the ~20 tenant names land on genuine retail nodes (116–121, 123–124, 127, 129–134) — confirm exact count during assignment and invent/drop to balance.

> Floor 2 has more retail-ish nodes than Floor 1; reconcile the 21 names vs. the available retail nodes after reserving functional nodes. Document the final count math in `poi_assignment.md`.

---

## Step 2 — Edit `nodes.json`

For each row in the finalized assignment table, change **only** the `label` value. Preserve exact JSON formatting/alignment (the file uses column-aligned spacing — match it). Do not reorder rows. Do not touch `junction` rows. Do not touch any non-`label` field.

Verify after editing:
- Same number of lines / same node count
- `git diff` shows **only** `label` changes
- No id, x, y, type, floor_id, or elevation changed

---

## Step 3 — Enrich `search_terms` in `seed.py`

Currently (`seed.py:101-104`):
```python
db.add(POI(
    node_id=p["id"], name=p["label"],
    category=p["type"],
    search_terms=p["label"].lower()
))
```

`search_terms` must become bilingual + keyword-rich so the `/search` and chat `LIKE` queries match English, Japanese, and category words. Build it from three sources:

1. The English canonical label (lowercased)
2. The Japanese name (from `poi_translations.json` or an inline map keyed by English label)
3. Category/synonym keywords (e.g. `restroom toilet` for restrooms, `elevator lift` for elevators)

Recommended approach — load a side map and compose:
```python
# Load the same English→Japanese map used by the frontend, so search_terms
# stays in sync with poi_translations.json (single source of truth).
import json, pathlib
_poi_ja = json.loads(pathlib.Path("seed/poi_translations.json").read_text(encoding="utf-8"))

def _search_terms(label: str, category: str) -> str:
    parts = [label.lower()]
    ja = _poi_ja.get(label)
    if ja:
        parts.append(ja)              # Japanese matches Japanese queries
    parts.append(category)            # 'poi' / 'elevator' / etc.
    # optional synonyms by category
    synonyms = {
        "elevator": "lift エレベーター",
        "stairs": "stairway 階段",
        "escalator": "エスカレーター",
        "entrance": "exit 入口 出口",
    }
    if category in synonyms:
        parts.append(synonyms[category])
    return " ".join(parts)
```
Then:
```python
search_terms=_search_terms(p["label"], p["type"])
```

> Keep `name=p["label"]` unchanged — the canonical English/Latin tenant name stays the join key and the AI-context value. Only `search_terms` becomes bilingual.

> Place a copy of the canonical→Japanese map at `backend/seed/poi_translations.json` (identical content to `frontend/public/poi_translations.json`) so the backend can build `search_terms` without reaching into the frontend tree. Phase B generates both copies from one source. If you prefer a single file, document the path the seed reads.

---

## Step 4 — Reseed the database

The seed script drops/recreates or upserts POIs. Run it the same way the project already does (check `backend/` for the documented command — e.g. `python seed.py`, a make target, or a Docker exec). Confirm:
- POI rows now have the new `name` values
- `search_terms` contains both English and Japanese tokens
- Node/edge counts unchanged (the seed script prints these — compare against a pre-change run)

Spot-check with the API:
- `GET /search?q=chanel` → returns the CHANEL POI
- `GET /search?q=シャネル` → returns the same POI (bilingual search working)
- `GET /map/floor/1` → POI names are the new tenant names

---

## Step 5 — Write `translation/floorplan/poi_assignment.md` (the audit)

Record:
- Final id → (old label → new label) table for both floors
- Every **invented** name and why
- Every **dropped** new-name and why
- Functional nodes intentionally kept generic (restrooms, stairs, info desk)
- Confirmation that no id/coord/type/edge changed

This file is the human-reviewable record of all judgment calls. It must exist before Phase B runs (Phase B's `poi_translations.json` keys must match the final `name` values exactly).
