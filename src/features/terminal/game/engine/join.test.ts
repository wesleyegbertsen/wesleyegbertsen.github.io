import type { TileDef } from './types.ts';
import { joinedLook, parseMap } from './world.ts';

/** Tiles that join their neighbours (a fence): each cell is drawn by the sides it shares with more of the same. */

const legend: Record<string, TileDef> = {
  '.': { sprite: 'grass', solid: false },
  f: { sprite: 'fence', solid: true, join: true },
  h: { sprite: 'hedge', solid: true },
};

const looks = (rows: string[]) => {
  const map = parseMap({ id: 'yard', name: 'Yard', rows, ground: '.', objects: {} }, legend);
  return map.cells.map((row) => row.map((char) => map.tiles[char]!.look ?? map.tiles[char]!.sprite));
};

describe('tiles that join their neighbours', () => {
  it('name the sides that go on, in the order north, east, south, west', () => {
    expect(joinedLook('fence', { n: true, e: true, s: false, w: true })).toBe('fence-new');
    expect(joinedLook('fence', { n: false, e: false, s: false, w: false })).toBe('fence');
  });

  it('draw a run across as one, with an end on each side', () => {
    expect(looks(['.fff.'])[0]).toEqual(['grass', 'fence-e', 'fence-ew', 'fence-w', 'grass']);
  });

  it('draw a run up and down with the upright pieces, not with the pieces of a run across', () => {
    expect(looks(['f', 'f', 'f']).map((row) => row[0])).toEqual(['fence-s', 'fence-ns', 'fence-n']);
  });

  it('join the corners of a pen, and leave the open side open', () => {
    expect(looks(['fff', 'f..', 'fff'])).toEqual([
      ['fence-es', 'fence-ew', 'fence-w'],
      ['fence-ns', 'grass', 'grass'],
      ['fence-ne', 'fence-ew', 'fence-w'],
    ]);
  });

  it('do not join other tiles, and keep the solid ground and the name of the tile', () => {
    const map = parseMap({ id: 'yard', name: 'Yard', rows: ['hfh'], ground: '.', objects: {} }, legend);
    const tile = map.tiles[map.cells[0]![1]!]!;
    expect(tile).toMatchObject({ sprite: 'fence', solid: true, look: 'fence' });
  });
});

describe('a mountain (relief)', () => {
  const rock: Record<string, TileDef> = {
    '.': { sprite: 'grass', solid: false },
    c: { sprite: 'cliff', solid: true, relief: true },
    // The mouth of a cave: not solid, but part of the mountain to its neighbours.
    k: { sprite: 'cliff', solid: false, relief: true },
  };
  const reliefLooks = (rows: string[]) => {
    const map = parseMap({ id: 'hill', name: 'Hill', rows, ground: '.', objects: {} }, rock);
    return map.cells.map((row) => row.map((char) => map.tiles[char]!.look ?? map.tiles[char]!.sprite));
  };

  it('is one face wherever it meets open ground, with the open sides in its name: corners included', () => {
    const looks = reliefLooks(['.....', '.ccc.', '.ccc.', '.ccc.', '.....']);
    expect(looks[1]![2]).toBe('cliff-face-n');
    expect(looks[3]![2]).toBe('cliff-face-s');
    expect(looks[2]![1]).toBe('cliff-face-w');
    expect(looks[2]![3]).toBe('cliff-face-e');
    // Outer corners: the lit top and the side, the side and the shadow at the foot.
    expect(looks[1]![3]).toBe('cliff-face-ne');
    expect(looks[3]![1]).toBe('cliff-face-sw');
    // Inside: the same rock, no edge.
    expect(looks[2]![2]).toMatch(/^cliff-rock-\d$/);
  });

  it('counts the mouth of a cave as rock, so the face runs on above and below it', () => {
    const looks = reliefLooks(['cc.', 'ck.', 'cc.']);
    expect(looks[0]![1]).toBe('cliff-face-e');
    expect(looks[2]![1]).toBe('cliff-face-e');
  });

  it('puts the peaks only on the top ridge, as big pairs, and nowhere next to a face', () => {
    const rows = ['ccccccc.', 'cccccccc', 'cccccccc', 'cccc....'];
    const looks = reliefLooks(rows);
    const peaks = looks.flatMap((row, y) => row.flatMap((look, x) => (look.startsWith('cliff-peak') ? [[x, y] as const] : [])));
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    for (const [x, y] of peaks) {
      expect(y).toBe(0);
      // In pairs: the left half beside the right half.
      const look = looks[y]![x]!;
      if (look === 'cliff-peak-0') expect(looks[y]![x + 1]).toBe('cliff-peak-1');
      if (look === 'cliff-peak-1') expect(looks[y]![x - 1]).toBe('cliff-peak-0');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]] as const) expect(looks[y + dy]?.[x + dx] ?? '', `${x},${y}`).not.toMatch(/^cliff-face/);
    }
    // One family: every look is a face, the rock or a peak.
    for (const look of looks.flat()) if (look.startsWith('cliff')) expect(look).toMatch(/^cliff-(face-[nesw]+|rock-\d|peak-[01])$/);
    const map = parseMap({ id: 'hill', name: 'Hill', rows, ground: '.', objects: {} }, rock);
    for (const row of map.cells) for (const char of row) if (map.tiles[char]!.sprite === 'cliff' && char.startsWith('c')) expect(map.tiles[char]!.solid).toBe(true);
  });
});
