// Generates flat-style portraits (SVG) in one shared style.
// Characters without photos get generic stand-ins; characters with photos get a stylisation built from the
// recorded features (hair, beard, glasses, mood). None of these is a likeness, they are drafts for the prototypes to approve.
// Usage: node tools/make-portraits.mjs  (writes into public/portraits)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'portraits');
mkdirSync(outDir, { recursive: true });

// hair: buzz | short | long | bald | cap | receding ; bun: top knot ; extra: beard | stubble | glasses | sunglasses | none
// mouth: smile | grin | flat | smirk | frown ; lips: lipstick colour ; eye: iris colour ; ears: normal | big
  const people = JSON.parse(readFileSync(join(root, 'src', 'content', 'looks.json'), 'utf8'));

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



