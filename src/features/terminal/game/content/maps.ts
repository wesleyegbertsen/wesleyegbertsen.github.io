import type { TileDef } from '../engine/types.ts';

/**
 * The maps, drawn as text. HOW TO EDIT
 *
 * - One character is one cell (16x16 pixels). Every row of a map must be equally long.
 * - The characters in the legends below are ground and scenery: OUTDOORS for the town, the routes and the hills,
 *   `indoors()` for the rooms, CAVE for the cave.
 *   `solid` ones cannot be walked on. `road` ones are kept free: the townsfolk who stroll never step on them, so
 *   the way from door to door is never blocked. Every door of the town must have a road cell in front of it (a test checks).
 *   `animated` ones have a second picture (`<name>-b` in scripts/sprites/scenery.mjs) and move.
 * - Every other character is a thing (a door, a person, a sign, a chest, a star) and must appear exactly once on
 *   its map. What it is and what it says is in story.ts, under the same map and character.
 * - The digits 1, 2, 3... in a building are the people who tell the facts from src/data: the first school, job,
 *   project or skill group goes to 1, the next to 2. A digit that has nobody left to tell about is simply empty.
 *   In town the digits 1-6 are hidden gold stars and 0, 7, 8, 9 are signposts. In Hobby Hills the digits are the
 *   ten hobby stops.
 * - Lamp posts (i, I) stand beside a road, at even distances: a test fails for a lamp that does not touch a road.
 * - `(` and `)` on the edge of an outdoor map are the ways out to the west and to the east.
 * - Tall grass (and the rubble in the cave) is where wild enemies live. Who lives there is in AREAS in battles.ts.
 * - The two roads out of town are routes: the way OUT crosses bands of tall grass, the way BACK hops down ledges
 *   and stays dry. A ledge (`$` is hopped going left, `}` going right) is a wall from every other side, and the
 *   cells in front of and behind it must be free. Each line of ledges blocks the road for whoever walks out, so
 *   beside it there must be a band of tall grass to walk round it; close every other gap with trees, bushes or
 *   rocks. Tests fail when the way out can be walked dry, when the way back cannot, or when a cell of a route has
 *   no way to both ends.
 * - The screen shows 10 x 9 cells, so a room of that size needs no scrolling.
 * - A typo (an unknown character, a ragged row) fails `npm test` with a message naming the map and the place.
 * - The name of a map (in story.ts, `name`) is shown on a label at the top of the screen when the player walks
 *   in. REGIONS at the bottom of this file gives parts of a map a name of their own, shown the same way.
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
  '*': { sprite: 'reeds', solid: true, animated: true }, // at the edge of a pond, in the water
  _: { sprite: 'jetty', solid: false, animated: true }, // planks out into the water: walk on it from the shore, north or south
  t: { sprite: 'stones', solid: false, animated: true }, // a stepping stone: a way across the water
  // Street furniture (the capital stands on the plaza)
  i: { sprite: 'lamp', under: 'grass', solid: true },
  I: { sprite: 'lamp', under: 'cobble', solid: true },
  n: { sprite: 'bench', under: 'grass', solid: true },
  N: { sprite: 'bench', under: 'cobble', solid: true },
  M: { sprite: 'stall', under: 'grass', solid: true },
  // The mountain
  c: { sprite: 'cliff', solid: true },
  x: { sprite: 'crate', under: 'grass', solid: true },
  z: { sprite: 'barrel', under: 'grass', solid: true },
  q: { sprite: 'mailbox', under: 'grass', solid: true },
  g: { sprite: 'flag', under: 'grass', solid: true, animated: true },
  '!': { sprite: 'flag', under: 'cobble', solid: true, animated: true }, // on the plaza
  '+': { sprite: 'shore', solid: false }, // the sandy rim of a pond: you can walk on it, the water is what stops you
  // Ledges: a step in the ground that is hopped over one way only, two cells in one move.
  $: { sprite: 'ledge-left', solid: true, ledge: 'left' }, // hopped going left (west): the way back on the East Road
  '}': { sprite: 'ledge-right', solid: true, ledge: 'right' }, // hopped going right (east): the way back on the West Road
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
    W: { sprite: 'wallpane', solid: true },
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

/** The legend of the cave: rock, a floor, and rubble where the wild things hide. */
export const CAVE: Record<string, TileDef> = {
  _: { sprite: 'cavefloor', solid: false },
  ',': { sprite: 'rubble', solid: false, grass: true },
  X: { sprite: 'cavewall', solid: true },
  s: { sprite: 'stalagmite', solid: true },
};

/**
 * The town. A O S L P are the doors of the Academy, Office, workShop, Library and contact office (Post); the same
 * letters in lower case are their signs. k is the coffee machine, C a chest, F the fountain, e the well.
 * People: B the postman, < the market vendor, ? the star collector, and the ones who stroll: H a kid, E an elder,
 * D a dog, m the gardener. ( and ) in the main road are the ways out of town: west to the mountain, east to
 * Hobby Hills. The duck pond has a sandy shore (+) where there is room beside the lamps and the sign, and reeds (*).
 */
export const TOWN = [
  'TYTTYTTTYTTYTTTTYTTYTYTTTYTTYTTT',
  'T1RRVRRR....RRRRRR.....ZZZZZZ""T',
  'T.RRRRRR....------.....GQGGQG"CT',
  'T.wWJAWwa..pw&WPWwq...oGQUOQG""T',
  'T.n.;=;....####:##B#....##:##""T',
  'T.H..=..fff#F##:####f...##:##""T',
  'T.,..=....8####:##!#f..,..=..u.T',
  '(==============================)',
  'T..,i.....i..,.=i..k..i+u+++i..T',
  'T.jjjjjj.x..M<.=.u....+~~~~~++.T',
  'T4jjjjjj.zx....=,.E..+~~^~d~~+2T',
  'T.v>KSv>s..i,..=.....9*~~~~^~n.T',
  'T....===========7.....+~~~~~++.T',
  'T~~~~^~~~~~~~~~|~~~~~~^~~~r....T',
  'Y..Y...u......i=...,....Y...,..T',
  'T""""..e...Y...=.,....hhhhhhhh.Y',
  'T"""""....n....=..u...h{{{{{{h6T',
  'T""3""..,..D...=......;{{{{{{;.T',
  'Y"""""..r....Y.=.Y....l][%L[];.T',
  'T.""""........,============....Y',
  'T..""...ffff...=i.m...n..i..u..T',
  'T.......;;;;.?.=0.;;.......,...T',
  'T...,....,.....@.......Y......5T',
  'TTYTTTYTTYTTTTYTTTYTTYTYTTTTYTTT',
];

/**
 * The road east, to Hobby Hills. ( leads back to town, ) on to the hills. s is a signpost, k a coffee machine,
 * C a chest in the tall grass. Walking out, each line of ledges ($) blocks the road: go round it through the band
 * of tall grass (south of the first, north of the second). Walking back, hop down the ledges. The coffee machine
 * stands in the first line, so it can be used from both sides.
 */
export const EAST = [
  'TYTTYTTTYTTYTTTTYTTYTTTYTT',
  'T."""".YTT.,...""""C""".YT',
  'T.""""".rT...."""""""""..T',
  'T.,""...uT..,.....uuu..,.T',
  'T....s.i.k...i.....$.i...T',
  '(========$=========$=====)',
  'T..i.....$..i...i..$...i.T',
  'T..,....uru......,.T....nT',
  'T....""""""""".Y...YT.,..T',
  'T.,..""""""""".....T.....T',
  'TYTTTYTTYTTTTYTTTYTTYTTTYT',
];

/**
 * Hobby Hills: a ring road around a pond with a sandy shore (+), with ten stops, one per hobby. 1 the telescope, 2 the arcade cabinet,
 * 3 the torii gate, 4 the cat, 5 the old console, 6 the rabbit in its pen, 7 the soldering bench, 8 the kanji board,
 * 9 the home server, 0 the flask. ? keeps the stamp rally, s is the signpost, k a coffee machine, m a second cat
 * who strolls. ( leads back to the road.
 */
export const HILLS = [
  'TYTTYTTTYTTYTTTTYTTYTTTYTTYT',
  'T..,....Y......,.....Y...,.T',
  'T.#1#.....#2#......#3#.....T',
  'T.i##..i..###..i...###.i...T',
  'T.========================.T',
  'T.=..,....++++++++...,...=.T',
  'T.=.4,....+*~^~~~+...#5#.=.T',
  'T.=.......+~~~~d~+.......=.T',
  'T.=..ff...+~^~_~*+...n...=.T',
  'T.=..f6...++++++++.......=.T',
  '(==.......,..?...........=.T',
  'T.=....,......s......u...=.T',
  'T.=#7#............m...#8#=.T',
  'T.=..,.......,........,..=.T',
  'T.========================.T',
  'T.i....i.......i.......i...T',
  'T..#9#......#0#......k.....T',
  'T.,......Y.........,....Y..T',
  'T...,.....Y.......,....Y...T',
  'TYTTTYTTYTTTTYTTTYTTYTTTYTTT',
];

/**
 * The road west, to the mountain (c is rock). D is the mouth of the cave, ) leads back to town. s is a signpost,
 * k a coffee machine, C a chest in the tall grass. Walking out, each line of ledges (}) blocks the road: go round
 * it through the band of tall grass (north of the first, south of the second). Walking back from the cave, hop
 * down the ledges. The coffee machine stands in the first line, so it can be used from both sides.
 */
export const WEST = [
  'ccccccTYTTYTTTYTTYTTTTYTTT',
  'ccccccccc.,.."""T""".."""T',
  'ccccccccc....""""""".."".T',
  'ccccc..,r...,..uuu...,...T',
  'cccc.i..}....i..k..s.i...T',
  'cccD====}=======}========)',
  'cccc..i.}.....i.}......i.T',
  'ccccc..uru..,...T..,.....T',
  'ccccc"""""""...YT.."""".rT',
  'cccccc""C"""....T.""""".TT',
  'ccccccTYTTTYTTYTTTTYTTTYTT',
];

/**
 * The cave, dark: rooms and tunnels that branch and meet again. m (on the right) is the way out: you come in
 * walking left. k and j are coffee machines, a is scratched into the rock and b a paper pinned to it, E F G are
 * chests, n someone who lost the way. D is the door to the last chamber (walk up to it), B the boss, C the prize,
 * L a ladder back up. The commas are rubble: wild things hide there, and every way to the door crosses some.
 */
export const CAVE_MAP = [
  'XXXXXXXXXXXXXXXXXXXXXXXX',
  'XX___FXXXXCXXXXXXXXbXXXX',
  'XX____XXXXBLXXXXX____EXX',
  'XXX_XXXXXX_XXXXXXs____XX',
  'XXX,XXXXXXDXXXXXXXX_XXXX',
  'XXX_XXXXXX_XXXXXXXX,XXXX',
  'XX__sXXXs____XXXXaX_XXXX',
  'XX___XXX_,___XXXX____kXX',
  'XX___,,_______,,______mX',
  'XX___XXX___,_XXXXs____XX',
  'XXj__XXX____sXXXXXX_XXXX',
  'XXX_XXXX,XXXXXXXXXX,XXXX',
  'XXX,XX____XXXXXXXXX_XXXX',
  'XXX_XX_,__XXXXXX______XX',
  'XXX_________,,____,___XX',
  'XXXXXXG__sXXXXXXs____nXX',
  'XXXXXXXXXXXXXXXXXXXXXXXX',
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
  'X_________vX',
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

/**
 * Parts of a map with a name of their own. HOW TO EDIT
 *
 * - Walking into one shows its name on the label at the top of the screen (and tells the status region), just
 *   like walking onto another map shows that map's name. Walking out again shows nothing: it is still the same map.
 * - A part is a rectangle of cells: `x` and `y` are its top left cell, counted from 0 (the first character of
 *   the first row is 0,0), `w` and `h` how many cells wide and high it is. `holds` is a thing that must stand
 *   inside it (a character of that map): when the map is redrawn and the rectangle is forgotten, a test says so.
 * - Keep names short: at most 24 characters fit the screen. Parts of one map must not overlap.
 */
export const REGIONS: Record<string, { name: string; x: number; y: number; w: number; h: number; holds: string }[]> = {
  // The cobbles around the fountain.
  town: [{ name: 'Fountain Plaza', x: 11, y: 4, w: 9, h: 3, holds: 'F' }],
  // Behind the heavy door: the boss, the prize and the ladder.
  cave: [{ name: 'Incident Room', x: 10, y: 1, w: 2, h: 4, holds: 'B' }],
};
