import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { WALK_TICKS, initialGame } from './engine/engine.ts';
import { play, testWorld as world } from './engine/testWorld.ts';
import type { GameState, TileDef, World } from './engine/types.ts';
import { STROLL_TICKS } from './engine/wander.ts';
import { parseMap } from './engine/world.ts';
import { FRAME_TICKS, SCREEN_H, SCREEN_W, camera, drawGame, drawText, type Hud, type Painter, type Sheets } from './render.ts';
import { fitScale, layout } from './scale.ts';

type Draw = { sheet: string; sx: number; sy: number; sw: number; sh: number; x: number; y: number; w: number; h: number };
type Fill = { shade: string; x: number; y: number; w: number; h: number };

const sheets = { tiles: 'tiles', sprites: 'sprites', font: 'font' } as unknown as Sheets;

/** A context that writes down what is drawn on it. */
function recorder() {
  const draws: Draw[] = [];
  const fills: Fill[] = [];
  const ctx = {
    fillStyle: '',
    imageSmoothingEnabled: true,
    drawImage: (sheet: string, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) =>
      draws.push({ sheet, sx, sy, sw, sh, x, y, w, h }),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ shade: this.fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as Painter, draws, fills, smooth: () => ctx.imageSmoothingEnabled };
}

function drawn(state: GameState, hud?: Hud, on: World = world) {
  const record = recorder();
  drawGame(record.ctx, sheets, state, on, hud);
  return record;
}

/** The text drawn on a row of the screen, read back from the glyphs' places on the font sheet. */
function textAt(draws: Draw[], y: number) {
  return draws
    .filter((draw) => draw.sheet === 'font' && draw.y === y)
    .sort((a, b) => a.x - b.x)
    .map((draw) => String.fromCharCode(FONT.first + (draw.sy % FONT.lightY) / FONT.cellH * FONT.cols + draw.sx / FONT.cellW))
    .join('');
}

const started = () => play(initialGame(world, 7), 'a', 'a');
const spriteDraws = (draws: Draw[], name: keyof typeof sprites) => {
  const [sx, sy] = sprites[name];
  return draws.filter((draw) => draw.sheet === 'sprites' && draw.sx === sx && draw.sy === sy);
};

describe('drawText', () => {
  it('takes each glyph from its cell on the font sheet and skips spaces', () => {
    const { ctx, draws } = recorder();
    drawText(ctx, sheets, 'A b', 10, 20);
    expect(draws).toEqual([
      { sheet: 'font', sx: 1 * FONT.cellW, sy: 2 * FONT.cellH, sw: 6, sh: 8, x: 10, y: 20, w: 6, h: 8 },
      { sheet: 'font', sx: 2 * FONT.cellW, sy: 4 * FONT.cellH, sw: 6, sh: 8, x: 22, y: 20, w: 6, h: 8 },
    ]);
  });

  it('uses the light copy of the font and doubles the size when asked', () => {
    const { ctx, draws } = recorder();
    drawText(ctx, sheets, 'A', 0, 0, true, 2);
    expect(draws[0]).toMatchObject({ sy: 2 * FONT.cellH + FONT.lightY, w: 12, h: 16 });
  });
});

describe('camera', () => {
  it('follows the player, stops at the edges, and centres a small map', () => {
    expect(camera(200, 400, 160)).toBe(120);
    expect(camera(10, 400, 160)).toBe(0);
    expect(camera(395, 400, 160)).toBe(240);
    expect(camera(50, 112, 160)).toBe(-24);
  });
});

describe('drawGame', () => {
  it('draws the title in big letters, without smoothing', () => {
    const { draws, smooth } = drawn(initialGame(world));
    expect(smooth()).toBe(false);
    const big = draws.filter((draw) => draw.sheet === 'font' && draw.w === 12);
    expect(big).toHaveLength(world.title.length);
    expect(textAt(draws, 92)).toBe('-PRESSA-');
  });

  it('draws every cell of the map, the things on it and the player facing down', () => {
    const { draws, fills } = drawn(started());
    expect(fills[0]).toEqual({ shade: PALETTE[3], x: 0, y: 0, w: SCREEN_W, h: SCREEN_H });
    const map = world.maps.main!;
    expect(draws.filter((draw) => draw.sheet === 'tiles')).toHaveLength(map.width * map.height + 5);
    // The map is 7 x 6 cells, smaller than the screen, so it is centred.
    const [floorX, floorY] = tiles.floor;
    expect(draws).toContainEqual({ sheet: 'tiles', sx: floorX, sy: floorY, sw: TILE, sh: TILE, x: 24 + 16, y: 24 + 16, w: TILE, h: TILE });
    expect(spriteDraws(draws, 'player-down-0')).toEqual([expect.objectContaining({ x: 24 + 2 * TILE, y: 24 + 2 * TILE })]);
    expect(spriteDraws(draws, 'boss')).toHaveLength(2);
  });

  it('leaves out a beaten boss and shows an opened chest', () => {
    const { draws } = drawn({ ...started(), flags: { beat: true, opened: true } });
    expect(spriteDraws(draws, 'boss')).toHaveLength(1);
    const [openX, openY] = tiles['chest-open'];
    expect(draws.filter((draw) => draw.sheet === 'tiles' && draw.sx === openX && draw.sy === openY)).toHaveLength(1);
  });

  it('draws the player between two cells while walking, on the walking frame', () => {
    const walking = { ...started(), x: 3, dir: 'right' as const, walk: { fromX: 2, fromY: 2, t: WALK_TICKS / 2 } };
    expect(spriteDraws(drawn(walking).draws, 'player-right-1')).toEqual([expect.objectContaining({ x: 24 + 2.5 * TILE })]);
  });

  it('types the dialogue: only the characters shown so far', () => {
    const talking = play(started(), 'right', 'up', 'a');
    expect(textAt(drawn(talking).draws, 110)).toBe('Hellothere.');
    const half = { ...talking, dialogue: { ...talking.dialogue!, shown: 5 } };
    const { draws, fills } = drawn(half);
    expect(textAt(draws, 110)).toBe('Hello');
    expect(fills).toContainEqual({ shade: PALETTE[0], x: 3, y: 107, w: SCREEN_W - 6, h: 34 });
  });

  it('shows the bag with its items and the badge case', () => {
    const bag = play({ ...started(), items: { coffee: 2 }, hp: 10 }, 'start');
    const { draws, fills } = drawn(bag);
    expect(textAt(draws, 42)).toBe('>COFFEEx2');
    expect(textAt(draws, 24)).toBe('ENERGY10/20');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 57, y: 26, w: 24, h: 4 });
    expect(textAt(draws, 110)).toBe('Restores20energy.');

    const badges = drawn(play({ ...bag, badges: ['one'] }, 'right')).draws;
    expect(textAt(badges, 42)).toBe('>*FIRSTBADGE');
    expect(textAt(badges, 110)).toBe('1of1badges.');
  });

  it('shows a battle: the enemy, both energy bars and the menu', () => {
    const battle = play(started(), 'down', 'right', 'a');
    const { draws, fills } = drawn({ ...battle, hp: 10, battle: { ...battle.battle!, enemyHp: 5 } });
    expect(spriteDraws(draws, 'bug')).toEqual([expect.objectContaining({ w: 32, h: 32 })]);
    expect(spriteDraws(draws, 'player-up-0')).toEqual([expect.objectContaining({ w: 32, h: 32 })]);
    expect(textAt(draws, 8)).toBe('RAT');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 23, y: 21, w: 29, h: 4 });
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 93, y: 75, w: 29, h: 4 });
    expect(textAt(draws, 84)).toBe('10/20');
    expect(textAt(draws, 110)).toBe('Whatwill>FIGHT');
    expect(textAt(draws, 120)).toBe('youdo?ITEM');
  });

  it('lists the moves with their PP, and the line of a battle step', () => {
    const moves = play(started(), 'down', 'right', 'a', 'a');
    expect(textAt(drawn(moves).draws, 78)).toBe('>HIT2/2');
    expect(textAt(drawn(moves).draws, 88)).toBe('NAP1/1');
    const intro = play(started(), 'down', 'right');
    expect(textAt(drawn(intro).draws, 110)).toBe('AwildRATappeared!');
  });

  it('draws the ending', () => {
    const ended = { ...started(), scene: 'ending' as const, finished: true };
    const { draws } = drawn(ended);
    expect(draws.filter((draw) => draw.sheet === 'font' && draw.w === 12)).toHaveLength('THEEND'.length);
    expect(spriteDraws(draws, 'wesley')).toHaveLength(1);
  });
});

describe('a living map', () => {
  const legend: Record<string, TileDef> = {
    '.': { sprite: 'grass', solid: false },
    '~': { sprite: 'water', solid: true, animated: true },
  };
  const park = parseMap(
    {
      id: 'park',
      name: 'Park',
      ground: '.',
      rows: ['.~.', '.@.', '.wf'],
      objects: {
        '@': { solid: false, trigger: 'interact', branches: [] },
        w: { sprite: 'cat', solid: true, trigger: 'interact', branches: [], wander: { radius: 1, every: 10 } },
        f: { sprite: 'fountain', animated: true, solid: true, trigger: 'interact', branches: [] },
      },
    },
    legend,
  );
  const letters = 'abcdefg'.split('');
  const living: World = {
    ...world,
    maps: { park },
    start: { map: 'park', at: '@' },
    items: Object.fromEntries(letters.map((id) => [id, { name: id.toUpperCase(), description: `Item ${id}.` }])),
    collect: { item: 'a', total: 3 },
  };
  const there = (): GameState => ({ ...initialGame(living), scene: 'world' });
  const tileDraws = (draws: Draw[], name: keyof typeof tiles) => {
    const [sx, sy] = tiles[name];
    return draws.filter((draw) => draw.sheet === 'tiles' && draw.sx === sx && draw.sy === sy);
  };
  // The map is 3 x 3 cells, centred on the screen.
  const left = (SCREEN_W - 3 * TILE) / 2;
  const top = (SCREEN_H - 3 * TILE) / 2;

  it('shows the two pictures of an animated tile and of an animated thing in turn, on the beat of the clock', () => {
    const first = drawn(there(), undefined, living).draws;
    expect(tileDraws(first, 'water')).toHaveLength(1);
    expect(tileDraws(first, 'water-b')).toHaveLength(0);
    expect(tileDraws(first, 'fountain')).toHaveLength(1);
    const second = drawn({ ...there(), clock: FRAME_TICKS }, undefined, living).draws;
    expect(tileDraws(second, 'water')).toHaveLength(0);
    expect(tileDraws(second, 'water-b')).toHaveLength(1);
    expect(tileDraws(second, 'fountain-b')).toHaveLength(1);
    expect(tileDraws(drawn({ ...there(), clock: 2 * FRAME_TICKS }, undefined, living).draws, 'water')).toHaveLength(1);
  });

  it('draws someone on a stroll between two cells, and on the new cell when the step is done', () => {
    const roam = { 'park:w': { x: 0, y: 2, fromX: 1, fromY: 2, at: 100 } };
    const half = drawn({ ...there(), roam, clock: 100 + STROLL_TICKS / 2 }, undefined, living).draws;
    expect(spriteDraws(half, 'cat')).toEqual([expect.objectContaining({ x: left + 0.5 * TILE, y: top + 2 * TILE })]);
    const bob = drawn({ ...there(), roam, clock: 100 + STROLL_TICKS / 4 }, undefined, living).draws;
    expect(spriteDraws(bob, 'cat')).toEqual([expect.objectContaining({ x: left + 0.75 * TILE, y: top + 2 * TILE - 1 })]);
    const done = drawn({ ...there(), roam, clock: 100 + STROLL_TICKS }, undefined, living).draws;
    expect(spriteDraws(done, 'cat')).toEqual([expect.objectContaining({ x: left, y: top + 2 * TILE })]);
  });

  it('shows the note after a find until its time is up', () => {
    const noted = { ...there(), clock: 10, notice: { text: '2/3', until: 20 } };
    expect(textAt(drawn(noted, undefined, living).draws, 4)).toBe('*2/3');
    expect(textAt(drawn({ ...noted, clock: 20 }, undefined, living).draws, 4)).toBe('');
  });

  it('draws a speaker in the corner of the map and of the title: with waves, or crossed out', () => {
    const corner = (fills: Fill[]) => fills.filter((fill) => fill.x >= 146 && fill.y <= 12 && fill.w <= 13);
    expect(corner(drawn(there(), undefined, living).fills)).toEqual([]);
    const on = corner(drawn(there(), { muted: false }, living).fills);
    expect(on[0]).toEqual({ shade: PALETTE[3], x: 146, y: 2, w: 13, h: 11 });
    expect(on).toContainEqual({ shade: PALETTE[3], x: 155, y: 5, w: 1, h: 5 });
    const off = corner(drawn(there(), { muted: true }, living).fills);
    expect(off).toContainEqual({ shade: PALETTE[3], x: 154, y: 7, w: 1, h: 1 });
    expect(off).not.toContainEqual({ shade: PALETTE[3], x: 155, y: 5, w: 1, h: 5 });
    expect(corner(drawn(initialGame(living), { muted: true }, living).fills)).toHaveLength(on.length + 3);
  });

  it('shows the find count and the sound at the foot of the Start menu', () => {
    const bag = { ...there(), items: { a: 2 }, menu: { tab: 'items' as const, cursor: 0 } };
    expect(textAt(drawn(bag, { muted: false }, living).draws, 94)).toBe('AS2/3SOUNDON');
    expect(textAt(drawn(bag, { muted: true }, living).draws, 94)).toBe('AS2/3SOUNDOFF');
    expect(textAt(drawn(bag, undefined, living).draws, 94)).toBe('AS2/3');
    expect(textAt(drawn({ ...bag, items: {} }, undefined, living).draws, 94)).toBe('AS0/3');
  });

  it('scrolls a bag that is longer than the list, keeping the cursor in view', () => {
    const items = Object.fromEntries(letters.map((id) => [id, 1]));
    const at = (cursor: number) => drawn({ ...there(), items, menu: { tab: 'items' as const, cursor } }, undefined, living).draws;
    expect(textAt(at(0), 42)).toBe('>Ax1');
    expect(textAt(at(0), 82)).toBe('Ex1');
    expect(textAt(at(3), 42)).toBe('Ax1');
    expect(textAt(at(3), 72)).toBe('>Dx1');
    expect(textAt(at(4), 42)).toBe('Bx1');
    expect(textAt(at(4), 72)).toBe('>Ex1');
    expect(textAt(at(6), 42)).toBe('Cx1');
    expect(textAt(at(6), 82)).toBe('>Gx1');
    expect(textAt(at(6), 92)).toBe('');
  });
});

describe('fitting the screen', () => {
  it('uses whole device pixels per game pixel', () => {
    expect(fitScale(500, 440)).toBe(3);
    expect(fitScale(500, 400)).toBe(2);
    expect(fitScale(271, 239, 2.625)).toBeCloseTo(4 / 2.625);
    expect(fitScale(100, 100)).toBeCloseTo(0.625);
    expect(fitScale(0, 0)).toBe(1);
  });

  it('puts the controls beside the screen when there is room, under it on a phone', () => {
    expect(layout(896, 448, false)).toEqual({ wide: true, scale: 3 });
    const phone = layout(299, 407, true, 2.625);
    expect(phone.wide).toBe(false);
    expect(SCREEN_W * phone.scale).toBeLessThanOrEqual(299 - 28);
    expect(SCREEN_H * phone.scale + 140 + 28).toBeLessThanOrEqual(407);
    expect(phone.scale).toBeGreaterThan(1.4);
  });
});
