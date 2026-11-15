import type { TileDef } from '../engine/types.ts';

/**
 * The maps, drawn as text. HOW TO EDIT
 *
 * - One character is one cell (16x16 pixels). Every row of a map must be equally long.
 * - The characters in the legends below are ground and scenery: OUTDOORS for the town, `indoors()` for the rooms.
 *   `solid` ones cannot be walked on. `road` ones are kept free: the townsfolk who stroll never step on them, so
 *   the way from door to door is never blocked. Every door must have a road cell in front of it (a test checks).
 *   `animated` ones have a second picture (`<name>-b` in scripts/sprites/scenery.mjs) and move.
 * - Every other character is a thing (a door, a person, a sign, a chest, a star) and must appear exactly once on
 *   its map. What it is and what it says is in story.ts, under the same map and character.
 * - The digits 1, 2, 3... in a building are the people who tell the facts from src/data: the first school, job,
 *   project or skill group goes to 1, the next to 2. A digit that has nobody left to tell about is simply empty.
 *   In town the digits 1-6 are hidden gold stars and 0, 7, 8, 9 are signposts.
 * - The screen shows 10 x 9 cells, so a room of that size needs no scrolling.
 * - A typo (an unknown character, a ragged row) fails `npm test` with a message naming the map and the place.
 */
export const OUTDOORS: Record<string, TileDef> = {
  // Ground
  '.': { sprite: 'grass', solid: false },
  ',': { sprite: 'flowers', solid: false, animated: true },
  '"': { sprite: 'tallgrass', solid: false, grass: true }, // wild BUGs live here
  '=': { sprite: 'path', solid: false, road: true },
  '#': { sprite: 'cobble', solid: false }, // a plaza: people stroll here
  ':': { sprite: 'cobble', solid: false, road: true }, // the way across a plaza
  '|': { sprite: 'bridge', solid: false, road: true },
  // Green
  T: { sprite: 'tree', solid: true },
  Y: { sprite: 'pine', solid: true },
  u: { sprite: 'bush', solid: true },
  h: { sprite: 'hedge', solid: true },
  r: { sprite: 'rock', solid: true },
  ';': { sprite: 'flowerbed', solid: true, animated: true },
  f: { sprite: 'fence', solid: true },
  // Water
  '~': { sprite: 'water', solid: true, animated: true },
  '^': { sprite: 'lily', solid: true, animated: true },
  d: { sprite: 'duck', solid: true, animated: true },
  // Street furniture (the capital stands on the plaza)
  i: { sprite: 'lamp', under: 'grass', solid: true, animated: true },
  I: { sprite: 'lamp', under: 'cobble', solid: true, animated: true },
  n: { sprite: 'bench', under: 'grass', solid: true },
  N: { sprite: 'bench', under: 'cobble', solid: true },
  M: { sprite: 'stall', under: 'cobble', solid: true },
  x: { sprite: 'crate', under: 'grass', solid: true },
  z: { sprite: 'barrel', under: 'grass', solid: true },
  q: { sprite: 'mailbox', under: 'grass', solid: true },
  g: { sprite: 'flag', under: 'grass', solid: true, animated: true },
  // The Academy and the contact office: light walls, tiled roofs
  R: { sprite: 'roof', solid: true },
  V: { sprite: 'roof-bell', solid: true },
  '-': { sprite: 'awning', solid: true },
  W: { sprite: 'wall', solid: true },
  w: { sprite: 'pane', solid: true }, // a wall with glass in it
  J: { sprite: 'plaque-academy', solid: true },
  '&': { sprite: 'plaque-contact', solid: true },
  // The Office: brick, a flat slate roof, two floors of windows
  Z: { sprite: 'slate', solid: true },
  Q: { sprite: 'brick', solid: true },
  G: { sprite: 'glass', under: 'brick', solid: true },
  U: { sprite: 'plaque-office', solid: true },
  // The Workshop: planks and a tin roof
  j: { sprite: 'tin', solid: true },
  v: { sprite: 'planks', solid: true },
  '>': { sprite: 'glass', under: 'planks', solid: true },
  K: { sprite: 'plaque-workshop', solid: true },
  // The Library: stone, columns and shingles
  '{': { sprite: 'shingle', solid: true },
  ']': { sprite: 'column', solid: true },
  '[': { sprite: 'glass', under: 'stone', solid: true },
  '%': { sprite: 'plaque-library', solid: true },
};

/** The legend of a room. Every room has its own floor; the furniture stands on it. */
export function indoors(floor: string): Record<string, TileDef> {
  const on = (sprite: string, animated?: boolean): TileDef => ({ sprite, under: floor, solid: true, animated });
  return {
    _: { sprite: floor, solid: false },
    '=': { sprite: 'rug', solid: false },
    // Walls and what hangs on them
    X: { sprite: 'iwall', solid: true },
    W: { sprite: 'window-in', solid: true },
    P: { sprite: 'poster', solid: true },
    Q: { sprite: 'blackboard', solid: true },
    O: { sprite: 'clock', solid: true },
    G: { sprite: 'pegboard', solid: true },
    U: { sprite: 'whiteboard', solid: true },
    b: { sprite: 'bookshelf', solid: true },
    // Furniture
    t: on('desk'),
    c: on('computer'),
    y: on('plant'),
    o: on('table'),
    h: on('chair'),
    s: on('sofa'),
    w: on('workbench'),
    v: on('cooler'),
    g: on('globe'),
    n: on('counter'),
    x: on('crate'),
    z: on('barrel'),
    S: on('server', true),
  };
}

/**
 * The town. A O S L P are the doors of the Academy, Office, workShop, Library and contact office (Post); the same
 * letters in lower case are their signs. k is the coffee machine, C a chest, F the fountain, e the well.
 * People: B the postman, < the market vendor, ? the star collector, and the ones who stroll: H a kid, E an elder,
 * D a dog, m the gardener.
 */
export const TOWN = [
  'TYTTYTTTYTTYTTTTYTTYTTTYTTYTTT',
  'T1RRVRRR.g..RRRRRR...ZZZZZZ""T',
  'T.RRRRRR.,..------.i.GQGGQG"CT',
  'T.wWJAWwa,.pw&WPWwq.oGQUOQG""T',
  'T.n.;=;....####:###B.I##:##""T',
  'T.H..=..ff.##F#:##M<..##:##""T',
  'T.,..=....8N###:#E#N.,..=..u.T',
  'T.==========================.T',
  'T..,.......i.,.=...k..u...,..T',
  'T.jjjjjj.x..;;.=.u...~~~~~.Y.T',
  'T4jjjjjj.zx..u.=,...~~^~d~~.2T',
  'T.v>KSv>s...,..=...9~~~~~^~n.T',
  'T....===========7....~~~~~...T',
  'T~~~~^~~~~~~~~~|~~~~^~~~r....T',
  'Y..Y...u....i..=...,..Y...,..T',
  'T""""..e...Y...=.,..hhhhhhhh.Y',
  'T"""""....n....=..u.h{{{{{{h6T',
  'T""3""..,..D...=....;{{{{{{;.T',
  'Y"""""..r....Y.=.Y..l][%L[];.T',
  'T.""""........,==========....Y',
  'T..""...ffff...=..m.n..i..u..T',
  'T.......;;;;.?.=0........,...T',
  'T...,....,.....@.....Y......5T',
  'TTYTTTYTTYTTTTYTTTYTTYTTTTYTTT',
];

/** Education: a classroom. 1-3 teachers (one per school), E the examiner, k coffee, * a star, m the way out. */
export const ACADEMY = [
  'XXQQXOXWPX',
  'Xb_____*gX',
  'X_1_2_3__X',
  'X________X',
  'Xt_t_t_EkX',
  'Xh_h_h___X',
  'X________X',
  'Xy______yX',
  'XXXXmXXXXX',
];

/**
 * Experience. 1-6 colleagues (one per employer), J a developer who is stuck, D the server room door, B the boss
 * among the server racks, k coffee, * a star.
 */
export const OFFICE = [
  'XXXXXXXXXXXX',
  'XSS__B__SS*X',
  'X__________X',
  'XUXXXDXXWXPX',
  'X_______v__X',
  'X1c_2c_3c_kX',
  'X_________JX',
  'X4c_5c_6c_yX',
  'Xs_________X',
  'XXXXXmXXXXXX',
];

/** Projects. 1-2 makers (one per project), L the cat, C a chest, B the boss, k coffee, * a star. */
export const WORKSHOP = [
  'XGGXWXGXPX',
  'Xww_cc_bbX',
  'X________X',
  'X_1__2_C_X',
  'X________X',
  'X_L_o_B_kX',
  'Xx______zX',
  'Xxx____*zX',
  'XXXXmXXXXX',
];

/** Skills. 1-4 librarians (the skills are spread over them), R the head librarian, B the boss, k coffee, * a star. */
export const LIBRARY = [
  'XXWXXOXWXX',
  'XbbbbbbbbX',
  'X________X',
  'X_1_2_3_4X',
  'X________X',
  'Xb_oh__b*X',
  'Xy_____BkX',
  'Xs_R_____X',
  'XXXXmXXXXX',
];

/** Contact. H is the host, behind the counter. */
export const CONTACT = [
  'XWXPXOWX',
  'Xb_cc_yX',
  'X______X',
  'XnnHnn_X',
  'X______X',
  'Xy_==_sX',
  'XXXmXXXX',
];
