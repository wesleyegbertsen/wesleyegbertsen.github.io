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
 * - The CAFE in town is where energy and moves are restored and where a defeat in town brings the player back
 *   to; it has a shop. The town has no coffee machine of its own any more. The machines (k) inside the buildings,
 *   on the two routes, in Hobby Hills and in the cave stay: they are the places to rest away from the cafe.
 * - Lamp posts (i, I) stand beside a road, at even distances: a test fails for a lamp that does not touch a road.
 * - `(` and `)` on the edge of an outdoor map are the ways out to the west and to the east.
 * - Tall grass (and the rubble in the cave) is where wild enemies live. Who lives there is in AREAS in battles.ts.
 * - The two roads out of town are routes: the way OUT crosses bands of tall grass, the way BACK hops down ledges
 *   and stays dry. A ledge (`$` is hopped going left, `}` going right) is a wall from every other side, and the
 *   cells in front of and behind it must be free. Each line of ledges blocks the road for whoever walks out, so
 *   beside it there must be a band of tall grass to walk round it; close every other gap with trees, bushes or
 *   rocks. Tests fail when the way out can be walked dry, when the way back cannot, or when a cell of a route has
 *   no way to both ends.
 * - The cave has two floors. The ladder down from the first is hidden on purpose, behind a cracked wall that
 *   opens when it is looked at (see CAVE_MAP): no sign points to it, one person in the cave gives a hint. The
 *   floor below (DEEP_MAP) holds three puzzles in a row, then the boss and the prize. Its rules are at DEEP_MAP.
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
  y: { sprite: 'boulder', under: 'shore', solid: true }, // a rock in the sand
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
  // The Cafe: brick under a flat roof (Z), a striped canopy over the windows (G) and the door
  '/': { sprite: 'canopy', solid: true },
  '`': { sprite: 'plaque-cafe', solid: true },
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
    // The cafe: the big machine behind the counter and the cups on the wall
    e: on('coffee'),
    u: { sprite: 'cupshelf', solid: true },
  };
}

/**
 * The legend of the cave: rock, a floor, and rubble where the wild things hide. The lower half is for the puzzles
 * of the deep cave.
 */
export const CAVE: Record<string, TileDef> = {
  _: { sprite: 'cavefloor', solid: false },
  ',': { sprite: 'rubble', solid: false, grass: true },
  X: { sprite: 'cavewall', solid: true },
  // `name` is what the status region calls a tile that stops a slide ("...and stop against a rock."); without one it is "the wall".
  s: { sprite: 'stalagmite', under: 'cavefloor', solid: true, name: 'a rock' },
  // A doorway: it looks like floor, but a boulder cannot be pushed onto it, so the way in and out stays free.
  '=': { sprite: 'cavefloor', solid: false, road: true },
  // A pressure plate: a boulder is pushed onto it.
  o: { sprite: 'plate', solid: false, plate: true },
  // Slick rock: whoever steps onto it slides on until something stops them.
  '~': { sprite: 'ice', solid: false, slide: true },
  // A fire bowl: it stands in the way, and lights the cells around it (2 cells fully, then it fades) in the dark.
  t: { sprite: 'brazier', under: 'cavefloor', solid: true, animated: true, light: 2, name: 'a fire bowl' },
  // The same two standing on slick rock: they are what stops a slide.
  '^': { sprite: 'stalagmite', under: 'ice', solid: true, name: 'a rock' },
  '*': { sprite: 'brazier', under: 'ice', solid: true, animated: true, light: 2, name: 'a fire bowl' },
};

/**
 * The town. A O S L P are the doors of the Academy, Office, workShop, Library and contact office (Post); the same
 * letters in lower case are their signs. X is the door of the Cafe (south of the main road, by the pond) and b
 * its sign. C is a chest, F the fountain, e the well.
 * People: B the postman, < the market vendor, ? the star collector, and the ones who stroll: H a kid, E an elder,
 * D a dog, m the gardener. ( and ) in the main road are the ways out of town: west to the mountain, east to
 * Hobby Hills. The duck pond has a sandy shore (+) all round but for one cell, where it runs into the stream, and reeds (*); its
 * signpost (9) stands by the main road between two lamps, and the bench (n) east of it.
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
  'T..,i.....i..,.=i.....i..9..i..T',
  'T.jjjjjj.x..M<.=.ZZZZ+++++++++.T',
  'T4jjjjjj.zx....=,////+*~^~~~~+2T',
  'T.v>KSv>s..i,..=bG`XG+~~~~d~~+nT',
  'T....===============.+~~~~~^*+.T',
  'T..,...........=.,...+++~+++++.T',
  'T~~~~^~~~~~~~~~|~~~~~~^~~~r....T',
  'Y..Y...u......i=7..,....Y...,..T',
  'T""""..e...Y...=.,.E..hhhhhhhh.Y',
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
 * Hobby Hills: a ring road with ten stops, one per hobby, around a pond. Every stop is on the ring road or a few
 * steps from it or from a path (a test checks), so walking the ring once finds them all.
 *
 * The stops: 1 the telescope, 2 the arcade cabinet, 3 the torii gate (north of the ring); 4 the cat, 6 the rabbit
 * in its pen, 5 the old console, 7 the soldering bench, 8 the kanji board (inside it); 9 the home server, 0 the
 * flask (south of it).
 * The pond: a sandy shore (+) all round, reeds (*), a jetty (_) with E, who fishes, at its end, and a stream that
 * runs east under the road (|); t are stepping stones across it. Paths lead from the ring to the pond on three sides.
 * Scenery: two cottages (doors a and b, on the ring road) and a shed (door S) nobody is home in, each under a roof
 * of two rows; a sand garden with a rock by the kanji board (y is a rock in the sand), flower beds, fences, benches.
 * People: ? keeps the stamp rally, P plays the arcade, B looks after the gate; H a kid, D a dog and m a second cat
 * stroll (keep their ranges apart, and never the only way to a stop). s is the signpost at the entrance, p and o the
 * ones that say where the stops are, k a coffee machine. ( leads back to the road.
 */
export const HILLS = [
  'TYTTYTTTYTTYTTTTYTTYTTTYTTYTTT',
  'T,,..Y.,RRR.,..,Y.RRR.;.,.;.YT',
  'T.#1#.u.RRR.P#2#..RRRB;#3#;..T',
  'T.i##..,Wawn.###i.wbW,.###.i.T',
  'T.==========================.T',
  'T,=p,..T..,..n=..,....#5#.Y=,T',
  'T.=..4,..+++++++++++..###..=.T',
  'T.=,....u+*~~^~~~~*+.,..H..=,T',
  'T,=.fff..+~~~~~~d~~+..,,..u=.T',
  'T.=.f6...+~^~~~~~~~t~~~t~~~|~~',
  'T.=.fff.,+*~~~E~~^~+..,.+++=,T',
  '(========+**~~_~~~*+....+y+=.T',
  'T,=s.,jjj+++++++++++.n..+++=.T',
  'T.=...jjj.,..?=.;;..,..,...=,T',
  'T,=#7#vS>..D..=...m...#8#,.=.T',
  'T.=###.=.,.,..=.,.,.T.###n.=.T',
  'T.=.,..=.;;,..=.;;.,...=..o=,T',
  'T.==========================.T',
  'T,i..#..,i..,..#i..,...i..,..T',
  'T.,.#9#...Y..,#0#..u..k.,.fffT',
  'T.,,..Y..,..,,...Y..,,..Y.,..T',
  'TYTTTYTTYTTTTYTTTYTTYTTTYTTTYT',
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
 * chests, n someone who lost the way. The commas are rubble: wild things hide there.
 *
 * L is the ladder down to the deep cave, and it is meant to be hard to find: it is behind a wall. w, in the east
 * wall of the chest room in the north-west (the furthest dead end from the mouth), is rock with a crack in it:
 * it looks almost like the rock around it, and whoever looks at it (A) leans on it and it gives way, for good.
 * x and y are the rock behind it, which falls away with it (they are drawn as plain rock until then). Behind
 * those three a short tunnel leads to the ladder. No sign points to it; the one who is lost (n) gives a hint.
 * d is a bricked-up doorway at the end of the short tunnel that goes up from the middle room: that is where the
 * last chamber used to be. The ladder is right behind that wall, and there is no way through.
 *
 * Keep the tunnel out of sight: no cell of it (the cells of w, x and y aside) may be within three and a half
 * cells of any cell that can be stood on while the wall is shut, or the light shows floor behind the rock. A test
 * checks it from every cell (regions.test.ts, "cannot be seen before the wall is open").
 */
export const CAVE_MAP = [
  'XXXXXXXXXXXXXXXXXXXXXXXX',
  'XXF___wxy_,__XXXXXXbXXXX',
  'XX____XXXXXXLXXXX____EXX',
  'XXX_XXXXXXXXXXXXXs____XX',
  'XXX,XXXXXXdXXXXXXXX_XXXX',
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

/**
 * The deep cave, below the first floor, dark too. Three puzzles in a row, then the boss. No rubble: nothing
 * jumps out down here, so a puzzle is never interrupted.
 *
 * u (top left) is the ladder back up; you arrive below it. k and j are coffee machines: one where you arrive,
 * one in front of the last door.
 *
 * 1. THE BOULDERS (top right). 1 and 2 are boulders, o the pressure plates, t a fire bowl, s a rock. Walk into a
 *    boulder to push it a cell on. When a boulder stands on each plate, the gate g opens for good and the
 *    boulders stay where they are. r is the lever that puts them back (so does climbing the ladder and coming
 *    down again). = is a doorway: a boulder cannot be pushed onto it. n is a note that explains it.
 * 2. THE SLICK ROCK (bottom right). ~ is slick rock: one step and you slide on until a rock (^), a fire bowl (*)
 *    or the wall stops you. You come in at the top right and must get out on the left. i is a note that says
 *    what a slide is, v one that says in words where everything on the floor is (the game writes it from this
 *    map: slickInWords in story.ts). A slide tells the status region which way it went, how far and what
 *    stopped it; what a tile is called there is its `name` in the CAVE legend.
 *    The two rows of solid rock above it keep this floor's rooms off each other's screen.
 * 3. THE PIPELINE (bottom, middle). P, A and C are three terminals in the rock: git push, git add, git commit.
 *    They must be used in the right order (add, commit, push); a wrong one puts all of them out again. h is the
 *    note with the riddle. Then the gate G opens for good.
 *
 * D is the door to the last chamber (walk down into it; level 5 and up), B the boss, c the prize, L a ladder out.
 *
 * After a change run `npm test`: for every puzzle a search plays the game itself, press by press, and fails when
 * the puzzle can no longer be solved or when there is a state it cannot be solved from any more (puzzles.test.ts).
 * PUZZLES in story.ts says where each puzzle starts and what solves it.
 */
export const DEEP_MAP = [
  'XXXXXXXXXXXXnXXXXXXXXXXX',
  'XXuXXXXXXX________XXXXXX',
  'X___kXXXrX_1_t__o_XXXXXX',
  'X_______===___2___g_XXXX',
  'X____XXXXX_s___o__X_XXXX',
  'XXXXXXXXXX________X_XXXX',
  'XXXXXXXXXXXXXXXXXXX_XXXX',
  'XXXXXXXXXXXXXXXXXXX_XXXX',
  'XXXXXXXXXXXXXXXXXXX_XXXX',
  'XXXXXXXXXXXXXXXXXXv_iXXX',
  'XXXXXXPhAXCXX~~~~~~~~XXX',
  'XXXXXX_____XX~~~~~~~^XXX',
  'XXXXXX__t__XX^~~~~~~~XXX',
  'Xj___G_______~~~~~*~~XXX',
  'XXDXXX_____XX~*^~~~~~XXX',
  'XX_XXX_____XX~~~~~~^~XXX',
  'XXBXXXXXXXXXXXXXXXXXXXXX',
  'Xc_LXXXXXXXXXXXXXXXXXXXX',
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

/**
 * The Cafe. B is the barista (restores energy and moves; a defeat in town wakes the player up in front of her),
 * V the shopkeeper (opens the shop), both in the counter. 1 is a regular at a table. e is the big coffee machine
 * and u the cups, behind the counter where nobody but the staff gets.
 */
export const CAFE = [
  'XXQuuXOXWX',
  'Xe__x__zyX',
  'XnnBnnVnnX',
  'X________X',
  'X_oh__ho_X',
  'X________X',
  'Xs_1o___yX',
  'X__===___X',
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
  // The deep cave: its three puzzle rooms, and behind the heavy door the boss, the prize and the ladder.
  deep: [
    { name: 'Boulder Hall', x: 10, y: 1, w: 8, h: 5, holds: '1' },
    { name: 'Slick Rock', x: 13, y: 9, w: 8, h: 7, holds: 'i' },
    { name: 'Pipeline Room', x: 6, y: 10, w: 5, h: 6, holds: 'A' },
    { name: 'Incident Room', x: 1, y: 15, w: 3, h: 3, holds: 'B' },
  ],
};
