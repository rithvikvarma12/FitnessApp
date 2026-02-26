# FitnessApp (Cut/Gym PWA)

A mobile-first fitness PWA that generates weekly workout plans, tracks workouts set-by-set, and logs bodyweight with a trend chart.

- **Tech:** Vite + React + TypeScript
- **Storage:** Dexie (IndexedDB) — local-first, offline
- **Deploy:** Vercel (GitHub-connected)
- **Install:** iPhone Safari → Share → Add to Home Screen

---

## What it does

### Weekly Plan
- Generates **Week N+1** from Week N (progression-aware)
- Supports **3 / 4 / 5-day weeks**
- **End Week Early** supported (notes influence next week)
- **kg/lb toggle** (display + inputs)
- Per-day completion tracking + week locking flow
- Set-level tracking:
  - planned reps
  - **planned weight per set**
  - actual reps
  - actual weight
  - completed checkbox

### Weight Tracker
- Add bodyweight entries
- Line chart shows weight trend
- **Goal weight** line on chart
- kg/lb support

---

## Version history (changelog)

### v0.1 — Skeleton MVP
- Initial app scaffolding (Vite + React + TS)
- Dexie DB setup (local-first)

### v0.2 — First working weekly plan
- Basic weekly plan generation
- Week view + set logging (reps/weight/done)
- Simple progression (early version)

### v0.3 — Usable planner + mobile install
- Deployed PWA (installable on iPhone)
- Notes-driven next week days parsing (e.g., “3 days next week”)
- End Week Early flow (generate next week even if not all days complete)
- Unit setting (kg/lb) wired through UI
- Weight tracker page added (initial)

### v0.4 — Daily-driver improvements + multi-user foundations
- **Profiles / Onboarding** (multi-user ready)
  - UserProfile table
  - active user selection
  - presets (including Rithvik preset starting Week 6)
- **3/4/5-day generation fixed** to respect profile days/week
- **Equipment-aware generation**
  - gym vs home vs minimal
  - home/minimal exercise pack seeded
  - strict filtering (no gym-only exercises on home/minimal)
- **Planned vs actual per set (B)**
  - planned weight input shown per set next to actual
  - helpers: Apply base to all, Ramp, Set plan = last actual
- **Duplicates fixed**
  - strict per-day dedupe by normalized exercise name + refill logic
- **Mobile UX**
  - collapsible day cards (open/close)
  - improved responsiveness / reduced clutter
- Weight tracker improvements
  - ensure new entries show on chart
  - goal weight line
  - improved add-weight UI placement

---

## Development

### Run locally
```bash
npm install
npm run dev
