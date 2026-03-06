CutGym – Intelligent Training Planner (PWA)

A Progressive Web App built with React + TypeScript + Vite + Dexie (IndexedDB) that generates weekly training plans, tracks body weight, and adapts to performance over time.

## Current Version

v0.9.0 — Adaptive Engine

## Features

### Training Plans
- Generates 3/4/5 day weekly plans based on goal, equipment, and notes
- Auto-progression: weight and rep targets advance week over week using e1RM
- End Week Early flow with freeform notes to guide next week's generation
- Exercise swap system with equipment-compatible alternatives

### Adaptive Engine (v0.9)
- **Structured note chips** — 7 chip types attached to any week to guide next-week generation:
  - *Deload week* — reduces all working sets by 1 and loads by 12.5%
  - *Fatigued* — drops one accessory exercise or trims a set from the most fatiguing movement
  - *Traveling* — overrides training days and available equipment for that week
  - *Injury/Pain* — records affected area and severity; exercises that stress the area are excluded or substituted
  - *Focus on...* — adds an extra set to exercises targeting the selected muscle group
  - *Only N days* — overrides the training day count for the generated week
  - *Equipment change* — switches equipment profile for one week or until manually changed back
- Chips with follow-up forms only commit when all required fields are filled (no partial saves)
- **Post-session fatigue rating** — 1–5 star rating logged after each completed workout
- **Auto-deload intelligence** — suggests a deload week when any of the following signals are detected:
  - Average fatigue rating ≤ 2.0 over the last two weeks
  - Session completion rate below 60% for two consecutive weeks
  - Volume ramped 15%+ or more across three straight weeks
  - Six or more weeks since the last deload
- **Injury/limitation memory** — active injuries are persisted across weeks:
  - Logged via the Injury/Pain chip (area + severity)
  - Checked in every two weeks: Still painful / Getting better / Fully recovered
  - Severity automatically downgrades on improvement; injury is removed on recovery
  - Exercise exclusions and substitutions applied automatically when generating plans
  - Injury snapshot stored per generated week so history accurately reflects what was in effect
- **Adaptive plan summary** — each generated week shows a bullet list of every adjustment made (set reductions, exercise swaps, focus boosts, equipment overrides, injury workarounds)

### Goal Modes
- **Cut** – reduced accessory volume, higher cardio frequency
- **Maintain** – balanced volume and moderate cardio
- **Bulk** – increased volume, lower cardio

### Cardio System
- Cardio sessions auto-assigned per goal mode
- Modalities: Treadmill, Stairmaster, Bike, Row
- Integrated into the weekly plan view

### Weight Tracking
- Daily weigh-in log with moving 7-day average trend
- Goal weight line on chart
- Goal-reached banner with transition options — always prompts for new target weight

### Progress Dashboard
- Current and longest workout streaks, overall completion rate
- Weekly volume trend chart (last 8 weeks)
- Muscle group breakdown with volume bars
- All-Time PR Board with compound/isolation filter and sort
- Top exercises by volume
- Session summary modal on day completion
- PR celebration overlay for noteworthy PRs (≥2.5 kg compounds, ≥1.0 kg isolations)

### Nutrition Tracking
- TDEE calculator (Mifflin-St Jeor) based on body stats, activity level, and goal mode
- Auto-calculated calorie and macro targets (protein / carbs / fat) from day one
- Targets auto-recalculate as weight changes — no manual updates needed
- Daily nutrition logging with progress rings and macro fill bars
- "Hit target today" qualitative mode for days without detailed logging
- Weekly adherence chart on the Progress page
- Fully customizable targets with per-macro tracking toggles

### Exercise System
- Exercise history charts (best weight + estimated 1RM for compounds)
- Exercise info cards with SVG muscle map (front + back body silhouette), cues, and video links
- Primary muscles highlighted red, secondary orange on the body map
- Progress page shows full-body muscle coverage map for the last 4 weeks
- Custom exercise creation per user (name, muscle group, type, equipment)
- Custom exercises appear in swap suggestions and plan generation

### Theme & UX
- Light and dark mode toggle
- Smooth tab transitions and day card collapse animations
- Rest timer with configurable duration
- Workout duration tracking

### Data
- Full JSON export/import for backup and migration
- Fully local — no backend, no account required

## Architecture

- **Frontend**: React + TypeScript
- **Bundler**: Vite
- **Storage**: Dexie (IndexedDB)
- **Charts**: Chart.js via react-chartjs-2
- **PWA**: Service worker, installable

## Installation

```bash
npm install
npm run dev
```

```bash
npm run build   # production build
```

## Version History

| Version | Highlights |
|---|---|
| v0.9 | Adaptive engine: structured note chips (7 types), post-session fatigue rating, auto-deload detection, injury/limitation memory with check-ins, adaptive plan summary |
| v0.8 | Nutrition system (TDEE, macros, daily logging, adherence), SVG muscle map, goal switching improvements |
| v0.7 | UI overhaul (dark athletic theme, bottom nav, glass cards), progress dashboard, PR tracking, rest timer, workout duration, session summary, custom exercises, light/dark theme, code refactor |
| v0.5 | Goal↔weight sync, goal-reached banner, exercise history charts, data export/import |
| v0.4 | Profile system, equipment logic, cardio, exercise meta |
| v0.3 | Dynamic week generation, notes-based adjustment, unit toggle, weight tracker |

## Notes

- All data is stored locally in IndexedDB — export before clearing browser data.
- Deleting the IndexedDB will erase all data.
