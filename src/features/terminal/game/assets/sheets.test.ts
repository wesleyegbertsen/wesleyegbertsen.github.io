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

  it('draw the rustle of the tall grass as the same tall grass, a little disturbed', () => {
    const script = "import('./scripts/sprites/scenery.mjs').then(({ scenery }) => import('./scripts/sprites/tiles.mjs').then(({ tiles }) => console.log(JSON.stringify({ grass: tiles.tallgrass, a: scenery.rustle, b: scenery['rustle-b'] }))))";
    const drawn = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { grass: string[]; a: string[]; b: string[] };
    const whole = (rows: string[]) => (rows.length === 8 ? [...rows, ...rows].map((row) => row + row) : rows);
    const grass = whole(drawn.grass).join('');
    const shades = (pixels: string) => [...new Set(pixels)].sort().join('');
    const count = (pixels: string, shade: string) => pixels.split(shade).length - 1;
    for (const frame of [drawn.a, drawn.b]) {
      const pixels = whole(frame).join('');
      expect(pixels).toHaveLength(256);
      // The same shades, no see-through holes, about the same number of dark blade pixels.
      expect(shades(pixels)).toBe(shades(grass));
      expect(Math.abs(count(pixels, '2') - count(grass, '2'))).toBeLessThanOrEqual(count(grass, '2') * 0.15);
      // A few blades moved: some pixels differ, most do not.
      const moved = [...pixels].filter((dot, i) => dot !== grass[i]).length;
      expect(moved).toBeGreaterThanOrEqual(6);
      expect(moved).toBeLessThanOrEqual(48);
    }
    expect(whole(drawn.a).join('')).not.toBe(whole(drawn.b).join(''));
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
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters, mirrored }) => { const rows = (name) => characters[name] ?? rows(mirrored[name]).map((row) => [...row].reverse().join('')); console.log(JSON.stringify(Object.fromEntries(['up', 'down', 'left', 'right'].flatMap((dir) => [0, 1, 2].map((frame) => ['player-' + dir + '-' + frame, rows('player-' + dir + '-' + frame)]).concat([1, 2].map((frame) => ['player-' + dir + '-' + frame + 's', characters['player-' + dir + '-' + frame + 's'] ?? (mirrored['player-' + dir + '-' + frame + 's'] ? 'mirrored' : undefined)])))))); })";
    const frames = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as Record<string, string[]>;
    // Rows 9 to 12 hold the shoulders, the arms and the hands; the legs are below.
    const arms = (name: string) => frames[name]!.slice(9, 13).join('/');
    for (const direction of ['up', 'down', 'left', 'right']) {
      const [standing, one, two] = [0, 1, 2].map((frame) => `player-${direction}-${frame}`) as [string, string, string];
      expect(arms(one), one).not.toBe(arms(standing));
      expect(arms(two), two).not.toBe(arms(standing));
      expect(arms(one), direction).not.toBe(arms(two));
      // The head stays where it is in every walk picture, in every direction: the rows above the collar (0 to 8,
      // the collar included) are the standing head, and the head touches the collar. No twins with a head moved over.
      expect(frames[`${one}s`], one).toBeUndefined();
      expect(frames[`${two}s`], two).toBeUndefined();
      for (const name of [one, two]) {
        expect(frames[name]!.slice(0, 9).join('/'), name).toBe(frames[standing]!.slice(0, 9).join('/'));
        const above = [...frames[name]![7]!].flatMap((dot, x) => (dot === '.' ? [] : [x]));
        const collar = [...frames[name]![8]!].flatMap((dot, x) => (dot === '.' ? [] : [x]));
        expect(above.some((x) => collar.includes(x)), `${name}: the head touches the collar`).toBe(true);
      }
    }
  });

  it('walk sideways with straight legs from the hips and an arm that swings beside the body, the body still', () => {
    const script = "import('./scripts/sprites/characters.mjs').then(({ characters }) => console.log(JSON.stringify(['player-left-0', 'player-left-1', 'player-left-2'].map((name) => characters[name]))))";
    const [standing, forward, back] = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as [string[], string[], string[]];
    // The head and the torso stand still: down to the shoulders exactly the standing picture.
    for (const frame of [forward, back]) expect(frame.slice(0, 10)).toEqual(standing.slice(0, 10));
    const filled = (row: string) => [...row].flatMap((dot, x) => (dot === '.' ? [] : [x]));
    const torso = { left: Math.min(...filled(standing[12]!)), right: Math.max(...filled(standing[12]!)) };
    // The arm: the light pixels in the torso rows. It overlaps the torso in both frames and reaches no further than
    // one pixel past its edge, forward in one frame and back in the other.
    const arm = (rows: string[]) => rows.slice(10, 13).flatMap((row) => [...row].flatMap((dot, x) => (dot === '0' || dot === '1' ? [x] : [])));
    for (const frame of [forward, back]) {
      expect(arm(frame).some((x) => x >= torso.left && x <= torso.right)).toBe(true);
      const rows = frame.slice(10, 13).map(filled);
      expect(Math.min(...rows.flat())).toBeGreaterThanOrEqual(torso.left - 1);
      expect(Math.max(...rows.flat())).toBeLessThanOrEqual(torso.right + 1);
    }
    // A whole arm, the same in the standing picture and in the walk: never a single pixel. Its light pixels, row by
    // row, are runs of two at the least, in three rows at the least, and a stride moves that very shape a pixel.
    const shape = (rows: string[]) => rows.slice(9, 13).flatMap((row, y) => [...row].flatMap((dot, x) => (dot === '0' || dot === '1' ? [{ x, y, dot }] : [])));
    for (const frame of [standing, forward, back]) {
      const cells = shape(frame);
      const ys = [...new Set(cells.map((cell) => cell.y))];
      expect(ys.length, frame.join('/')).toBeGreaterThanOrEqual(3);
      for (const y of ys) expect(cells.filter((cell) => cell.y === y).length, `row ${y}`).toBeGreaterThanOrEqual(2);
    }
    const key = (cells: { x: number; y: number; dot: string }[], dx: number) => cells.map((cell) => `${cell.x + dx},${cell.y},${cell.dot}`).sort().join(' ');
    for (const frame of [forward, back]) {
      expect([-1, 0, 1].some((dx) => key(shape(standing), dx) === key(shape(frame), 0)), frame.join('/')).toBe(true);
    }
    expect(key(shape(forward), 0)).not.toBe(key(shape(back), 0));
    // The legs (rows 13 and 14): two shapes, each one connected, hanging from the torso, slanting by a pixel per row
    // at most, two pixels of leg inside the outline, on a shoe of three pixels at the most.
    const legsOf = (rows: string[]) => {
      const cells = new Set<string>();
      for (const y of [13, 14]) for (const x of filled(rows[y]!)) cells.add(`${x},${y}`);
      const shapes: { x: number; y: number }[][] = [];
      const seen = new Set<string>();
      for (const start of cells) {
        if (seen.has(start)) continue;
        const shape: { x: number; y: number }[] = [];
        const queue = [start];
        seen.add(start);
        for (let key = queue.shift(); key; key = queue.shift()) {
          const [x, y] = key.split(',').map(Number) as [number, number];
          shape.push({ x, y });
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = `${x + dx!},${y + dy!}`;
            if (cells.has(next) && !seen.has(next)) {
              seen.add(next);
              queue.push(next);
            }
          }
        }
        shapes.push(shape);
      }
      return shapes;
    };
    for (const frame of [forward, back]) {
      const legs = legsOf(frame);
      expect(legs, frame.join('/')).toHaveLength(2);
      for (const leg of legs) {
        const row = (y: number) => leg.filter((cell) => cell.y === y).map((cell) => cell.x);
        // Hanging from the torso: the top of the leg is under it.
        expect(row(13).some((x) => x >= torso.left && x <= torso.right)).toBe(true);
        // Straight: the second row starts a pixel from the first at the most, on both sides.
        expect(Math.abs(Math.min(...row(14)) - Math.min(...row(13)))).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.max(...row(14)) - Math.max(...row(13)))).toBeLessThanOrEqual(1);
        // Two pixels of leg inside its outline, and a small shoe.
        expect(row(13)).toHaveLength(4);
        expect(row(14).length).toBeLessThanOrEqual(3);
      }
    }
    // The legs step: the two frames differ from standing and from each other.
    const legs = (rows: string[]) => rows.slice(13, 15).join('/');
    expect(legs(forward)).not.toBe(legs(standing));
    expect(legs(forward)).not.toBe(legs(back));
    // A short stride: the feet spread a pixel wider than standing at the most.
    const spread = (rows: string[]) => { const xs = rows.slice(13, 15).flatMap(filled); return Math.max(...xs) - Math.min(...xs); };
    for (const frame of [forward, back]) expect(spread(frame) - spread(standing)).toBeLessThanOrEqual(1);
    for (const frame of [forward, back]) expect(frame[15]).toBe('................');
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
