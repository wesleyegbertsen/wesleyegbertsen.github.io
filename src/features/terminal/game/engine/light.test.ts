import { dimness } from './light.ts';

describe('the light in a dark place', () => {
  it('lights the player and the cells around, by the radius', () => {
    expect(dimness(0, 0, 1)).toBe(0);
    expect(dimness(1, 0, 1)).toBe(0);
    expect(dimness(1, 1, 1)).toBe(0);
    expect(dimness(2, 0, 1)).toBe(1);
    expect(dimness(2, 0, 2)).toBe(0);
  });

  it('falls off over two rings to black', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((dx) => dimness(dx, 0, 1))).toEqual([0, 0, 1, 2, 3, 3, 3]);
    expect(dimness(2, 2, 1)).toBe(2);
    expect(dimness(3, 3, 1)).toBe(3);
  });

  it('is the same in every direction and never gets lighter further away', () => {
    for (const [dx, dy] of [[2, 1], [0, 3], [3, 2], [1.5, 0.5]] as const) {
      const all = [dimness(dx, dy, 1), dimness(-dx, dy, 1), dimness(dx, -dy, 1), dimness(-dx, -dy, 1), dimness(dy, dx, 1)];
      expect(new Set(all).size).toBe(1);
    }
    let last = 0;
    for (let d = 0; d < 8; d += 0.25) {
      const now = dimness(d, 0, 1);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('moves smoothly with a player between two cells', () => {
    // Half a step to the right: the cell two to the right comes into the light.
    expect(dimness(2, 0, 1)).toBe(1);
    expect(dimness(2 - 0.5, 0, 1)).toBe(0);
  });
});
