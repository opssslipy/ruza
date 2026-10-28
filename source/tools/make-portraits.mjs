// Generates flat-style portraits (SVG) in one shared style.
// Characters without photos get generic stand-ins; characters with photos get a stylisation built from the
// recorded features (hair, beard, glasses, mood). None of these is a likeness, they are drafts for the prototypes to approve.
// Usage: node tools/make-portraits.mjs  (writes into public/portraits)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'portraits');
mkdirSync(outDir, { recursive: true });

// hair: buzz | short | long | bald | cap | receding ; bun: top knot ; extra: beard | stubble | glasses | sunglasses | none
// mouth: smile | grin | flat | smirk | frown ; lips: lipstick colour ; eye: iris colour ; ears: normal | big
const people = [
  // generic stand-ins (no photo)
  { id: 'stas', bg: '#2f3b52', skin: '#e8b996', hair: 'short', hairColor: '#4a3426', extra: 'stubble', top: '#546a8a', mouth: 'smirk' },
  { id: 'demon', bg: '#3a2424', skin: '#d9a07e', hair: 'buzz', hairColor: '#1d1612', extra: 'beard', top: '#161616', mouth: 'flat' },
  { id: 'korun', bg: '#2b2f24', skin: '#cf9570', hair: 'short', hairColor: '#201813', extra: 'stubble', top: '#3f4a2e', mouth: 'smirk' },
  { id: 'bara', bg: '#1f2d44', skin: '#e4b08e', hair: 'cap', hairColor: '#1b2a46', extra: 'stubble', top: '#2c4a7a', mouth: 'flat' },
  { id: 'bezuk', bg: '#24303f', skin: '#dba583', hair: 'short', hairColor: '#2b2b2b', extra: 'glasses', top: '#3b5278', mouth: 'flat' },
  { id: 'petya', bg: '#3b2a1e', skin: '#e0a98a', hair: 'bald', hairColor: '#000000', extra: 'none', top: '#6b4a2f', mouth: 'smile' },
  { id: 'kryazh', bg: '#2a2a2a', skin: '#d19c7a', hair: 'cap', hairColor: '#3a3a3a', extra: 'beard', top: '#5a5a5a', mouth: 'smirk' },
  { id: 'shatruha', bg: '#3d2b3d', skin: '#f0c7a8', hair: 'long', hairColor: '#7a4a2a', extra: 'none', top: '#8a4f78', mouth: 'smile' },
  { id: 'minyucha', bg: '#2b3d3a', skin: '#efc3a3', hair: 'long', hairColor: '#2a1d16', extra: 'glasses', top: '#3f7a70', mouth: 'smirk' },
  // stylised from recorded photo features
  // Lev: buzz cut, light brown hair, clean-shaven, prominent ears; photo is serious, drawn with a half-smile because he is the joker
  { id: 'lev', bg: '#28364d', skin: '#efc5a6', hair: 'buzz', hairColor: '#9a7440', extra: 'none', top: '#222831', mouth: 'smirk', eye: '#7fa6c9', ears: 'big' },
  // Timur: buzzed reddish hair, ginger stubble, calm direct gaze
  { id: 'timur', bg: '#3a2d24', skin: '#f0c4a4', hair: 'buzz', hairColor: '#b8602f', extra: 'stubble', top: '#1d1d22', mouth: 'smirk', eye: '#8db0c8' },
  // Diana: long blonde hair with dark roots and a top knot, pink eyeshadow, nude lips
  { id: 'diana', bg: '#3c2a35', skin: '#f2cdb0', hair: 'long', hairColor: '#d9b878', bun: true, extra: 'none', top: '#c85f8f', mouth: 'smile', eye: '#7fb0d0', lips: '#d49a8c', shadow: '#e8837f' },
  // AnyaArtem: short hair, round dark glasses, scowl, light blue hoodie collar
  { id: 'anyaartem', bg: '#33363a', skin: '#f0c9ae', hair: 'short', hairColor: '#8a6a48', extra: 'sunglasses', top: '#9fb8d8', mouth: 'frown' },
  // Belka: receding dark hair, full dark beard, wide grin, thin chain
  { id: 'belka', bg: '#3a2b1f', skin: '#d9a982', hair: 'receding', hairColor: '#3a2a20', extra: 'beard', top: '#c99a7a', mouth: 'grin', chain: true },
  // Karina: long straight black hair with centre part, green eyes, nude lips
  { id: 'karina', bg: '#2e2640', skin: '#e6b895', hair: 'long', hairColor: '#14141a', extra: 'none', top: '#8a6fc0', mouth: 'smile', eye: '#6fa070', lips: '#d49a8c' },
];

function hairBack(p) {
  if (p.hair === 'long') return `<path d="M72 120 Q60 215 82 236 L158 236 Q180 215 168 120 Z" fill="${p.hairColor}"/>`;
  return '';
}

function hairFront(p) {
  let s = '';
  switch (p.hair) {
    case 'buzz':
      s = `<path d="M77 114 Q76 64 120 64 Q164 64 163 114 Q148 90 120 90 Q92 90 77 114Z" fill="${p.hairColor}"/>`;
      break;
    case 'short':
      s = `<path d="M78 108 Q80 62 120 62 Q160 62 162 108 Q150 84 120 84 Q90 84 78 108Z" fill="${p.hairColor}"/>`;
      break;
    case 'receding':
      s = `<path d="M78 106 Q82 64 120 64 Q158 64 162 106 Q148 90 138 92 Q120 78 102 92 Q92 90 78 106Z" fill="${p.hairColor}"/>`;
      break;
    case 'long':
      s = `<path d="M76 118 Q76 58 120 58 Q164 58 164 118 Q154 84 120 82 Q86 84 76 118Z" fill="${p.hairColor}"/>`;
      break;
    case 'cap':
      s = `<path d="M74 100 Q80 60 120 60 Q160 60 166 100 Z" fill="${p.hairColor}"/><rect x="70" y="96" width="100" height="10" rx="5" fill="${p.hairColor}"/>`;
      break;
    default:
      break;
  }
  if (p.bun) s += `<circle cx="120" cy="48" r="17" fill="${p.hairColor}"/>`;
  return s;
}

function extra(p) {
  if (p.extra === 'beard') return `<path d="M84 140 Q120 214 156 140 Q150 178 120 184 Q90 178 84 140Z" fill="${p.hairColor}"/>`;
  if (p.extra === 'stubble') return `<path d="M88 146 Q120 198 152 146 Q146 186 120 190 Q94 186 88 146Z" fill="${p.hairColor}" opacity="0.35"/>`;
  if (p.extra === 'glasses') {
    return `<g fill="none" stroke="#111" stroke-width="3"><circle cx="102" cy="126" r="13"/><circle cx="138" cy="126" r="13"/><path d="M115 126 H125"/></g>`;
  }
  if (p.extra === 'sunglasses') {
    return `<g stroke="#111" stroke-width="3"><circle cx="102" cy="126" r="14" fill="#1b1b1f"/><circle cx="138" cy="126" r="14" fill="#1b1b1f"/><path d="M116 126 H124"/></g>`;
  }
  return '';
}

function mouth(p) {
  const c = p.lips ?? '#7a3b2e';
  const w = p.lips ? 6 : 4;
  if (p.mouth === 'grin') return `<path d="M100 158 Q120 182 140 158 Z" fill="#fff" stroke="#7a3b2e" stroke-width="3" stroke-linejoin="round"/>`;
  if (p.mouth === 'smile') return `<path d="M104 160 Q120 174 136 160" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  if (p.mouth === 'smirk') return `<path d="M106 164 Q122 168 138 156" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  if (p.mouth === 'frown') return `<path d="M106 168 Q120 158 134 168" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  return `<path d="M107 163 H133" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function browLine(p) {
  const col = p.hairColor === '#000000' ? '#5a3a2a' : p.hairColor;
  // furrowed brows for a frown: slanted inward
  if (p.mouth === 'frown') return `<path d="M92 114 L112 108 M148 114 L128 108" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
  return `<path d="M92 112 H112 M128 112 H148" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
}

function svg(p) {
  const ear = p.ears === 'big' ? { rx: 10, ry: 15 } : { rx: 7, ry: 12 };
  const eye = p.eye ?? '#1a1a1a';
  const eyes = p.extra === 'sunglasses' ? '' : `<circle cx="102" cy="126" r="5" fill="${eye}"/><circle cx="138" cy="126" r="5" fill="${eye}"/><circle cx="103.5" cy="124.5" r="1.6" fill="#fff"/><circle cx="139.5" cy="124.5" r="1.6" fill="#fff"/>`;
  const shadow = p.shadow ? `<ellipse cx="102" cy="120" rx="13" ry="5" fill="${p.shadow}" opacity="0.6"/><ellipse cx="138" cy="120" rx="13" ry="5" fill="${p.shadow}" opacity="0.6"/>` : '';
  const chain = p.chain ? `<path d="M104 196 Q120 214 136 196" stroke="#d8d8d8" stroke-width="3" fill="none"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
<rect width="240" height="240" fill="${p.bg}"/>
${hairBack(p)}
<path d="M40 240 Q44 196 120 192 Q196 196 200 240Z" fill="${p.top}"/>
<rect x="104" y="170" width="32" height="30" fill="${p.skin}"/>
${chain}
<ellipse cx="120" cy="128" rx="44" ry="52" fill="${p.skin}"/>
<ellipse cx="${76}" cy="130" rx="${ear.rx}" ry="${ear.ry}" fill="${p.skin}"/><ellipse cx="${164}" cy="130" rx="${ear.rx}" ry="${ear.ry}" fill="${p.skin}"/>
${hairFront(p)}
${shadow}
${eyes}
${browLine(p)}
${extra(p)}
${mouth(p)}
</svg>
`;
}

for (const p of people) writeFileSync(join(outDir, `${p.id}.svg`), svg(p), 'utf8');
console.log(`wrote ${people.length} portraits to ${outDir}`);


