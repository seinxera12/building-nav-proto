You are working inside a FastAPI + React/Vite building navigation project. Your task is a **read-only audit** of the frontend codebase. Do NOT modify any source files. Do NOT refactor, rename, or change any logic, imports, function names, or component structure.

## Goal
Crawl the entire frontend source tree and produce two output files:
1. `ui_text_inventory.txt` — a plain-text list of every user-visible string, formatted for a human translator
2. `ui_text_map.json` — a location map that links each string back to its exact file and line(s)

These outputs will be handed to a human translator (English → Japanese), and then to a second coding agent that will apply the translations. Your job is only to extract and document — not to translate or modify anything.

---

## Step 1 — Understand the project layout

Begin by listing the top-level directory structure of the frontend (likely `frontend/src/` or similar). Identify:
- All `.tsx`, `.ts`, `.jsx`, `.js` component files
- All `.json` locale/i18n files (if any)
- Any constants files that contain UI labels (e.g., `constants.ts`, `config.ts`, `labels.ts`)
- Any route or navigation config that contains page titles or breadcrumb strings

Print a brief summary of what you found before proceeding.

---

## Step 2 — Define what counts as "user-visible text"

Only extract strings that a user will see in the browser. Include:
- Button labels (`Save`, `onClick` aria-labels)
- Input placeholders (`placeholder="Search buildings..."`)
- Form field labels (`Floor`)
- Page/section headings and subheadings
- Navigation menu items and sidebar links
- Tab labels
- Table column headers
- Toast/alert/error/success messages
- Modal titles and body text
- Tooltip content
- Empty-state messages ("No results found")
- Dropdown option text
- Step labels in wizards or onboarding flows
- Any hardcoded string passed to a `title`, `aria-label`, `alt`, or `placeholder` prop

Do NOT extract:
- Variable names, function names, or class names
- Console.log strings or developer-only comments
- CSS class names or Tailwind utilities
- API endpoint paths, route paths, or env variables
- IDs, keys, or data values that are not displayed to users
- Strings inside comments

---

## Step 3 — Crawl every frontend source file

For each file in `frontend/src/` (recurse fully):
1. Open the file and scan line by line
2. For every user-visible string found, record:
   - `id`: a unique slug (e.g., `nav_floor_selector`, `btn_save_route`, `modal_confirm_title`) — use snake_case, be descriptive
   - `original_text`: the exact English string as it appears in code
   - `context`: one sentence describing where this text appears in the UI
   - `component`: the React component name or file where it lives
   - `file`: relative path from the project root
   - `line_start` and `line_end`: line numbers
   - `code_snippet`: the exact raw line(s) of source code (3–5 lines for context)

---

## Step 4 — Write `ui_text_inventory.txt`

This file is for the human translator. Format it as a clean, readable plain-text list — one entry per string, grouped by component/file section. Use this exact format:

```
========================================
COMPONENT: RoutePlanner  (frontend/src/components/RoutePlanner.tsx)
========================================

[btn_save_route]
English:  Save Route
Context:  Primary action button in the route planning panel
Japanese: 

--

[input_search_placeholder]
English:  Search buildings...
Context:  Placeholder text inside the main search input
Japanese: 

--
```

Rules for this file:
- Group all strings from the same component/file under one header
- Separate each entry with `--` on its own line
- The `Japanese:` line is intentionally blank — the translator fills it in
- Do not include file paths, line numbers, or code snippets in this file — keep it clean for the translator
- Use the same `id` slugs (in square brackets) as in `ui_text_map.json` so the two files stay in sync

---

## Step 5 — Write `ui_text_map.json`

This file is for the coding agent that will apply the translations later. Format it as a JSON array of location records that exactly mirrors `ui_text_inventory.txt` by `id`:

```json
[
  {
    "id": "btn_save_route",
    "file": "frontend/src/components/RoutePlanner.tsx",
    "line_start": 84,
    "line_end": 84,
    "code_snippet": "  Save Route"
  },
  ...
]
```

---

## Step 6 — Final checks before writing output

Before writing the files, verify:
- [ ] No duplicate `id` values
- [ ] Every `id` in `ui_text_inventory.txt` has a matching entry in `ui_text_map.json`
- [ ] No extracted string is a variable reference (e.g., `{label}`) — only static hardcoded strings
- [ ] If a string appears in multiple places (reused component), create one entry per occurrence with a numeric suffix on the `id` (e.g., `btn_cancel_1`, `btn_cancel_2`)
- [ ] Strings inside i18n/locale JSON files should be listed under their key path as `file`, not a component

---

## Output

Write both files to the project root (or a `/translation/` folder if one exists):
- `ui_text_inventory.txt`
- `ui_text_map.json`

Then print a short summary:
- Total strings found
- Files crawled
- Any files skipped and why
- Any ambiguous cases where you were unsure if a string was user-visible (list them so a human can decide)

Do not modify any source file. This is a read-only extraction task.