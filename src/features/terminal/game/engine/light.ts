/**
 * How dark a cell of a dark place is, seen from the player. Pure: the renderer asks it per cell.
 *
 * 0 is lit, 1 and 2 are the two dithered rings around the light, 3 is black. `dx` and `dy` are the distance to
 * the player in cells (fractions while walking), `radius` is how many cells around the player are fully lit.
 */
export type Dimness = 0 | 1 | 2 | 3;

export function dimness(dx: number, dy: number, radius: number): Dimness {
  const distance = Math.hypot(dx, dy);
  if (distance <= radius + 0.5) return 0;
  if (distance <= radius + 1.5) return 1;
  if (distance <= radius + 2.5) return 2;
  return 3;
}
