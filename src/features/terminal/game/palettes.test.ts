import { PALETTE } from './assets/atlas.ts';
import { PALETTES, SHEET_NAMES, contrast, dim, dimmed, luminance, paletteOf, recolour, ruleOf, type Palette } from './palettes.ts';

describe('the palettes of Game Boy Color mode', () => {
  it('have four different colours each, lightest first, and the lightest far from the darkest', () => {
    expect(Object.keys(PALETTES).length).toBeGreaterThanOrEqual(10);
    for (const [id, colours] of Object.entries(PALETTES)) {
      expect(colours, id).toHaveLength(4);
      expect(new Set(colours).size, id).toBe(4);
      for (const colour of colours) expect(colour, id).toMatch(/^#[0-9a-f]{6}$/);
      // Lightest first, darkest last: the shades of the sheets keep their order.
      expect(luminance(colours[0]), id).toBeGreaterThan(luminance(colours[3]));
      expect(luminance(colours[0]), id).toBeGreaterThanOrEqual(Math.max(luminance(colours[1]), luminance(colours[2])));
      expect(luminance(colours[3]), id).toBeLessThanOrEqual(Math.min(luminance(colours[1]), luminance(colours[2])));
      // Text and outlines stay readable: at least the contrast of normal text on the web.
      expect(contrast(colours[0], colours[3]), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('give every tile and sprite on the sheets a palette by a rule', () => {
    expect(SHEET_NAMES.length).toBeGreaterThan(150);
    const missing = SHEET_NAMES.filter((name) => ruleOf(name) === undefined);
    expect(missing).toEqual([]);
    // A few that must look right: grass is green, water blue, roofs red, the people in skin tones, the enemies
    // apart, the cave dark violet, stars gold.
    expect(paletteOf('grass')).toBe('grass');
    expect(paletteOf('water-b')).toBe('water');
    expect(paletteOf('roof')).toBe('roof');
    expect(paletteOf('player-down-1')).toBe('people');
    expect(paletteOf('trainer-back')).toBe('people');
    expect(paletteOf('bug')).toBe('foe');
    expect(paletteOf('cavewall')).toBe('cave');
    expect(paletteOf('shade-2')).toBe('cave');
    expect(paletteOf('star')).toBe('gold');
    expect(paletteOf('fence-ns')).toBe('fence');
    // Ledges and cliffs are brown earth, not grass; rocks are grey stone, not sand.
    expect(paletteOf('ledge-left')).toBe('earth');
    expect(paletteOf('ledge-right')).toBe('earth');
    expect(paletteOf('cliff')).toBe('earth');
    expect(paletteOf('rock')).toBe('stone');
    expect(paletteOf('boulder')).toBe('stone');
    // Every picture of the mountain is earth: brown rock, a light lip, a dark foot.
    for (const name of SHEET_NAMES.filter((candidate) => candidate.startsWith('cliff'))) expect(paletteOf(name), name).toBe('earth');
    expect(SHEET_NAMES.filter((candidate) => candidate.startsWith('cliff-')).length).toBeGreaterThanOrEqual(8);
    // What stands in or on the water has colours of its own: green plants, a white duck, wooden planks, grey stones.
    // Only the water around them is blue (they are drawn over the water of their cell).
    expect(paletteOf('lily')).toBe('grass');
    expect(paletteOf('lily-b')).toBe('grass');
    expect(paletteOf('reeds')).toBe('grass');
    expect(paletteOf('duck')).not.toBe('water');
    expect(paletteOf('jetty')).toBe('wood');
    expect(paletteOf('stones')).toBe('stone');
    // Every palette is used by something.
    const used = new Set(SHEET_NAMES.map(paletteOf));
    for (const id of Object.keys(PALETTES)) if (id !== 'ui') expect(used, id).toContain(id);
  });

  it('recolours the four shades of a sheet and leaves see-through pixels alone', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const pixels = new Uint8ClampedArray([...PALETTE.flatMap((hex) => [...rgb(hex), 255]), 1, 2, 3, 0]);
    recolour(pixels, PALETTES.water);
    expect([...pixels]).toEqual([...PALETTES.water.flatMap((hex) => [...rgb(hex), 255]), 1, 2, 3, 0]);
  });
});

describe('the dim LCD (the LIGHT setting)', () => {
  const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  /** How far the channels of a colour are apart: 0 for a grey. */
  const spread = (hex: string) => Math.max(...rgbOf(hex)) - Math.min(...rgbOf(hex));
  const all = [...Object.values(PALETTES).flat(), ...PALETTE];

  it('is darker and less colourful, never brighter, and keeps black black and the order of the shades', () => {
    expect(dim('#000000')).toBe('#000000');
    // White is no longer pure white: a light grey.
    expect(dim('#ffffff')).toBe('#d1d1d1');
    for (const colour of all) {
      expect(luminance(dim(colour)), colour).toBeLessThan(luminance(colour) + 1e-9);
      if (colour !== '#000000') expect(luminance(dim(colour)), colour).toBeLessThan(luminance(colour));
      expect(spread(dim(colour)), colour).toBeLessThanOrEqual(spread(colour));
      expect(dim(colour)).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const palette of [...Object.values(PALETTES), PALETTE]) {
      const out = dimmed(palette as unknown as Palette);
      for (let i = 1; i < 4; i++) expect(luminance(out[i]!), palette.join()).toBeLessThan(luminance(out[i - 1]!));
    }
  });

  it('stays readable: text on its box 4.5:1 or more in every palette, and the four greens apart from each other', () => {
    for (const [id, palette] of [...Object.entries(PALETTES), ['gb', PALETTE] as const]) {
      const out = dimmed(palette as unknown as Palette);
      expect(contrast(out[0], out[3]), id).toBeGreaterThanOrEqual(4.5);
    }
    const greens = dimmed(PALETTE as unknown as Palette);
    for (let i = 1; i < 4; i++) expect(contrast(greens[i - 1]!, greens[i]!), `${i}`).toBeGreaterThanOrEqual(1.2);
  });
});
