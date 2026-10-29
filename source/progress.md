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

## 2026-10-29 update 5: no password, title screen
Done: password gate removed everywhere (anyone with a link can play; faces are public anyway by the author's decision). New TitleScene (first scene): "РУЗА / ГОРОД ЧУДЕС" over the live 3D town at dusk, orbiting camera, cartoon cars driving on an open street, line-up of heroes with photo heads, Demon and Bara holding stylised toy pistols, "ИГРАТЬ" / "ПРОДОЛЖИТЬ + НОВАЯ ИГРА" when a save exists, Enter/Space starts. The stage (open E-W street + clear ground) is picked automatically; trees in front of the line-up are hidden on the title only. Published as a private Claude artifact for the phone: https://claude.ai/artifact/Afkbb8oTgM8RfooBoYCymM (republish by hand after deploys; needs the new hashed script path).

## 2026-10-29 update 6: 3D interiors for all venues
Done: every venue is now a walk-in 3D room (InteriorScene + src/game/interiors.ts and interiors2.ts): The Дым (neon lounge, sofas, hookah tables with drifting smoke, bar, friends sitting or strolling, hookah mini-game: flavour + 3 timed puffs), shops (Pyaterochka shelves with products and fridge, shawarma stand with a spinning spit, pharmacy), gym (treadmills, bench with barbell), club (Ruzvelt/Mixbar: glowing dance floor, DJ booth, flashing lights), home (bed, sofa, TV, desk, fridge), police (desks, cell), hospital (beds), cinema (seat rows), garages (car, barrels). Walk with joystick/WASD, collisions, people from the schedules sit on sofas/seats or wander, actions run from the existing venue actions (price, effect, time). The old flat VenueScene is no longer reached.
Verified headless Edge: all 12 rooms enter + first action works, full play-through (shop, home work calls, endings) OK, no console errors.
NEXT: life on the map (cars and passers-by on streets, street events/quests), sound, performance check on a real phone.

## 2026-10-29 update 7: street life
Done: 22 cars drive along real streets near the centre (two lanes, back and forth, they grow with camera height), 14 passers-by with random costumes and generic faces walk along footpaths. Hidden inside buildings and on the title screen (cars stay on the title). Source: src/game/streetLife.ts.
NEXT (not done): street events and small quests on the map, sound, performance check on a real phone.

## 2026-10-29 update 8: quests, mini-games, sound, real-size people
Done: (1) people and cars keep real size when the camera zooms (they no longer grow when zooming out). (2) Quests (src/game/quests.ts, 6 draft errands from the friends: Diana's parcel, Lev's interview, Bara's eyes and ears, Belka's shawarma, Karina's beer, Timur's car): a friend offers one after a conversation where Stas helped, the target glows on the map with a yellow beam and plate, the top line shows the current step and hours left, visiting a venue / using a venue action / talking to a person completes steps, reward on completion, penalty on timeout, max 3 at a time. (3) Rhythm mini-games for the gym (5 reps) and the dance floors of Ruzvelt/Mixbar (4-6 beats) adding a bonus to the plain action. (4) Sound without files (Web Audio): UI/mini-game blips, coin, hookah puff, quest jingle, lounge music in The Dym, beat in the clubs, mute button.
Tests 38/38; headless Edge: quest offered -> visit -> step 2, gym and club mini-games, play-through, no console errors. Not verified: how sound feels on a real device, phone speed.
OPEN: quest texts and rewards are drafts; more quests and street events; other venues have no mini-game yet.
