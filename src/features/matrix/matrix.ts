export const MATRIX_COLORS = ['#0f0', '#f00', '#00f', '#fff'] as const;
export const COLUMN_WIDTH = 20;
export const STORAGE_KEY = 'currentMatrixFontColorIndex';

/** The next colour index, wrapping around after the last colour. */
export function nextColorIndex(index: number): number {
  return (index + 1) % MATRIX_COLORS.length;
}

/** Parses a stored colour index; anything that is not a valid index is rejected. */
export function parseColorIndex(raw: string): number | undefined {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value < MATRIX_COLORS.length ? value : undefined;
}

/** One column per 20px of width, all starting at the top. */
export function createColumns(width: number): number[] {
  return new Array<number>(Math.floor(width / COLUMN_WIDTH) + 1).fill(0);
}

/** Moves every column down one row; a column past a random depth restarts at the top. */
export function stepColumns(columns: number[], random: () => number): number[] {
  return columns.map((y) => (y > 100 + random() * 10000 ? 0 : y + COLUMN_WIDTH));
}
