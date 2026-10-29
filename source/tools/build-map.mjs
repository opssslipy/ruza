// Turns data/ruza.osm.json (Overpass, ODbL © OpenStreetMap contributors) into public/map.json for the game.
// Everything is projected to metres, simplified, and a blocked-cell bit grid is baked for collision.
// Usage: node tools/build-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const osm = JSON.parse(readFileSync(join(root, 'data', 'ruza.osm.json'), 'utf8'));

// must match the bbox used for the download: south, west, north, east
const LAT_S = 55.69, LON_W = 36.18, LAT_N = 55.712, LON_E = 36.215;
const M_LAT = 110574;
const M_LON = 111320 * Math.cos(((LAT_S + LAT_N) / 2) * (Math.PI / 180));
const WIDTH = (LON_E - LON_W) * M_LON;
const HEIGHT = (LAT_N - LAT_S) * M_LAT;
const CELL = 2; // metres per collision cell

const proj = (p) => [(p.lon - LON_W) * M_LON, (LAT_N - p.lat) * M_LAT];
const r1 = (n) => Math.round(n * 10) / 10;

function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const flat = (pts) => pts.flatMap((p) => [r1(p[0]), r1(p[1])]);
const closed = (g) => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

const ROAD_W = { motorway: 12, trunk: 12, primary: 10, secondary: 9, tertiary: 8, unclassified: 6, residential: 6, living_street: 5, service: 4, track: 3, footway: 2, path: 2, pedestrian: 4, steps: 2, cycleway: 2 };
const GREEN_LEISURE = new Set(['park', 'garden', 'recreation_ground']);
const GREEN_LAND = new Set(['forest', 'grass', 'recreation_ground', 'meadow']);

const buildings = [], roads = [], waters = [], rivers = [], greens = [], pitches = [];
const named = [];

function addPoly(list, geom, extra) {
  if (!geom || geom.length < 4) return;
  const pts = simplify(geom.map(proj), 0.4);
  if (pts.length >= 3) list.push({ pts, ...extra });
}

for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (e.type === 'way' && e.geometry) {
    if (t.building) {
      if (closed(e.geometry)) addPoly(buildings, e.geometry, { id: e.id, t });
    } else if (t.highway) {
      if (t.area === 'yes') continue;
      const w = ROAD_W[t.highway];
      if (!w) continue;
      roads.push({ pts: simplify(e.geometry.map(proj), 0.5), w, bridge: t.bridge === 'yes' || t.bridge === 'viaduct', kind: t.highway, name: t.name });
    } else if (t.waterway) {
      const w = t.waterway === 'river' ? 14 : t.waterway === 'stream' || t.waterway === 'canal' ? 4 : 0;
      if (w) rivers.push({ pts: simplify(e.geometry.map(proj), 0.8), w, name: t.name });
    } else if (t.natural === 'water') {
      if (closed(e.geometry)) addPoly(waters, e.geometry, {});
    } else if (t.leisure === 'pitch' || t.leisure === 'stadium') {
      if (closed(e.geometry)) addPoly(pitches, e.geometry, { id: e.id });
    } else if (GREEN_LEISURE.has(t.leisure) || GREEN_LAND.has(t.landuse)) {
      if (closed(e.geometry)) addPoly(greens, e.geometry, {});
    }
  } else if (e.type === 'relation' && e.members) {
    // multipolygons: only closed outer rings are drawn, inner holes are ignored on purpose
    for (const m of e.members) {
      if (m.role !== 'outer' || !m.geometry || !closed(m.geometry)) continue;
      if (t.building) addPoly(buildings, m.geometry, { id: e.id, t });
      else if (t.natural === 'water') addPoly(waters, m.geometry, {});
    }
  }
}

// --- collision grid -----------------------------------------------------------------------------
const GW = Math.ceil(WIDTH / CELL), GH = Math.ceil(HEIGHT / CELL);
const grid = new Uint8Array(GW * GH);

function fillPolygon(pts, value) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys) / CELL)), y1 = Math.min(GH - 1, Math.ceil(Math.max(...ys) / CELL));
  for (let gy = y0; gy <= y1; gy++) {
    const y = (gy + 0.5) * CELL;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i] / CELL)), x1 = Math.min(GW - 1, Math.floor(xs[i + 1] / CELL));
      for (let gx = x0; gx <= x1; gx++) grid[gy * GW + gx] = value;
    }
  }
}

function strokeLine(pts, width, value) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], half = width / 2;
    const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - half) / CELL)), x1 = Math.min(GW - 1, Math.ceil((Math.max(a[0], b[0]) + half) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - half) / CELL)), y1 = Math.min(GH - 1, Math.ceil((Math.max(a[1], b[1]) + half) / CELL));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      if (segDist([(gx + 0.5) * CELL, (gy + 0.5) * CELL], a, b) <= half) grid[gy * GW + gx] = value;
    }
  }
}

for (const w of waters) fillPolygon(w.pts, 1);
for (const r of rivers) strokeLine(r.pts, r.w, 1);
// the player body is about 4.7 m wide in MapScene.blockedBody, so every opened strip must be at least 8 m: a diagonal strip of 6 m leaves only 1.3 m of slack and the player jams on its edge
const WALK_W = 8;
// a bridge opens a walkable strip across the river
for (const r of roads) if (r.bridge) strokeLine(r.pts, Math.max(r.w, WALK_W), 0);
// most crossings are not tagged bridge=yes in OSM (culverts, unmapped bridges), and the player must not have to walk around the river
// in the middle of town: every other road opens a strip too. Buildings are filled afterwards, so they stay solid.
const crossings = [];
for (const r of roads) {
  if (r.bridge || r.kind === 'track') continue;
  const before = grid.slice();
  strokeLine(r.pts, Math.max(r.w, WALK_W), 0);
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (before[i] && !grid[i]) n++;
  if (n) { const p = r.pts[Math.floor(r.pts.length / 2)]; crossings.push({ name: r.name ?? r.kind, w: r.w, x: Math.round(p[0]), y: Math.round(p[1]), cells: n }); }
}
console.log('roads opened across water:', crossings.length, JSON.stringify(crossings.slice(0, 40)));
const waterGrid = grid.slice(); // water (and bridge) state before the houses, so a footbridge only ever clears water cells
for (const b of buildings) fillPolygon(b.pts, 1);

// --- footbridges -----------------------------------------------------------------------------------
// OSM tags few bridges, so rivers in the centre could be crossed in only one or two places over kilometres.
// Walking along each river near the square: where the nearest way across is further than BRIDGE_GAP, put a footbridge
// at the first spot whose two banks are free ground. They are drawn as planks with rails and are walkable.
const BRIDGE_GAP = 160, BRIDGE_ZONE = 900;
const zone = proj({ lat: 55.6998, lon: 36.1945 });
const gridBlocked = (x, y) => { const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); return gx < 0 || gy < 0 || gx >= GW || gy >= GH || grid[gy * GW + gx] === 1; };
const bridges = [];
for (const r of rivers) {
  let since = 0, prev = null;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-6) continue;
    const tx = (b[0] - a[0]) / d, ty = (b[1] - a[1]) / d, nx = -ty, ny = tx;
    for (let s = 0; s < d; s += 8) {
      const x = a[0] + tx * s, y = a[1] + ty * s;
      since += prev ? 8 : 0; prev = true;
      if (Math.hypot(x - zone[0], y - zone[1]) > BRIDGE_ZONE) continue;
      if (!gridBlocked(x, y)) { since = 0; continue; }
      if (since < BRIDGE_GAP) continue;
      const reach = r.w / 2 + 3;
      // both banks need open ground (a 3 x 3 patch), not a lone free cell in a closed yard
      const roomy = (px, py) => { for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) if (gridBlocked(px + ox * CELL, py + oy * CELL)) return false; return true; };
      if (!roomy(x + nx * reach, y + ny * reach) || !roomy(x - nx * reach, y - ny * reach)) continue;
      for (let u = -reach; u <= reach; u += 1) for (let v = -4; v <= 4; v += 1) {
        const px = x + nx * u + tx * v, py = y + ny * u + ty * v;
        const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
        if (gx >= 0 && gy >= 0 && gx < GW && gy < GH && waterGrid[gy * GW + gx] === 1) grid[gy * GW + gx] = 0;
      }
      bridges.push({ x: r1(x), y: r1(y), a: Math.round(Math.atan2(ny, nx) * 1000) / 1000, l: r1(r.w + 8), w: 7.6 });
      since = 0;
    }
  }
}
console.log('footbridges added:', bridges.length, JSON.stringify(bridges.map((q) => [q.x, q.y])));

const packed = new Uint8Array(Math.ceil(grid.length / 8));
for (let i = 0; i < grid.length; i++) if (grid[i]) packed[i >> 3] |= 1 << (i & 7);

// --- landmarks ----------------------------------------------------------------------------------
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const at = (lat, lon) => proj({ lat, lon });
const landmarks = [];
const home = buildings.find((b) => b.id === 168764127);
if (home) landmarks.push({ id: 'home', name: 'Дом Стаса', note: 'Ульяновская ул., 5 (way 168764127)', pos: centroid(home.pts).map(r1) });
else console.warn('WARNING: home building 168764127 not found');
landmarks.push({ id: 'square', name: 'Площадь Партизан', note: 'relation 14343879, центр', pos: at(55.6998, 36.1945).map(r1) });
landmarks.push({ id: 'fountain', name: 'Фонтан', note: 'node 4156608982', pos: at(55.6995, 36.19465).map(r1) });
landmarks.push({ id: 'busstation', name: 'Автостанция', note: 'node 1911908184, только точка', pos: at(55.7075, 36.1995).map(r1) });
const stadium = pitches.find((p) => p.id === 168915122);
landmarks.push({ id: 'stadium', name: 'Стадион «Урожай»', note: 'way 168915122, название из OSM, подтверждено автором', pos: (stadium ? centroid(stadium.pts) : at(55.7053, 36.2059)).map(r1) });

// shops and amenities that already have a name in OSM: useful for recognition, no invented places
const shops = [];
for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (!t.name || !(t.shop || t.amenity) || !e.geometry) continue;
  if (e.type === 'way' && closed(e.geometry)) shops.push({ name: t.name, kind: t.shop ?? t.amenity, pos: centroid(e.geometry.map(proj)).map(r1) });
}

// confirmed by the author: OSM nightclub "RuzVelt Club" is the Рузвельт
const ruzvelt = shops.find((s) => /ruzvelt/i.test(s.name));
if (ruzvelt) landmarks.push({ id: 'ruzvelt', name: 'Рузвельт', note: 'OSM nightclub «RuzVelt Club», подтверждено автором', pos: ruzvelt.pos });
else console.warn('WARNING: RuzVelt Club not found');

// venues: coordinates given by the author (Google Maps, copied by hand). placeholder=true means "put somewhere nearby" was the instruction.
const venue = (id, name, pos, extra = {}) => landmarks.push({ id, name, kind: 'venue', pos: pos.map(r1), ...extra });
venue('dym', 'The Дым', at(55.704621, 36.192054), { note: 'координаты от автора' });
venue('gym', 'Качалка', at(55.708384, 36.192898), { note: 'координаты от автора' });
venue('police', 'Отдел полиции', at(55.703068, 36.195297), { note: 'координаты от автора' });
const pyat = at(55.703068, 36.195297);
// the author sent the SAME coordinates for police and Pyaterochka: shifted 12 m so both labels are readable, to be confirmed
venue('pyaterochka', 'Пятёрочка', [pyat[0] + 12, pyat[1] + 12], { note: 'у автора те же координаты, что у полиции; сдвиг 12 м, уточнить', placeholder: true });
venue('shawarma', 'Шаурма', at(55.70459, 36.204513), { note: 'координаты от автора' });
venue('hospital', 'Больница', at(55.702916, 36.198396), { note: 'координаты от автора' });
const ruzPos = landmarks.find((l) => l.id === 'ruzvelt')?.pos ?? [0, 0];
const sqPos = landmarks.find((l) => l.id === 'square').pos;
const homePos = landmarks.find((l) => l.id === 'home')?.pos ?? [0, 0];
const pharm = shops.find((s) => s.kind === 'pharmacy');
venue('mixbar', 'Миксбар', [ruzPos[0] + 35, ruzPos[1] - 25], { note: 'заглушка: рядом с Рузвельтом по просьбе автора', placeholder: true });
venue('teatre', 'Театре', [sqPos[0] - 60, sqPos[1] + 40], { note: 'заглушка: рядом с площадью по просьбе автора', placeholder: true });
venue('pharmacy', 'Аптека', pharm ? pharm.pos : [sqPos[0] + 80, sqPos[1] - 50], { note: 'заглушка: ближайшая аптека из OSM («Аптечный пункт»), не подтверждена автором', placeholder: true });
venue('garages', 'Гаражи', [homePos[0] + 70, homePos[1] + 60], { note: 'заглушка: рядом с домом по просьбе автора', placeholder: true });

// building look: kind picks the colour family, levels the visual height (see src/game/worldRender.ts)
// 0 apartments, 1 house, 2 public, 3 commercial, 4 other
const areaOf = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;
function kindOf(b) {
  const t = b.t.building;
  if (['apartments', 'residential', 'dormitory'].includes(t)) return 0;
  if (['house', 'detached', 'semidetached_house', 'bungalow', 'terrace'].includes(t)) return 1;
  if (['school', 'kindergarten', 'hospital', 'civic', 'public', 'government', 'church', 'cathedral', 'sports_centre', 'transportation'].includes(t)) return 2;
  if (['retail', 'commercial', 'supermarket', 'office', 'bank', 'service'].includes(t)) return 3;
  if (['garage', 'garages', 'industrial', 'warehouse', 'roof', 'shed'].includes(t)) return 4;
  const lv = Number(b.t['building:levels']);
  const a = areaOf(b.pts);
  if (lv >= 3) return 0;
  return a < 220 ? 1 : 4;
}
function levelsOf(b, k) {
  const lv = Number(b.t['building:levels']);
  if (lv > 0) return Math.min(lv, 12);
  return [5, 1.5, 3, 2, 1.2][k];
}

// street and river name labels: one label per way that is long enough, text kept upright along the road
const SHORT = [[/ улица$/, ' ул.'], [/^улица /, 'ул. '], [/ переулок$/, ' пер.'], [/^переулок /, 'пер. '], [/ проезд$/, ' пр-д'], [/^проезд /, 'пр-д '], [/ шоссе$/, ' ш.'], [/ проспект$/, ' пр-т'], [/^река /, 'р. ']];
const short = (n) => SHORT.reduce((s, [re, to]) => s.replace(re, to), n);
const streets = [];
function addLabels(list, river) {
  const placed = [];
  for (const r of list) {
    if (!r.name || r.pts.length < 2) continue;
    let len = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) len += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    if (len < (river ? 80 : 70)) continue;
    let acc = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= len / 2) {
        const f = (len / 2 - acc) / (l || 1);
        const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        if (placed.some((p) => p.n === r.name && Math.hypot(p.x - x, p.y - y) < 170)) break;
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        placed.push({ n: r.name, x, y });
        streets.push({ n: short(r.name), x: r1(x), y: r1(y), a: Math.round(ang * 1000) / 1000, r: river ? 1 : 0, big: r.w >= 8 ? 1 : 0 });
        break;
      }
      acc += l;
    }
  }
}
addLabels(roads, false);
addLabels(rivers, true);

const out = {
  width: r1(WIDTH), height: r1(HEIGHT), cell: CELL, gridW: GW, gridH: GH,
  blocked: Buffer.from(packed).toString('base64'),
  buildings: buildings.map((b) => { const k = kindOf(b); const o = { p: flat(b.pts), k, l: levelsOf(b, k) }; const n = b.t['addr:housenumber']; if (n) o.n = String(n); return o; }),
  streets,
  roads: roads.map((r) => ({ w: r.w, p: flat(r.pts) })),
  bridges,
  rivers: rivers.map((r) => ({ w: r.w, p: flat(r.pts) })),
  waters: waters.map((w) => flat(w.pts)),
  greens: greens.map((g) => flat(g.pts)),
  pitches: pitches.map((p) => flat(p.pts)),
  landmarks, shops,
};
const json = JSON.stringify(out);
writeFileSync(join(root, 'public', 'map.json'), json);
const blockedPct = ((grid.reduce((s, v) => s + v, 0) / grid.length) * 100).toFixed(1);
console.log(JSON.stringify({ sizeKB: Math.round(json.length / 1024), worldM: [r1(WIDTH), r1(HEIGHT)], grid: [GW, GH], blockedPct, buildings: buildings.length, roads: roads.length, rivers: rivers.length, waters: waters.length, greens: greens.length, pitches: pitches.length, shops: shops.length, landmarks: landmarks.map((l) => l.id) }));
