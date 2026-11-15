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
    expect(tileSheet.bytes + spriteSheet.bytes + font.bytes).toBeLessThan(8000);
  });

  it('use four shades, lightest first', () => {
    expect(PALETTE).toHaveLength(4);
    const light = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect([...PALETTE].sort((a, b) => light(b) - light(a))).toEqual([...PALETTE]);
  });

  it('have a player sprite for every direction and walking frame', () => {
    for (const direction of ['up', 'down', 'left', 'right']) {
      for (const frame of [0, 1]) expect(sprites).toHaveProperty([`player-${direction}-${frame}`]);
    }
  });
});
