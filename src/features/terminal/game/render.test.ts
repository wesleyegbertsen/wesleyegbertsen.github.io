import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { WALK_TICKS, initialGame } from './engine/engine.ts';
import { levelWorld, play, playIn, testWorld as world } from './engine/testWorld.ts';
import type { GameState, TileDef, World } from './engine/types.ts';
import { STROLL_TICKS } from './engine/wander.ts';
import { parseMap } from './engine/world.ts';
import { FRAME_TICKS, SCREEN_H, SCREEN_W, VOLUME_STEPS, camera, drawGame, drawText, type Hud, type Painter, type Sheets } from './render.ts';
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
    expect(textAt(draws, 28)).toBe('ENERGY10/20');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 57, y: 30, w: 24, h: 4 });
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
    expect(textAt(draws, 8)).toBe('RATLv2');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 23, y: 21, w: 29, h: 4 });
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 93, y: 70, w: 29, h: 4 });
    expect(textAt(draws, 58)).toBe('YOULv1');
    expect(textAt(draws, 77)).toBe('10/20');
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
    collect: [{ item: 'a', total: 3, label: 'AS', mark: '*' }],
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
    const noted = { ...there(), clock: 10, notice: { text: '* 2/3', until: 20 } };
    expect(textAt(drawn(noted, undefined, living).draws, 4)).toBe('*2/3');
    expect(textAt(drawn({ ...noted, clock: 20 }, undefined, living).draws, 4)).toBe('');
  });

  it('draws a speaker in the corner of the map and of the title: with waves, or crossed out', () => {
    const corner = (fills: Fill[]) => fills.filter((fill) => fill.x >= 146 && fill.y <= 12 && fill.w <= 13);
    expect(corner(drawn(there(), undefined, living).fills)).toEqual([]);
    const on = corner(drawn(there(), { muted: false, volume: 5 }, living).fills);
    expect(on[0]).toEqual({ shade: PALETTE[3], x: 146, y: 2, w: 13, h: 11 });
    expect(on).toContainEqual({ shade: PALETTE[3], x: 155, y: 5, w: 1, h: 5 });
    const off = corner(drawn(there(), { muted: true, volume: 5 }, living).fills);
    expect(off).toContainEqual({ shade: PALETTE[3], x: 154, y: 7, w: 1, h: 1 });
    expect(off).not.toContainEqual({ shade: PALETTE[3], x: 155, y: 5, w: 1, h: 5 });
    expect(corner(drawn(initialGame(living), { muted: true, volume: 5 }, living).fills)).toHaveLength(on.length + 3);
  });

  it('shows the find count and the volume at the foot of the Start menu', () => {
    const bag = { ...there(), items: { a: 2 }, menu: { tab: 'items' as const, cursor: 0 } };
    expect(textAt(drawn(bag, { muted: false, volume: 5 }, living).draws, 83)).toBe('AS2/3');
    expect(textAt(drawn(bag, { muted: false, volume: 5 }, living).draws, 94)).toBe('VOLUME50%');
    expect(textAt(drawn(bag, { muted: true, volume: 5 }, living).draws, 94)).toBe('VOLUME50%OFF');
    expect(textAt(drawn(bag, undefined, living).draws, 94)).toBe('');
    expect(textAt(drawn({ ...bag, items: {} }, undefined, living).draws, 83)).toBe('AS0/3');
  });

  it('counts a second thing to collect at the right of the same line', () => {
    const two: World = { ...living, collect: [...living.collect!, { item: 'b', total: 10, label: 'BS', mark: '#' }] };
    const bag = { ...there(), items: { a: 2, b: 7 }, menu: { tab: 'items' as const, cursor: 0 } };
    expect(textAt(drawn(bag, undefined, two).draws, 83)).toBe('AS2/3BS7/10');
  });

  it('draws the volume wheel as ten steps that grow, filled up to the level, dimmed while the sound is off', () => {
    const bag = { ...there(), menu: { tab: 'items' as const, cursor: 0 } };
    const steps = (hud: Hud) => drawn(bag, hud, living).fills.filter((fill) => fill.w === 3 && fill.x >= 56 && fill.x < 96 && fill.y >= 93 && fill.y <= 101);
    const half = steps({ muted: false, volume: 5 });
    expect(half).toHaveLength(VOLUME_STEPS);
    expect(half.filter((fill) => fill.shade === PALETTE[3])).toHaveLength(5);
    expect(half.filter((fill) => fill.shade === PALETTE[3]).map((fill) => fill.x)).toEqual([56, 60, 64, 68, 72]);
    // Each filled step is at least as tall as the one before, and they all stand on one line.
    const heights = half.filter((fill) => fill.shade === PALETTE[3]).map((fill) => fill.h);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(heights.at(-1)).toBeGreaterThan(heights[0]!);
    expect(new Set(half.map((fill) => fill.y + fill.h)).size).toBe(1);
    expect(steps({ muted: false, volume: 0 }).filter((fill) => fill.shade === PALETTE[3])).toHaveLength(0);
    expect(steps({ muted: false, volume: 10 }).filter((fill) => fill.shade === PALETTE[3])).toHaveLength(10);
    expect(textAt(drawn(bag, { muted: false, volume: 10 }, living).draws, 94)).toBe('VOLUME100%');
    expect(textAt(drawn(bag, { muted: false, volume: 0 }, living).draws, 94)).toBe('VOLUME0%');
    // Off: the wheel keeps its place but is drawn in the dimmer shade.
    const off = steps({ muted: true, volume: 5 });
    expect(off.filter((fill) => fill.shade === PALETTE[3])).toHaveLength(0);
    expect(off.filter((fill) => fill.h > 1)).toHaveLength(5);
  });

  it('moves the cursor to the volume row and says what left and right do there', () => {
    const bag = { ...there(), items: { a: 1 }, menu: { tab: 'items' as const, cursor: 0, row: 'volume' as const } };
    const { draws } = drawn(bag, { muted: false, volume: 5 }, living);
    expect(textAt(draws, 94)).toBe('>VOLUME50%');
    expect(textAt(draws, 42)).toBe('Ax1');
    expect(textAt(draws, 110)).toBe('Leftandrightchange');
  });

  it('scrolls a bag that is longer than the list, keeping the cursor in view', () => {
    const items = Object.fromEntries(letters.map((id) => [id, 1]));
    const at = (cursor: number) => drawn({ ...there(), items, menu: { tab: 'items' as const, cursor } }, undefined, living).draws;
    expect(textAt(at(0), 42)).toBe('>Ax1');
    expect(textAt(at(0), 72)).toBe('Dx1');
    expect(textAt(at(0), 82)).toBe('');
    expect(textAt(at(2), 42)).toBe('Ax1');
    expect(textAt(at(2), 62)).toBe('>Cx1');
    expect(textAt(at(3), 42)).toBe('Bx1');
    expect(textAt(at(3), 62)).toBe('>Dx1');
    expect(textAt(at(6), 42)).toBe('Dx1');
    expect(textAt(at(6), 72)).toBe('>Gx1');
    expect(textAt(at(6), 82)).toBe('');
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

describe('a dark place', () => {
  const legend: Record<string, TileDef> = { '.': { sprite: 'cavefloor', solid: false }, '#': { sprite: 'cavewall', solid: true } };
  const rows = Array.from({ length: 11 }, (_, y) => (y === 5 ? '......@......' : '.............'));
  const pit = parseMap({ id: 'pit', name: 'Pit', ground: '.', rows, dark: 1, objects: { '@': { solid: false, trigger: 'interact', branches: [] } } }, legend);
  const dark: World = { ...world, maps: { pit }, start: { map: 'pit', at: '@' } };
  const there = (): GameState => ({ ...initialGame(dark), scene: 'world' });
  const shade = (draws: Draw[], name: 'shade-1' | 'shade-2') => {
    const [sx, sy] = tiles[name];
    return draws.filter((draw) => draw.sheet === 'tiles' && draw.sx === sx && draw.sy === sy);
  };
  /** The darkest squares laid over whole cells. */
  const black = (fills: Fill[]) => fills.filter((fill) => fill.w === TILE && fill.h === TILE && fill.shade === PALETTE[3]);

  it('lights the cells around the player, dithers two rings and blacks out the rest', () => {
    const { draws, fills } = drawn(there(), undefined, dark);
    // The player stands at 6,5 of a 13 x 11 map; the view is 10 x 9 cells.
    const player = spriteDraws(draws, 'player-down-0')[0]!;
    const over = (list: { x: number; y: number }[], dx: number, dy: number) => list.some((item) => item.x === player.x + dx * TILE && item.y === player.y + dy * TILE);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, 1], [-1, 1]] as const) {
      expect(over(shade(draws, 'shade-1'), dx, dy) || over(shade(draws, 'shade-2'), dx, dy) || over(black(fills), dx, dy), `${dx},${dy}`).toBe(false);
    }
    expect(over(shade(draws, 'shade-1'), 2, 0)).toBe(true);
    expect(over(shade(draws, 'shade-1'), 0, -2)).toBe(true);
    expect(over(shade(draws, 'shade-2'), 3, 0)).toBe(true);
    expect(over(shade(draws, 'shade-2'), 2, 2)).toBe(true);
    expect(over(black(fills), 4, 0)).toBe(true);
    expect(over(black(fills), -3, 3)).toBe(true);
    // Most of the screen is black.
    expect(black(fills).length).toBeGreaterThan(40);
    expect(shade(draws, 'shade-1').length + shade(draws, 'shade-2').length).toBeGreaterThan(15);
  });

  it('lays the darkness over the map and under the HUD and the text box', () => {
    const talking = { ...there(), dialogue: { pages: [['Dark.']], page: 0, shown: 5 }, notice: { text: '# 1/10', until: 99 } };
    const { draws, fills } = drawn(talking, { muted: false, volume: 5 }, dark);
    const lastBlack = fills.map((fill) => fill.w === TILE && fill.h === TILE && fill.shade === PALETTE[3]).lastIndexOf(true);
    const speaker = fills.findIndex((fill) => fill.x === 146 && fill.y === 2 && fill.w === 13);
    const textBox = fills.findIndex((fill) => fill.x === 0 && fill.y === 104 && fill.w === SCREEN_W);
    expect(speaker).toBeGreaterThan(lastBlack);
    expect(textBox).toBeGreaterThan(lastBlack);
    expect(textAt(draws, 110)).toBe('Dark.');
    expect(textAt(draws, 4)).toBe('#1/10');
  });

  it('does not change with the clock: the darkness never flickers', () => {
    const picture = (clock: number) => JSON.stringify(drawn({ ...there(), clock }, undefined, dark).fills);
    expect(picture(0)).toBe(picture(FRAME_TICKS));
    expect(picture(0)).toBe(picture(7));
  });

  it('moves with the player, also between two cells', () => {
    const still = black(drawn(there(), undefined, dark).fills).length;
    const walking = { ...there(), x: 7, dir: 'right' as const, walk: { fromX: 6, fromY: 5, t: WALK_TICKS / 2 } };
    const moving = drawn(walking, undefined, dark);
    expect(spriteDraws(moving.draws, 'player-right-1')).toHaveLength(1);
    expect(Math.abs(black(moving.fills).length - still)).toBeLessThan(20);
  });

  it('leaves a map that is not dark alone', () => {
    const lit: World = { ...dark, maps: { pit: { ...pit, dark: undefined } } };
    const { draws, fills } = drawn(there(), undefined, lit);
    expect(shade(draws, 'shade-1')).toEqual([]);
    expect(black(fills)).toEqual([]);
  });
});

describe('levels on the screen', () => {
  it('shows the level and the XP towards the next one in the Start menu', () => {
    const bag = playIn(levelWorld, { ...play(initialGame(levelWorld, 7), 'a', 'a'), level: 2, xp: 13 }, 'start');
    const { draws, fills } = drawn(bag, undefined, levelWorld);
    expect(textAt(draws, 18)).toBe('LV2XP7/14');
    // Half of the XP bar (38 wide inside) is filled.
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 51, y: 21, w: 19, h: 2 });
    const top = drawn({ ...bag, level: 4, xp: 40 }, undefined, levelWorld);
    expect(textAt(top.draws, 18)).toBe('LV4XPMAX');
    expect(top.fills).toContainEqual({ shade: PALETTE[2], x: 51, y: 21, w: 38, h: 2 });
  });

  it('shows both levels and the XP bar in a battle', () => {
    const battle = playIn(levelWorld, { ...play(initialGame(levelWorld, 7), 'a', 'a'), level: 2, xp: 13 }, 'down', 'right', 'a');
    const { draws, fills } = drawn(battle, undefined, levelWorld);
    expect(textAt(draws, 8)).toBe('RATLv2');
    expect(textAt(draws, 58)).toBe('YOULv2');
    expect(textAt(draws, 89)).toBe('XP');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 93, y: 92, w: 29, h: 2 });
  });

  it('measures the enemy against the energy it came with, not its lowest', () => {
    const battle = playIn(levelWorld, play(initialGame(levelWorld, 7), 'a', 'a'), 'down', 'right', 'a');
    const strong = { ...battle, battle: { ...battle.battle!, level: 5, enemyMax: 16, enemyHp: 8 } };
    const { draws, fills } = drawn(strong, undefined, levelWorld);
    expect(textAt(draws, 8)).toBe('RATLv5');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 23, y: 21, w: 29, h: 4 });
  });

  it('draws the offer of a new move: what it does, the moves that can make room, and the way out', () => {
    const offer = { ...play(initialGame(levelWorld, 7), 'a', 'a'), level: 2, learn: { move: 'zap', cursor: 0 } };
    const { draws } = drawn(offer, undefined, levelWorld);
    expect(textAt(draws, 8)).toBe('NEWMOVELV2');
    expect(textAt(draws, 20)).toBe('ZAP');
    expect(textAt(draws, 30)).toBe('POW9HIT100%PP3');
    expect(textAt(draws, 58)).toBe('>NAP+10');
    expect(textAt(draws, 68)).toBe('KEEPMYMOVES');
    expect(textAt(draws, 110)).toBe('HITalwaysstays.');
    expect(textAt(draws, 130)).toBe('B:keepyourmoves.');
    const keep = drawn({ ...offer, learn: { move: 'zap', cursor: 1 } }, undefined, levelWorld).draws;
    expect(textAt(keep, 58)).toBe('NAP+10');
    expect(textAt(keep, 68)).toBe('>KEEPMYMOVES');
    // A move that heals is described by what it heals.
    const heal = drawn({ ...offer, moves: ['hit', 'zap'], learn: { move: 'nap', cursor: 0 } }, undefined, levelWorld).draws;
    expect(textAt(heal, 30)).toBe('HEALS10PP1');
    expect(textAt(heal, 58)).toBe('>ZAP9100%');
  });

  it('lists the moves the player knows now in a battle, not the ones of the start', () => {
    const swapped = { ...play(initialGame(levelWorld, 7), 'a', 'a'), moves: ['hit', 'zap'], pp: { hit: 2, zap: 3 } };
    const moves = playIn(levelWorld, swapped, 'down', 'right', 'a', 'a');
    expect(textAt(drawn(moves, undefined, levelWorld).draws, 88)).toBe('ZAP3/3');
  });
});
