# Progress (overwritten each checkpoint)

Date: 2026-10-28. Live: https://opssslipy.github.io/ruza/ (repo opssslipy/ruza, deploy with tools/deploy.ps1).

## Done
- Real map of the centre of Ruza from OpenStreetMap, walking (keyboard + touch joystick), collision, bridges, landmarks and 12 venue markers.
- Game state (src/game/state.ts): clock (1 s = 4 game min), needs (satiety, energy, mood, health, wanted), money, midnight household cost 700 RUB, passing out, 4 endings (banka "Стаса в баньке не было", arrested, broke, week survived).
- Venues (src/content/venues.ts): enter from the map, actions with prices, effects and time costs, friends present by schedule are tappable inside.
- Work: Skillbox cold calls mini-game (src/content/calls.ts, 10 scenarios, 5 per round, 4 rounds a day, weekdays 10-19).
- 8 friends with ink dialogues; each dialogue changes needs once per game day (src/content/effects.ts).
- DRAFT schedules (src/content/schedules.ts), friends phone book screen showing where everyone is now, day/night overlay, autosave, versioned save (v2).
- Tests 26/26. Browser checks (headless Edge 390x844) on the live URL: login, walk, shop purchase, work round, talk to Diana, night, both fail and week endings, no console errors, no external hosts.

## Not done / not verified
- Real phone, other browsers, slow networks, load time without VPN: NOT measured.
- Not played through a whole week by a human; balance (prices, decay, pay) is a first guess. Needs a real playtest.
- Missing from the original wish list: interiors are a simple room per venue (no walking, no bartender NPC); street names on the map; Diana rumour system; gangs, dealers (Belka only talks), Petya, Bezuk, Demon, Korun, Kryazh, Minyucha have no dialogues; Vegas work; car; hooking up with girls; STDs.
- Portraits are flat drafts, not likenesses; prototypes have not approved them.
- Placeholders: Pyaterochka (same coords as police in the author's data), Mixbar, Teatre, Pharmacy, Garages are not real positions.

## OPEN
- OPEN: author playtests one full week and reports balance (too easy / too hard, boring spots).
- OPEN: author edits draft schedules to the friends' real habits.
- OPEN: real coordinates for Pyaterochka, Mixbar, Teatre, pharmacy, garages.
- OPEN: portraits approved by prototypes; Bara and Shatrukha photos.
- OPEN: character descriptions for Stas, Petya, Bezuk, Demon, Korun, Kryazh, Minyucha.
- OPEN: ODbL: map.json derived from OSM in a public repo (lawyer question).
- OPEN: independent verification pass with clean context (reviewer agent) before calling stage 1 done.
