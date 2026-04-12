# CLAUDE.md

## Project Snapshot
This repo is now a serverless TOEIC app on:
- Vite + React (`src/`)
- Firebase Auth + Firestore (user-scoped data sync)
- Gemini routing (`2.5-flash` for question generation, `3-flash` for analysis, `2.5-flash` fallback)
- GitHub Pages base path: `/toeic-90days-challenge/`

Legacy static site is preserved in `legacy/`.

## Current Product Behaviors
- Adaptive difficulty by target score:
  - 470 -> green
  - 730 -> blue
  - 860 -> gold
- Practice flow is exam-oriented (not topic input):
  - setup -> taking -> submit -> detailed explanations -> history review
- Modes:
  - Part 5 / Part 6 / Part 7 / Mixed
- Presets:
  - `10x5` and `20x10`
- Mixed ratio:
  - `10`: 5/3/2 (P5/P6/P7)
  - `20`: 8/6/6 (P5/P6/P7)
- Local banks used first from `public/data/questions-part*.json`
- If insufficient (especially Part 7), Gemini auto-fills missing questions
- Post-submit analysis is batch-based and includes:
  - question zh
  - options zh
  - correct reason
  - trap explanation
  - per-option review
- Daily vocab page now uses the same vocabulary card UI/behavior as `/vocabulary`
  - bookmark toggle
  - pronunciation
  - mastered +1
- Vocab mini-game is finite-round (10 or 20) and auto-finishes
  - state machine: `idle -> playing -> finished`
  - no infinite auto-looping

## Route Map
- `/dashboard`
- `/progress`
- `/vocabulary`
- `/review` (SRS vocab review)
- `/vocab-game` (vocab mini-game)
- `/practice`
- `/grammar`
- `/mistakes`
- `/settings`

## Firestore Collections (all under `users/{uid}`)
- root doc:
  - `email`, `geminiApiKey`
  - `settings.level`, `settings.part`
  - `settings.targetScore`, `settings.targetLevel`
  - `settings.examPreset`
  - `settings.reminder.{enabled,time}`
  - `settings.ai.{questionModel,analysisModel,analysisFallbackModel}`
- subcollections:
  - `question_pool` (level-aware FIFO pool)
  - `pool_history`
  - `examAttempts`
  - `history`
  - `mistakes`
  - `bookmarks`
  - `srs`
  - `stats/summary`

## Key Files Changed
- App shell/routing/pages:
  - `src/App.jsx`
  - `src/components/AppShell.jsx`
  - `src/components/VocabWordCard.jsx`
  - `src/ui/NavBar.jsx`
  - `src/pages/*.jsx`
- Data/AI services:
  - `src/lib/firestoreService.js`
  - `src/lib/geminiService.js`
  - `src/lib/localData.js`
- PWA assets:
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - `public/icons/*`
- Runtime data for frontend fetch:
  - `public/data/vocabulary.json`
  - `public/data/grammar.json`
  - `public/data/questions-part5.json`
  - `public/data/questions-part6.json`
  - `public/data/questions-part7.json`

## Collaboration Notes for Claude Code
- Keep question dispatch level-aware: pool filtering must include `part + targetLevel`.
- Keep pool dedupe hash independent from level, but on level conflict prefer current target level.
- Keep missing `question_pool.level` migration silent and non-blocking.
- Keep background pool expansion button locked while request is in-flight.
- Do not reintroduce topic-based practice input.
- Keep exam snapshots in `examAttempts` for review playback.
- Keep analysis in batch mode to reduce API pressure.
- Keep retry UX surfaced to users (backoff waiting hints).
- Keep `public/data/*` as runtime source for local banks.
- Keep daily vocab and vocabulary card rendering consistent via shared component.
- Keep vocab game finite-round behavior (10/20) and finished summary screen.
- If adding dark mode/shortcuts later, preserve current CSS variable structure and sidebar collapse behavior.
