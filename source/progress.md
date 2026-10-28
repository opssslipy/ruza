# Progress (overwritten each checkpoint)

Date: 2026-10-28. Stage 0 done in draft; stage 1 started: slice 1 "map and walking".

## Done
- Stage 0: password gate (hash in src/config.ts), versioned save, 15 portraits (tools/make-portraits.mjs), dialogues for 8 characters (src/content/ink), friends menu. Tests 13/13, build passes.
- Stage 1 slice 1: real map of the centre of Ruza from OpenStreetMap (data/ruza.osm.json -> tools/build-map.mjs -> public/map.json, 393 KB). 1697 buildings, 632 roads, river, collision grid, bridges open the river.
- MapScene: walking by keyboard and floating touch joystick, wall sliding, chunked vector drawing, landmark labels, "Talk" button near friends, OSM attribution on screen.
- Landmarks: Stas's home (Ulyanovskaya 5, way 168764127, confirmed by author), Partizan square, fountain, bus station (point only), stadium "Urozhay" (way 168915122, confirmed by author), Ruzvelt (OSM nightclub "RuzVelt Club", confirmed by author).
- Checked in headless Edge 390x844: login, map renders, keyboard and joystick walking move the player, ~180 fps in headless (NOT a phone), no console errors, no external hosts.

## Not done / not verified
- Not tried on a real phone. Performance on a weak phone unknown.
- No street names, no named shops on the map, no interiors, no needs bars, no work/money, no day-night, no schedules, no cops conflict, no ending.
- Friends stand in a ring around Partizan square as temporary placement (not real schedules).
- Portraits are flat drafts, not likenesses; prototypes have not approved them.
- Nothing published.

## OPEN
- OPEN: coordinates/addresses of other venues: Mixbar, Teatre, The Dym hookah, gym, Pyaterochka, shawarma, pharmacy, hospital, police, garages.
- OPEN: where exactly is the bus station building (OSM has only a point).
- OPEN: ODbL: public map.json derived from OSM may need to be published under ODbL; lawyer question.
- OPEN: prototypes approve portraits; Bara and Shatrukha photos; descriptions for Stas, Petya, Bezuk, Demon, Korun, Kryazh, Minyucha.
