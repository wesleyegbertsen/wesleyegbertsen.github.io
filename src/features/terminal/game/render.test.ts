import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { WALK_TICKS, initialGame } from './engine/engine.ts';
import { play, testWorld as world } from './engine/testWorld.ts';
import type { GameState } from './engine/types.ts';
import { SCREEN_H, SCREEN_W, camera, drawGame, drawText, type Painter, type Sheets } from './render.ts';
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

function drawn(state: GameState) {
  const record = recorder();
  drawGame(record.ctx, sheets, state, world);
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
