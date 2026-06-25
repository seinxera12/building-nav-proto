# Phase B — Japanese Display Overlay + Bilingual Search Dropdown

Runs **after** Phase A (DB reseeded with new tenant `name` values and bilingual `search_terms`). This phase makes the UI show Japanese while search keeps working in English, and makes the search dropdown show **both** languages.

This phase reuses the mechanism from `.claude/specs/ui-japanese/instruction_phase3.md` (translation map + `translatePoi` helper + five display sites). The only additions are: (1) the overlay keys are now the **new tenant names**, and (2) the SearchBar shows an English subline.

---

## Step 1 — Generate `poi_translations.json` (two copies, one source)

From the finalized `translation/floorplan/poi_assignment.md` (Phase A) and the Japanese values in `translation/floorplan/new_poi.txt`, build the canonical-English → Japanese map.

Write it to **both**:
- `frontend/public/poi_translations.json` — served to the browser at `/poi_translations.json`
- `backend/seed/poi_translations.json` — read by `seed.py` to build `search_terms`

They must be byte-identical. Generate from one in-memory dict, write twice.

```json
{
  "CHANEL": "シャネル",
  "Valextra": "ヴァレクストラ",
  "Grand Lobby": "グランドロビー",
  "Car Drop-off": "車寄せ",
  "MUCHA": "ミュシャ",
  "Hirotaka": "ヒロタカ",
  "Spica・ALBION": "スピカ・アルビオン",
  "EDIT(h)": "エディット",
  "NIWAKA": "ニワカ",
  "THE CONTINENTAL ROYAL&Goh": "ザ・コンチネンタル ロイヤル アンド ゴー",
  "PIERRE MARCOLINI": "ピエール マルコリーニ",
  "THE CAFE by ONE FUKUOKA HOTEL": "ザ カフェ バイ ワンフクオカホテル",
  "ONE FUKUOKA HOTEL Entrance": "ワンフクオカホテル エントランス",
  "Patou": "パトゥ",
  "MoMA Design Store": "モマデザインストア",
  "NIKE FUKUOKA TENJIN": "ナイキ 福岡天神"
}
```

Rules:
- **Keys must equal the final `pois.name` values byte-for-byte** (same spelling, same `・`, same casing). A mismatch silently falls back to English.
- Include **every** POI whose displayed name should differ from its canonical name — including functional ones you want Japanese for (e.g. `"Restrooms": "お手洗い"`, `"Information Desk": "インフォメーション"`, `"Elevator Bank": "エレベーター"`, `"Central Escalators": "中央エスカレーター"`, `"Stairwell NW": "北西階段"`). The new-name list doesn't cover these, so add sensible Japanese for the functional nodes too.
- Omit any key whose Japanese would equal the English (pure-Latin brand shown identically) — the `?? englishName` fallback handles it. (You may still include it for clarity; it's harmless.)

---

## Step 2 — Store: state, loader, helper

Edit `frontend/src/store/useNavStore.js`:

1. Add state: `poiTranslations: {},`
2. Add action `loadPoiTranslations`:
```js
loadPoiTranslations: async () => {
  try {
    const res = await fetch('/poi_translations.json');
    if (!res.ok) throw new Error(`poi_translations ${res.status}`);
    set({ poiTranslations: await res.json() });
  } catch (e) {
    console.warn('POI translations failed to load; showing canonical names', e);
    set({ poiTranslations: {} });
  }
},
```
3. Export the pure helper (module scope, not inside the store):
```js
export function translatePoi(name, translations) {
  if (!name) return name;
  return translations?.[name] ?? name;
}
```

Do **not** change `destinationLabel()` or `findPoiForNode()` — they must keep returning the canonical English `name`, because that is the join key for both the overlay and the chatbot context.

---

## Step 3 — Initialize the loader at startup

In `frontend/src/App.jsx` (or wherever floors are first fetched in the store's init), call `loadPoiTranslations()` once, early, so the overlay is present before POI names first render. It runs in parallel with floor loading; the fallback guarantees no blank labels if it's slow.

---

## Step 4 — Wire `translatePoi` into the five display sites

For each, add:
```js
import { translatePoi } from '../store/useNavStore';
const poiTranslations = useNavStore(s => s.poiTranslations);
```
and wrap the displayed name. Verify the exact line by reading the file first (line numbers below are from the audit and may have shifted).

- **FloorMap.jsx** (~line 936): `{poi?.name || node.label}` → `{translatePoi(poi?.name || node.label, poiTranslations)}`
- **InstructionPanel.jsx** (~lines 111–121): wrap the resolved `destLabel` → `{translatePoi(destLabel, poiTranslations)}`
- **ChatbotPanel.jsx** (~line 175): `{c.name}` → `{translatePoi(c.name, poiTranslations)}`
- **LocationPicker.jsx** (~line 170): `{location.label}` → `{translatePoi(location.label, poiTranslations)}` (display only — keep search matching on raw `label`/`detail`/`type`, lines ~22–24, untouched)
- **SearchBar.jsx** — see Step 5 (special: bilingual two-line display)

Do not restructure components, change prop shapes, convert quotes, or touch logic.

---

## Step 5 — Bilingual search dropdown (SearchBar.jsx)

The dropdown item already has two lines (`SearchBar.jsx:97-103`):
```jsx
<span className="search-bar__item-name">{r.name}</span>
<span className="search-bar__item-cat">{r.category}{r.floorName ? ` · ${r.floorName}` : ''}</span>
```

Change to show **Japanese primary, English secondary**:
```jsx
<span className="search-bar__item-name">{translatePoi(r.name, poiTranslations)}</span>
<span className="search-bar__item-cat">
  {r.name}
  {' · '}{r.category}
  {r.floorName ? ` · ${r.floorName}` : ''}
</span>
```

- Primary line = Japanese (or canonical fallback)
- Secondary line = canonical English name + category + floor, so the user sees the English they may have typed and confirms the match
- Add the same `import` + `poiTranslations` selector as the other sites
- If `translatePoi(r.name)` equals `r.name` (no Japanese), the two lines will duplicate the name; acceptable, but optionally guard: only show the English subline when it differs from the primary.

**Search-by-English requirement:** already satisfied by Phase A (`search_terms` contains the English name). No frontend matching change — the input still sends the raw query to `/search`, which matches `search_terms`. Confirm by typing `chanel` and seeing シャネル appear.

> Optional CSS: if the English subline crowds the category, consider a dedicated `search-bar__item-en` span. Only add CSS if the existing `__item-cat` styling looks cramped — check visually first. Keep class additions minimal and consistent with existing BEM naming.

---

## Step 6 — Verify end to end

1. **Build/lint** the frontend — no import or syntax errors.
2. **Map:** floor 1 and 2 render Japanese tenant names on POI dots/tooltips.
3. **Search English:** typing `chanel` → dropdown shows `シャネル` (primary) / `CHANEL` (secondary) → selecting routes correctly.
4. **Search Japanese:** typing `シャネル` → same result (confirms `search_terms` bilingual).
5. **Instructions:** starting navigation shows the Japanese destination name; routing still computes correctly (uses node ids, not labels).
6. **Chatbot:** asking for a destination returns candidates; candidate names display in Japanese; AI still resolves intent (it receives canonical English `available_pois`).
7. **Fallback:** temporarily rename `poi_translations.json` → app shows canonical English names, no blanks, console warns.

---

## Step 7 — Report

Write `translation/floorplan/poi_replacement_report.txt`:
```
FLOORPLAN POI TRANSLATION REPORT
================================

PHASE A — DATA
  POI labels replaced:        N
  Invented names:             N (listed)
  Dropped new-names:          N (listed)
  Functional nodes kept:      N (restrooms, stairs, info, etc.)
  Nodes/edges changed:        0 (verified via git diff — labels only)
  DB reseeded:                yes/no
  search_terms bilingual:     verified (chanel & シャネル both match)

PHASE B — DISPLAY + SEARCH
  poi_translations.json entries: N  (frontend + backend copies identical)
  Display sites wired:
    [ ] FloorMap.jsx
    [ ] SearchBar.jsx (bilingual two-line)
    [ ] InstructionPanel.jsx
    [ ] ChatbotPanel.jsx
    [ ] LocationPicker.jsx
  Store: poiTranslations state / loadPoiTranslations / translatePoi export  [ ]/[ ]/[ ]
  Startup loader wired:       [ ]

VERIFICATION
  English search:   pass/fail
  Japanese search:  pass/fail
  Map display JA:   pass/fail
  Instructions JA:  pass/fail
  Chatbot JA:       pass/fail
  Missing-file fallback: pass/fail

--- INVENTED NAMES ---
--- DROPPED NAMES ---
--- KEYS WITH NO JAPANESE (shown in English) ---
```

---

## Guardrails (whole phase)
- Backend logic, routing, and graph structure: untouched (only `seed.py` `search_terms` builder + reseed, done in Phase A).
- `pois.name` and `node.label` keep their canonical values; translation is display-only.
- `destinationLabel`, `findPoiForNode`, search matching on raw fields: untouched.
- UTF-8, existing line endings, existing quote styles preserved.
- No explanatory code comments added.
