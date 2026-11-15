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
