import type { Level } from './level.ts';
import { GRAVITY, JUMP_SPEED, MAX_FALL, PLAYER_H, PLAYER_W, RUN_SPEED } from './physics.ts';

export type Input = { left: boolean; right: boolean; jump: boolean };
export const NO_INPUT: Input = { left: false, right: false, jump: false };

export type GameState = {
  /** Top-left of the player's box, in tiles. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Where to come back after spikes or a fall; `col` is the checkpoint tile (-1: the start). */
  checkpoint: { x: number; y: number; col: number; section: string };
  collected: string[];
  finished: boolean;
};

export type GameEvent =
  | { type: 'collected'; label: string }
  | { type: 'checkpoint'; section: string }
  | { type: 'respawn' }
  | { type: 'finished' };

const EPS = 1e-6;
/** The largest slice `step` integrates in one go, so nothing moves a whole tile between two collision checks. */
const MAX_SLICE = 1 / 60;
/** Spikes and items use a box slightly smaller than the player's, so near misses are misses. */
const MARGIN = 0.15;
const SIDE = (1 - PLAYER_W) / 2;

export function initialGame(level: Level): GameState {
  const x = level.start.col + SIDE;
  const y = level.start.row + 1 - PLAYER_H - EPS;
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: false,
    checkpoint: { x, y, col: -1, section: level.sections[0]?.label ?? '' },
    collected: [],
    finished: false,
  };
}

const tileAt = (level: Level, col: number, row: number) => level.tiles[row]?.[col] ?? ' ';

/** Tiles a box covers; `margin` shrinks the box. */
function* covered(x: number, y: number, margin = 0): Generator<[number, number]> {
  const left = Math.floor(x + margin);
  const right = Math.floor(x + PLAYER_W - margin - EPS);
  const top = Math.floor(y + margin);
  const bottom = Math.floor(y + PLAYER_H - margin - EPS);
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) yield [col, row];
}

const blocked = (level: Level, x: number, y: number) => {
  for (const [col, row] of covered(x, y)) if (tileAt(level, col, row) === '#') return true;
  return false;
};

function slice(state: GameState, input: Input, h: number, level: Level): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let { x, y, vy } = state;
  const vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * RUN_SPEED;
  if (input.jump && state.grounded) vy = -JUMP_SPEED;
  vy = Math.min(vy + GRAVITY * h, MAX_FALL);

  // Across first, against solid tiles only.
  let nx = Math.min(Math.max(x + vx * h, 0), level.width - PLAYER_W);
  if (blocked(level, nx, y)) nx = vx > 0 ? Math.floor(nx + PLAYER_W) - PLAYER_W - EPS : Math.floor(nx) + 1 + EPS;
  x = nx;

  // Then down or up. Going down, a one-way platform also holds the player if the feet were above it before.
  let ny = y + vy * h;
  let grounded = false;
  if (vy > 0) {
    for (const [col, row] of covered(x, ny)) {
      const tile = tileAt(level, col, row);
      if (tile === '#' || (tile === '=' && y + PLAYER_H <= row + EPS)) {
        ny = row - PLAYER_H - EPS;
        vy = 0;
        grounded = true;
        break;
      }
    }
  } else if (vy < 0 && blocked(level, x, ny)) {
    ny = Math.floor(ny) + 1 + EPS;
    vy = 0;
  }
  y = ny;

  let next: GameState = { ...state, x, y, vx, vy, grounded };
  const respawn = () => {
    next = { ...next, x: next.checkpoint.x, y: next.checkpoint.y, vx: 0, vy: 0, grounded: false };
    events.push({ type: 'respawn' });
  };

  if (y > level.height + 2) {
    respawn();
    return { state: next, events };
  }
  for (const [col, row] of covered(x, y, MARGIN)) {
    const tile = tileAt(level, col, row);
    if (tile === '^') {
      respawn();
      return { state: next, events };
    }
    if (tile === 'F') {
      next = { ...next, finished: true, vx: 0, vy: 0 };
      events.push({ type: 'finished' });
      return { state: next, events };
    }
    if (tile === '|' && next.checkpoint.col !== col) {
      const section = level.checkpoints.find((checkpoint) => checkpoint.col === col)?.section ?? '';
      next = { ...next, checkpoint: { x: col + SIDE, y: row + 1 - PLAYER_H - EPS, col, section } };
      events.push({ type: 'checkpoint', section });
    }
  }
  for (const item of level.items) {
    if (next.collected.includes(item.label)) continue;
    const hit = [...covered(x, y, MARGIN)].some(([col, row]) => col === item.col && row === item.row);
    if (hit) {
      next = { ...next, collected: [...next.collected, item.label] };
      events.push({ type: 'collected', label: item.label });
    }
  }
  return { state: next, events };
}

/** Advances the game by `dt` seconds. Pure: the state is never mutated. */
export function step(
  state: GameState,
  input: Input,
  dt: number,
  level: Level,
): { state: GameState; events: GameEvent[] } {
  if (state.finished) return { state, events: [] };
  const slices = Math.max(1, Math.ceil(dt / MAX_SLICE - EPS));
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < slices && !current.finished; i++) {
    const result = slice(current, input, dt / slices, level);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** The leftmost column (fractional) the camera shows: it follows the player and stops at both ends of the level. */
export function camera(state: GameState, level: Level, cols: number): number {
  return clamp(state.x + PLAYER_W / 2 - cols / 2, 0, Math.max(0, level.width - cols));
}

/** What the live region says about an event. */
export function announce(event: GameEvent): string {
  switch (event.type) {
    case 'collected':
      return `Collected ${event.label}`;
    case 'checkpoint':
      return `Checkpoint: ${event.section}`;
    case 'respawn':
      return 'Back at the last checkpoint';
    case 'finished':
      return 'Finished! You reached the contact details';
  }
}
