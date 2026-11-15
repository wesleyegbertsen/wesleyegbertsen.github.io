import { education } from '../../../data/education.ts';
import { experience } from '../../../data/experience.ts';
import { profile } from '../../../data/profile.ts';
import { projects } from '../../../data/projects.ts';
import { skills } from '../../../data/skills.ts';
import { initialGame } from './engine.ts';
import { buildLevel } from './level.ts';
import { CANVAS_H, canvasWidth, drawGame } from './render.ts';
import { VIEW_COLS, VIEW_COLS_NARROW } from './physics.ts';

const level = buildLevel({ profile, skills, experience, education, projects });

/** A 2D context that records what was drawn and with which colour. */
function fakeContext() {
  const calls: { op: string; fill: string }[] = [];
  const ctx = new Proxy(
    { fillStyle: '' as string, globalAlpha: 1, font: '', textBaseline: '' },
    {
      get(target, key: string) {
        if (key in target) return target[key as keyof typeof target];
        return () => calls.push({ op: key, fill: target.fillStyle });
      },
      set(target, key: string, value) {
        (target as Record<string, unknown>)[key] = value;
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const palette = { accent: '#00ff41', ink: '#000000' };

describe('drawGame', () => {
  it('clears the canvas and draws the ground, a coin and the player', () => {
    const { ctx, calls } = fakeContext();
    drawGame(ctx, initialGame(level), level, palette, VIEW_COLS);
    expect(calls[0]).toMatchObject({ op: 'clearRect' });
    expect(calls.filter((call) => call.op === 'fillRect' && call.fill === palette.accent).length).toBeGreaterThan(5);
    expect(calls.some((call) => call.op === 'arc')).toBe(true);
    expect(calls.some((call) => call.op === 'fillRect' && call.fill === '#f5f5f5')).toBe(true);
  });

  it('stops drawing a coin once it is collected', () => {
    const near = { ...initialGame(level), x: 6, y: 9.09 };
    const before = fakeContext();
    drawGame(before.ctx, near, level, palette, VIEW_COLS);
    const after = fakeContext();
    drawGame(after.ctx, { ...near, collected: level.items.map((item) => item.label) }, level, palette, VIEW_COLS);
    const coins = (calls: { op: string }[]) => calls.filter((call) => call.op === 'arc').length;
    expect(coins(after.calls)).toBeLessThan(coins(before.calls));
  });

  it('has a fixed canvas size of whole tiles', () => {
    expect(canvasWidth(VIEW_COLS) % 16).toBe(0);
    expect(canvasWidth(VIEW_COLS_NARROW) % 16).toBe(0);
    expect(CANVAS_H % 16).toBe(0);
  });
});
