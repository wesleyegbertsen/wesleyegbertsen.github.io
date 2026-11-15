// Builds the game's sprite sheets from the pixel definitions beside this file.
//
//   npm run sprites            write the PNG sheets and atlas.ts
//   npm run sprites -- --check exit 1 when the committed files differ from the definitions
//   npm run sprites -- --preview <dir>   also write 4x enlarged copies there, to look at
//
// No dependencies: the PNG encoder below is a few lines on node:zlib. The sheets are indexed PNGs with the four
// Game Boy shades plus one see-through entry, so they stay tiny.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { characters, mirrored } from './characters.mjs';
import { enemies } from './enemies.mjs';
import { glyphs } from './font.mjs';
import { scenery } from './scenery.mjs';
import { tiles as plain } from './tiles.mjs';

const clash = Object.keys(scenery).filter((name) => name in plain);
if (clash.length > 0) throw new Error(`Tile names used twice (tiles.mjs and scenery.mjs): ${clash.join(", ")}`);
const tiles = { ...plain, ...scenery };

/** The four shades, lightest first. Change them here to recolour every sheet. */
export const PALETTE = ['#e0f8d0', '#88c070', '#346856', '#081820'];
const CLEAR = 4;

const TILE = 16;
const ENEMY = 32;
const GLYPH_W = 6;
const GLYPH_H = 8;
const FONT_COLS = 16;
const FIRST_CHAR = 32;
const LAST_CHAR = 126;

const out = join(dirname(fileURLToPath(import.meta.url)), '../../src/features/terminal/game/assets');

// --- pixels -------------------------------------------------------------------------------------------------

function parse(name, rows, width, height) {
  if (rows.length !== height) throw new Error(`${name}: ${rows.length} rows, expected ${height}`);
  return rows.map((row, y) => {
    if (row.length !== width) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${width}`);
    return [...row].map((char) => {
      if (char === '.') return CLEAR;
      const shade = Number(char);
      if (!(shade >= 0 && shade <= 3)) throw new Error(`${name}: row ${y} has '${char}'`);
      return shade;
    });
  });
}

/** An 8x8 pattern repeated 2x2, or a full 16x16 tile. */
function tilePixels(name, rows) {
  if (rows.length === 8) {
    const doubled = rows.map((row) => row + row);
    return parse(name, [...doubled, ...doubled], TILE, TILE);
  }
  return parse(name, rows, TILE, TILE);
}

const mirror = (pixels) => pixels.map((row) => [...row].reverse());
const withMirror = (pixels) => pixels.map((row) => [...row, ...[...row].reverse()]);

function canvas(width, height) {
  return { width, height, data: new Uint8Array(width * height).fill(CLEAR) };
}

function blit(target, pixels, x, y) {
  pixels.forEach((row, dy) => row.forEach((value, dx) => (target.data[(y + dy) * target.width + x + dx] = value)));
}

// --- PNG ----------------------------------------------------------------------------------------------------

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, tail]);
}

/** The parts of the PNG before compression: an indexed picture, 4 bits per pixel, four shades and a see-through fifth. */
function pngParts({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([4, 3, 0, 0, 0], 8);

  const palette = Buffer.from([...PALETTE.flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))), 0, 0, 0]);
  const alpha = Buffer.from([255, 255, 255, 255, 0]);

  const stride = Math.ceil(width / 2) + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = data[y * width + x];
      raw[y * stride + 1 + (x >> 1)] |= x % 2 === 0 ? value << 4 : value;
    }
  }

  return { IHDR: header, PLTE: palette, tRNS: alpha, raw };
}

export function encodePng(sheet) {
  const parts = pngParts(sheet);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', parts.IHDR),
    chunk('PLTE', parts.PLTE),
    chunk('tRNS', parts.tRNS),
    chunk('IDAT', deflateSync(parts.raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Whether a PNG file shows exactly this sheet. It compares the pixels and the palette, not the bytes of the file:
 * another version of zlib may compress the same picture differently.
 */
export function samePicture(file, sheet) {
  const parts = pngParts(sheet);
  const found = { IDAT: [] };
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('ascii', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT') found.IDAT.push(body);
    else found[type] = body;
    at += 12 + length;
  }
  return (
    ['IHDR', 'PLTE', 'tRNS'].every((type) => found[type]?.equals(parts[type])) &&
    inflateSync(Buffer.concat(found.IDAT)).equals(parts.raw)
  );
}

// --- sheets -------------------------------------------------------------------------------------------------

function buildTiles() {
  const names = Object.keys(tiles);
  const cols = 8;
  const sheet = canvas(cols * TILE, Math.ceil(names.length / cols) * TILE);
  const atlas = {};
  names.forEach((name, i) => {
    const x = (i % cols) * TILE;
    const y = Math.floor(i / cols) * TILE;
    blit(sheet, tilePixels(name, tiles[name]), x, y);
    atlas[name] = [x, y];
  });
  return { sheet, atlas };
}

function buildSprites() {
  const people = Object.fromEntries(Object.entries(characters).map(([name, rows]) => [name, parse(name, rows, TILE, TILE)]));
  for (const [name, source] of Object.entries(mirrored)) people[name] = mirror(people[source]);
  const big = Object.entries(enemies).map(([name, rows]) => [name, withMirror(parse(name, rows, ENEMY / 2, ENEMY))]);

  const cols = 8;
  const names = Object.keys(people);
  const peopleRows = Math.ceil(names.length / cols);
  // The enemies wrap too, so the sheet stays narrow however many there are.
  const bigCols = 5;
  const width = Math.max(cols * TILE, Math.min(big.length, bigCols) * ENEMY);
  const sheet = canvas(width, peopleRows * TILE + Math.ceil(big.length / bigCols) * ENEMY);
  const atlas = {};
  names.forEach((name, i) => {
    const x = (i % cols) * TILE;
    const y = Math.floor(i / cols) * TILE;
    blit(sheet, people[name], x, y);
    atlas[name] = [x, y, TILE, TILE];
  });
  big.forEach(([name, pixels], i) => {
    const x = (i % bigCols) * ENEMY;
    const y = peopleRows * TILE + Math.floor(i / bigCols) * ENEMY;
    blit(sheet, pixels, x, y);
    atlas[name] = [x, y, ENEMY, ENEMY];
  });
  return { sheet, atlas };
}

/** Two copies of the font: darkest ink on top, lightest ink below. */
function buildFont() {
  const count = LAST_CHAR - FIRST_CHAR + 1;
  const rows = Math.ceil(count / FONT_COLS);
  const sheet = canvas(FONT_COLS * GLYPH_W, rows * GLYPH_H * 2);
  for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    const char = String.fromCharCode(code);
    const glyph = glyphs[char];
    if (!glyph) throw new Error(`font: no glyph for '${char}'`);
    const lines = glyph.split('/');
    if (lines.length !== 7 || lines.some((line) => line.length !== 5)) throw new Error(`font: '${char}' is not 5x7`);
    const i = code - FIRST_CHAR;
    [3, 0].forEach((shade, copy) => {
      const pixels = lines.map((line) => [...line].map((dot) => (dot === '#' ? shade : CLEAR)));
      blit(sheet, pixels, (i % FONT_COLS) * GLYPH_W, (Math.floor(i / FONT_COLS) + copy * rows) * GLYPH_H);
    });
  }
  return { sheet, rows };
}

function atlasSource(tileAtlas, spriteAtlas, fontRows) {
  const entries = (atlas) =>
    Object.entries(atlas)
      .map(([name, at]) => `  ${JSON.stringify(name)}: [${at.join(', ')}],`)
      .join('\n');
  return `// Generated by scripts/sprites/generate.mjs (npm run sprites). Do not edit by hand.

/** The side of a map cell and of a tile on tiles.png, in pixels. */
export const TILE = ${TILE};

/** The four shades of the sheets, lightest first. */
export const PALETTE = ${JSON.stringify(PALETTE)} as const;

/** Where each tile sits on tiles.png: [x, y]. */
export const tiles = {
${entries(tileAtlas)}
} as const;

/** Where each sprite sits on sprites.png: [x, y, width, height]. */
export const sprites = {
${entries(spriteAtlas)}
} as const;

/** The font sheet: fixed cells, ASCII from \`first\`, dark ink at y 0 and light ink at \`lightY\`. */
export const FONT = { cellW: ${GLYPH_W}, cellH: ${GLYPH_H}, cols: ${FONT_COLS}, first: ${FIRST_CHAR}, last: ${LAST_CHAR}, lightY: ${fontRows * GLYPH_H} } as const;

export type TileName = keyof typeof tiles;
export type SpriteName = keyof typeof sprites;
`;
}

/** Every output file: name -> contents. */
export function build() {
  const tileSheet = buildTiles();
  const spriteSheet = buildSprites();
  const font = buildFont();
  return {
    sheets: { 'tiles.png': tileSheet.sheet, 'sprites.png': spriteSheet.sheet, 'font.png': font.sheet },
    atlas: atlasSource(tileSheet.atlas, spriteSheet.atlas, font.rows),
  };
}

function enlarge(sheet, factor) {
  const big = canvas(sheet.width * factor, sheet.height * factor);
  for (let y = 0; y < big.height; y++) {
    for (let x = 0; x < big.width; x++) {
      const value = sheet.data[Math.floor(y / factor) * sheet.width + Math.floor(x / factor)];
      // See-through shows as the light shade when looking at a preview.
      big.data[y * big.width + x] = value === CLEAR ? 1 : value;
    }
  }
  return big;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { sheets, atlas } = build();
  const files = { ...Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, encodePng(sheet)])), 'atlas.ts': Buffer.from(atlas) };

  if (process.argv.includes('--check')) {
    const fresh = (name) => {
      try {
        const committed = readFileSync(join(out, name));
        // Git may check text out with CRLF on Windows.
        return name === 'atlas.ts' ? committed.toString().replaceAll('\r\n', '\n') === atlas : samePicture(committed, sheets[name]);
      } catch {
        return false;
      }
    };
    const stale = Object.keys(files).filter((name) => !fresh(name));
    if (stale.length > 0) {
      console.error(`Out of date: ${stale.join(', ')}. Run: npm run sprites`);
      process.exit(1);
    }
    console.log('Sprite sheets are up to date.');
  } else {
    mkdirSync(out, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(out, name), body);
      console.log(`${name}: ${body.length} bytes`);
    }
    const at = process.argv.indexOf('--preview');
    if (at > 0 && process.argv[at + 1]) {
      mkdirSync(process.argv[at + 1], { recursive: true });
      for (const [name, sheet] of Object.entries(sheets)) writeFileSync(join(process.argv[at + 1], name), encodePng(enlarge(sheet, 4)));
    }
  }
}
