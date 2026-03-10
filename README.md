# TrainLab – Intelligent Adaptive Training Planner (PWA)

A Progressive Web App built with React + TypeScript + Vite + Dexie (IndexedDB) + Supabase that generates weekly training plans, tracks body weight and nutrition, and adapts to your performance over time.

## Current Version

v1.0.0 — Auth + Cloud Sync + Adaptive Engine

## Tech Stack

- **Frontend**: React + TypeScript
- **Bundler**: Vite
- **Local Storage**: Dexie (IndexedDB) — offline-first
- **Cloud Backend**: Supabase (Postgres + Auth)
- **Charts**: Chart.js via react-chartjs-2
- **PWA**: Service worker, installable, offline capable

## Features

### Auth & Sync
- Email-based sign up and sign in via Supabase Auth
- All data synced to Supabase Postgres in real time — dual-write on every action
- Full read sync on login — data loads on any device, any browser
- Offline queue — failed writes are stored locally and retried automatically when back online
- Row-level security (RLS) — users can only access their own data
- Local-first architecture — app works fully offline via Dexie, sync is additive

### Training Plans
- Generates 3/4/5 day weekly plans based on goal, equipment, gender, and notes
- Auto-progression: weight and rep targets advance week over week using e1RM
- End Week Early flow with structured note chips to guide next week's generation
- Exercise swap system with equipment-compatible alternatives
- **Mid-week plan regeneration** — if you can't complete all planned days, adjust remaining days to cover untrained muscle groups without repeating what's already done
- Gender-aware exercise selection:
  - Female profiles: higher rep ranges (+4 reps), glute/hamstring priority, hip thrust and glute bridge prioritised in lower body days
  - Male profiles: compound-heavy, standard rep ranges

### Adaptive Engine
- **Structured note chips** — 7 chip types attached to any week to guide next-week generation:
  - *Deload week* — reduces all working sets by 1 and loads by 12.5%
  - *Fatigued* — drops one accessory exercise or trims a set from the most fatiguing movement
  - *Traveling* — overrides training days and available equipment for that week
  - *Injury/Pain* — records affected area and severity; exercises that stress the area are excluded or substituted
  - *Focus on...* — adds an extra set to exercises targeting the selected muscle group
  - *Only N days* — overrides the training day count for the generated week
  - *Equipment change* — switches equipment profile for one week
- **Post-session fatigue rating** — 1–5 star rating logged after each completed workout
- **Auto-deload intelligence** — suggests a deload week when:
  - Average fatigue ≤ 2.0 over the last two weeks
  - Session completion rate below 60% for two consecutive weeks
  - Volume ramped 15%+ across three straight weeks
  - Six or more weeks since the last deload
- **Injury memory** — active injuries persist across weeks with severity auto-downgrade on improvement
- **Injury resolution flow** — mark injuries as Improving or Resolved from the Profile tab or end-of-week Injury Update chip; resolved injuries are immediately removed from plan constraints
- **Injury Update chip** — appears in end-of-week notes when active injuries exist, lets you update status inline before generating next week
- **Adaptive plan summary** — each generated week shows every adjustment made

### Goal Modes
- **Cut** — reduced accessory volume, higher cardio frequency, calorie deficit targets
- **Maintain** — balanced volume and moderate cardio
- **Bulk** — increased volume, lower cardio

### Cardio System
- Cardio sessions auto-assigned per goal mode
- Modalities: Treadmill, Stairmaster, Bike, Row
- Integrated into the weekly plan view

### Nutrition Tracking
- TDEE calculator (Mifflin-St Jeor) based on body stats, activity level, and goal mode
- **Gender-aware macro targets** — protein calculated per kg bodyweight (men: 2.0g/kg, women: 1.6g/kg)
- Targets auto-recalculate as weight changes
- Daily nutrition logging with progress rings and macro fill bars
- "Hit target today" mode — auto-fills inputs with recommended targets
- Weekly adherence chart on the Progress page
- Fully customisable targets with per-macro tracking toggles

### Weight Tracking
- Daily weigh-in log with moving 7-day average trend
- Goal weight line on chart
- Goal-reached banner with transition options

### Progress Dashboard
- Current and longest workout streaks, overall completion rate
- Weekly volume trend chart (last 8 weeks)
- Muscle group breakdown with volume bars and SVG muscle coverage map
- All-Time PR Board with compound/isolation filter
- Top exercises by volume
- Session summary modal on day completion
- PR celebration overlay for noteworthy PRs

### Exercise System
- Exercise history charts (best weight + estimated 1RM for compounds)
- Exercise info cards with SVG muscle map, cues, and video links
- Custom exercise creation per user (name, muscle group, type, equipment)
- Custom exercises appear in swap suggestions and plan generation

### Theme & UX
- Light and dark mode toggle
- Smooth tab transitions and day card collapse animations
- Rest timer with configurable duration
- Workout duration tracking

### Data
- Full JSON export/import for local backup and migration
- Offline-first — app works fully without internet, syncs when back online

## Architecture

```
User Action
    │
    ├─► Dexie (IndexedDB) — immediate local write, app always responsive
    │
    └─► Supabase (Postgres) — async fire-and-forget sync
              │
              └─► On failure → offlineQueue (Dexie) → retry on reconnect
```

On login: `syncFromSupabase()` pulls all user data into local Dexie, then app runs locally.

## Installation

```bash
npm install
npm run dev
```

```bash
npm run build   # production build
```

## Environment Variables

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Version History

| Version | Highlights |
|---|---|
| v1.0 | Supabase auth + cloud sync, offline queue, gender-aware plans and nutrition, mid-week plan regeneration, injury resolution flow, TrainLab rebrand |
| v0.9 | Adaptive engine: structured note chips (7 types), post-session fatigue rating, auto-deload detection, injury/limitation memory with check-ins, adaptive plan summary |
| v0.8 | Nutrition system (TDEE, macros, daily logging, adherence), SVG muscle map, goal switching improvements |
| v0.7 | UI overhaul (dark athletic theme, bottom nav, glass cards), progress dashboard, PR tracking, rest timer, workout duration, session summary, custom exercises, light/dark theme |
| v0.5 | Goal↔weight sync, goal-reached banner, exercise history charts, data export/import |
| v0.4 | Profile system, equipment logic, cardio, exercise meta |
| v0.3 | Dynamic week generation, notes-based adjustment, unit toggle, weight tracker |

## Notes

- The `anon` Supabase key is safe to expose in the frontend — RLS policies enforce per-user data access.
- The `service_role` key must never be used in frontend code.
- Local Dexie DB name is `cutGymDB` (unchanged from earlier versions to preserve existing local data).
