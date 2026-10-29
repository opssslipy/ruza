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

## Tomorrow (2026-10-29): agreed with the author
Order: (1) responsive layout for phone AND desktop (Phaser RESIZE, UI camera, WASD + E on PC), (2) dialogue as a panel at the BOTTOM over the map/venue, NOT a separate screen (remove DialogueScene), (3) real full-body character sprites with walk animation instead of circles (looks in src/content/looks.json, already created and shared with tools/make-portraits.mjs), (4) nicer map: shadows, trees, road markings, street names from OSM, night window lights, baked chunk textures for phone speed, (5) furniture in interiors.
Reference for the look: author's Yandex Maps screenshot of Ruza (parks, river, named streets). Reference only, no copying of Yandex data.
State right now: live site = last tested version (commit c1f0ef0, with faces). Local half-done: looks.json added; tools/make-portraits.mjs now reads it (not yet re-run; petya hairColor changed). Nothing else refactored yet.

## 2026-10-29 update: new look (graphics option A chosen by the author)
Done: chibi figures (cartoon body in an invented costume + the character's portrait/photo as the head, walk animation in 3 directions), light cartoon map (volumetric buildings by type and floors, shadows, windows, trees, road markings, street/river names from OSM), night lit windows, chunk textures for speed, dialogue as a panel at the bottom over the map and venues (no separate screen), responsive layout (phone portrait, desktop landscape, WASD/arrows + E, keys 1-4 in dialogue), furniture in 8 venue types. "АняАртем" renamed to "Артем" (internal id still `anyaartem`, dialogue text switched to masculine).
Verified (headless Edge, live URL): phone 390x844 and desktop 1280x720, day/night, dialogue panel, bar interior, no console errors. NOT verified: real phone, frame rate on weak devices, costumes of Timur/Karina/Artem/Bezuk/Petya/Demon/Korun/Kryazh/Minyucha up close.
Heads: photo for Lev, Timur, Diana, Artem, Belka, Karina; drawn cartoon heads for the rest (no photos yet).
Next ideas: author reviews costumes; Stas photo; more venue life; sound; street names bigger on desktop; Pyaterochka/police label overlap.

## 2026-10-29 update 2: 3D world (author's reference: low-poly 3D town, tilted camera, bottom dialogue card)
Done: three.js (MIT, bundled, no CDN) renders the world in `src/game/world3d.ts` on a canvas behind a transparent Phaser canvas; Phaser keeps only the interface (HUD, joystick, dialogue panel, venues, menu). OSM footprints are extruded into houses (roof colours by type, windows lit at night), flat road ribbons, river, parks, instanced low-poly trees (not on roads), street names on the ground, name plates for places and friends, billboard figures with photo heads and costumes. Camera tilted 55 degrees, follows Stas, "+/-", wheel, pinch; zoom out shows the whole centre of Ruza. Old flat renderer `src/game/worldRender.ts` is unused now (can be deleted).
Verified in headless Edge (software GL, ~5 fps there): login, 3D day/night, whole-city view, dialogue panel over the world, shop purchase, work, both endings, no console errors. NOT verified: real phone speed (about 250k triangles; windows capped at 28k instances, trees at 6.5k), pinch zoom on a touch screen.
Karina schedule widened locally (weekdays 10-15 square, 16-19 Pyaterochka, weekends 11-19 square); author wants her much more often: widen further next.

## 2026-10-29 update 3: 3D bodies and Karina
Done: people are now real low-poly 3D bodies (src/game/figure3d.ts): chunky body in the invented costume (suit, jacket, hoodie, uniform, overalls, dress, robe; hats cap/helmet/peaked; props bag, mug, backpack, chain, keys, bolt), arms and legs swing while walking, body turns to the direction of movement, head is a photo disc that always faces the camera (drawn portraits are cropped tight). Lens narrowed (32 deg landscape, 48 portrait), figures bigger. Billboard sprites removed from the 3D world (sprites.ts still serves the venue interiors).
Karina: in town every day 9-13 square, 13-16 stadium, 16-21 Pyaterochka (draft in src/content/schedules.ts).
Verified headless Edge on local build: close-ups, walk pose, full play-through (shop, work, both endings), no console errors. Not verified: real phone speed.

## 2026-10-29 update 4: bodies by description, all heroes in the world
Done: bodies follow a described figure (look fields: build slim/normal/muscular, tattoos, shorts; outfits fitted and tank). Diana: slim, pink fitted top, jeans, white sneakers, WB bag. Belka reworked from the author's reference picture: muscular, black tank, tattooed arms, shorts, sneakers, no helmet. Added to the world with drawn heads (no photos), draft schedules and SHORT DRAFT dialogues by role only (effects in src/content/effects.ts): Demon, Korun, Bezuk, Petya, Kryazh, Minyucha. Builds slim for Bezuk, Minyucha, Shatruha and muscular for Demon are invented drafts.
Tests 32/32; headless Edge play-through and close-ups OK, no console errors. Not verified: real phone speed.
OPEN: real descriptions for Petya, Bezuk, Demon, Korun, Kryazh, Minyucha (the six dialogues are placeholders); body descriptions (build, clothes) for everyone else like the one given for Diana.
