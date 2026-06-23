You are working inside a FastAPI + React/Vite building navigation project. The human translator has returned the completed translation files. Your task is to apply Japanese translations surgically into the frontend source files using the provided map.

Do NOT change anything except the exact user-visible strings listed. Do NOT touch logic, imports, variable names, JSX structure, CSS classes, route paths, or any string not present in the translation files.

---

## Input files (all located in `translation/`)

- `ui_text_inventory.txt` — the completed inventory; each entry has a filled `Japanese:` line
- `ui_strings_client_japanese.txt` — the simplified flat list of Japanese strings (mirrors `ui_strings_client_english.txt` line-by-line, same order)
- `ui_text_map.json` — maps every `[id]` to its exact file, line numbers, and a code snippet

---

## Step 1 — Parse the translation sources

### From `ui_text_inventory.txt`:
Read every entry block and extract a lookup table of the form:
  id → { english, japanese }

An entry looks like:
```
[btn_save_route]
English:  Save Route
Context:  ...
Japanese: ルートを保存
```

Rules:
- Skip any entry where `Japanese:` is blank or missing — do not attempt that replacement
- Trim leading/trailing whitespace from both English and Japanese values
- If the Japanese value is identical to the English value, skip it and log a warning — it was likely left untranslated by mistake

### From `ui_strings_client_japanese.txt`:
This is a flat line-by-line list (one string per line, no ids, no labels). It is the Japanese counterpart to `ui_strings_client_english.txt`. Parse it as an ordered list. You will use it only for cross-verification in Step 3 — do not use it as a replacement source.

---

## Step 2 — Load the map

Read `ui_text_map.json`. For each entry, you have:
- `id` — matches the lookup table from Step 1
- `file` — relative path to the source file
- `line_start` / `line_end` — exact line numbers
- `code_snippet` — the original raw line(s) containing the English string

Build a combined work list by joining the map entries with the translation lookup on `id`. Only include entries that have a valid Japanese translation. Log and skip any `id` present in the map but missing from the translation lookup.

---

## Step 3 — Cross-verify with `ui_strings_client_japanese.txt`

Before making any edits, perform a sanity check:
- The line count of `ui_strings_client_japanese.txt` must equal the line count of `ui_strings_client_english.txt`
- Spot-check 5 random entries: confirm the Japanese string on line N of `ui_strings_client_japanese.txt` matches the `japanese` value for the corresponding `id` in your lookup table
- If counts mismatch or spot-checks fail, STOP and report the discrepancy — do not proceed with edits

---

## Step 4 — Apply replacements

Process each entry in the work list one file at a time (group by `file` to minimise open/close operations).

For each entry:

1. Open the file and read it into memory as an array of lines
2. Navigate to `line_start`
3. Verify the `code_snippet` from the map still matches the actual current content of those lines. If it does NOT match (the file may have changed since Phase 1), skip this entry and add it to a "stale map" warning list — do not guess
4. Identify the exact English string within those line(s) using the `code_snippet` as your guide. Apply the correct replacement pattern based on string type:

   **JSX text node** — text directly between tags:
   ```jsx
   // Before
   Recalculating...
   // After
   再計算中...
   ```

   **JSX attribute value (aria-label, placeholder, title, alt)** — replace only the value inside the quotes:
   ```jsx
   // Before
   aria-label="Open navigation assistant"
   // After
   aria-label="ナビゲーションアシスタントを開く"
   ```

   **JS/TS string variable or object value** — replace only the string content, preserve quote style:
   ```js
   // Before
   label: "Save Route"
   // After
   label: "ルートを保存"
   ```

   **Multi-line strings** — if `line_end > line_start`, reconstruct only the text content across those lines. Preserve all indentation, tag structure, and surrounding code exactly.

5. Write the modified line(s) back. All other lines in the file remain byte-for-byte identical.
6. After processing all entries for a file, write the full file back to disk.

---

## Step 5 — Update `ui_strings_client_english.txt` → `ui_strings_client_japanese.txt`

The `ui_strings_client_japanese.txt` was provided by the translator and is already correct — do not regenerate it. Confirm it exists in `translation/` and is non-empty. If it is missing, log an error but do not block the rest of the replacements.

---

## Step 6 — Write a replacement report

After all edits are done, write `translation/replacement_report.txt` with the following sections:

```
REPLACEMENT REPORT
==================

Applied successfully: N
Skipped — blank Japanese: N
Skipped — stale map (snippet mismatch): N
Skipped — missing from translation lookup: N
Warnings (identical English/Japanese): N

--- STALE MAP ENTRIES (review manually) ---
[id]  file:line  expected snippet vs actual

--- MISSING TRANSLATIONS (fill and re-run) ---
[id]  English value

--- IDENTICAL VALUES (likely untranslated) ---
[id]  value
```

---

## Final rules

- Never modify a line that is not in the work list
- Never change JSX structure, class names, or logic — only the visible string value
- Never convert single quotes to double quotes or vice versa
- Never add, remove, or reformat imports
- If you are unsure whether a replacement is safe (e.g. the same English string appears twice on the same line), skip it and add it to the report under a "Needs manual review" section
- Preserve all original file encoding (UTF-8) and line endings

Run Step 3 verification first. Only proceed to Step 4 if verification passes.