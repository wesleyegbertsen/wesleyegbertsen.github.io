import { PALETTE, sprites, tiles } from './assets/atlas.ts';

/**
 * The colours of Game Boy Color mode. HOW TO EDIT
 *
 * - The sheets are drawn in the four green shades of the Game Boy (PALETTE in scripts/sprites/generate.mjs). In
 *   colour mode each tile and sprite is drawn from a copy of its sheet in one of the palettes below: shade 0 (the
 *   lightest) becomes the first colour, shade 3 (the darkest) the last. Like the real Game Boy Color: four colours
 *   per palette, a palette per kind of thing.
 * - RULES says which palette a tile or sprite gets, by its name: the first rule whose pattern matches. A test fails
 *   for a name on the sheets that no rule matches, so a new tile needs a rule (or fits one already).
 * - Keep each palette lightest first, four different colours, and the lightest and the darkest far apart (a test
 *   checks the contrast).
 */

export type PaletteId = 'earth' | 'fence' | 'grass' | 'flower' | 'water' | 'sand' | 'stone' | 'roof' | 'wood' | 'tech' | 'gold' | 'people' | 'cave' | 'foe' | 'ui';
export type Palette = readonly [string, string, string, string];

export const PALETTES: Record<PaletteId, Palette> = {
  // A wooden fence standing in the grass: the light shade is the grass around it, the dark one the wood.
  // A step in the ground or a rock face: a light lip, the grass around it (the light shade), brown earth, a dark foot.
  earth: ['#f8ecc0', '#88d060', '#94582c', '#2a1408'],
  fence: ['#fff0d4', '#88d060', '#9a5a2c', '#24100a'],
  grass: ['#e8f8c8', '#88d060', '#307838', '#0c2410'],
  // Petals on grass: the light shade is the grass between them, the darkest the heart of a flower.
  flower: ['#fff4f8', '#88d060', '#307838', '#a01850'],
  water: ['#e0f4ff', '#70b8f0', '#2858b0', '#081840'],
  sand: ['#fff8dc', '#f0d088', '#b08040', '#30200c'],
  stone: ['#f4f4f0', '#b8c0cc', '#606a7c', '#141824'],
  roof: ['#fff0e4', '#f09070', '#b03428', '#2c0808'],
  wood: ['#fff0d4', '#d8a468', '#8a5228', '#24100a'],
  tech: ['#e8fff8', '#78e0c4', '#22786a', '#081818'],
  gold: ['#fffbe0', '#f8d040', '#b07010', '#2c1800'],
  people: ['#fff8f0', '#f8c0a0', '#c04040', '#1c0814'],
  cave: ['#e4dcfc', '#9488cc', '#463870', '#0e0818'],
  foe: ['#fff0fa', '#f090c8', '#8030a8', '#1c0830'],
  ui: ['#f8f8f0', '#a8c8f0', '#3050a8', '#101828'],
};

/** Which palette a tile or sprite gets, by its name. The first rule that matches wins; see HOW TO EDIT. */
export const RULES: [RegExp, PaletteId][] = [
  // Ledges, cliffs and the mouth of the cave: brown earth in the green grass.
  [/^(ledge-|cliff|cavemouth)/, 'earth'],
  // The dark of a cave and everything in it.
  [/^shade-|^cave|^rubble|^stalagmite|^crack|^plate|^hole|^scratches|^notice/, 'cave'],
  // A rock or a boulder: grey stone, drawn see-through on whatever ground its cell has.
  [/^(rock|boulder)$/, 'stone'],
  [/^(brazier|star|chest|sparkle|spark)/, 'gold'],
  [/^mug/, 'wood'],
  [/^(ice|water|lily|duck|reeds|stones|jetty|float|fountain|well)/, 'water'],
  [/^fence/, 'fence'],
  [/^(flowers|flowerbed)/, 'flower'],
  [/^(grass|tallgrass|rustle|tree|pine|bush|hedge|plant)/, 'grass'],
  [/^(shore|path)$/, 'sand'],
  [/^(roof|awning|canopy|shingle|slate|tin|flag|torii|mailbox)/, 'roof'],
  [/^(computer|server|cooler|coffee|crt|arcade|solder|telescope|kanji|flask|globe|lever|gate|lamp)/, 'tech'],
  [/^(planks|wood|desk|table|chair|sofa|workbench|crate|barrel|counter|bench|stall|bridge|rug|carpet|checker|floor|ladder|sign|mat|bookshelf|cupshelf|door-wood|plaque-workshop)/, 'wood'],
  [/^(wall|pane|door|brick|glass|column|stone|plaque|iwall|wallpane|poster|blackboard|clock|pegboard|whiteboard|void|cobble)/, 'stone'],
  // The people and the animals: skin, hair, clothes.
  [/^(player|trainer|teacher|dev|maker|librarian|wesley|kid|elder|postman|gardener|barista|angler|dog|cat|bunny)/, 'people'],
  [/^boss$/, 'foe'],
];

/** The rule's palette for a name, or undefined when no rule matches (a test keeps that from happening). */
export function ruleOf(name: string): PaletteId | undefined {
  const rule = RULES.find(([pattern]) => pattern.test(name));
  if (rule) return rule[1];
  // The enemies of the battles: every big picture on the sprite sheet but the trainer.
  const at = (sprites as Record<string, readonly number[]>)[name];
  return at && at[2] === 32 ? 'foe' : undefined;
}

/** The palette a tile or sprite is drawn in, in colour mode. */
export const paletteOf = (name: string): PaletteId => ruleOf(name) ?? 'ui';

/** Every name on the sheets: what the rules must cover. */
export const SHEET_NAMES = [...Object.keys(tiles), ...Object.keys(sprites)];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Recolours the pixels of a sheet in place: every pixel in one of the four shades of `from` gets the colour at the
 * same place in `to`. See-through pixels and any other colour stay as they are.
 */
export function recolour(data: Uint8ClampedArray, to: Palette, from: readonly string[] = PALETTE): void {
  const sources = from.map(rgb);
  const targets = to.map(rgb);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const shade = sources.findIndex(([r, g, b]) => data[i] === r && data[i + 1] === g && data[i + 2] === b);
    if (shade < 0) continue;
    const [r, g, b] = targets[shade]!;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** The relative luminance of a colour (WCAG), 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours (WCAG): 1 to 21. */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
