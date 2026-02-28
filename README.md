CutGym – Intelligent Training Planner (PWA)

A Progressive Web App (PWA) built with React + TypeScript + Vite + Dexie (IndexedDB) that intelligently generates weekly training plans, tracks weight progress, adapts based on performance, and links physique goals (cut/maintain/bulk) with cardio and lifting volume.

🚀 Current Version

v0.5.0 – Goal-Synced Training System

🧠 Core Features
1️⃣ Dynamic Weekly Plan Generation

Generates 3/4/5 day plans

Adjusts automatically based on:

Profile goal (cut / maintain / bulk)

Equipment (gym / home / minimal)

Notes (e.g., “3 days next week”)

Progression logic based on:

Completed sets

Reps achieved

Estimated 1RM (compounds)

2️⃣ Goal Modes (Cut / Maintain / Bulk)

Each mode adjusts:

Cut

Slightly reduced accessory volume

Higher prescribed cardio (4 sessions/week default)

Moderate intensity

Maintain

Balanced lifting volume

Moderate cardio (3 sessions/week)

Bulk

Increased lifting volume

Lower cardio (2 sessions/week)

Goal can be changed anytime in Profile.
Previous weeks remain unchanged.

3️⃣ Cardio System (Prescribed Days Only)

Cardio automatically assigned to selected lifting days

Modalities: Treadmill / Stairmaster / Bike / Row

Sessions per week derived from goal

Top summary card reflects actual assigned sessions (source-of-truth = week data)

4️⃣ Weight Tracking

Add weight entries

Unit toggle (kg / lb)

Goal line shown on chart

14-day trend calculation

Progress-to-goal displayed on Plan page

5️⃣ Goal-Reached Banner

When goal is reached:

🎉 Switch to Maintain

📈 Switch to Bulk

🔁 Continue phase (set new goal)

No forced transitions.

6️⃣ Exercise History

For each exercise:

Compounds

Best Weight chart

Estimated 1RM chart (toggle)

Isolations

Best Weight chart

Filters:

Only completed sets

Rep range filter for 1RM (3–10)

7️⃣ Alternatives System

Suggests equipment-compatible swaps

Prevents duplicate exercises in a day

Handles no-alternative scenarios safely

8️⃣ Exercise Info Cards

Primary muscles

Coaching cues

Optional video links

Designed to expand later

9️⃣ Data Backup

Export JSON

Import JSON (overwrite with confirmation)

Fully local storage (IndexedDB)

🏗 Architecture

Frontend: React + TypeScript

Bundler: Vite

Storage: Dexie (IndexedDB)

Charts: (whatever chart lib you’re using)

PWA enabled

No backend. Fully offline capable.

📦 Installation
npm install
npm run dev

Production build:

npm run build
🗂 Version History
v0.3

Dynamic week generation

Notes-based week adjustment

Unit toggle

Weight tracker

v0.4

Profile system

Equipment logic

Cardio introduction

Exercise meta system

History modal foundation

v0.5

Goal ↔ weight sync

Goal switching after onboarding

Goal reached banner

Prescribed cardio integration

Exercise history charts (weight + e1RM)

Data export/import

Progress header on plan page

UI polish & stability fixes

🎯 Design Philosophy

Plan adapts to life (missed days, illness, schedule changes)

Goal-driven, not random templates

History informs progression

Simple enough for daily use

Structured enough to scale later

⚠️ Notes

All data is local to device unless exported.

Deleting IndexedDB clears data.

Always export before major version changes.
