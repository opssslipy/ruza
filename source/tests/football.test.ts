import { describe, expect, it } from 'vitest';
import { Match } from '../src/game/football';

// a small seeded generator so the matches are repeatable
const seeded = (seed: number): (() => number) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

describe('football match simulation', () => {
  it('has two full teams: 11 players each, one keeper per side', () => {
    const m = new Match(103, 63, seeded(1));
    expect(m.players).toHaveLength(22);
    for (const team of [0, 1]) {
      const t = m.players.filter((p) => p.team === team);
      expect(t).toHaveLength(11);
      expect(t.filter((p) => p.role === 'gk')).toHaveLength(1);
      expect(t.filter((p) => p.role === 'df')).toHaveLength(4);
      expect(t.filter((p) => p.role === 'mf')).toHaveLength(4);
      expect(t.filter((p) => p.role === 'fw')).toHaveLength(2);
    }
  });

  it('ten minutes of play: nothing leaves the pitch, no NaN, nobody sprints faster than a human cartoon', () => {
    const problems: string[] = [];
    let maxStep = 0;
    for (const seed of [3, 7, 11]) {
      const m = new Match(103, 63, seeded(seed));
      for (let t = 0; t < 600; t += 0.05) {
        const before = m.players.map((p) => [p.u, p.v] as const);
        m.step(0.05);
        m.players.forEach((p, i) => {
          if (!Number.isFinite(p.u) || !Number.isFinite(p.v)) problems.push(`NaN player ${i} seed ${seed} t ${t}`);
          if (Math.abs(p.u) > 103 / 2 + 1.01 || Math.abs(p.v) > 63 / 2 + 1.01) problems.push(`player ${i} off the pitch seed ${seed} t ${t}`);
          const b = before[i] as readonly [number, number];
          maxStep = Math.max(maxStep, Math.hypot(p.u - b[0], p.v - b[1]) / 0.05);
        });
        if (!Number.isFinite(m.ball.u) || !Number.isFinite(m.ball.v) || Math.abs(m.ball.u) > 103 / 2 + 3 || Math.abs(m.ball.v) > 63 / 2 + 3) problems.push(`ball lost seed ${seed} t ${t}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(maxStep).toBeLessThan(9);
  });

  it('it is a match, not a stand-off: the ball changes hands often and goals are scored by both sides over many matches', () => {
    let goals = 0, changes = 0, bothScored = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = new Match(103, 63, seeded(seed * 13));
      for (let t = 0; t < 900; t += 0.05) m.step(0.05);
      goals += m.goals; changes += m.possessionChanges;
      if (m.score[0] > 0 && m.score[1] > 0) bothScored++;
    }
    expect(changes / 12).toBeGreaterThan(40);
    expect(goals / 12).toBeGreaterThanOrEqual(0.7); // at least one goal in a typical quarter of an hour
    expect(goals / 12).toBeLessThan(25); // and not a basketball score
    expect(bothScored).toBeGreaterThanOrEqual(2);
  });

  it('a goal makes the crowd cheer and the ball restarts in the centre circle area', () => {
    const m = new Match(103, 63, seeded(5));
    let t = 0;
    while (m.goals === 0 && t < 3600) { m.step(0.05); t += 0.05; }
    expect(m.goals).toBeGreaterThan(0);
    expect(m.cheer).toBeGreaterThan(5);
    expect(Math.hypot(m.ball.u, m.ball.v)).toBeLessThan(15);
  });
});
