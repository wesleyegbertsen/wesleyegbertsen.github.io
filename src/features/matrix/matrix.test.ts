import { MATRIX_COLORS, createColumns, nextColorIndex, parseColorIndex, stepColumns } from './matrix.ts';

describe('matrix logic', () => {
  it('keeps the original colours', () => {
    expect(MATRIX_COLORS).toEqual(['#0f0', '#f00', '#00f', '#fff']);
  });

  it('cycles colours 0-1-2-3-0', () => {
    expect([0, 1, 2, 3].map(nextColorIndex)).toEqual([1, 2, 3, 0]);
  });

  it('accepts only valid stored indexes', () => {
    expect(parseColorIndex('0')).toBe(0);
    expect(parseColorIndex('3')).toBe(3);
    expect(parseColorIndex('4')).toBeUndefined();
    expect(parseColorIndex('abc')).toBeUndefined();
  });

  it('creates one column per 20px plus one', () => {
    expect(createColumns(1000)).toHaveLength(51);
    expect(createColumns(19)).toHaveLength(1);
    expect(createColumns(1000).every((y) => y === 0)).toBe(true);
  });

  it('moves columns down 20px', () => {
    expect(stepColumns([0, 40], () => 0.5)).toEqual([20, 60]);
  });

  it('restarts a column that is past its random depth', () => {
    // threshold = 100 + 0 * 10000 = 100
    expect(stepColumns([120, 100, 80], () => 0)).toEqual([0, 120, 100]);
  });
});
