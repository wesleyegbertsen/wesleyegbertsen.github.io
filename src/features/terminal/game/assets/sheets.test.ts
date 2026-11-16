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
    // Raised from 9000: every side of every person, the dog and the player's strides are drawn by hand now. Raised from
    // 10000 in round seven: sixteen fence pieces that join their neighbours, the trainer of the battle, the cat's sides.
    expect(tileSheet.bytes + spriteSheet.bytes + font.bytes).toBeLessThan(12000);
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

  it('draw slick rock so that it is not taken for the cave floor: another shade, with slanting streaks of shine', () => {
    const script = "import('./scripts/sprites/scenery.mjs').then(({ scenery }) => console.log(JSON.stringify({ ice: scenery.ice, floor: scenery.cavefloor })))";
    const drawn = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { ice: string[]; floor: string[] };
    // A tile is 16 rows of 16, or a pattern of 8 by 8 that is repeated.
    const whole = (rows: string[]) => (rows.length === 8 ? [...rows, ...rows].map((row) => row + row) : rows);
    const ice = whole(drawn.ice);
    const floor = whole(drawn.floor);
    const count = (rows: string[], shade: string) => rows.join('').split(shade).length - 1;
    // The ground itself: the lightest shade where the floor has the light one. Nearly every pixel differs.
    expect(count(ice, '0')).toBeGreaterThan(200);
    expect(count(floor, '1')).toBeGreaterThan(200);
    expect(ice.flatMap((row, y) => [...row].filter((dot, x) => dot !== floor[y]![x])).length).toBeGreaterThan(230);
    // The shine: strokes in the dark shade (they still show under the dither of the dark) and in the light one.
    expect(count(ice, '2')).toBeGreaterThanOrEqual(8);
    expect(count(ice, '1')).toBeGreaterThanOrEqual(8);
    expect(count(ice, '3')).toBe(0);
    // Every stroke slants the same way: each of its pixels has a neighbour up to the right or down to the left.
    const at = (x: number, y: number) => ice[(y + 16) % 16]![(x + 16) % 16]!;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (at(x, y) === '0') continue;
        expect(at(x + 1, y - 1) === at(x, y) || at(x - 1, y + 1) === at(x, y), `${x},${y}`).toBe(true);
      }
    }
  });

  it('draw the cracked wall of the cave as a clear crack: a long light fissure with dark edges, and pebbles at its foot', () => {
    const script = "import('./scripts/sprites/scenery.mjs').then(({ scenery }) => console.log(JSON.stringify({ crack: scenery.crack, wall: scenery.cavewall })))";
    const drawn = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { crack: string[]; wall: string[] };
    const wall = (drawn.wall.length === 8 ? [...drawn.wall, ...drawn.wall].map((row) => row + row) : drawn.wall);
    // (The sheet holds the crack laid over the rock already.)
    const differs = (y: number) => [...drawn.crack[y]!].filter((dot, x) => dot !== wall[y]![x]).length;
    // The fissure runs (nearly) from top to bottom, and its light core is easy to see in the shade of the rock.
    expect(Array.from({ length: 12 }, (_, y) => differs(y + 1)).every((count) => count >= 2)).toBe(true);
    expect(drawn.crack.join('').split('0').length - 1).toBeGreaterThanOrEqual(10);
    // Pebbles at the foot: the light shade in the bottom rows.
    expect(drawn.crack.slice(13).join('').split('1').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('draw the trainer of the battle from behind at the size of the enemies, at an angle, in all four shades', () => {
    expect(sprites['trainer-back'].slice(2)).toEqual([32, 32]);
    const script = "import('./scripts/sprites/trainer.mjs').then(({ trainers }) => console.log(JSON.stringify(trainers['trainer-back'])))";
    const rows = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as string[];
    expect(rows).toHaveLength(32);
    // Turned towards the enemy: not the same left and right (an enemy is a mirrored half).
    expect(rows.filter((row) => row !== [...row].reverse().join('')).length).toBeGreaterThanOrEqual(24);
    for (const shade of ['0', '1', '2', '3']) expect(rows.join(''), shade).toContain(shade);
    // A person from head to feet: the cap starts at the top, two feet stand apart on the bottom row, and the head
    // (down to the neck, the first row that narrows under it) is about a third of the height.
    expect(rows.findIndex((row) => /[^.]/.test(row))).toBeLessThanOrEqual(2);
    expect(rows[31]!.split(/\.+/).filter(Boolean)).toHaveLength(2);
    const width = (row: string) => row.replace(/^\.+|\.+$/g, '').length;
    const neck = rows.findIndex((row, y) => y > 6 && width(row) > 0 && width(row) < 10);
    expect(neck).toBeGreaterThanOrEqual(9);
    expect(neck).toBeLessThanOrEqual(13);
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
      // The head stays where it is, as in the walk up and down: no bob.
      expect(head(one), one).toBe(head(standing));
      expect(head(two), two).toBe(head(standing));
    }
  });

  it('walk sideways like up and down: the arm two pixels in front and behind, the legs a pixel or two, small shoes, no bob', () => {
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters }) => console.log(JSON.stringify(['player-left-0', 'player-left-1', 'player-left-2', 'player-down-0'].map((name) => characters[name]))))";
    const [standing, forward, back, front] = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as [string[], string[], string[], string[]];
    // No bob: everything down to the shoulders is the standing picture, in the same rows.
    for (const frame of [forward, back]) expect(frame.slice(0, 10)).toEqual(standing.slice(0, 10));
    // The arm (rows 10 and 11) reaches two pixels in front of the body, then two behind it.
    const first = (rows: string[]) => Math.min(...rows.map((row) => row.search(/[^.]/)).filter((x) => x >= 0));
    const last = (rows: string[]) => Math.max(...rows.map((row) => row.length - 1 - [...row].reverse().join('').search(/[^.]/)));
    const body = standing.slice(9, 13);
    expect(first(body) - first(forward.slice(10, 12))).toBe(2);
    expect(last(back.slice(10, 12)) - last(body)).toBe(2);
    // Small shoes: every foot on the bottom row of the legs is as long as a foot of the standing and front pictures.
    const feet = (rows: string[]) => rows[14]!.split(/\.+/).filter(Boolean).map((foot) => foot.length);
    const size = Math.max(...feet(standing), ...feet(front));
    expect(size).toBeLessThanOrEqual(3);
    for (const frame of [forward, back]) {
      expect(feet(frame).length).toBeGreaterThanOrEqual(1);
      for (const foot of feet(frame)) expect(foot).toBeLessThanOrEqual(size);
      // Nothing below the feet, as standing.
      expect(frame[15]).toBe('................');
    }
    // The legs move: the two strides differ from each other and from standing, by a pixel or two.
    const legs = (rows: string[]) => rows.slice(13, 15).join('/');
    expect(legs(forward)).not.toBe(legs(back));
    expect(legs(forward)).not.toBe(legs(standing));
    const spread = (rows: string[]) => last(rows.slice(13, 15)) - first(rows.slice(13, 15));
    expect(Math.abs(spread(forward) - spread(standing))).toBeLessThanOrEqual(2);
  });

  it('draw everyone who can turn by hand: a back without a face and a side that is not the front', () => {
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters, facing }) => console.log(JSON.stringify({ facing, characters })))";
    const { facing, characters } = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { facing: string[]; characters: Record<string, string[]> };
    // The nine of the town and the barista of the cafe.
    expect(facing).toHaveLength(10);
    expect(facing).toContain('barista');
    for (const name of [...facing, 'dog', 'cat']) {
      const front = name === 'dog' ? characters['dog-down']! : characters[name]!;
      const back = characters[`${name}-up`]!;
      expect(back, name).toHaveLength(16);
      expect(back.join(''), name).not.toBe(front.join(''));
      // A drawing from the front or the back is the same left and right, give or take a detail; a profile is not.
      const lopsided = (rows: string[]) => rows.filter((row) => row !== [...row].reverse().join('')).length;
      // The cat turns its whole body: a profile of its own (looking left; the right is its mirror), not the front.
      if (name === 'cat') {
        expect(characters['cat-left'], 'cat-left').toHaveLength(16);
        expect(lopsided(characters['cat-left']!)).toBeGreaterThanOrEqual(6);
        expect(characters['cat-left']!.join()).not.toBe(front.map((row) => [...row].reverse().join('')).join());
        expect(sprites).toHaveProperty(['cat-right']);
        // The same cat from every side: as tall (from the same top row to the same bottom row) and about as much cat.
        const size = (rows: string[]) => {
          const filled = rows.map((row, y) => (/[^.]/.test(row) ? y : -1)).filter((y) => y >= 0);
          return { top: filled[0], bottom: filled.at(-1), mass: rows.join('').replaceAll('.', '').length };
        };
        const [ahead, behind, side] = [characters.cat!, characters['cat-up']!, characters['cat-left']!].map(size) as [ReturnType<typeof size>, ReturnType<typeof size>, ReturnType<typeof size>];
        for (const other of [behind, side]) {
          expect([other.top, other.bottom]).toEqual([ahead.top, ahead.bottom]);
          expect(Math.abs(other.mass - ahead.mass) / ahead.mass).toBeLessThanOrEqual(0.15);
        }
      }
      if (name === 'dog' || name === 'cat') continue;
      const side = characters[`${name}-left`]!;
      expect(lopsided(side), name).toBeGreaterThanOrEqual(6);
      expect(lopsided(side), name).toBeGreaterThan(lopsided(front));
    }
  });
});
