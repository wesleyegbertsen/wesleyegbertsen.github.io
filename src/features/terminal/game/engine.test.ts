import { education } from '../../../data/education.ts';
import { experience } from '../../../data/experience.ts';
import { profile } from '../../../data/profile.ts';
import { projects } from '../../../data/projects.ts';
import { skills } from '../../../data/skills.ts';
import { announce, camera, initialGame, NO_INPUT, step, type GameEvent, type GameState, type Input } from './engine.ts';
import { buildLevel, type Level } from './level.ts';
import { RUN_SPEED, STEP_MS, VIEW_COLS } from './physics.ts';

const data = { profile, skills, experience, education, projects };
const level = buildLevel(data);
const DT = STEP_MS / 1000;
const RIGHT: Input = { ...NO_INPUT, right: true };

function run(state: GameState, input: Input, seconds: number, on: Level = level) {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const result = step(current, input, DT, on);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** A small level of our own, so a rule is tested without the draft map in the way. */
const tiny = (rows: string[]): Level => ({
  ...level,
  tiles: rows,
  width: rows[0]!.length,
  height: rows.length,
  items: [],
  checkpoints: [],
  flag: { col: -1, row: -1 },
});

describe('step', () => {
  const settled = run(initialGame(level), NO_INPUT, 1).state;

  it('lands the player on the ground and keeps them there', () => {
    expect(settled.grounded).toBe(true);
    expect(settled.y + 0.9).toBeCloseTo(10, 3);
  });

  it('runs about RUN_SPEED tiles a second while right is held', () => {
    const moved = run(settled, RIGHT, 0.5).state.x - settled.x;
    expect(moved).toBeCloseTo(RUN_SPEED * 0.5, 0);
  });

  it('stops at a wall', () => {
    const room = tiny(['          ', '          ', '     #    ', '##########']);
    const start = { ...initialGame(room), x: 1, y: 2.1 };
    const after = run(start, RIGHT, 1, room).state;
    expect(after.x + 0.8).toBeLessThanOrEqual(5 + 1e-3);
    expect(after.x + 0.8).toBeGreaterThan(4.9);
  });

  it('jumps only from the ground', () => {
    const jump = { ...NO_INPUT, jump: true };
    const risen = run(settled, jump, 0.2).state;
    expect(risen.y).toBeLessThan(settled.y - 1);
    expect(risen.grounded).toBe(false);
    // Holding jump in the air does not lift the player again.
    const held = run(risen, jump, 0.3).state;
    const free = run(risen, NO_INPUT, 0.3).state;
    expect(held.y).toBeCloseTo(free.y, 6);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(settled);
    step(settled, RIGHT, DT, level);
    expect(JSON.stringify(settled)).toBe(before);
  });

  it('stands on a one-way platform but jumps up through it', () => {
    const room = tiny(['          ', '          ', '          ', '          ', '          ', '    ==    ', '##########']);
    const fall = run({ ...initialGame(room), x: 4.1, y: 0.5 }, NO_INPUT, 1.5, room).state;
    expect(fall.y + 0.9).toBeCloseTo(5, 2);
    const up = run({ ...initialGame(room), x: 4.1, y: 5.09 }, { ...NO_INPUT, jump: true }, 0.35, room).state;
    expect(up.y + 0.9).toBeLessThan(5);
  });
});

describe('collecting, checkpoints, respawn and the flag', () => {
  const first = level.items.find((item) => item.row === 9)!;

  it('collects an item once and records its label', () => {
    const state = { ...initialGame(level), x: first.col - 1, y: 9.09 };
    const { state: after, events } = run(state, RIGHT, 0.6);
    expect(after.collected).toEqual([first.label]);
    expect(events.filter((event) => event.type === 'collected')).toHaveLength(1);
  });

  it('reaches a checkpoint when crossing it', () => {
    const edu = level.checkpoints.find((checkpoint) => checkpoint.section === 'Education')!;
    const result = run({ ...initialGame(level), x: edu.col - 1, y: 9.09 }, RIGHT, 0.5);
    expect(result.events).toContainEqual({ type: 'checkpoint', section: 'Education' });
    expect(result.state.checkpoint.col).toBe(edu.col);
  });

  it('respawns at the last checkpoint after spikes, keeping what was collected', () => {
    const spike = level.tiles[9]!.indexOf('^');
    const state = { ...initialGame(level), collected: ['Betabit'], x: spike - 1.2, y: 9.09 };
    let current = state;
    let events: GameEvent[] = [];
    for (let i = 0; i < 30 && !events.some((event) => event.type === 'respawn'); i++) {
      ({ state: current, events } = step(current, RIGHT, DT, level));
    }
    expect(events).toContainEqual({ type: 'respawn' });
    expect(current.collected).toContain('Betabit');
    expect(current.x).toBeCloseTo(initialGame(level).checkpoint.x, 0);
  });

  it('respawns after a fall out of the level', () => {
    const pit = level.tiles[10]!.indexOf(' ');
    const result = run({ ...initialGame(level), x: pit + 0.1, y: 9.09 }, NO_INPUT, 2);
    expect(result.events).toContainEqual({ type: 'respawn' });
  });

  it('has no lives: the state holds no such field', () => {
    expect(Object.keys(initialGame(level))).not.toContain('lives');
  });

  it('finishes at the flag and then stands still', () => {
    const result = run({ ...initialGame(level), x: level.flag.col - 1, y: 9.09 }, RIGHT, 0.5);
    expect(result.events).toContainEqual({ type: 'finished' });
    expect(result.state.finished).toBe(true);
    expect(step(result.state, RIGHT, DT, level)).toEqual({ state: result.state, events: [] });
  });
});

describe('camera', () => {
  it('follows the player', () => {
    const state = { ...initialGame(level), x: 50 };
    expect(camera(state, level, VIEW_COLS)).toBeCloseTo(50 + 0.4 - VIEW_COLS / 2, 5);
  });

  it('stops at both ends of the level', () => {
    expect(camera({ ...initialGame(level), x: 0 }, level, VIEW_COLS)).toBe(0);
    expect(camera({ ...initialGame(level), x: level.width - 1 }, level, VIEW_COLS)).toBe(level.width - VIEW_COLS);
  });
});

describe('announce', () => {
  it('says what happened', () => {
    expect(announce({ type: 'collected', label: 'Betabit' })).toBe('Collected Betabit');
    expect(announce({ type: 'checkpoint', section: 'Education' })).toBe('Checkpoint: Education');
    expect(announce({ type: 'finished' })).toMatch(/^Finished/);
    expect(announce({ type: 'respawn' })).toMatch(/checkpoint/);
  });
});

describe('the draft level', () => {
  it('can be finished by a runner that jumps spikes and pits', () => {
    let state = initialGame(level);
    const events: GameEvent[] = [];
    for (let i = 0; i < 30 * 60 && !state.finished; i++) {
      const col = Math.floor(state.x + 0.4);
      const ahead = [1, 2].map((d) => ({ floor: level.tiles[10]?.[col + d], low: level.tiles[9]?.[col + d] }));
      const jump = state.grounded && ahead.some((tile) => tile.low === '^' || tile.floor === ' ');
      const result = step(state, { left: false, right: true, jump }, DT, level);
      state = result.state;
      events.push(...result.events);
    }
    expect(state.finished).toBe(true);
    expect(events.filter((event) => event.type === 'respawn')).toHaveLength(0);
  });
});
