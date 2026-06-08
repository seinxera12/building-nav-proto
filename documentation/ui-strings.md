# UI Strings — QR Nav

Extracted from all user-facing React components. Strings are listed exactly as they appear in source. File path and line number follow each entry.

---

## [BUTTONS]

| Text | File | Line |
|------|------|------|
| `Retry` | `frontend/src/App.jsx` | 131 |
| `Scan to Locate` | `frontend/src/App.jsx` | 165 |
| `Update Anchor` | `frontend/src/App.jsx` | 165 |
| `End Navigation` | `frontend/src/components/ArrivedScreen.jsx` | 21 |
| `🌐 {langLabel}` (e.g. `🌐 Auto`) | `frontend/src/components/ChatbotPanel.jsx` | 105 |
| `✕` (close chatbot) | `frontend/src/components/ChatbotPanel.jsx` | 113 |
| `➤` (send message) | `frontend/src/components/ChatbotPanel.jsx` | 186 |
| `Close` | `frontend/src/components/EntryPrompt.jsx` | 38 |
| `Scan QR` | `frontend/src/components/EntryPrompt.jsx` | 52 |
| `Select from list` | `frontend/src/components/EntryPrompt.jsx` | 60 |
| `⊙ Fit` | `frontend/src/components/FloorMap.jsx` | 100 |
| `Cancel` (FloorMap banner) | `frontend/src/components/FloorMap.jsx` | 338 |
| `Dismiss` | `frontend/src/components/InstructionPanel.jsx` | 50 |
| `Cancel` (route preview) | `frontend/src/components/InstructionPanel.jsx` | 88 |
| `Begin` | `frontend/src/components/InstructionPanel.jsx` | 90 |
| `Next` | `frontend/src/components/InstructionPanel.jsx` | 137 |
| `Cancel Navigation` | `frontend/src/components/InstructionPanel.jsx` | 141 |
| `Update` | `frontend/src/components/LocationBar.jsx` | 29 |
| `Select Manually` | `frontend/src/components/QRScanner.jsx` | 103 |
| `Select location manually` | `frontend/src/components/QRScanner.jsx` | 115 |
| `✕` (close scanner) | `frontend/src/components/QRScanner.jsx` | 122 |
| `✕` (clear search) | `frontend/src/components/SearchBar.jsx` | 68 |
| `Next ▶` | `frontend/src/components/SimulationPanel.jsx` | 96 |
| `Auto ⏩` | `frontend/src/components/SimulationPanel.jsx` | 103 |
| `Pause ⏸` | `frontend/src/components/SimulationPanel.jsx` | 111 |
| `Reset ↺` | `frontend/src/components/SimulationPanel.jsx` | 119 |
| `↻ Refresh` | `frontend/src/pages/AdminPage.jsx` | 88 |
| `…` (loading state of Refresh) | `frontend/src/pages/AdminPage.jsx` | 88 |

---

## [HEADINGS]

| Text | File | Line |
|------|------|------|
| `QR Nav` (h1, app header) | `frontend/src/App.jsx` | 121 |
| `You have arrived!` (h2) | `frontend/src/components/ArrivedScreen.jsx` | 14 |
| `🤖 Navigation Assistant` (panel title) | `frontend/src/components/ChatbotPanel.jsx` | 101 |
| `Update your location` (h2, entry prompt update mode) | `frontend/src/components/EntryPrompt.jsx` | 36 |
| `Where are you?` (h2, entry prompt entry mode) | `frontend/src/components/EntryPrompt.jsx` | 36 |
| `Did you mean one of these?` (candidates sub-heading) | `frontend/src/components/ChatbotPanel.jsx` | 170 |
| `Demo Mode` (eyebrow label) | `frontend/src/components/SimulationPanel.jsx` | 64 |
| `{scenario.name}` (h2, dynamic scenario title) | `frontend/src/components/SimulationPanel.jsx` | 65 |
| `QR Nav — Analytics` (h1) | `frontend/src/pages/AdminPage.jsx` | 83 |

---

## [NAVIGATION ITEMS / LABELS]

| Text | File | Line |
|------|------|------|
| `Location` (eyebrow label above entry prompt title) | `frontend/src/components/EntryPrompt.jsx` | 35 |
| `Scenario` (select label) | `frontend/src/components/SimulationPanel.jsx` | 72 |
| `Space / P / R` (keyboard shortcut hint) | `frontend/src/components/SimulationPanel.jsx` | 127 |

---

## [ALERTS / MESSAGES / NOTIFICATIONS]

| Text | File | Line |
|------|------|------|
| `⚠️ {floorError}` (dynamic floor load error) | `frontend/src/App.jsx` | 130 |
| `Recalculating...` (rerouting overlay) | `frontend/src/App.jsx` | 151 |
| `⚠️ Voice assistant offline — use text search or browse by category.` | `frontend/src/components/ChatbotPanel.jsx` | 118 |
| `⚠️ {error}` (dynamic admin error) | `frontend/src/pages/AdminPage.jsx` | 94 |

---

## [OFFLINE / STATUS BANNERS]

| Text | File | Line |
|------|------|------|
| `Offline` | `frontend/src/components/OfflineBanner.jsx` | 18 |
| `Using cached data.` | `frontend/src/components/OfflineBanner.jsx` | 19 |
| `Cached {days} day ago - may be outdated.` / `Cached {days} days ago - may be outdated.` (dynamic) | `frontend/src/components/OfflineBanner.jsx` | 9 |

---

## [FORM LABELS, PLACEHOLDERS & SEARCH INPUTS]

| Text | File | Line |
|------|------|------|
| `Search rooms, entrances, lobbies...` (placeholder) | `frontend/src/components/EntryPrompt.jsx` | 67 |
| `Ask where to go…` (placeholder, chatbot available) | `frontend/src/components/ChatbotPanel.jsx` | 180 |
| `Type to search manually…` (placeholder, chatbot unavailable) | `frontend/src/components/ChatbotPanel.jsx` | 180 |
| `Search for a destination…` (placeholder) | `frontend/src/components/SearchBar.jsx` | 61 |

---

## [ARIA LABELS (screen-reader only text)]

| Text | File | Line |
|------|------|------|
| `Open navigation assistant` | `frontend/src/App.jsx` | 172 |
| `Select language` | `frontend/src/components/ChatbotPanel.jsx` | 104 |
| `Close chatbot` | `frontend/src/components/ChatbotPanel.jsx` | 113 |
| `Release to send` | `frontend/src/components/ChatbotPanel.jsx` | 175 |
| `Hold to speak` | `frontend/src/components/ChatbotPanel.jsx` | 175 |
| `Send message` | `frontend/src/components/ChatbotPanel.jsx` | 186 |
| `Cancel route preview` | `frontend/src/components/InstructionPanel.jsx` | 79 |
| `Cancel navigation` | `frontend/src/components/InstructionPanel.jsx` | 122 |
| `Navigation map` | `frontend/src/components/FloorMap.jsx` | 244 |
| `QR scanner` | `frontend/src/components/QRScanner.jsx` | 67 |
| `Close scanner` | `frontend/src/components/QRScanner.jsx` | 122 |
| `Clear search` | `frontend/src/components/SearchBar.jsx` | 68 |
| `Simulation control panel` | `frontend/src/components/SimulationPanel.jsx` | 57 |
| `Refresh analytics data` | `frontend/src/pages/AdminPage.jsx` | 87 |
| `Summary statistics` | `frontend/src/pages/AdminPage.jsx` | 96 |
| `Loading map` | `frontend/src/pages/AdminPage.jsx` | 116 |
| `Heatmap — QR scan frequency` | `frontend/src/pages/AdminPage.jsx` | 126 |

---

## [EMPTY STATES]

| Text | File | Line |
|------|------|------|
| `Ask me where you'd like to go, or say` + `"I need accessible routes."` | `frontend/src/components/ChatbotPanel.jsx` | 151–152 |
| `No matching places.` | `frontend/src/components/EntryPrompt.jsx` | 74 |
| `Searching…` | `frontend/src/components/SearchBar.jsx` | 76 |
| `No results found` | `frontend/src/components/SearchBar.jsx` | 78 |

---

## [STATUS / PROGRESS INDICATORS]

| Text | File | Line |
|------|------|------|
| `Loading map…` (location bar loading) | `frontend/src/components/LocationBar.jsx` | 12 |
| `Scan a QR code to set your position` (no location) | `frontend/src/components/LocationBar.jsx` | 24 |
| `Computing route...` | `frontend/src/components/InstructionPanel.jsx` | 40 |
| `Step {n} of {total}` (dynamic) | `frontend/src/components/InstructionPanel.jsx` | 130 |
| `Next` (upcoming instruction label) | `frontend/src/components/InstructionPanel.jsx` | 135 |
| `Currently: {label}` (dynamic, entry prompt update mode) | `frontend/src/components/EntryPrompt.jsx` | 42 |
| `Requesting camera access...` | `frontend/src/components/QRScanner.jsx` | 87 |
| `Point at a QR code` | `frontend/src/components/QRScanner.jsx` | 88 |
| `Select your current location on a map node.` | `frontend/src/components/FloorMap.jsx` | 337 |
| `Loading map…` (admin page) | `frontend/src/pages/AdminPage.jsx` | 117 |
| `Autoplay` | `frontend/src/components/SimulationPanel.jsx` | 121 |
| `Executing` | `frontend/src/components/SimulationPanel.jsx` | 123 |
| `Done` | `frontend/src/components/SimulationPanel.jsx` | 125 |
| `Ready` | `frontend/src/components/SimulationPanel.jsx` | 127 |
| `Idle` | `frontend/src/components/SimulationPanel.jsx` | 129 |

---

## [MODAL / DIALOG CONTENT]

| Text | File | Line |
|------|------|------|
| `Cancel current navigation?` (window.confirm) | `frontend/src/components/InstructionPanel.jsx` | 123 |
| `Cancel current navigation?` (window.confirm, second instance) | `frontend/src/components/InstructionPanel.jsx` | 143 |

---

## [TOOLTIP LABELS]

| Text | File | Line |
|------|------|------|
| `Destination` (fallback destination marker tooltip) | `frontend/src/components/FloorMap.jsx` | 173 |
| `{poi?.name \| node.label}` (POI node tooltip, dynamic) | `frontend/src/components/FloorMap.jsx` | 309 |
| `{node.label}` (QR anchor tooltip, dynamic) | `frontend/src/components/FloorMap.jsx` | 313 |
| `{entry.label}: {entry.scan_count} scan` / `scans` (heatmap tooltip, dynamic) | `frontend/src/pages/AdminPage.jsx` | 145 |

---

## [ENTRY PROMPT — OPTION CARDS]

| Text | File | Line |
|------|------|------|
| `Scan QR` (strong label) | `frontend/src/components/EntryPrompt.jsx` | 53 |
| `Use a nearby wall marker.` (small description) | `frontend/src/components/EntryPrompt.jsx` | 54 |
| `Select from list` (strong label) | `frontend/src/components/EntryPrompt.jsx` | 61 |
| `Choose from known places.` (small description) | `frontend/src/components/EntryPrompt.jsx` | 62 |

---

## [QR SCANNER — ERROR / TIMEOUT]

| Text | File | Line |
|------|------|------|
| `Having trouble? Try selecting your location from the list.` | `frontend/src/components/QRScanner.jsx` | 99 |
| `Camera permission denied` (toast error, dynamically set) | `frontend/src/components/QRScanner.jsx` | 58 |
| `Camera unavailable` (toast error, dynamically set) | `frontend/src/components/QRScanner.jsx` | 59 |
| `Camera access is unavailable. Allow camera access in browser settings, or select your location manually.` | `frontend/src/components/QRScanner.jsx` | 111 |

---

## [ADMIN PAGE — STAT CARD LABELS]

| Text | File | Line |
|------|------|------|
| `Total Sessions` | `frontend/src/pages/AdminPage.jsx` | 97 |
| `Total Routes` | `frontend/src/pages/AdminPage.jsx` | 98 |
| `Completion Rate` | `frontend/src/pages/AdminPage.jsx` | 99 |
| `Most Visited` | `frontend/src/pages/AdminPage.jsx` | 100 |
| `None yet` (fallback for Most Visited) | `frontend/src/pages/AdminPage.jsx` | 100 |

---

## [CHATBOT LANGUAGE SELECTOR OPTIONS]

| Text | File | Line |
|------|------|------|
| `Auto` | `frontend/src/components/ChatbotPanel.jsx` | 19 |
| `English` | `frontend/src/components/ChatbotPanel.jsx` | 20 |
| `日本語` | `frontend/src/components/ChatbotPanel.jsx` | 21 |
| `中文` | `frontend/src/components/ChatbotPanel.jsx` | 22 |
| `한국어` | `frontend/src/components/ChatbotPanel.jsx` | 23 |

---

## [TTS / SPOKEN ANNOUNCEMENTS]
> These strings are spoken via TTS but not visually rendered.

| Text | File | Line |
|------|------|------|
| `You are located at {currentNode.label}` (dynamic) | `frontend/src/components/NavTTSPlayer.jsx` | 78 |
| `Recalculating route` | `frontend/src/components/NavTTSPlayer.jsx` | 83 |
| `You have arrived at {label}` (dynamic) | `frontend/src/components/NavTTSPlayer.jsx` | 89 |
| `{inst.text}` (step instruction, dynamic) | `frontend/src/components/NavTTSPlayer.jsx` | 103 |

---

## [ROUTE PREVIEW — STATS]

| Text | File | Line |
|------|------|------|
| `{distanceLabel(totalDistance)}` (dynamic, e.g. `~45m`) | `frontend/src/components/InstructionPanel.jsx` | 72 |
| `{instructions.length} instructions` (dynamic) | `frontend/src/components/InstructionPanel.jsx` | 73 |
| `{n} min walk` (dynamic) | `frontend/src/components/InstructionPanel.jsx` | 74 |

---

## [ARRIVED SCREEN]

| Text | File | Line |
|------|------|------|
| `You have arrived!` | `frontend/src/components/ArrivedScreen.jsx` | 14 |
| `Welcome to {destinationName}` (dynamic) | `frontend/src/components/ArrivedScreen.jsx` | 16 |
