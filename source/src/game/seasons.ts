import * as THREE from 'three';
import type { Season } from './state';

// Season palettes for the town: ground layers, sky, trees. "flake" is the colour of falling leaves or snow (none in summer and spring).
export interface SeasonColors { ground: number; parks: number; pitch: number; water: number; sky: number; hemiGround: number; flake?: number }

export const SEASON_COLORS: Record<Season, SeasonColors> = {
  spring: { ground: 0xe3e8cb, parks: 0xaee08a, pitch: 0x90d27a, water: 0x78bfe8, sky: 0xc9e6f5, hemiGround: 0xb9ac8c },
  summer: { ground: 0xdfe8c2, parks: 0x9fd06a, pitch: 0x7fc25c, water: 0x6fb4e6, sky: 0xbfe0f5, hemiGround: 0xb9ac8c },
  autumn: { ground: 0xe6dcc0, parks: 0xcfc27a, pitch: 0xa8c066, water: 0x7fa8c0, sky: 0xcdd6dc, hemiGround: 0xb9a98a, flake: 0xe0a23a },
  winter: { ground: 0xf1f4f7, parks: 0xe9eff3, pitch: 0xe4ecf0, water: 0xb9d3e3, sky: 0xdde5ee, hemiGround: 0xdfe6ee, flake: 0xffffff },
};

const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Colour of the i-th tree's crown: fresh in spring, dark in summer, red-and-gold in autumn (some firs stay green), pale and snowy in winter. */
export function crownColor(season: Season, i: number, c: THREE.Color): THREE.Color {
  switch (season) {
    case 'spring': return c.setHSL(0.27 + hash(i + 3) * 0.05, 0.55, 0.36 + hash(i + 9) * 0.1);
    case 'autumn': return hash(i + 31) < 0.3 ? c.setHSL(0.33 + hash(i + 3) * 0.04, 0.45, 0.2 + hash(i + 9) * 0.1) : c.setHSL(0.02 + hash(i + 5) * 0.12, 0.65, 0.34 + hash(i + 9) * 0.12);
    case 'winter': return c.setHSL(0.45, 0.12, 0.62 + hash(i + 9) * 0.1);
    default: return c.setHSL(0.33 + hash(i + 3) * 0.04, 0.45, 0.2 + hash(i + 9) * 0.1);
  }
}
