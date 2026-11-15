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

/**
 * How dark a cell is with every light counted: the player's own (`radius` cells around `px`, `py`) and the
 * lights that stand on the map (a fire bowl). The brightest one wins.
 */
export function lit(x: number, y: number, px: number, py: number, radius: number, lights: readonly { x: number; y: number; radius: number }[] = []): Dimness {
  let best = dimness(x - px, y - py, radius);
  for (const light of lights) {
    if (best === 0) break;
    const dim = dimness(x - light.x, y - light.y, light.radius);
    if (dim < best) best = dim;
  }
  return best;
}
