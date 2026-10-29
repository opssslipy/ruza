// A small 11-a-side football simulation. Pure logic, no graphics: the pitch is a rectangle with the long axis "u" (goal to goal,
// -L/2..L/2) and the short axis "v" (touchline to touchline, -W/2..W/2). Team 0 attacks towards +u, team 1 towards -u.
// It is not real football: players hold a 4-4-2 shape that slides with the ball, the holder dribbles, passes or shoots,
// keepers sometimes save, and goals, throw-ins and kick-offs follow. Enough to look like a match from a camera above.

import { isWeekday, seasonOf, type GameState } from './state';

export type Role = 'gk' | 'df' | 'mf' | 'fw';
export interface Player { team: 0 | 1; role: Role; base: { u: number; v: number }; u: number; v: number; hu: number; hv: number; speed: number }
export interface Ball { u: number; v: number; vu: number; vv: number; owner: number; to: number; shot: boolean; h: number }

const GOAL_HALF = 6; // goal mouth half-width in metres (a cartoon-sized goal to match the cartoon-sized players)
const MAX_SPEED = 7.2;
const DRIBBLE = 5.2;

const FORMATION: { role: Role; f: number; v: number }[] = [
  { role: 'gk', f: 0.03, v: 0 },
  { role: 'df', f: 0.2, v: -0.72 }, { role: 'df', f: 0.2, v: -0.25 }, { role: 'df', f: 0.2, v: 0.25 }, { role: 'df', f: 0.2, v: 0.72 },
  { role: 'mf', f: 0.42, v: -0.7 }, { role: 'mf', f: 0.42, v: -0.24 }, { role: 'mf', f: 0.42, v: 0.24 }, { role: 'mf', f: 0.42, v: 0.7 },
  { role: 'fw', f: 0.62, v: -0.3 }, { role: 'fw', f: 0.62, v: 0.3 },
];

/** Matches are played in spring, summer and autumn: weekday evenings and weekend afternoons. Under the snow the pitch is empty. */
export function matchOn(s: GameState): boolean {
  if (seasonOf(s) === 'winter') return false;
  const h = s.minutes / 60;
  return isWeekday(s) ? h >= 17.5 && h < 20 : h >= 12 && h < 18;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export class Match {
  players: Player[] = [];
  ball: Ball = { u: 0, v: 0, vu: 0, vv: 0, owner: -1, to: -1, shot: false, h: 0 };
  score: [number, number] = [0, 0];
  /** seconds of cheering left after a goal */
  cheer = 0;
  /** counts goals so a viewer can notice a new one */
  goals = 0;
  possessionChanges = 0;
  private decide = 1.5;
  private lastTeam: 0 | 1 = 0;

  constructor(readonly L: number, readonly W: number, private rnd: () => number = Math.random) {
    for (const team of [0, 1] as const) {
      for (const f of FORMATION) {
        const u = team === 0 ? -L / 2 + f.f * L : L / 2 - f.f * L;
        const v = f.v * (W / 2) * (f.role === 'mf' ? 0.9 : 1);
        this.players.push({ team, role: f.role, base: { u, v }, u, v, hu: team === 0 ? 1 : -1, hv: 0, speed: 0 });
      }
    }
    this.kickOff(this.rnd() < 0.5 ? 0 : 1);
  }

  private nearestTo(u: number, v: number, team: 0 | 1 | null, skip = -1): number {
    let best = -1, bd = Infinity;
    this.players.forEach((p, i) => {
      if (i === skip || (team !== null && p.team !== team)) return;
      const d = Math.hypot(p.u - u, p.v - v);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  private give(i: number): void {
    if (this.ball.owner !== i) this.possessionChanges++;
    this.ball.owner = i; this.ball.to = -1; this.ball.shot = false; this.ball.vu = 0; this.ball.vv = 0;
    this.lastTeam = (this.players[i] as Player).team;
    this.decide = 0.8 + this.rnd() * 1.4;
  }

  private kickOff(team: 0 | 1): void {
    this.ball.u = 0; this.ball.v = 0;
    this.give(this.nearestTo(0, 0, team));
  }

  step(dt: number): void {
    const { L, W, ball } = this;
    this.cheer = Math.max(0, this.cheer - dt);
    this.decide -= dt;

    // --- ball -----------------------------------------------------------------------------------------
    if (ball.owner >= 0) {
      const o = this.players[ball.owner] as Player;
      ball.u = o.u + o.hu * 1.1; ball.v = o.v + o.hv * 1.1; ball.h = 0;
      if (this.decide <= 0) this.act(ball.owner);
      // a tackle: an opponent close to the holder sometimes wins the ball
      const foe = this.nearestTo(o.u, o.v, o.team === 0 ? 1 : 0);
      const f = this.players[foe] as Player;
      if (Math.hypot(f.u - o.u, f.v - o.v) < 2.6 && this.rnd() < dt * 0.55) this.give(foe);
    } else {
      ball.u += ball.vu * dt; ball.v += ball.vv * dt;
      const sp = Math.hypot(ball.vu, ball.vv);
      ball.h = ball.shot ? Math.min(2.6, sp * 0.06) : Math.min(1.8, sp * 0.05);
      const slow = ball.shot ? 0.15 : 0.55;
      ball.vu *= 1 - slow * dt; ball.vv *= 1 - slow * dt;
      // the receiver, an interceptor, or whoever reaches a rolling ball first
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i] as Player;
        const d = Math.hypot(p.u - ball.u, p.v - ball.v);
        if (ball.shot) {
          if (p.role === 'gk' && p.team !== this.lastTeam && d < 3.2) {
            if (this.rnd() < 0.5) { this.give(i); break; }
            ball.shot = false; ball.vu *= -0.4; // palmed away
          }
          continue;
        }
        const wanted = i === ball.to && d < 1.8;
        const stray = sp < 6 && d < 1.6;
        const steal = p.team !== this.lastTeam && d < 1.4 && this.rnd() < dt * 1.6;
        if (wanted || stray || steal) { this.give(i); break; }
      }
      if (ball.owner < 0 && sp < 0.6) this.give(this.nearestTo(ball.u, ball.v, null));
      this.boundaries();
    }

    // --- players ----------------------------------------------------------------------------------------
    const holder = ball.owner >= 0 ? (this.players[ball.owner] as Player) : null;
    const chasers: number[] = [];
    for (const team of [0, 1] as const) {
      if (holder && holder.team === team) continue;
      const near = this.players.map((p, i) => ({ i, d: p.team === team && p.role !== 'gk' ? Math.hypot(p.u - ball.u, p.v - ball.v) : Infinity })).sort((a, b) => a.d - b.d);
      chasers.push((near[0] as { i: number }).i, (near[1] as { i: number }).i);
    }
    this.players.forEach((p, i) => {
      let tu: number, tv: number, sp = MAX_SPEED * 0.8;
      if (i === ball.owner) {
        const goalU = p.team === 0 ? L / 2 : -L / 2;
        tu = goalU; tv = clamp(p.v + Math.sin(this.cheer + i + performance_t(this) * 1.3) * 6, -W / 2 + 3, W / 2 - 3); sp = DRIBBLE;
      } else if (p.role === 'gk') {
        tu = p.base.u; tv = clamp(ball.v * 0.25, -4, 4); sp = 4;
      } else if (chasers.includes(i) || i === ball.to) {
        tu = ball.u; tv = ball.v; sp = MAX_SPEED;
      } else {
        tu = clamp(p.base.u + ball.u * 0.4, -L / 2 + 3, L / 2 - 3);
        tv = p.base.v + (ball.v - p.base.v) * 0.15;
      }
      const du = tu - p.u, dv = tv - p.v, d = Math.hypot(du, dv);
      const want = d < 1.2 ? 0 : sp;
      p.speed += (want - p.speed) * Math.min(1, dt * 4);
      if (d > 0.05) { p.hu += (du / d - p.hu) * Math.min(1, dt * 8); p.hv += (dv / d - p.hv) * Math.min(1, dt * 8); const hl = Math.hypot(p.hu, p.hv) || 1; p.hu /= hl; p.hv /= hl; }
      p.u = clamp(p.u + p.hu * p.speed * dt, -L / 2 - 1, L / 2 + 1);
      p.v = clamp(p.v + p.hv * p.speed * dt, -W / 2 - 1, W / 2 + 1);
    });
  }

  /** The holder shoots near the goal, otherwise passes to a teammate who is ahead of the ball, otherwise keeps running. */
  private act(i: number): void {
    const o = this.players[i] as Player, { L, ball } = this;
    const dir = o.team === 0 ? 1 : -1;
    const toGoal = L / 2 - dir * o.u;
    this.decide = 1.0 + this.rnd() * 1.6;
    if (toGoal < L * 0.3 && this.rnd() < 0.75) {
      const ty = (this.rnd() * 2 - 1) * (GOAL_HALF - 0.8);
      const dx = dir * L / 2 - ball.u, dy = ty - ball.v, d = Math.hypot(dx, dy) || 1;
      ball.owner = -1; ball.to = -1; ball.shot = true; this.lastTeam = o.team; this.possessionChanges++;
      ball.vu = (dx / d) * 30; ball.vv = (dy / d) * 30;
      return;
    }
    let best = -1, bs = -Infinity;
    this.players.forEach((p, j) => {
      if (j === i || p.team !== o.team || p.role === 'gk') return;
      const d = Math.hypot(p.u - o.u, p.v - o.v);
      if (d < 7 || d > 34) return;
      const score = (p.u - o.u) * dir + this.rnd() * 14 - d * 0.15;
      if (score > bs) { bs = score; best = j; }
    });
    if (best < 0 || this.rnd() < 0.15) return; // keep the ball a bit longer
    const r = this.players[best] as Player;
    const lu = r.u + r.hu * r.speed * 0.7, lv = r.v + r.hv * r.speed * 0.7;
    const dx = lu - ball.u, dy = lv - ball.v, d = Math.hypot(dx, dy) || 1;
    ball.owner = -1; ball.to = best; ball.shot = false; this.lastTeam = o.team; this.possessionChanges++;
    ball.vu = (dx / d) * 22; ball.vv = (dy / d) * 22;
  }

  private boundaries(): void {
    const { L, W, ball } = this;
    if (Math.abs(ball.u) > L / 2) {
      const scorerTeam: 0 | 1 = ball.u > 0 ? 0 : 1; // the team that attacks that end
      if (Math.abs(ball.v) < GOAL_HALF && this.lastTeam === scorerTeam) {
        this.score[scorerTeam]++; this.goals++; this.cheer = 6;
        this.kickOff(scorerTeam === 0 ? 1 : 0);
      } else {
        // goal kick or corner: the other side restarts from the nearest player
        const restart: 0 | 1 = this.lastTeam === 0 ? 1 : 0;
        ball.u = Math.sign(ball.u) * (L / 2 - 4); ball.v = clamp(ball.v, -W / 2 + 3, W / 2 - 3);
        this.give(this.nearestTo(ball.u, ball.v, restart));
      }
    } else if (Math.abs(ball.v) > W / 2) {
      ball.v = Math.sign(ball.v) * (W / 2 - 0.6);
      this.give(this.nearestTo(ball.u, ball.v, this.lastTeam === 0 ? 1 : 0));
    }
  }
}

// a slowly changing value used for the holder's zig-zag; kept off the hot path of the rng so replays stay deterministic
function performance_t(m: Match): number { return m.possessionChanges * 0.37; }
