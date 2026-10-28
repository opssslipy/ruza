# Ruza life-sim (game)

Browser life-sim about the town of Ruza; characters are the author's real friends. Plan: `..\plan.md`, decisions: `..\grilling.md`, research: `..\research-*.md`.

## Stack
Phaser 3 + TypeScript (strict, no any) + Vite, inkjs for dialogues (`src/content/ink/*.ink`), Vitest. Static output for GitHub Pages.

## Rules
- No external domains at runtime (Russia without VPN): fonts and libs are bundled.
- Source photos of real people never enter this folder tree that gets committed: keep them in `refs-private/` (git-ignored). Only stylised portraits go to `public/portraits/`.
- Portrait-first mobile layout, 480x854 logical size.
- Save format is versioned (`src/save.ts`); bump VERSION on breaking changes.
- OSM-derived data needs visible attribution "© OpenStreetMap contributors".

## Commands
`npm run dev`, `npm test`, `npm run build`.
