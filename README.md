# Augustin's FolioRecall

An offline-first, privacy-focused flashcard studio designed with a tactile skeuomorphic workspace and optimized for 2K (`2560 × 1440`) displays so full A4 PDF pages can be studied side by side without clipping.

All PDFs, flashcards, study sessions, and progress rewards stay strictly on your device in your browser's local storage — nothing is ever uploaded to a server.

---

## Key Features

### 1. Raw PDF, DOCX & CSV Flashcards
- Upload single or multiple PDF, DOCX, or CSV files (drag-and-drop or file picker), or generate an in-memory sample PDF or CSV to test immediately.
- **Zero lossy text stripping (PDF & DOCX):** Raw PDF and DOCX bytes are stored directly in browser IndexedDB (`foliorecall_offline_db`). PDFs render onto `<canvas>` via a locally bundled `pdfjs-dist` worker, while DOCX documents render with original formatting, tables, equations, and embedded images via `docx-preview` (with automatic A4 page splitting if a DOCX lacks explicit page breaks). Every odd page (`1, 3, 5…`) becomes a **Question** sheet, and the following even page (`2, 4, 6…`) becomes its **Answer** sheet.
- **Offline CSV Import & Column Mapping:** Parse RFC-4180 CSV/TSV/semicolon-delimited files directly in the browser, auto-detect header rows (`question`/`front`/`term` and `answer`/`back`/`definition`), remap Question/Answer columns interactively, and import rows onto ruled study cards.
- **2K Full-A4 Scaling & Fullscreen Answer:** Toggle between **Full A4 Page** and **Fit Width**, or press `F` (or click **Fullscreen**) to inspect any Answer sheet or card across the full viewport with inline grading keys.

### 2. Active Recall Testing & Keyboard-First Study
- Distraction-free reading spread showing the Question A4 sheet first, with an optional recall scratchpad before revealing the Answer A4 sheet side by side.
- Four-tier active recall grading with live interval previews:
  - `1` — **Forgot** (`0%` score weight, resets spacing)
  - `2` — **Hard** (`60%` score weight)
  - `3` — **Good** (`90%` score weight)
  - `4` — **Easy** (`100%` score weight)
  - `Space` — Reveal answer sheet
- Study modes for **Due**, **All Cards**, and **Weakest** cards, plus end-of-session score plaques and missed-card retry queues.

### 3. Exam-Date Spaced Repetition & Interactive Analytics
- Uses an Ebbinghaus / FSRS-inspired forgetting curve ($R(t) = 0.9^{t/S}$) to compute optimal review intervals.
- Set a **Target Exam Date** and **Retention Goal** (`85%`, `90%`, or `95%`) to reverse-engineer a daily review schedule leading up to final consolidation day.
- Interactive forgetting-curve chart comparing **Scheduled Recall %** against **Unreviewed Decay %**, with hover tooltips across every chart point, ledger row, deck readiness badge, and quiz score explaining exactly what each percentage means.

### 4. Per-Card Rewards, Sound Chimes & Game Announcer Voiceovers
- Immediate positive reinforcement on every card graded (`+5` to `+35` base XP), scaled by:
  - **Recall Streak Multipliers:** `3+` cards = `1.25×`, `5+` = `1.5×`, `8+` = `2.0×`
  - **Recall Note Bonus:** `+5 XP` when using the scratchpad
  - **New Card Bonus:** `+5 XP` on first successful recall
- Persistent **Scholar Ranks** (`Apprentice` → `Reader` → `Scholar` → `Archivist` → `Fellow` → `Dean` → `Laureate` → `Grand Master`), daily card goals, and study-day streaks.
- Synthesized **Web Audio API** chimes and arena sub-bass stingers paired with offline **Web Speech API** game-style announcer voiceovers (`Double Recall!`, `Triple Streak!`, `Mega Streak!`, `Unstoppable!`, `Pro Player!`, `Dominating!`, `Godlike Recall!`, `Clutch Comeback!`, `Rank Up!`, and `Flawless Victory!`) plus animated callout plaques and quick Sound/Voice mute toggles.

### 5. Complete Local Privacy & JSON Backups
- **IndexedDB (`foliorecall_offline_db` v2):** Stores `decks`, `cards`, `sessions`, and raw `pdfFiles` (`ArrayBuffer`). Deleting a deck automatically garbage-collects unreferenced PDF files.
- **`localStorage` (`foliorecall_rewards_v1`):** Stores XP, daily streaks, and sound preferences.
- **On-Device Vault (`Storage & Backups`):** Inspect storage footprint, export a portable `.json` backup (including base64-encoded PDFs), restore from backup, or erase all local data.

---

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite 8
- **Styling:** Tailwind CSS v4 (custom linen, leather, ivory paper, and burnished brass skeuomorphic materials)
- **PDF Rendering:** `pdfjs-dist` (local offline worker)
- **Animations & Icons:** `motion` (`motion/react`), `lucide-react`
- **Persistence & Audio:** Browser IndexedDB, `localStorage`, Web Audio API

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation & Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite dev server on port `3000` |
| `npm run build` | Builds the production bundle into `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Removes `dist/` and compiled output |

---

## Project Structure

```text
src/
├── App.tsx                     # Root state, navigation, IndexedDB & reward lifecycle
├── index.css                   # Tailwind CSS v4 theme & skeuomorphic material classes
├── main.tsx                    # React entry point
├── types/
│   └── flashcard.ts            # Deck, Flashcard, StoredPdfFile, and schedule types
├── lib/
│   ├── csvParser.ts            # Offline RFC-4180 CSV parser, column mapper & sample CSV
│   ├── documentFiles.ts        # Unified PDF/DOCX/CSV staging and cache cleanup helpers
│   ├── docxParser.ts           # Offline DOCX renderer, A4 paginator & odd/even staging
│   ├── pdfParser.ts            # Offline pdfjs-dist worker setup, staging & sample PDF
│   ├── rewards.ts              # XP, combo multipliers, Scholar ranks & Web Audio chimes
│   ├── spacedRepetition.ts     # Forgetting curve math & reverse exam schedule builder
│   └── storage.ts              # IndexedDB persistence, orphan file GC & JSON backup I/O
└── components/
    ├── DeckDetailView.tsx      # Deck metadata editor, manual cards & page inspector
    ├── DecksView.tsx           # Linen desk library, Scholar plaque & quiz ledger
    ├── DocumentPageView.tsx    # Dispatcher routing PDF vs. DOCX pages seamlessly
    ├── DocxPageView.tsx        # Scaled vector/HTML renderer for paginated DOCX sheets
    ├── ExamPlannerView.tsx     # Target exam planner, SVG forgetting curve & daily ledger
    ├── MetricTooltip.tsx       # Hover/focus tooltips explaining analytics percentages
    ├── PdfImportView.tsx       # Multi-file (PDF/DOCX/CSV) staging & card previews
    ├── PdfPageCanvas.tsx       # High-DPI responsive PDF <canvas> renderer (contain/width)
    ├── StorageModal.tsx        # On-device vault metrics, JSON export/import & wipe
    ├── StudyView.tsx           # 2K A4 active recall workspace, fullscreen answer & XP stamps
    └── TopBar.tsx              # Stitched dark-leather navigation header
```
