import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { WALK_TICKS, initialGame } from './engine/engine.ts';
import { levelWorld, play, playIn, testWorld as world } from './engine/testWorld.ts';
import type { GameState, TileDef, World } from './engine/types.ts';
import { STROLL_TICKS } from './engine/wander.ts';
import { parseMap } from './engine/world.ts';
import { FRAME_TICKS, SCREEN_H, SCREEN_W, VOLUME_STEPS, camera, drawGame, drawText, facingSprite, type Hud, type Painter, type Sheets } from './render.ts';
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
    // Cell 3,2: the second stride (the strides take turns per cell).
    expect(spriteDraws(drawn(walking).draws, 'player-right-2')).toEqual([expect.objectContaining({ x: 24 + 2.5 * TILE })]);
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
    expect(textAt(draws, 6)).toBe('RATLv2');
    expect(textAt(draws, 16)).toBe('HP');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 24, y: 19, w: 30, h: 3 });
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 91, y: 71, w: 30, h: 3 });
    expect(textAt(draws, 58)).toBe('YOULv1');
    expect(textAt(draws, 68)).toBe('HP');
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

});

describe('the battle screen', () => {
  const battle = () => play(started(), 'down', 'right', 'a');
  const dark = (fills: Fill[]) => fills.filter((fill) => fill.shade === PALETTE[3]);

  it('gives each fighter a box in one style: a bracket down one side and along the bottom, mirrored', () => {
    const { fills } = drawn(battle());
    // The enemy, top left: the upright on the left, the rail under it, ending in a point.
    expect(dark(fills)).toContainEqual({ shade: PALETTE[3], x: 4, y: 6, w: 2, h: 22 });
    expect(dark(fills)).toContainEqual({ shade: PALETTE[3], x: 4, y: 26, w: 94, h: 2 });
    expect(dark(fills)).toContainEqual({ shade: PALETTE[3], x: 98, y: 27, w: 4, h: 1 });
    // The player, bottom right: the upright on the right, as tall as its four rows, down to the rail.
    expect(dark(fills)).toContainEqual({ shade: PALETTE[3], x: 154, y: 58, w: 2, h: 36 });
  });

  it('makes the XP bar the rail of the box of the player: thin, right under the energy, joined to the upright', () => {
    const { fills, draws } = drawn(battle());
    const rail = dark(fills).find((fill) => fill.y === 91 && fill.h === 3)!;
    expect(rail).toEqual({ shade: PALETTE[3], x: 90, y: 91, w: 64, h: 3 });
    // It ends where the upright starts, and at the foot of it.
    expect(rail.x + rail.w).toBe(154);
    expect(rail.y + rail.h).toBe(58 + 36);
    // The energy bar above it starts at the same place and is thicker.
    expect(dark(fills)).toContainEqual({ shade: PALETTE[3], x: 90, y: 70, w: 62, h: 5 });
    // Both labels stand in one column, in the same font.
    const label = (y: number) => draws.filter((draw) => draw.sheet === 'font' && draw.y === y).map((draw) => draw.x);
    expect(label(68)).toEqual([76, 82]);
    expect(label(87)).toEqual([76, 82]);
  });

  it('shows the numbers of the energy for the player only', () => {
    const { draws } = drawn(battle());
    const rows = [...new Set(draws.filter((draw) => draw.sheet === 'font' && draw.y < 56).map((draw) => draw.y))];
    expect(rows.sort((a, b) => a - b)).toEqual([6, 16]);
    expect(textAt(draws, 77)).toBe('20/20');
    // Right-aligned with the end of the energy bar.
    expect(Math.max(...draws.filter((draw) => draw.sheet === 'font' && draw.y === 77).map((draw) => draw.x + draw.w))).toBe(152);
  });

  it('has room for the longest name at the highest level beside the picture of the enemy', () => {
    const long: World = { ...world, enemies: { ...world.enemies, rat: { ...world.enemies.rat!, name: 'RACE CONDITION' } } };
    const state = battle();
    const { draws } = drawn({ ...state, battle: { ...state.battle!, level: 10 } }, undefined, long);
    expect(textAt(draws, 6)).toBe('RACECONDITIONLv10');
    const end = Math.max(...draws.filter((draw) => draw.sheet === 'font' && draw.y === 6).map((draw) => draw.x + draw.w));
    const picture = spriteDraws(draws, 'bug')[0]!;
    expect(end).toBeLessThanOrEqual(picture.x);
    expect(picture.x + picture.w).toBeLessThanOrEqual(SCREEN_W);
    expect(picture).toMatchObject({ w: 32, h: 32 });
  });

  it('keeps the menu at the bottom, and the box of the enemy in view above the list of moves', () => {
    const menu = drawn(battle());
    expect(menu.fills).toContainEqual({ shade: PALETTE[3], x: 0, y: 104, w: 100, h: 40 });
    const moves = drawn(play(battle(), 'a'));
    expect(moves.fills).toContainEqual({ shade: PALETTE[3], x: 0, y: 56, w: SCREEN_W, h: 88 });
    expect(textAt(moves.draws, 6)).toBe('RATLv2');
    expect(dark(moves.fills)).toContainEqual({ shade: PALETTE[3], x: 4, y: 6, w: 2, h: 22 });
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

describe('the Start menu', () => {
  const letters = 'abcdefg'.split('');
  const items = Object.fromEntries(letters.map((id) => [id, { name: id.toUpperCase(), description: `Item ${id}.` }]));
  const shop: World = { ...world, items, collect: [{ item: 'a', total: 3, label: 'AS', mark: '*' }, { item: 'b', total: 10, label: 'BS', mark: '#' }] };
  const there = (): GameState => ({ ...initialGame(shop), scene: 'world' });
  const on: Hud = { muted: false, volume: 5, lcd: true };

  it('names its three tabs and underlines the open one', () => {
    const tab = (name: 'items' | 'badges' | 'settings') => drawn({ ...there(), menu: { tab: name, cursor: 0 } }, on, shop);
    expect(textAt(tab('items').draws, 6)).toBe('BAGBADGESSETTINGS<>');
    expect(tab('items').fills).toContainEqual({ shade: PALETTE[3], x: 10, y: 15, w: 17, h: 1 });
    expect(tab('badges').fills).toContainEqual({ shade: PALETTE[3], x: 38, y: 15, w: 35, h: 1 });
    expect(tab('settings').fills).toContainEqual({ shade: PALETTE[3], x: 84, y: 15, w: 47, h: 1 });
  });

  it('counts the things to collect at its foot, on the bag and the badges', () => {
    const bag = { ...there(), items: { a: 2, b: 7 }, menu: { tab: 'items' as const, cursor: 0 } };
    expect(textAt(drawn(bag, on, shop).draws, 92)).toBe('AS2/3BS7/10');
    expect(textAt(drawn({ ...bag, items: {} }, undefined, shop).draws, 92)).toBe('AS0/3BS0/10');
    // The volume is not on these tabs any more.
    expect(drawn(bag, on, shop).draws.some((draw) => draw.sheet === 'font' && draw.y === 94)).toBe(false);
  });

  it('scrolls a bag that is longer than the list, keeping the cursor in view', () => {
    const all = Object.fromEntries(letters.map((id) => [id, 1]));
    const at = (cursor: number) => drawn({ ...there(), items: all, menu: { tab: 'items' as const, cursor } }, undefined, shop).draws;
    expect(textAt(at(0), 42)).toBe('>Ax1');
    expect(textAt(at(0), 82)).toBe('Ex1');
    expect(textAt(at(3), 42)).toBe('Ax1');
    expect(textAt(at(3), 72)).toBe('>Dx1');
    expect(textAt(at(4), 42)).toBe('Bx1');
    expect(textAt(at(4), 72)).toBe('>Ex1');
    expect(textAt(at(6), 42)).toBe('Cx1');
    expect(textAt(at(6), 82)).toBe('>Gx1');
  });

  it('shows the settings: the sound, the volume wheel and the look of the screen, with the cursor on one', () => {
    const settings = (cursor: number, hud: Hud = on) => drawn({ ...there(), menu: { tab: 'settings' as const, cursor } }, hud, shop);
    const first = settings(0);
    expect(textAt(first.draws, 46)).toBe('>SOUNDON');
    expect(textAt(first.draws, 60)).toBe('VOLUME50%');
    expect(textAt(first.draws, 74)).toBe('SCREENLCD');
    expect(textAt(first.draws, 110)).toBe('Aswitchesthesoundoff');
    expect(textAt(settings(1).draws, 60)).toBe('>VOLUME50%');
    expect(textAt(settings(1).draws, 110)).toBe('Leftandrightchange');
    expect(textAt(settings(2).draws, 74)).toBe('>SCREENLCD');
    expect(textAt(settings(0, { muted: true, volume: 5, lcd: false }).draws, 46)).toBe('>SOUNDOFF');
    expect(textAt(settings(0, { muted: true, volume: 5, lcd: false }).draws, 74)).toBe('SCREENPLAIN');
    expect(textAt(settings(1, { muted: false, volume: 10 }).draws, 60)).toBe('>VOLUME100%');
    expect(textAt(settings(1, { muted: false, volume: 0 }).draws, 60)).toBe('>VOLUME0%');
  });

  it('draws the volume wheel as ten steps that grow, filled up to the level, dimmed while the sound is off', () => {
    const steps = (hud: Hud) =>
      drawn({ ...there(), menu: { tab: 'settings' as const, cursor: 1 } }, hud, shop).fills.filter((fill) => fill.w === 3 && fill.x >= 64 && fill.x < 104 && fill.y >= 59 && fill.y <= 67);
    const half = steps({ muted: false, volume: 5 });
    expect(half).toHaveLength(VOLUME_STEPS);
    const filled = half.filter((fill) => fill.shade === PALETTE[3]);
    expect(filled.map((fill) => fill.x)).toEqual([64, 68, 72, 76, 80]);
    const heights = filled.map((fill) => fill.h);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(heights.at(-1)).toBeGreaterThan(heights[0]!);
    expect(new Set(half.map((fill) => fill.y + fill.h)).size).toBe(1);
    expect(steps({ muted: false, volume: 0 }).filter((fill) => fill.shade === PALETTE[3])).toHaveLength(0);
    expect(steps({ muted: false, volume: 10 }).filter((fill) => fill.shade === PALETTE[3])).toHaveLength(10);
    const off = steps({ muted: true, volume: 5 });
    expect(off.filter((fill) => fill.shade === PALETTE[3])).toHaveLength(0);
    expect(off.filter((fill) => fill.h > 1)).toHaveLength(5);
  });
});

describe('who looks where', () => {
  const legend: Record<string, TileDef> = { '.': { sprite: 'grass', solid: false } };
  const yard = parseMap(
    {
      id: 'yard',
      name: 'Yard',
      ground: '.',
      rows: ['.....', '.t.d.', '..@..', '.....'],
      objects: {
        '@': { solid: false, trigger: 'interact', branches: [] },
        t: { sprite: 'teacher', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['Hello.'] }] }] },
        d: { sprite: 'dog', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['Woof.'] }] }], wander: { radius: 2, every: 60 } },
      },
    },
    legend,
  );
  const park: World = { ...world, maps: { yard }, start: { map: 'yard', at: '@' } };
  const there = (): GameState => ({ ...initialGame(park), scene: 'world' });
  const teacher = yard.objects.find((object) => object.id === 'yard:t')!;
  const dog = yard.objects.find((object) => object.id === 'yard:d')!;
  const shown = (state: GameState, name: keyof typeof sprites) => spriteDraws(drawn(state, undefined, park).draws, name).length;

  it('draws a person who is talked to turned to the player, and the plain picture otherwise', () => {
    expect(shown(there(), 'teacher')).toBe(1);
    for (const dir of ['up', 'left', 'right'] as const) {
      const state = { ...there(), face: { id: 'yard:t', dir } };
      expect(shown(state, `teacher-${dir}`), dir).toBe(1);
      expect(shown(state, 'teacher'), dir).toBe(0);
    }
    // Turned down is the plain picture: it looks at you.
    expect(shown({ ...there(), face: { id: 'yard:t', dir: 'down' } }, 'teacher')).toBe(1);
    expect(facingSprite('teacher', teacher, { ...there(), face: { id: 'yard:d', dir: 'up' } })).toBe('teacher');
  });

  it('draws the dog looking the way it walks: its own pictures going away and coming closer', () => {
    const roam = (dir: 'up' | 'down' | 'left' | 'right', side?: 'left' | 'right') => ({ ...there(), clock: 500, roam: { 'yard:d': { x: 3, y: 1, fromX: 3, fromY: 1, at: 0, dir, side } } });
    expect(facingSprite('dog', dog, there())).toBe('dog');
    expect(facingSprite('dog', dog, roam('right', 'right'))).toBe('dog-right');
    expect(facingSprite('dog', dog, roam('left', 'left'))).toBe('dog');
    // Up and down are drawn from behind and from the front, whatever side it looked to before.
    expect(facingSprite('dog', dog, roam('up', 'right'))).toBe('dog-up');
    expect(facingSprite('dog', dog, roam('up', 'left'))).toBe('dog-up');
    expect(facingSprite('dog', dog, roam('down', 'right'))).toBe('dog-down');
    expect(facingSprite('dog', dog, roam('down', 'left'))).toBe('dog-down');
    expect(shown(roam('right', 'right'), 'dog-right')).toBe(1);
    expect(shown(roam('right', 'right'), 'dog')).toBe(0);
    expect(shown(roam('up', 'left'), 'dog-up')).toBe(1);
    expect(shown(roam('down', 'left'), 'dog-down')).toBe(1);
    // Talked to from its right while it looked left: it turns round. From above or below: it turns there too.
    expect(facingSprite('dog', dog, { ...roam('left', 'left'), face: { id: 'yard:d', dir: 'right' } })).toBe('dog-right');
    expect(facingSprite('dog', dog, { ...roam('left', 'left'), face: { id: 'yard:d', dir: 'left' } })).toBe('dog');
    expect(facingSprite('dog', dog, { ...roam('left', 'left'), face: { id: 'yard:d', dir: 'up' } })).toBe('dog-up');
    expect(facingSprite('dog', dog, { ...roam('left', 'left'), face: { id: 'yard:d', dir: 'down' } })).toBe('dog-down');
  });

  it('has a back and two sides for the cat, and the plain picture looking at you', () => {
    const cat = { ...teacher, id: 'yard:c', sprite: 'cat' };
    const faced = (dir: 'up' | 'down' | 'left' | 'right') => facingSprite('cat', cat, { ...there(), face: { id: 'yard:c', dir } });
    expect(faced('up')).toBe('cat-up');
    expect(faced('left')).toBe('cat-left');
    expect(faced('down')).toBe('cat');
    expect(faced('right')).toBe('cat');
  });

  it('has a picture of its own for every side of everyone who can turn', () => {
    const atlas: Record<string, readonly number[]> = sprites;
    for (const person of ['teacher', 'dev', 'maker', 'librarian', 'wesley', 'kid', 'elder', 'postman', 'gardener']) {
      const places = [person, `${person}-up`, `${person}-left`, `${person}-right`].map((name) => atlas[name]?.join());
      expect(places.every((place) => place !== undefined), person).toBe(true);
      expect(new Set(places).size, person).toBe(4);
    }
  });

  it('gives a person who strolls a picture per direction', () => {
    const walker = { ...teacher, id: 'yard:w' };
    const roam = (dir: 'up' | 'down' | 'left' | 'right') => ({ ...there(), roam: { 'yard:w': { x: 1, y: 1, fromX: 1, fromY: 1, at: 0, dir, side: 'left' as const } } });
    expect(facingSprite('teacher', walker, roam('up'))).toBe('teacher-up');
    expect(facingSprite('teacher', walker, roam('left'))).toBe('teacher-left');
    expect(facingSprite('teacher', walker, roam('right'))).toBe('teacher-right');
    expect(facingSprite('teacher', walker, roam('down'))).toBe('teacher');
  });

  it('leaves things without sides alone', () => {
    const sign = { ...teacher, id: 'yard:s', sprite: 'sign' };
    expect(facingSprite('sign', sign, { ...there(), face: { id: 'yard:s', dir: 'left' } })).toBe('sign');
  });

  it('walks on both feet in every direction: one stride on one cell, the other on the next', () => {
    const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] } as const;
    const walking = (x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => ({ ...there(), x, y, dir, walk: { fromX: x + back[dir][0], fromY: y + back[dir][1], t: WALK_TICKS / 2 } });
    for (const dir of ['up', 'down'] as const) {
      expect(shown(walking(2, 2, dir), `player-${dir}-1`), dir).toBe(1);
      expect(shown(walking(2, 1, dir), `player-${dir}-2`), dir).toBe(1);
      expect(shown(walking(2, 0, dir), `player-${dir}-1`), dir).toBe(1);
      // The first half of a step is the standing picture.
      expect(shown({ ...walking(2, 1, dir), walk: { fromX: 2, fromY: 1, t: 0 } }, `player-${dir}-0`), dir).toBe(1);
    }
    // Sideways the arm swings forward on one cell and back on the next.
    for (const dir of ['left', 'right'] as const) {
      expect(shown(walking(2, 2, dir), `player-${dir}-1`), dir).toBe(1);
      expect(shown(walking(1, 2, dir), `player-${dir}-2`), dir).toBe(1);
      expect(shown(walking(1, 2, dir), `player-${dir}-1`), dir).toBe(0);
      expect(shown(walking(0, 2, dir), `player-${dir}-1`), dir).toBe(1);
      expect(shown({ ...walking(1, 2, dir), walk: { fromX: 1, fromY: 2, t: 0 } }, `player-${dir}-0`), dir).toBe(1);
    }
    // Every frame is a picture of its own on the sheet.
    const places = (['up', 'down', 'left', 'right'] as const).flatMap((dir) => ([0, 1, 2] as const).map((frame) => sprites[`player-${dir}-${frame}`].join()));
    expect(new Set(places).size).toBe(12);
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
    expect(textAt(draws, 6)).toBe('RATLv2');
    expect(textAt(draws, 58)).toBe('YOULv2');
    expect(textAt(draws, 87)).toBe('XP');
    // Half way to the next level: half of the rail (62 wide inside) is filled.
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 91, y: 92, w: 31, h: 1 });
  });

  it('measures the enemy against the energy it came with, not its lowest', () => {
    const battle = playIn(levelWorld, play(initialGame(levelWorld, 7), 'a', 'a'), 'down', 'right', 'a');
    const strong = { ...battle, battle: { ...battle.battle!, level: 5, enemyMax: 16, enemyHp: 8 } };
    const { draws, fills } = drawn(strong, undefined, levelWorld);
    expect(textAt(draws, 6)).toBe('RATLv5');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 24, y: 19, w: 30, h: 3 });
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
