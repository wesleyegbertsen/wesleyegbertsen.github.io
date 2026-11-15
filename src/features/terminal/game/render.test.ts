import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { BANNER_HOLD, BANNER_SLIDE } from './engine/banner.ts';
import { JUMP_TICKS, WALK_TICKS, initialGame } from './engine/engine.ts';
import { levelWorld, play, playIn, shopWorld, testWorld as world } from './engine/testWorld.ts';
import { BOSS_TICKS, QUICK_TICKS, WILD_TICKS } from './engine/transition.ts';
import type { GameState, TileDef, World } from './engine/types.ts';
import { STROLL_TICKS } from './engine/wander.ts';
import { parseMap } from './engine/world.ts';
import { FRAME_TICKS, HOP_PIXELS, SCREEN_H, SCREEN_W, VOLUME_STEPS, camera, drawGame, drawText, facingSprite, hopHeight, type Hud, type Painter, type Sheets } from './render.ts';
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

  it('lifts the player off the ground in an arc during a hop over a ledge, with a shadow under it', () => {
    expect([hopHeight(0), hopHeight(0.5), hopHeight(1)]).toEqual([0, HOP_PIXELS, 0]);
    expect(hopHeight(0.25)).toBeGreaterThan(0);
    expect(hopHeight(0.25)).toBeLessThan(HOP_PIXELS);
    expect(hopHeight(0.75)).toBe(hopHeight(0.25));
    const hopping = (t: number) => ({ ...started(), x: 4, dir: 'right' as const, walk: { fromX: 2, fromY: 2, t, jump: true as const } });
    // Standing in the test world the player is drawn at 24 + x cells, 24 + y cells.
    const ground = 24 + 2 * TILE;
    // Half way: over the ledge, one cell along, at the top of the arc, on a stride, the shadow on the ground.
    const mid = drawn(hopping(JUMP_TICKS / 2));
    expect(spriteDraws(mid.draws, 'player-right-1')).toEqual([expect.objectContaining({ x: 24 + 3 * TILE, y: ground - HOP_PIXELS })]);
    expect(mid.fills).toContainEqual({ shade: PALETTE[2], x: 24 + 3 * TILE + 4, y: ground + 13, w: 8, h: 2 });
    // A quarter of the way: half a cell along (the two cells take JUMP_TICKS), and lower.
    const early = spriteDraws(drawn(hopping(JUMP_TICKS / 4)).draws, 'player-right-1');
    expect(early).toEqual([expect.objectContaining({ x: 24 + 2.5 * TILE, y: ground - hopHeight(0.25) })]);
    // Taking off, the feet are still on the ground: standing, no shadow.
    const start = drawn(hopping(0));
    expect(spriteDraws(start.draws, 'player-right-0')).toEqual([expect.objectContaining({ x: 24 + 2 * TILE, y: ground })]);
    expect(start.fills.filter((fill) => fill.w === 8 && fill.h === 2)).toEqual([]);
    // A plain step never leaves the ground.
    const walking = { ...started(), x: 3, dir: 'right' as const, walk: { fromX: 2, fromY: 2, t: WALK_TICKS / 2 } };
    expect(spriteDraws(drawn(walking).draws, 'player-right-2')).toEqual([expect.objectContaining({ y: ground })]);
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
    // The energy with its numbers, a short bar (22 wide inside, half full), and the coins at the end of the row.
    expect(textAt(draws, 28)).toBe('HP10/20COINS0');
    expect(fills).toContainEqual({ shade: PALETTE[2], x: 67, y: 30, w: 11, h: 4 });
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

  it('lists the moves with their PP in a box that hugs them, with what the move under the cursor does at its foot', () => {
    const moves = play(started(), 'down', 'right', 'a', 'a');
    const { draws, fills } = drawn(moves);
    // Two moves: the box starts 44 pixels and two rows above the bottom, and there is no empty space under them.
    expect(fills).toContainEqual({ shade: PALETTE[3], x: 0, y: 80, w: SCREEN_W, h: SCREEN_H - 80 });
    expect(textAt(draws, 86)).toBe('MOVEPP');
    expect(textAt(draws, 101)).toBe('>HIT2/2');
    expect(textAt(draws, 111)).toBe('NAP1/1');
    expect(textAt(draws, 129)).toMatch(/^POW\d+HIT\d+%$/);
    // The second move heals: the foot says how much.
    expect(textAt(drawn(play(moves, 'down')).draws, 129)).toMatch(/^HEALS\d+$/);
    const intro = play(started(), 'down', 'right');
    expect(textAt(drawn(intro).draws, 110)).toBe('AwildRATappeared!');
  });

  it('draws the ending', () => {
    const ended = { ...started(), scene: 'ending' as const, finished: true };
    const { draws } = drawn(ended);
    expect(draws.filter((draw) => draw.sheet === 'font' && draw.w === 12)).toHaveLength('THEEND'.length);
    expect(spriteDraws(draws, 'wesley')).toHaveLength(1);
    // No money in this world: nothing is said about a purse.
    expect(draws.filter((draw) => draw.sheet === 'font' && draw.y > 40 && draw.y < 112)).toHaveLength(0);
  });

  it('shows the purse on the ending in a world with a shop: what was earned is the score', () => {
    const lines: World = { ...shopWorld, ending: ['THE END', 'Thanks for visiting this town of tests.', 'The details are on this page.'] };
    const ended = { ...initialGame(lines), scene: 'ending' as const, finished: true, coins: 1469 };
    const { draws } = drawn(ended, undefined, lines);
    expect([46, 56, 66, 76].map((y) => textAt(draws, y))).toEqual(['Thanksforvisitingthis', 'townoftests.', 'Thedetailsareonthis', 'page.']);
    // Under the lines, a line apart, and above the grass.
    expect(textAt(draws, 92)).toBe('Yourpurse:1469COINS.');
    const row = draws.filter((draw) => draw.sheet === 'font' && draw.y === 92);
    expect(Math.min(...row.map((draw) => draw.x)) + Math.max(...row.map((draw) => draw.x + draw.w))).toBe(SCREEN_W);
    expect(textAt(drawn({ ...ended, coins: 1 }, undefined, lines).draws, 92)).toBe('Yourpurse:1COIN.');
    // Left out when the lines of the ending need the room.
    const long: World = { ...lines, ending: ['THE END', ...Array.from({ length: 6 }, (_, i) => `Line ${i + 1}.`)] };
    const full = drawn(ended, undefined, long).draws;
    expect(textAt(full, 96)).toBe('Line6.');
    expect([...new Set(full.filter((draw) => draw.sheet === 'font' && draw.y > 40).map((draw) => draw.y))]).toEqual([46, 56, 66, 76, 86, 96]);
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

  it('draws the small star in the place of the mark, in the note and on the Start menu, where the thing has a picture', () => {
    const starry: World = { ...living, collect: [{ item: 'star', total: 3, label: 'STARS', mark: '*', icon: 'star-mini' }] };
    const [sx, sy] = tiles['star-mini'];
    const icons = (draws: Draw[]) => draws.filter((draw) => draw.sheet === 'tiles' && draw.sx === sx && draw.sy === sy);
    const noted = drawn({ ...there(), clock: 10, notice: { text: '* 2/3', until: 20 } }, undefined, starry).draws;
    expect(icons(noted)).toEqual([expect.objectContaining({ x: 5, y: 4 })]);
    expect(textAt(noted, 4)).toBe('2/3');
    const menu = drawn({ ...there(), menu: { tab: 'items', cursor: 0 } }, undefined, starry).draws;
    expect(icons(menu)).toEqual([expect.objectContaining({ x: 8, y: 94 })]);
    expect(textAt(menu, 94)).toBe('STARS0/3');
  });

  describe('the label with the name of a place', () => {
    // 'Park' is four letters: a box of 35 by 16, centred at the top.
    const label = (clock: number, slide = true): GameState => ({ ...there(), clock, banner: { text: 'Park', at: 0, slide } });
    const boxAt = (fills: Fill[]) => fills.find((fill) => fill.w === 35 && fill.h === 16 && fill.shade === PALETTE[3]);

    it('is a box in the style of the note after a find, centred at the top, with the name in it', () => {
      const { draws, fills } = drawn(label(BANNER_SLIDE), undefined, living);
      expect(boxAt(fills)).toEqual({ shade: PALETTE[3], x: 62, y: 0, w: 35, h: 16 });
      // The same double border as the note: light, dark, light.
      expect(fills).toContainEqual({ shade: PALETTE[0], x: 63, y: 1, w: 33, h: 14 });
      expect(fills).toContainEqual({ shade: PALETTE[3], x: 64, y: 2, w: 31, h: 12 });
      expect(fills).toContainEqual({ shade: PALETTE[0], x: 65, y: 3, w: 29, h: 10 });
      expect(textAt(draws, 4)).toBe('Park');
      expect(draws.filter((draw) => draw.sheet === 'font' && draw.y === 4).map((draw) => draw.x)).toEqual([68, 74, 80, 86]);
    });

    it('slides down from above the screen and back up, a whole pixel at a time', () => {
      const y = (clock: number) => boxAt(drawn(label(clock), undefined, living).fills)?.y;
      expect(y(0)).toBeUndefined();
      expect(y(3)).toBe(-12);
      expect(y(6)).toBe(-8);
      expect(y(BANNER_SLIDE)).toBe(0);
      expect(y(BANNER_SLIDE + BANNER_HOLD)).toBe(0);
      expect(y(BANNER_SLIDE + BANNER_HOLD + 6)).toBe(-8);
      expect(y(BANNER_SLIDE * 2 + BANNER_HOLD)).toBeUndefined();
      // The name moves with its box.
      expect(textAt(drawn(label(6), undefined, living).draws, -4)).toBe('Park');
    });

    it('with reduced motion is whole or not there', () => {
      const y = (clock: number) => boxAt(drawn(label(clock, false), undefined, living).fills)?.y;
      expect(y(0)).toBe(0);
      expect(y(50)).toBe(0);
      expect(y(60)).toBeUndefined();
    });

    it('pushes the note after a find down while it is out, so both can be read', () => {
      const both = (clock: number) => drawn({ ...label(clock), notice: { text: '* 2/3', until: 999 } }, undefined, living).draws;
      expect(textAt(both(BANNER_SLIDE), 4)).toBe('Park');
      expect(textAt(both(BANNER_SLIDE), 20)).toBe('*2/3');
      // Half way out the note is half way down; with the label gone it is back in its corner.
      expect(textAt(both(6), 12)).toBe('*2/3');
      expect(textAt(both(BANNER_SLIDE * 2 + BANNER_HOLD), 4)).toBe('*2/3');
    });

    it('is not drawn over a battle or the Start menu', () => {
      const battle = play(started(), 'down', 'right');
      const out = { text: 'Main', at: battle.clock, slide: false };
      expect(textAt(drawn({ ...battle, banner: out }).draws, 4)).toBe('');
      const menu = play(started(), 'start');
      expect(textAt(drawn({ ...menu, banner: { ...out, at: menu.clock } }).draws, 4)).toBe('');
      // On the map it is there, also under a text box.
      const talking = play(started(), 'right', 'up', 'a');
      expect(textAt(drawn({ ...talking, banner: { ...out, at: talking.clock } }).draws, 4)).toBe('Main');
    });
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
    // The list of moves hugs its rows: two moves, the box from 80 down. The enemy's box stays in view above it.
    expect(moves.fills).toContainEqual({ shade: PALETTE[3], x: 0, y: 80, w: SCREEN_W, h: 64 });
    expect(textAt(moves.draws, 6)).toBe('RATLv2');
    expect(dark(moves.fills)).toContainEqual({ shade: PALETTE[3], x: 4, y: 6, w: 2, h: 22 });
  });
});

describe('the way into a battle', () => {
  const battle = (wild: boolean, t: number): GameState => {
    const state = wild ? play(started(), 'down', 'right') : play(started(), 'down', 'down', 'left', 'a');
    return { ...state, banner: null, battle: { ...state.battle!, intro: (wild ? WILD_TICKS : BOSS_TICKS) - t } };
  };
  const whole = (fill: Fill | undefined) => !!fill && fill.x === 0 && fill.y === 0 && fill.w === SCREEN_W && fill.h === SCREEN_H;
  /** The dark laid over the map by the transition: everything painted after the last picture. */
  const dark = (state: GameState) => {
    const { fills } = drawn(state);
    return fills.filter((fill) => fill.shade === PALETTE[3] && fill.w >= 8 && fill.h >= 8 && !whole(fill));
  };
  const area = (fills: Fill[]) => fills.reduce((sum, fill) => sum + fill.w * fill.h, 0);

  it('shows the map, not the battle screen, until it is over', () => {
    const { draws } = drawn(battle(true, 0));
    expect(draws.filter((draw) => draw.sheet === 'tiles').length).toBeGreaterThan(30);
    expect(spriteDraws(draws, 'player-right-0')).toHaveLength(1);
    expect(spriteDraws(draws, 'bug')).toHaveLength(0);
    expect(draws.some((draw) => draw.sheet === 'font')).toBe(false);
    // Over: the battle screen, with the line.
    const after = drawn(battle(true, WILD_TICKS));
    expect(spriteDraws(after.draws, 'bug')).toHaveLength(1);
    expect(textAt(after.draws, 110)).toBe('AwildRATappeared!');
  });

  it('washes the whole screen out to the lightest shade for a blink: once for a wild enemy, twice for a boss', () => {
    const washes = (wild: boolean) => {
      const on = Array.from({ length: wild ? WILD_TICKS : BOSS_TICKS }, (_, t) => {
        const { fills } = drawn(battle(wild, t));
        return whole(fills.at(-1)) && fills.at(-1)!.shade === PALETTE[0];
      });
      return on.filter((now, i) => now && !on[i - 1]).length;
    };
    expect(washes(true)).toBe(1);
    expect(washes(false)).toBe(2);
  });

  it('closes blinds from both sides for a wild enemy, on whole steps, until the screen is dark', () => {
    expect(dark(battle(true, 9))).toEqual([]);
    const half = dark(battle(true, 26));
    // One bar per 16 pixels, in turn from the left and from the right.
    expect(half).toHaveLength(9);
    expect(half.every((bar) => bar.h === 16 && bar.w % 8 === 0)).toBe(true);
    expect(half.filter((bar) => bar.x === 0)).toHaveLength(5);
    expect(half.filter((bar) => bar.x + bar.w === SCREEN_W && bar.x > 0)).toHaveLength(4);
    expect(area(half)).toBeGreaterThan(SCREEN_W * SCREEN_H * 0.4);
    expect(area(half)).toBeLessThan(SCREEN_W * SCREEN_H * 0.6);
    expect(area(dark(battle(true, 20)))).toBeLessThan(area(half));
    expect(area(dark(battle(true, WILD_TICKS - 1)))).toBe(SCREEN_W * SCREEN_H);
  });

  it('closes an iris around the middle for a boss, until the screen is dark', () => {
    expect(dark(battle(false, 49))).toEqual([]);
    const half = dark(battle(false, 75));
    expect(half).toHaveLength(4);
    // The hole is in the middle: as much dark left as right, above as below.
    const [top, bottom, left, right] = half as [Fill, Fill, Fill, Fill];
    expect(top).toMatchObject({ x: 0, y: 0, w: SCREEN_W });
    expect(bottom.y + bottom.h).toBe(SCREEN_H);
    expect(top.h).toBe(bottom.h);
    expect(left.x).toBe(0);
    expect(right.x + right.w).toBe(SCREEN_W);
    expect(left.w).toBe(right.w);
    expect(left.w).toBeGreaterThan(20);
    expect(left.w).toBeLessThan(60);
    expect(area(dark(battle(false, 60)))).toBeLessThan(area(half));
    expect(area(dark(battle(false, BOSS_TICKS - 1)))).toBe(SCREEN_W * SCREEN_H);
  });

  it('closes the same iris in a third of the time, after one wash, for a boss that follows another', () => {
    const quick = (t: number): GameState => {
      const state = battle(false, 0);
      return { ...state, battle: { ...state.battle!, quick: true, intro: QUICK_TICKS - t } };
    };
    const on = Array.from({ length: QUICK_TICKS }, (_, t) => {
      const { fills } = drawn(quick(t));
      return whole(fills.at(-1)) && fills.at(-1)!.shade === PALETTE[0];
    });
    expect(on.filter((now, i) => now && !on[i - 1])).toHaveLength(1);
    expect(dark(quick(9))).toEqual([]);
    const half = dark(quick(20));
    expect(half).toHaveLength(4);
    expect(half[2]!.w).toBe(half[3]!.w);
    expect(area(half)).toBeGreaterThan(area(dark(quick(14))));
    expect(area(dark(quick(QUICK_TICKS - 1)))).toBe(SCREEN_W * SCREEN_H);
    // Over: the battle screen.
    expect(spriteDraws(drawn(quick(QUICK_TICKS)).draws, 'bug')).toHaveLength(1);
  });

  it('uses the four shades only, and hides the speaker under the dark', () => {
    const { fills } = drawn(battle(false, BOSS_TICKS - 1), { muted: false, volume: 5 });
    expect(new Set(fills.map((fill) => fill.shade)).size).toBeLessThanOrEqual(4);
    for (const fill of fills) expect(PALETTE).toContain(fill.shade);
    const speaker = fills.findIndex((fill) => fill.x === 146 && fill.y === 2 && fill.w === 13);
    const curtain = fills.map((fill) => fill.shade === PALETTE[3] && fill.w === SCREEN_W && fill.y === 0 && fill.h >= 70).lastIndexOf(true);
    expect(curtain).toBeGreaterThan(speaker);
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
    expect(textAt(drawn(bag, on, shop).draws, 94)).toBe('AS2/3BS7/10');
    expect(textAt(drawn({ ...bag, items: {} }, undefined, shop).draws, 94)).toBe('AS0/3BS0/10');
    expect(textAt(drawn({ ...bag, menu: { tab: 'badges' as const, cursor: 0 } }, on, shop).draws, 94)).toBe('AS2/3BS7/10');
  });

  it('scrolls a bag that is longer than the list, keeping the cursor in view', () => {
    const all = Object.fromEntries(letters.map((id) => [id, 1]));
    const at = (cursor: number) => drawn({ ...there(), items: all, menu: { tab: 'items' as const, cursor } }, undefined, shop).draws;
    // Five rows, ten pixels apart; the foot under them is what was collected.
    expect(textAt(at(0), 42)).toBe('>Ax1');
    expect(textAt(at(0), 82)).toBe('Ex1');
    expect(textAt(at(3), 42)).toBe('Ax1');
    expect(textAt(at(3), 72)).toBe('>Dx1');
    expect(textAt(at(4), 42)).toBe('Bx1');
    expect(textAt(at(4), 72)).toBe('>Ex1');
    expect(textAt(at(4), 82)).toBe('Fx1');
    expect(textAt(at(6), 42)).toBe('Cx1');
    expect(textAt(at(6), 82)).toBe('>Gx1');
    for (const cursor of [0, 3, 6]) {
      const rows = [...new Set(at(cursor).filter((draw) => draw.sheet === 'font' && draw.y >= 42 && draw.y < 104).map((draw) => draw.y))];
      expect(rows.sort((a, b) => a - b)).toEqual([42, 52, 62, 72, 82, 94]);
    }
  });

  it('shows the coins on every tab, at the end of the row of the energy, and what was collected at the foot', () => {
    const rich = { ...there(), coins: 1234 };
    for (const tab of ['items', 'badges', 'settings'] as const) {
      const { draws } = drawn({ ...rich, items: { a: 1, b: 1, c: 1, d: 1, e: 1 }, menu: { tab, cursor: 0 } }, on, shop);
      expect(textAt(draws, 28), tab).toBe('HP20/20COINS1234');
      expect(Math.max(...draws.filter((draw) => draw.sheet === 'font' && draw.y === 28).map((draw) => draw.x + draw.w)), tab).toBe(SCREEN_W - 8);
      expect(textAt(draws, 94), tab).toBe('AS1/3BS1/10');
      // Nothing else is drawn between the list and the note at the bottom.
      const rows = [...new Set(draws.filter((draw) => draw.sheet === 'font' && draw.y > 82 && draw.y < 104).map((draw) => draw.y))];
      expect(rows, tab).toEqual([94]);
    }
    // The name of the money is the world's.
    const euros = { ...shop, economy: { ...shop.economy, currency: 'EUR' } };
    expect(textAt(drawn({ ...rich, menu: { tab: 'items' as const, cursor: 0 } }, on, euros).draws, 28)).toBe('HP20/20EUR1234');
    // More than fits beside the bar is shown as the most that does.
    expect(textAt(drawn({ ...rich, coins: 123456, menu: { tab: 'items' as const, cursor: 0 } }, on, shop).draws, 28)).toBe('HP20/20COINS9999');
  });

  it('has room for a full bag, every badge, both counters and the longest numbers: nothing overlaps or touches the border', () => {
    const badges = ['DEGREE BADGE', 'CAREER BADGE', 'MAKER BADGE', 'SKILL BADGE'].map((name, i) => ({ id: `b${i}`, name }));
    const names = ['STROOPWAFEL', 'COFFEE', 'ENERGY DRINK', 'GREEN TEA', 'BUG SPRAY', 'PIZZA', 'UPTIME MEDAL'];
    const full: World = {
      ...shop,
      badges,
      items: Object.fromEntries(letters.map((id, i) => [id, { name: names[i]!, description: 'No wild enemies for 60 steps in tall grass.' }])),
      collect: [{ item: 'a', total: 11, label: 'STARS', mark: '*' }, { item: 'b', total: 10, label: 'STAMPS', mark: '#' }],
    };
    const state: GameState = { ...initialGame(full), scene: 'world', level: 10, xp: 999, hp: 87, maxHp: 87, coins: 9999, badges: badges.map((badge) => badge.id), items: { ...Object.fromEntries(letters.map((id) => [id, 9])), a: 11, b: 10 } };
    const loud: Hud = { muted: true, volume: 10, lcd: false };
    for (const tab of ['items', 'badges', 'settings'] as const) {
      for (const cursor of tab === 'items' ? [0, 6] : [0, 2]) {
        const { draws, fills } = drawn({ ...state, menu: { tab, cursor } }, loud, full);
        const glyphs = draws.filter((draw) => draw.sheet === 'font');
        const label = `${tab} ${cursor}`;
        // Inside the border, with air: the frame is three pixels thick.
        for (const glyph of glyphs) {
          expect(glyph.x, label).toBeGreaterThanOrEqual(8);
          expect(glyph.x + glyph.w, label).toBeLessThanOrEqual(SCREEN_W - 8);
          expect(glyph.y, label).toBeGreaterThanOrEqual(6);
          expect(glyph.y + glyph.h, label).toBeLessThanOrEqual(SCREEN_H - 6);
        }
        // Rows of text are at least a line apart, and no two glyphs of a row share a pixel.
        const rows = [...new Set(glyphs.map((glyph) => glyph.y))].sort((a, b) => a - b);
        for (let i = 1; i < rows.length; i++) expect(rows[i]! - rows[i - 1]!, `${label} ${rows[i]}`).toBeGreaterThanOrEqual(10);
        for (const y of rows) {
          const row = glyphs.filter((glyph) => glyph.y === y).sort((a, b) => a.x - b.x);
          for (let i = 1; i < row.length; i++) expect(row[i]!.x, `${label} ${y}`).toBeGreaterThanOrEqual(row[i - 1]!.x + row[i - 1]!.w);
        }
        // The bars of the XP and the energy, and the volume wheel, keep two pixels off the text beside them.
        const bars = fills.filter((fill) => fill.shade === PALETTE[3] && fill.y > 16 && fill.y < 104 && fill.h >= 2 && fill.h <= 8 && fill.w >= 3 && fill.w <= 60);
        expect(bars.length, label).toBeGreaterThanOrEqual(tab === 'settings' ? 2 : 2);
        for (const bar of bars) {
          for (const glyph of glyphs.filter((glyph) => glyph.y < bar.y + bar.h && glyph.y + glyph.h > bar.y)) {
            expect(glyph.x + glyph.w <= bar.x - 2 || glyph.x >= bar.x + bar.w + 2, `${label} bar at ${bar.x},${bar.y}`).toBe(true);
          }
        }
        expect(textAt(draws, 18), label).toBe('LV10XPMAX');
        expect(textAt(draws, 28), label).toBe('HP87/87COINS9999');
        expect(textAt(draws, 94), label).toBe('STARS11/11STAMPS10/10');
      }
    }
    // The bag shows five of its seven kinds, the badge case all four.
    const bag = drawn({ ...state, menu: { tab: 'items', cursor: 0 } }, loud, full).draws;
    expect([42, 52, 62, 72, 82].map((y) => textAt(bag, y))).toEqual(['>STROOPWAFELx11', 'COFFEEx10', 'ENERGYDRINKx9', 'GREENTEAx9', 'BUGSPRAYx9']);
    const case4 = drawn({ ...state, menu: { tab: 'badges', cursor: 0 } }, loud, full).draws;
    expect([42, 52, 62, 72].map((y) => textAt(case4, y))).toEqual(['>*DEGREEBADGE', '*CAREERBADGE', '*MAKERBADGE', '*SKILLBADGE']);
  });

  it('shows the settings: the sound, the volume wheel and the look of the screen, with the cursor on one', () => {
    const settings = (cursor: number, hud: Hud = on) => drawn({ ...there(), menu: { tab: 'settings' as const, cursor } }, hud, shop);
    const first = settings(0);
    // Three rows with room between them: fourteen pixels apart.
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
    // What each row is for fits the three lines of the note: the last word is on the screen.
    expect([120, 130].map((y) => textAt(settings(0).draws, y))).toEqual(['oron.SodoestheM', 'key.']);
    expect(textAt(settings(1).draws, 120)).toBe('thevolume.');
    expect([110, 120, 130].map((y) => textAt(settings(2).draws, y))).toEqual(['AswitchestheLCDlook:', 'apixelgrid,asonthe', 'realthing.']);
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

describe('the shop on the screen', () => {
  /** In the kiosk of shopWorld: COFFEE for 10, GREEN TEA for 25, a KEY for 100; 45 COINS. */
  const shopping = () => playIn(shopWorld, initialGame(shopWorld, 7), 'a', 'a', 'down', 'left', 'a', 'a');
  const screen = (state: GameState) => drawn(state, undefined, shopWorld).draws;

  it('names the shop and the coins at the top, lists what it sells with what is in the bag and the price, and the way out', () => {
    const open = shopping();
    expect(open.shop).not.toBeNull();
    const draws = screen(open);
    expect(textAt(draws, 8)).toBe('KIOSK45COINS');
    // The row under the cursor shows how many A buys, between arrows.
    expect(textAt(draws, 24)).toBe('>COFFEEx0<1>10');
    expect(textAt(draws, 34)).toBe('GREENTEAx025');
    expect(textAt(draws, 44)).toBe('KEYx0100');
    expect(textAt(draws, 54)).toBe('LEAVE');
    // The prices end at the same place, the coins too.
    const right = (y: number) => Math.max(...draws.filter((draw) => draw.sheet === 'font' && draw.y === y).map((draw) => draw.x + draw.w));
    expect(new Set([8, 24, 34, 44].map(right))).toEqual(new Set([SCREEN_W - 8]));
    // The foot says what the item under the cursor does.
    expect(textAt(draws, 110)).toBe('Restores20energy.');
  });

  it('moves the cursor, counts what was bought and says what the last press led to', () => {
    const bought = playIn(shopWorld, shopping(), 'a');
    const draws = screen(bought);
    expect(textAt(draws, 8)).toBe('KIOSK35COINS');
    expect(textAt(draws, 24)).toBe('>COFFEEx1<1>10');
    expect(textAt(draws, 110)).toBe('YoubuyoneCOFFEEfor');
    expect(textAt(draws, 120)).toBe('10COINS.35COINSleft.');
    const dear = screen(playIn(shopWorld, bought, 'down', 'down', 'a'));
    expect(textAt(dear, 24)).toBe('COFFEEx110');
    expect(textAt(dear, 44)).toBe('>KEYx0<1>100');
    expect(textAt(dear, 110)).toBe('NotenoughCOINS:the');
    expect(textAt(dear, 120)).toBe('KEYis100,youhave35.');
    const leave = screen(playIn(shopWorld, bought, 'down', 'down', 'down'));
    expect(textAt(leave, 54)).toBe('>LEAVE');
    expect(textAt(leave, 110)).toBe('A:buy.B:leave.');
  });

  it('shows how many are picked and what they cost together, and nothing runs into anything at the widest', () => {
    const three = screen(playIn(shopWorld, shopping(), 'right', 'right'));
    expect(textAt(three, 24)).toBe('>COFFEEx0<3>30');
    expect(textAt(three, 34)).toBe('GREENTEAx025');
    expect(textAt(three, 110)).toBe('3COFFEEfor30COINS.');
    // The widest row there can be: a name of 12 letters, 9 in the bag, 9 picked, a total of three digits.
    const wide: World = { ...shopWorld, items: { ...shopWorld.items, coffee: { ...shopWorld.items.coffee!, name: 'ENERGY DRINK' } }, economy: { ...shopWorld.economy, bagLimit: 18 }, shops: { kiosk: { ...shopWorld.shops.kiosk!, stock: [{ item: 'coffee', price: 60 }] } } };
    let state: GameState = { ...shopping(), coins: 9999, items: { coffee: 9 } };
    for (let i = 0; i < 8; i++) state = playIn(wide, state, 'right');
    const row = drawn(state, undefined, wide).draws.filter((draw) => draw.sheet === 'font' && draw.y === 24).sort((a, b) => a.x - b.x);
    expect(textAt(row, 24)).toBe('>ENERGYDRINKx9<9>540');
    // The cursor, the two words of the name, the count, the picker and the price: each starts at least four pixels after the one before it ends (the cursor: two).
    const starts = row.filter((draw, i) => i > 0 && draw.x - (row[i - 1]!.x + row[i - 1]!.w) > 0).map((draw) => draw.x - (row[row.indexOf(draw) - 1]!.x + row[row.indexOf(draw) - 1]!.w));
    expect(starts).toHaveLength(5);
    expect(starts[0]).toBe(2);
    for (const gap of starts.slice(1)) expect(gap).toBeGreaterThanOrEqual(4);
    expect(Math.max(...row.map((draw) => draw.x + draw.w))).toBe(SCREEN_W - 8);
  });

  it('is drawn in place of the map, under the text box of the goodbye', () => {
    const open = shopping();
    expect(spriteDraws(screen(open), 'player-left-0')).toHaveLength(0);
    const out = playIn(shopWorld, open, 'b');
    expect(spriteDraws(screen(out), 'player-left-0')).toHaveLength(1);
    expect(textAt(screen(out), 110)).toBe('Byenow.');
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

  it('draws the label with the name of the place on top of the darkness', () => {
    const { draws, fills } = drawn({ ...there(), banner: { text: 'Pit', at: 0, slide: false } }, undefined, dark);
    const lastBlack = fills.map((fill) => fill.w === TILE && fill.h === TILE && fill.shade === PALETTE[3]).lastIndexOf(true);
    const label = fills.findIndex((fill) => fill.y === 0 && fill.h === 16 && fill.w === 3 * FONT.cellW + 11);
    expect(label).toBeGreaterThan(lastBlack);
    // Its paper is light, in the middle of a black screen.
    expect(fills.slice(label)).toContainEqual({ shade: PALETTE[0], x: 68, y: 3, w: 23, h: 10 });
    expect(textAt(draws, 4)).toBe('Pit');
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

  it('is lit around a fire bowl too, far from the player, and the bowl flickers', () => {
    const fire: Record<string, TileDef> = { ...legend, t: { sprite: 'brazier', solid: true, animated: true, light: 1 } };
    const lighted = parseMap({ id: 'pit', name: 'Pit', ground: '.', rows: rows.map((row, y) => (y === 5 ? '......@...t..' : row)), dark: 1, objects: { '@': { solid: false, trigger: 'interact', branches: [] } } }, fire);
    expect(lighted.lights).toEqual([{ x: 10, y: 5, radius: 1 }]);
    const withBowl = drawn(there(), undefined, { ...dark, maps: { pit: lighted } });
    const without = drawn(there(), undefined, dark);
    const player = spriteDraws(withBowl.draws, 'player-down-0')[0]!;
    const at = (list: { x: number; y: number }[], dx: number, dy: number) => list.some((item) => item.x === player.x + dx * TILE && item.y === player.y + dy * TILE);
    // Four cells to the right of the player: black without the bowl, clear with it, and the cell above it too.
    expect(at(black(without.fills), 4, 0)).toBe(true);
    for (const [dx, dy] of [[4, 0], [4, -1], [3, 1]] as const) {
      expect(at(black(withBowl.fills), dx, dy) || at(shade(withBowl.draws, 'shade-1'), dx, dy) || at(shade(withBowl.draws, 'shade-2'), dx, dy), `${dx},${dy}`).toBe(false);
    }
    // Further up the light falls off as it does around the player.
    expect(at(shade(withBowl.draws, 'shade-1'), 4, -2)).toBe(true);
    expect(black(withBowl.fills).length).toBeLessThan(black(without.fills).length);
    const bowl = (list: Draw[], name: 'brazier' | 'brazier-b') => list.filter((draw) => draw.sheet === 'tiles' && draw.sx === tiles[name][0] && draw.sy === tiles[name][1]);
    expect(bowl(withBowl.draws, 'brazier')).toHaveLength(1);
    expect(bowl(drawn({ ...there(), clock: FRAME_TICKS }, undefined, { ...dark, maps: { pit: lighted } }).draws, 'brazier-b')).toHaveLength(1);
  });

  it('draws a slide with the legs still, and a pushed boulder between two cells at walking pace', () => {
    const sliding = { ...there(), x: 7, dir: 'right' as const, walk: { fromX: 6, fromY: 5, t: WALK_TICKS / 2, slide: 2 } };
    expect(spriteDraws(drawn(sliding, undefined, dark).draws, 'player-right-0')).toHaveLength(1);
    const rock = parseMap({ id: 'pit', name: 'Pit', ground: '.', rows: rows.map((row, y) => (y === 5 ? '......@b.....' : row)), objects: { '@': { solid: false, trigger: 'interact', branches: [] }, b: { sprite: 'boulder', solid: true, trigger: 'interact', branches: [], push: 'boulder' } } }, legend);
    const pushing: GameState = { ...there(), x: 7, dir: 'right', clock: WALK_TICKS / 2, walk: { fromX: 6, fromY: 5, t: WALK_TICKS / 2 }, roam: { 'pit:b': { x: 8, y: 5, fromX: 7, fromY: 5, at: 0, ticks: WALK_TICKS } } };
    const { draws } = drawn(pushing, undefined, { ...dark, maps: { pit: rock } });
    const player = spriteDraws(draws, 'player-right-1')[0]!;
    const [bx, by] = tiles.boulder;
    const boulder = draws.find((draw) => draw.sheet === 'tiles' && draw.sx === bx && draw.sy === by)!;
    // Exactly one cell ahead of the player all the way, half a cell along.
    expect(boulder.x - player.x).toBe(TILE);
    expect(boulder.y).toBe(player.y);
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
    expect(textAt(drawn(moves, undefined, levelWorld).draws, 111)).toBe('ZAP3/3');
  });
});
