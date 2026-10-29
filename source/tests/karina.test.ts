import { describe, expect, it } from 'vitest';
import { Dialogue } from '../src/dialogue';
import karinaInk from '../src/content/ink/karina.ink?raw';

// Plays the whole conversation with random answers; returns the opening line, every line spoken, and whether she was helped.
function play(rnd: () => number): { opening: string; lines: string[]; helped: boolean; steps: number } {
  const d = new Dialogue(karinaInk);
  let line = d.next();
  const lines = [line.text];
  let steps = 1;
  while (!line.ended && steps < 20) {
    line = d.next(Math.floor(rnd() * line.choices.length));
    lines.push(line.text);
    steps++;
  }
  expect(line.ended, 'conversation must end').toBe(true);
  return { opening: (lines[0] ?? '').split('\n')[0] ?? '', lines, helped: d.getFlag('karina_helped'), steps };
}

describe('Karina dialogues', () => {
  it('every random path ends, speaks only as Karina, and has no empty line', () => {
    for (let i = 0; i < 120; i++) {
      const r = play(Math.random);
      expect(r.steps).toBeGreaterThanOrEqual(2);
      for (const l of r.lines) {
        expect(l.length).toBeGreaterThan(10);
        for (const row of l.split('\n').filter(Boolean)) expect(row.startsWith('Карина:'), row).toBe(true);
      }
    }
  });

  it('has at least 8 different scenes and several different beer offers', () => {
    const openings = new Set<string>(), offers = new Set<string>();
    for (let i = 0; i < 250; i++) {
      const r = play(Math.random);
      openings.add(r.opening);
      offers.add((r.lines[r.lines.length - 2] ?? '').split('\n').pop() ?? '');
    }
    expect(openings.size).toBeGreaterThanOrEqual(8);
    expect(offers.size).toBeGreaterThanOrEqual(4);
  });

  it('both outcomes are reachable: sitting with her (helped) and refusing', () => {
    let yes = 0, no = 0;
    for (let i = 0; i < 120; i++) (play(Math.random).helped ? yes++ : no++);
    expect(yes).toBeGreaterThan(10);
    expect(no).toBeGreaterThan(10);
  });
});
