// Sound without any files: everything is synthesised with the Web Audio API, so nothing extra has to download.
// Browsers only allow sound after a tap or key press, so unlock() is called from the first one.
type AC = AudioContext;
let ctx: AC | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('ruza-mute') === '1'; } catch { muted = false; }

export function unlock(): void {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

export const isMuted = (): boolean => muted;
export function setMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem('ruza-mute', v ? '1' : '0'); } catch { /* storage may be blocked */ }
  if (master) master.gain.value = v ? 0 : 0.5;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, at = 0, highpass = 4000): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = highpass;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  click: (): void => tone(660, 0.07, 'triangle', 0.25),
  good: (): void => { tone(660, 0.1, 'triangle', 0.3); tone(990, 0.16, 'triangle', 0.3, 0.09); },
  bad: (): void => tone(180, 0.25, 'sawtooth', 0.25, 0, 90),
  coin: (): void => { tone(988, 0.08, 'square', 0.18); tone(1319, 0.22, 'square', 0.18, 0.07); },
  puff: (): void => { noise(0.5, 0.35, 0, 1500); tone(120, 0.4, 'sine', 0.12, 0, 70); },
  quest: (): void => { tone(523, 0.12, 'triangle', 0.3); tone(659, 0.12, 'triangle', 0.3, 0.12); tone(784, 0.25, 'triangle', 0.3, 0.24); },
};

let timer: ReturnType<typeof setInterval> | null = null;
let kind = '';

/** Looping background music for a place: 'club' (beat and bass), 'lounge' (soft pads) or 'square' (street guitar). Anything else stops it. */
export function music(k: string): void {
  if (k === kind) return;
  stopMusic();
  if (!ctx || (k !== 'club' && k !== 'lounge' && k !== 'square')) return;
  kind = k;
  const bpm = k === 'club' ? 124 : k === 'square' ? 96 : 84;
  const stepLen = 60 / bpm / 4;
  let step = 0;
  let next = ctx.currentTime + 0.1;
  const tick = (): void => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.2) {
      const at = Math.max(0, next - ctx.currentTime);
      const s = step % 16;
      if (k === 'club') {
        if (s % 4 === 0) tone(130, 0.18, 'sine', 0.5, at, 45);
        if (s % 4 === 2) noise(0.05, 0.25, at, 7000);
        if (s === 4 || s === 12) noise(0.12, 0.3, at, 2500);
        if ([0, 3, 6, 10, 14].includes(s)) tone(55 * (s > 8 ? 1.2 : 1), 0.2, 'sawtooth', 0.18, at);
        if (s % 8 === 0) tone(440 * (s === 0 ? 1 : 1.5), 0.5, 'triangle', 0.07, at);
      } else if (k === 'square') {
        // plucked chords Am - F - C - G, one per bar, with a soft hand-drum on the off beats
        const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
        const bar = Math.floor(step / 16) % 4;
        const ch = chords[bar] as number[];
        if (s % 2 === 0) tone((ch[(s / 2) % 3] as number) * (s % 8 === 0 ? 0.5 : 1), 0.45, 'triangle', 0.13, at);
        if (s % 8 === 4) tone(110, 0.12, 'sine', 0.3, at, 60);
        if (s % 4 === 2) noise(0.04, 0.1, at, 6000);
      } else {
        if (s === 0) [220, 261.6, 329.6, 392].forEach((f) => tone(f, stepLen * 15, 'sine', 0.06, at));
        if (s === 8) [196, 246.9, 293.7, 392].forEach((f) => tone(f, stepLen * 7, 'sine', 0.05, at));
        if (s % 4 === 2) noise(0.04, 0.08, at, 8000);
        if (s === 5 || s === 13) tone(880 + (s === 13 ? 220 : 0), 0.3, 'sine', 0.04, at);
      }
      next += stepLen;
      step++;
    }
  };
  timer = setInterval(tick, 40);
}

export function stopMusic(): void {
  if (timer) clearInterval(timer);
  timer = null;
  kind = '';
}
