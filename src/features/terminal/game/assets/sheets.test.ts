import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONT, PALETTE, TILE, sprites, tiles } from './atlas.ts';

const dir = join(process.cwd(), 'src/features/terminal/game/assets');

/** Width and height from a PNG's header. */
function size(name: string) {
  const png = readFileSync(join(dir, name));
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
}

describe('the sprite sheets', () => {
  it('are what the pixel definitions in scripts/sprites generate', () => {
    // Fails after an edit to a definition without `npm run sprites`.
    const out = execFileSync(process.execPath, ['scripts/sprites/generate.mjs', '--check'], { encoding: 'utf8' });
    expect(out).toContain('up to date');
  });

  it('hold every tile, sprite and glyph the atlas points at, and stay small', () => {
    const tileSheet = size('tiles.png');
    for (const [x, y] of Object.values(tiles)) {
      expect(x + TILE).toBeLessThanOrEqual(tileSheet.width);
      expect(y + TILE).toBeLessThanOrEqual(tileSheet.height);
    }
    const spriteSheet = size('sprites.png');
    for (const [x, y, w, h] of Object.values(sprites)) {
      expect(x + w).toBeLessThanOrEqual(spriteSheet.width);
      expect(y + h).toBeLessThanOrEqual(spriteSheet.height);
    }
    const font = size('font.png');
    expect(font.width).toBe(FONT.cols * FONT.cellW);
    expect(font.height).toBe(FONT.lightY * 2);
    expect(Math.ceil((FONT.last - FONT.first + 1) / FONT.cols) * FONT.cellH).toBe(FONT.lightY);
    // Raised from 9000: every side of every person, the dog and the player's strides are drawn by hand now.
    expect(tileSheet.bytes + spriteSheet.bytes + font.bytes).toBeLessThan(10000);
  });

  it('have a font in which every character looks different from every other, the M included', () => {
    const script = "import('./scripts/sprites/font.mjs').then(({ glyphs }) => { const seen = new Map(); const twins = []; for (const [char, rows] of Object.entries(glyphs)) { if (seen.has(rows)) twins.push(seen.get(rows) + char); seen.set(rows, char); } console.log(JSON.stringify({ count: Object.keys(glyphs).length, twins, m: glyphs.M, n: glyphs.N, w: glyphs.W, h: glyphs.H })); })";
    const found = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { count: number; twins: string[]; m: string; n: string; w: string; h: string };
    expect(found.count).toBe(FONT.last - FONT.first + 1);
    expect(found.twins).toEqual([]);
    // The M: two full legs and a V between them at the top, unlike N, W and H.
    const differs = (a: string, b: string) => [...a].filter((dot, i) => dot !== b[i]).length;
    for (const other of [found.n, found.w, found.h]) expect(differs(found.m, other)).toBeGreaterThanOrEqual(3);
    expect(found.m.split('/')).toEqual(['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#']);
  });

  it('use four shades, lightest first', () => {
    expect(PALETTE).toHaveLength(4);
    const light = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect([...PALETTE].sort((a, b) => light(b) - light(a))).toEqual([...PALETTE]);
  });

  it('have a player sprite for every direction and walking frame', () => {
    for (const direction of ['up', 'down', 'left', 'right']) {
      for (const frame of [0, 1, 2]) expect(sprites).toHaveProperty([`player-${direction}-${frame}`]);
    }
  });

  it('swing the arms of the player with the walk: the walking frames differ from standing above the legs', () => {
    // The pixel rows of a character, mirrors included, straight from the definitions.
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters, mirrored }) => { const rows = (name) => characters[name] ?? rows(mirrored[name]).map((row) => [...row].reverse().join('')); console.log(JSON.stringify(Object.fromEntries(['up', 'down', 'left', 'right'].flatMap((dir) => [0, 1, 2].map((frame) => ['player-' + dir + '-' + frame, rows('player-' + dir + '-' + frame)]))))); })";
    const frames = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as Record<string, string[]>;
    // Rows 9 to 12 hold the shoulders, the arms and the hands; the legs are below.
    const arms = (name: string) => frames[name]!.slice(9, 13).join('/');
    const head = (name: string) => frames[name]!.slice(0, 9).join('/');
    for (const direction of ['up', 'down', 'left', 'right']) {
      const [standing, one, two] = [0, 1, 2].map((frame) => `player-${direction}-${frame}`) as [string, string, string];
      expect(arms(one), one).not.toBe(arms(standing));
      expect(arms(two), two).not.toBe(arms(standing));
      expect(arms(one), direction).not.toBe(arms(two));
      // The head stays still, or the player would wobble (the mirrored frames have a symmetric head).
      if (direction === 'left' || direction === 'right') expect(head(one)).toBe(head(standing));
    }
  });

  it('draw everyone who can turn by hand: a back without a face and a side that is not the front', () => {
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters, facing }) => console.log(JSON.stringify({ facing, characters })))";
    const { facing, characters } = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { facing: string[]; characters: Record<string, string[]> };
    expect(facing).toHaveLength(9);
    for (const name of [...facing, 'dog', 'cat']) {
      const front = name === 'dog' ? characters['dog-down']! : characters[name]!;
      const back = characters[`${name}-up`]!;
      expect(back, name).toHaveLength(16);
      expect(back.join(''), name).not.toBe(front.join(''));
      // A drawing from the front or the back is the same left and right, give or take a detail; a profile is not.
      const lopsided = (rows: string[]) => rows.filter((row) => row !== [...row].reverse().join('')).length;
      if (name === 'dog' || name === 'cat') continue;
      const side = characters[`${name}-left`]!;
      expect(lopsided(side), name).toBeGreaterThanOrEqual(6);
      expect(lopsided(side), name).toBeGreaterThan(lopsided(front));
    }
  });
});
