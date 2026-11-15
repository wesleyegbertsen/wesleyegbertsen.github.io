import type { TileDef } from '../engine/types.ts';

/**
 * The maps, drawn as text. HOW TO EDIT
 *
 * - One character is one cell (16x16 pixels). Every row of a map must be equally long.
 * - The characters in LEGEND below are ground and scenery. `solid` ones cannot be walked on.
 * - Every other character is a thing (a door, a person, a sign, a chest) and must appear exactly once on its map.
 *   What it is and what it says is in story.ts, under the same map and character.
 * - The digits 1, 2, 3... in a building are the people who tell the facts from src/data: the first school, job,
 *   project or skill group goes to 1, the next to 2. A digit that has nobody left to tell about is simply empty.
 * - The screen shows 10 x 9 cells, so a room of that size needs no scrolling.
 * - A typo (an unknown character, a ragged row) fails `npm test` with a message naming the map and the place.
 */
export const LEGEND: Record<string, TileDef> = {
  // Outdoors
  '.': { sprite: 'grass', solid: false },
  ',': { sprite: 'flowers', solid: false },
  '"': { sprite: 'tallgrass', solid: false, grass: true }, // wild BUGs live here
  '=': { sprite: 'path', solid: false },
  T: { sprite: 'tree', solid: true },
  '~': { sprite: 'water', solid: true },
  R: { sprite: 'roof', solid: true },
  W: { sprite: 'wall', solid: true },
  w: { sprite: 'pane', solid: true }, // a wall with glass in it
  // Indoors
  _: { sprite: 'floor', solid: false },
  X: { sprite: 'iwall', solid: true },
  b: { sprite: 'bookshelf', solid: true },
  t: { sprite: 'desk', under: 'floor', solid: true },
  c: { sprite: 'computer', under: 'floor', solid: true },
  y: { sprite: 'plant', under: 'floor', solid: true },
};

/** The town. A O S L P are the doors of the Academy, Office, workShop, Library and contact office (Post). */
export const TOWN = [
  'TTTTTTTTTTTTTTTTTTTTTT',
  'T...,...RRRR......"""T',
  'T.RRRR..RRRR.RRRR.""CT',
  'T.RRRR.pWPWw.RRRR."""T',
  'T.WAWwa..=..oWOWw....T',
  'T..=.....=....=......T',
  'T..============...,..T',
  'T.,.......=..........T',
  'T.........=k...~~~~..T',
  'T.........=....~~~~.,T',
  'T.RRRR....=..........T',
  'T.RRRR....=...RRRR...T',
  'T.WSWws...=...RRRR...T',
  'T..=......=..lWLWw...T',
  'T..=============.....T',
  'T.,.......=......,...T',
  'T.........@..........T',
  'TTTTTTTTTTTTTTTTTTTTTT',
];

/** Education. 1-3 teachers (one per school), E the examiner, k coffee, m the way out. */
export const ACADEMY = [
  'XXXXXXXXXX',
  'XbbbbbbbbX',
  'X________X',
  'X_1_2_3__X',
  'X________X',
  'Xt_t___EkX',
  'X________X',
  'XXXXmXXXXX',
];

/** Experience. 1-6 colleagues (one per employer), D the server room door, B the boss, k coffee. */
export const OFFICE = [
  'XXXXXXXXXXXX',
  'Xcc__B___ccX',
  'X__________X',
  'XXXXXDXXXXXX',
  'X__________X',
  'X1c_2c_3c_kX',
  'X__________X',
  'X4c_5c_6c_yX',
  'X__________X',
  'XXXXXmXXXXXX',
];

/** Projects. 1-2 makers (one per project), L the cat, C a chest, B the boss, k coffee. */
export const WORKSHOP = [
  'XXXXXXXXXX',
  'Xcc_tt_bbX',
  'X________X',
  'X_1__2_C_X',
  'X________X',
  'X_L___B_kX',
  'X________X',
  'XXXXmXXXXX',
];

/** Skills. 1-4 librarians (the skills are spread over them), B the boss, k coffee. */
export const LIBRARY = [
  'XXXXXXXXXX',
  'XbbbbbbbbX',
  'X________X',
  'X_1_2_3_4X',
  'X________X',
  'Xy_____BkX',
  'X________X',
  'XXXXmXXXXX',
];

/** Contact. H is the host. */
export const CONTACT = [
  'XXXXXXXX',
  'Xb_cc_yX',
  'X______X',
  'X__Ht__X',
  'X______X',
  'X______X',
  'XXXmXXXX',
];
