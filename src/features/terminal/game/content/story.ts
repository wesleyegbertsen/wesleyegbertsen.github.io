import type { Education } from '../../../../data/education.ts';
import type { Job } from '../../../../data/experience.ts';
import type { Project } from '../../../../data/projects.ts';
import { contactLines } from '../../content.ts';
import type { FsData } from '../../fs.ts';
import type { Action, Cond, Cue, Spot, TileDef } from '../engine/types.ts';
import type { MapSpec, ObjectSpec } from '../engine/world.ts';
import { AREAS, BADGES, CAVE_LEVEL, COLLECT, DEEP_CAVE_LEVEL, ECONOMY, ENEMIES, FINAL_BOSSES, REWARDS, SHOPS, STAMP } from './battles.ts';
import { REST_TICKS } from './music.ts';
import { ACADEMY, CAFE, CAVE, CAVE_MAP, CONTACT, DEEP_MAP, EAST, HILLS, LIBRARY, OFFICE, OUTDOORS, REGIONS, TOWN, WEST, WORKSHOP, indoors } from './maps.ts';

/**
 * Who and what is on the maps, and what they say. HOW TO EDIT
 *
 * - The facts (schools, employers, projects, skills, contact details) are read from src/data. Do not type them
 *   here: change the data module and the people in the game say the new thing.
 * - Everything else (greetings, jokes, signs, boss lines) is plain text in this file. Change it freely. A text is
 *   wrapped and split into pages by the game; each string in a `say` list starts on a new page.
 * - Only printable ASCII has a glyph in the font; accents are folded (é becomes e) and anything else shows as `?`.
 * - The helpers below (sign, person, chest, door, boss...) cover the usual things. An object is a list of
 *   branches: the first whose `when` holds runs its actions in order (say, give, take, flag, badge, heal, battle,
 *   warp, coins, shop, ending). See engine/types.ts.
 * - The CAFE in town is the place to rest: the barista restores energy and moves, and a defeat in town brings
 *   the player back to her (`respawn` in world.ts), from anywhere. CAFE_TEXT is what is said there: a draft, rewrite it. The
 *   shopkeeper opens the shop (`{ shop: 'cafe' }`); what it sells and the prices are SHOPS in battles.ts.
 *   `{ coins: 20 }` hands over money; the amounts that are handed out (errands, the stamp card, some chests, the
 *   pay after the last fight) are REWARDS in battles.ts. Nothing in the shop may be needed for the main path.
 * - The main path is the four badges and the contact office. Everything else (the townsfolk, the signposts, the
 *   gold stars, the errands, the roads east and west, Hobby Hills, the cave) is extra: a test fails when a door,
 *   a boss or the ending starts to depend on it.
 * - The `name` of a map is what the label at the top of the screen says when the player walks in, and what the
 *   status region announces. Keep it under 25 characters. Named parts of a map are REGIONS in maps.ts.
 * - The roads east and west are routes: the way out crosses tall grass, the way back hops down ledges (see
 *   maps.ts). Their signposts say so (ROUTE_BACK), and name the levels of the wild things from AREAS.
 * - HOBBIES is the text of the ten stops in Hobby Hills, in Wesley's own voice. It is a draft: rewrite it freely.
 *   A new hobby needs a line there, a digit on the HILLS map, a picture (scripts/sprites/scenery.mjs) and a name
 *   in STOP_NAMES for the signposts. HILLS_FOLK is what the people of the hills say: a draft too.
 * - The cave has a second floor, the deep cave, with three puzzles (see DEEP_MAP in maps.ts for the map and the
 *   rules). DEEP_TEXT is what is said down there: a draft, rewrite it. PUZZLES lists the puzzles for the test
 *   that solves each of them by playing: when you move a puzzle, keep its entry pointing at the right place.
 * - People with `stroll(...)` walk about. They keep off the roads, so they can never block the way to a door.
 * - After a change run `npm test`: a bot plays the whole game and fails if it can no longer be finished.
 */

/** A map as this file hands it over: the grid, the things on it, and the legend its characters are read with. */
export type BuiltMap = MapSpec & { legend: Record<string, TileDef> };

// --- helpers --------------------------------------------------------------------------------------------------

/** The wild enemies of a map, from AREAS in battles.ts. */
const wild = (area: string): MapSpec['encounters'] => {
  const { enemies, rate, levels } = AREAS[area]!;
  return { enemies, rate, levels };
};

const sign = (...text: string[]): ObjectSpec => ({
  sprite: 'sign',
  solid: true,
  trigger: 'interact',
  branches: [{ do: [{ say: text }] }],
});

const person = (sprite: string, lines: string[], under?: string): ObjectSpec => ({
  sprite,
  solid: true,
  trigger: 'interact',
  under,
  branches: [{ do: [{ say: lines }] }],
});

/**
 * Makes someone stroll: about every `every` ticks (60 a second) they may take a step, never further than
 * `radius` cells from where the map puts them. Keep their ranges apart and off the roads.
 */
const stroll = (who: ObjectSpec, radius: number, every: number): ObjectSpec => ({ ...who, wander: { radius, every } });

/** A piece of scenery you can look at: it is drawn by its sprite and says something. */
const thing = (sprite: string, lines: string[], under?: string, animated?: boolean): ObjectSpec => ({
  sprite,
  animated,
  solid: true,
  trigger: 'interact',
  under,
  branches: [{ do: [{ say: lines }] }],
});

/**
 * A hidden gold star: walk over it to pick it up, without a text box. `id` must be unique (it is the flag that
 * remembers the find). The collector in town counts them.
 */
const star = (id: string, under?: string): ObjectSpec => ({
  sprite: 'star',
  solid: false,
  trigger: 'step',
  under,
  hideWhen: { flag: `star:${id}` },
  branches: [{ pass: true, do: [{ flag: `star:${id}` }, { give: COLLECT, quiet: true }] }],
});

/** A spot on the map that is just a name (the start, an unused seat). */
const marker = (under?: string): ObjectSpec => ({ solid: false, trigger: 'interact', branches: [], under });

/**
 * A chest with an item in it. `flag` must be unique (it remembers that the chest was opened). A chest whose flag
 * is listed in REWARDS.chests (battles.ts) holds that many coins too.
 */
const chest = (flag: string, item: string, under?: string): ObjectSpec => ({
  sprite: 'chest',
  spriteWhen: { flag, sprite: 'chest-open' },
  solid: true,
  trigger: 'interact',
  under,
  branches: [{ when: { notFlag: flag }, do: [{ flag }, { give: item }, ...(REWARDS.chests[flag] ? [{ coins: REWARDS.chests[flag] }] : [])] }, { do: [{ say: ['It is empty.'] }] }],
});

/**
 * A door you walk into. With a lock it only lets you through while `when` holds, and says `deny` otherwise.
 * `sprite` is the door that fits the building's wall.
 */
const door = (to: Spot, lock?: { when: Cond; deny: string }, sprite = 'door', cue?: Cue): ObjectSpec => ({
  sprite,
  solid: true,
  trigger: 'step',
  branches: lock ? [{ when: lock.when, do: [{ warp: to, cue }] }, { do: [{ say: [lock.deny] }] }] : [{ do: [{ warp: to, cue }] }],
});

/** The edge of an outdoor map: walk off it to get to the next map. It lies on the road. */
const wayOut = (to: Spot): ObjectSpec => ({ solid: false, trigger: 'step', under: '=', branches: [{ do: [{ warp: to, cue: 'path' }] }] });

/**
 * A stop of the stamp rally in Hobby Hills: look at it to read about the hobby; the first time it also stamps the
 * card. `id` must be unique (it is the flag that remembers the stamp).
 */
const hobby = (id: string, sprite: string, lines: string[], animated?: boolean, under?: string): ObjectSpec => ({
  sprite,
  animated,
  solid: true,
  trigger: 'interact',
  under,
  branches: [
    { when: { notFlag: `hobby:${id}` }, do: [{ say: lines }, { flag: `hobby:${id}` }, { give: STAMP, quiet: true }] },
    { do: [{ say: lines }] },
  ],
});

/**
 * The ten stops of Hobby Hills: the character on the HILLS map, the picture, and what it says. Written as Wesley
 * would say it. A DRAFT: these are guesses at the details, so rewrite them.
 */
export const HOBBIES: { at: string; id: string; sprite: string; animated?: boolean; lines: string[] }[] = [
  { at: '1', id: 'astronomy', sprite: 'telescope', lines: ['A telescope, pointed at the night sky.', 'Astronomy: I can look at planets and stars for hours. It puts a bug report in perspective.'] },
  { at: '2', id: 'gaming', sprite: 'arcade', lines: ['An arcade cabinet. INSERT COIN.', 'Gaming: "one more run", I said. That was two hours ago.'] },
  { at: '3', id: 'japan', sprite: 'torii', lines: ['A small torii gate. It is quiet here.', 'Japanese culture: the food, the craft, the care for small things. It never stops fascinating me.'] },
  { at: '4', id: 'cats', sprite: 'cat', lines: ['Purr... (A cat, asleep on the warmest spot in the hills.)', 'Cats: I am a cat person. There is a cat on this website for a reason.'] },
  { at: '5', id: 'retro', sprite: 'crt', lines: ['An old console on a small TV. The pixels glow just right.', 'Retro gaming: the classics taught me that 160 by 144 pixels is plenty.'] },
  { at: '6', id: 'animals', sprite: 'bunny', lines: ['A rabbit munches on clover and looks at you.', 'Animals: I have a soft spot for all of them. Even the BUGs. Almost.'] },
  { at: '7', id: 'soldering', sprite: 'solder', lines: ['A soldering iron, still warm. It smells of flux.', 'Soldering: I like building small electronics. Software you can drop on your foot.'] },
  { at: '8', id: 'language', sprite: 'kanji', lines: ['A board full of kanji. Today: "nihon", Japan.', 'Language study: I am learning Japanese. Slowly, one character at a time.'] },
  { at: '9', id: 'homeserver', sprite: 'server', animated: true, lines: ['A home server hums in the grass. Its lights blink.', 'Home server: my own little cloud. When it breaks, I am the helpdesk.'] },
  { at: '0', id: 'science', sprite: 'flask', lines: ['A flask bubbles away. Better not drink it.', 'Science: my favourite rabbit hole. Space, physics, how things work.'] },
];

/**
 * What the signposts in Hobby Hills call each stop, by its `id` in HOBBIES. A new hobby needs a name here, and a
 * mention on one of the two signposts (`p` and `o` in the hills below): a test fails for a stop no signpost names.
 */
export const STOP_NAMES: Record<string, string> = {
  astronomy: 'TELESCOPE',
  gaming: 'ARCADE',
  japan: 'GATE',
  cats: 'CAT',
  retro: 'OLD CONSOLE',
  animals: 'RABBIT',
  soldering: 'SOLDERING BENCH',
  language: 'KANJI BOARD',
  homeserver: 'HOME SERVER',
  science: 'FLASK',
};

/** "the TELESCOPE, the ARCADE and the GATE": the stops with these ids, as a signpost lists them. */
const stops = (...ids: string[]): string => {
  const names = ids.map((id) => `the ${STOP_NAMES[id]}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
};

/**
 * The people of Hobby Hills, and the notes on the doors of the houses nobody is home in. They talk about the
 * hobbies, in a friendly voice. A DRAFT: rewrite them freely. `who` is the first name from the profile.
 */
export const HILLS_FOLK = {
  /** By the arcade cabinet. */
  gamer: (who: string) => [`My high score on that cabinet stood for a week. Then ${who} came by.`, 'I am not bitter. I am practising.'],
  /** By the flower beds at the gate. */
  keeper: (who: string) => ['I sweep around the gate every morning. A quiet place wants looking after.', `${who} says that is what to bring home from Japan: the care for small things.`],
  /** Strolls near the old console. */
  kid: () => ['That console is older than I am! The games still work. You blow on them first.'],
  /** At the end of the jetty, fishing. */
  angler: () => ['I come here to fish. I have never caught a thing.', 'That is the nice part of a hobby: it does not have to ship.'],
  /** Strolls south of the pond. */
  dog: () => ['Woof! (It has a stick. It would like you to know about the stick.)'],
  /** Strolls too. */
  cat: () => ['Mrrp. (A second cat. In these hills there is always a second cat.)'],
  /** The doors of the two cottages and of the shed. */
  cottage: () => ['Nobody answers. A note on the door: "Out stargazing. Back when it gets light."'],
  neighbour: () => ['Locked. Through the glass you can see a shelf of games, sorted by year.'],
  shed: () => ['A shed. Inside, something beeps. A note: "Do not unplug. It finally works."'],
};

/**
 * The last page of the signposts on the two roads out of town. The roads are routes now: nobody gets out without
 * a walk through the tall grass, and the ledges make the way back a dry one.
 */
export const ROUTE_BACK = 'The ledges across the road can only be hopped down on the way back: that way you stay out of the grass.';

/** The mat at the bottom of a room: step on it to go back to town, in front of that building's door. */
const exitTo = (townDoor: string): ObjectSpec => ({
  sprite: 'mat',
  solid: false,
  trigger: 'step',
  branches: [{ do: [{ warp: { map: 'town', at: townDoor, dy: 1, dir: 'down' } }] }],
});

/** Into a building: you arrive on the cell above its mat. */
const into = (map: string): Spot => ({ map, at: 'm', dy: -1, dir: 'up' });

/**
 * What is said in and about the CAFE, in a friendly voice. A DRAFT: rewrite it freely. `who` is the first name
 * from the profile.
 */
export const CAFE_TEXT = {
  /** The sign beside the door, in town. */
  sign: ['CAFE. Fresh coffee, a seat to rest in, and a small shop.', 'Lost a battle in town? This is where you wake up.'],
  /** The barista, after she has restored energy and moves. */
  barista: ['Welcome to the CAFE! Sit down for a moment. There: energy and moves are restored.', 'If a battle in town ever goes wrong, you wake up right here. I keep a seat free.'],
  /** The same, for someone without a single COFFEE: she hands one over. */
  refill: ['Welcome to the CAFE! Sit down for a moment. There: energy and moves are restored.', 'No COFFEE in your bag? Here, one to go. It is on the house.'],
  /** The shopkeeper, before the shop opens. */
  shop: [`Snacks and drinks for the road! We take ${ECONOMY.currency}: wild things drop a few, bosses drop a lot.`],
  /** A regular at a table. */
  regular: (who: string) => ['They know my order by heart here.', `${who} says the best ideas come after the second cup. I am on my fourth. Still waiting.`],
};

/**
 * The barista of the cafe, the one place to rest: restores energy and moves after the rest jingle, and never leaves
 * you dry: someone without a COFFEE gets one (the Office trades its key card for one).
 */
const barista = (): ObjectSpec => ({
  sprite: 'barista',
  solid: true,
  trigger: 'interact',
  branches: [
    { when: { noItem: 'coffee' }, do: [{ heal: true, rest: REST_TICKS }, { say: CAFE_TEXT.refill }, { give: 'coffee' }] },
    { do: [{ heal: true, rest: REST_TICKS }, { say: CAFE_TEXT.barista }] },
  ],
});

/** Someone who keeps a shop (a name in SHOPS in battles.ts): a word of welcome, then the list to buy from. */
const shopkeeper = (sprite: string, shop: keyof typeof SHOPS, lines: string[]): ObjectSpec => ({
  sprite,
  solid: true,
  trigger: 'interact',
  branches: [{ do: [{ say: lines }, { shop }] }],
});

/** A boss stands in the way until beaten, then it is gone. `win` runs after the victory. */
const boss = (enemy: string, intro: string[], win: Action[]): ObjectSpec => ({
  sprite: 'boss',
  solid: true,
  trigger: 'interact',
  hideWhen: { flag: `beat:${enemy}` },
  branches: [{ do: [{ say: intro }, { battle: enemy, win: [{ flag: `beat:${enemy}` }, ...win] }] }],
});

/**
 * Seats `speeches` on the numbered characters of a map: the first speech on `1`, the next on `2`. If there are
 * more speeches than seats, the last person tells the rest too; seats nobody needs stay empty.
 */
function seat(chars: string[], speeches: string[][], sprites: string[]): Record<string, ObjectSpec> {
  const used = speeches.slice(0, chars.length).map((lines, i) =>
    i === chars.length - 1 ? speeches.slice(i).flat() : lines,
  );
  return Object.fromEntries(
    chars.map((char, i) => [char, used[i] ? person(sprites[i % sprites.length]!, used[i]) : marker()]),
  );
}

const firstName = (data: FsData) => data.profile.name.split(' ')[0]!;
const yearOf = (date: string) => date.match(/\d{4}/)?.[0] ?? date;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How often an action gives an item, the ones behind a won battle included. */
const gives = (actions: Action[], item: string): number =>
  actions.reduce((sum, action) => sum + ('give' in action && action.give === item ? 1 : 'battle' in action ? gives(action.win, item) : 0), 0);

/** How many of a collectible the maps hold: every one on the ground and every one somebody hands out. */
export const countCollectibles = (maps: MapSpec[], item: string): number =>
  maps.reduce(
    (sum, map) => sum + Object.values(map.objects).reduce((inner, object) => inner + Math.max(0, ...object.branches.map((branch) => gives(branch.do, item))), 0),
    0,
  );

// --- the deep cave ----------------------------------------------------------------------------------------------

/** The flags the deep cave sets: the boulders are on their plates, and the three steps of the riddle. */
export const DEEP_FLAGS = { plates: 'deep:plates', add: 'git:add', commit: 'git:commit', shipped: 'deep:shipped', /** The cracked wall on the first floor is open. */ crack: 'cave:crack' };

/**
 * A slick floor in words, read off the map, for whoever cannot see it: how big it is, where one gets on and off
 * it, and what stands on it, by row (from the top) and place (from the left). The second note at the slick rock
 * is this, so it is still true after the room is redrawn. The words around the numbers can be changed here.
 */
export function slickInWords(rows: string[], legend: Record<string, TileDef>): string[] {
  const tile = (x: number, y: number): TileDef | undefined => legend[rows[y]?.[x] ?? ''];
  const slick = rows.flatMap((row, y) => [...row].flatMap((_, x) => (tile(x, y)?.slide ? [{ x, y }] : [])));
  if (slick.length === 0) return [];
  const left = Math.min(...slick.map((cell) => cell.x));
  const top = Math.min(...slick.map((cell) => cell.y));
  const wide = Math.max(...slick.map((cell) => cell.x)) - left + 1;
  const deep = Math.max(...slick.map((cell) => cell.y)) - top + 1;
  // Firm ground that touches the floor from outside: the ways on and off.
  const firm = (x: number, y: number) => !!tile(x, y) && !tile(x, y)!.solid && !tile(x, y)!.slide;
  const ways: string[] = [];
  for (let i = 0; i < wide; i++) {
    if (firm(left + i, top - 1)) ways.push(`above place ${i + 1} of row 1`);
    if (firm(left + i, top + deep)) ways.push(`below place ${i + 1} of row ${deep}`);
  }
  for (let i = 0; i < deep; i++) {
    if (firm(left - 1, top + i)) ways.push(`left of row ${i + 1}`);
    if (firm(left + wide, top + i)) ways.push(`right of row ${i + 1}`);
  }
  // What stands on it: everything in the rectangle that is not slick.
  const inTheWay: string[] = [];
  for (let y = 0; y < deep; y++) {
    const things = Array.from({ length: wide }, (_, x) => ({ at: tile(left + x, top + y), place: x + 1 }))
      .filter(({ at }) => !at?.slide)
      .map(({ at, place }) => `${at?.solid === false ? 'firm ground' : (at?.name ?? 'the wall')} at ${place}`);
    if (things.length > 0) inTheWay.push(`Row ${y + 1}: ${things.join(', ')}.`);
  }
  // A row per page: each is told to the status region by itself.
  return [`"The slick floor is ${wide} wide and ${deep} deep. Rows are counted from the top, places from the left.`, `Ways on and off it: ${ways.join('; ')}.`, ...inTheWay].map((line, i, all) =>
    i === all.length - 1 ? `${line}"` : line,
  );
}

/** What is said in the deep cave. A DRAFT: rewrite it freely. */
export const DEEP_TEXT = {
  /** The bricked-up doorway on the first floor, where the last chamber used to be. */
  bricked: [
    'A doorway, bricked up. The mortar is still fresh.',
    'Chalked on a brick: "INCIDENT ROOM moved. People kept walking in."',
    'A cold draught comes through the bricks. Something is behind them, but this is not the way in.',
  ],
  /**
   * The hint for whoever is stuck, said by the one who is lost (after their own lines). It says what to look for
   * and the kind of place, never where: a test fails when it names a direction or the room.
   */
  hint: [
    'One thing I did learn down here: not every wall is as solid as it looks.',
    'Where the cave comes to a dead end, as far from the daylight as you can get, look closely at the rock. A crack gives it away. Lean on it.',
  ],
  /** Looking at the cracked wall (A): what is seen first, and then what is said as it opens, once and for good. */
  crack: ['This rock has a crack in it. A draught whistles through.'],
  crackOpen: ['You lean on it. It gives way! A passage leads on into the dark.'],
  /** The note in the hall of the boulders, and what its gate and its lever say. */
  boulders: [
    'A note: "Two plates in the floor, two boulders. Walk into a boulder to push it."',
    '"Hold both plates down and the gate opens. Stuck? The lever by the way in puts the boulders back."',
    // For whoever cannot see the hall: where things are, in words.
    '"The plates: one near the top right corner, one at the lower right. The boulders: one at the top left, one in the middle. A fire bowl and a rock stand in the way."',
  ],
  platesDown: ['Both plates are down. To the east, a gate rattles open. The boulders settle and will not move again.'],
  gate: ['An iron gate. It will not move. Something in this hall holds it shut.'],
  lever: ['You pull the lever. The boulders roll back to where they started.'],
  leverDone: ['The lever is stuck. The boulders are where they belong.'],
  /** The note at the slick rock, on the right of the way in: what a slide is. */
  slick: [
    'A note: "Slick rock ahead: the pale, shiny floor. One step onto it and you slide. You cannot steer and you cannot stop."',
    '"You go on until a rock, a fire bowl or the wall stops you, or until the ground is firm again. Then you pick the next direction."',
    '"The way on is at the far left. Plan the slide before you take it."',
  ],
  /**
   * The second note there, on the left: the floor itself in words. Only the first line is written here; the rest
   * is read off the map (slickInWords above), so it follows the map by itself.
   */
  slickWords: ['A second note, in big letters, for whoever cannot see the floor:', ...slickInWords(DEEP_MAP, CAVE)],
  /** The riddle of the pipeline: the note, the three terminals and the gate. */
  riddle: ['A sticky note: "The gate ships with the code. First stage your work. Then seal it with a message. Then send it off."', '"One wrong step and you start over."'],
  add: ['$ git add .', 'Staged. A green light comes on: 1 of 3.'],
  commit: ['$ git commit -m "open the gate"', 'Sealed with a message. A second light comes on: 2 of 3.'],
  push: ['$ git push', 'Sent off. All three lights are green. To the west, a gate rolls open.'],
  wrong: (command: string) => [`$ git ${command}`, 'Not in that order. Every light goes out: start over.'],
  shipped: ['Everything is up to date.'],
  pipelineGate: ['A steel gate with three dark lights above it. The terminals in this room must have something to do with it.'],
};

/**
 * A terminal of the riddle. It is the right one when the step before it is done (`after`) and it has not been
 * used yet; anything else puts every light out. Once the riddle is solved the terminals only say so.
 */
const terminal = (command: string, flag: string, after: string | undefined, right: string[]): ObjectSpec => ({
  sprite: 'computer',
  solid: true,
  trigger: 'interact',
  under: 'X',
  branches: [
    { when: { flag: DEEP_FLAGS.shipped }, do: [{ say: DEEP_TEXT.shipped }] },
    { when: { ...(after ? { flag: after } : {}), notFlag: flag }, do: [{ flag }, { say: right }] },
    { do: [{ unflag: [DEEP_FLAGS.add, DEEP_FLAGS.commit] }, { say: DEEP_TEXT.wrong(command) }] },
  ],
});

/** A gate across a passage: shut until a flag is set, then gone for good. */
const gate = (flag: string, shut: string[]): ObjectSpec => ({ sprite: 'gate', solid: true, trigger: 'step', hideWhen: { flag }, branches: [{ do: [{ say: shut }] }] });

/**
 * The puzzles of the deep cave, for the test that proves each one by playing it (puzzles.test.ts). `from` is
 * where the player stands when the puzzle begins, `needs` the flags of the puzzles before it, and `goal` what
 * solves it: a flag that gets set, or a place that is reached.
 */
export const PUZZLES: { name: string; from: Spot; needs: string[]; goal: { flag: string } | { at: Spot } }[] = [
  { name: 'the boulders', from: { map: 'deep', at: 'u', dy: 1 }, needs: [], goal: { flag: DEEP_FLAGS.plates } },
  { name: 'the slick rock', from: { map: 'deep', at: 'i', dx: -1 }, needs: [DEEP_FLAGS.plates], goal: { at: { map: 'deep', at: 'G', dx: 7 } } },
  { name: 'the pipeline', from: { map: 'deep', at: 'G', dx: 7 }, needs: [DEEP_FLAGS.plates], goal: { flag: DEEP_FLAGS.shipped } },
];

// --- the last fight ---------------------------------------------------------------------------------------------

/**
 * What Wesley says in the Contact Office, in his own voice. A DRAFT: rewrite it. `before` introduces each of the
 * three bosses (in the order of FINAL_BOSSES in battles.ts), `after` is said with the coffee once it is beaten.
 * `pay` is said after the third, right before he hands over REWARDS.finale coins (battles.ts); then `goodbye`.
 */
export const FINALE = {
  welcome: (name: string, role: string) => [
    `You made it! I am ${name}, ${role}.`,
    'Four badges. You know my career by now. But a career is more than badges.',
    'Before I give you my details: meet three things every developer has to face. I did. Ready?',
  ],
  before: [
    ['First, the JOB INTERVIEW. Please reverse this linked list. On a whiteboard. While we watch.'],
    ['Second, the YEARLY REVIEW. "Meets expectations." What does that even mean?'],
    ['And the last one. The small voice that says everyone else knows what they are doing. THE IMPOSTOR.'],
  ],
  after: [
    'Hired! Here, have a coffee. You will need it.',
    'Exceeds expectations! Another coffee. One more to go.',
    'It never goes away for good. But now you know it can be beaten.',
  ],
  pay: ['One more thing. Nobody works for free: here is your pay.'],
  goodbye: ['That is all of it. Thanks for walking through my career. Want to talk? This is how to reach me:'],
};

/**
 * Wesley as the final boss: three battles in a row, energy and moves restored in between; only after the third
 * come the contact details and the ending. A defeat loses nothing: talk to him again and the fight goes on with
 * the boss that won. The first battle of a talk gets the whole transition of a boss; the ones that follow it are
 * marked `quick` and get the short one.
 */
function lastFight(data: FsData): ObjectSpec['branches'] {
  const goodbye: Action[] = [{ say: FINALE.pay }, { coins: REWARDS.finale }, { say: [...FINALE.goodbye, ...contactLines(data.profile)] }, { ending: true }];
  const from = (round: number, quick = false): Action[] => {
    const enemy = FINAL_BOSSES[round];
    if (!enemy) return goodbye;
    const win: Action[] = [{ flag: `beat:${enemy}` }, { heal: true }, { say: [FINALE.after[round] ?? ''] }, ...from(round + 1, true)];
    return [{ say: FINALE.before[round] ?? [] }, quick ? { battle: enemy, win, quick } : { battle: enemy, win }];
  };
  // The furthest round first: whoever is beaten stays beaten.
  const resumed = FINAL_BOSSES.map((enemy, round) => ({ when: { flag: `beat:${enemy}` }, do: [{ say: ['Back for more? Good.'] }, ...from(round + 1)] })).reverse();
  return [...resumed, { do: [{ say: FINALE.welcome(data.profile.name, data.profile.role) }, ...from(0)] }];
}

// --- the facts, as speech --------------------------------------------------------------------------------------

function schoolSpeech(school: Education, who: string): string[] {
  return [
    `${school.school}. ${who} sat right there, ${school.start} to ${school.end}.`,
    `The programme: ${school.program}${school.profile ? `, profile ${school.profile}` : ''}.`,
  ];
}

/** The jobs grouped per employer, in the order of the data (newest first). */
export function employers(jobs: readonly Job[]): Job[][] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const name = job.company.replace(/\s*\(.*\)$/, '');
    groups.set(name, [...(groups.get(name) ?? []), job]);
  }
  return [...groups.values()];
}

function employerSpeech(jobs: Job[], who: string): string[] {
  const newest = jobs[0]!;
  const oldest = jobs.at(-1)!;
  const name = newest.company.replace(/\s*\(.*\)$/, '');
  const until = newest.end ?? 'today';
  const tools = `The tools: ${newest.stack.slice(0, 6).join(', ')}${newest.stack.length > 6 ? ' and more' : ''}.`;
  if (jobs.length === 1) {
    const verb = newest.end === null ? 'works' : 'worked';
    return [`${name}, ${newest.location}. ${who} ${verb} here as ${newest.title}, ${newest.start} to ${until}.`, tools];
  }
  return [
    `${name}, ${newest.location}. ${who} was here from ${oldest.start} to ${until}.`,
    `It started as ${oldest.title} and grew into ${newest.title}.`,
    tools,
  ];
}

function projectSpeech(project: Project): string[] {
  return [
    `${project.name}: ${project.tagline}`,
    ...project.description.split(/(?<=\.)\s+/),
    `Built with ${project.tech.join(', ')}.`,
    `Try it: ${project.links.live}`,
  ];
}

function shelfSpeeches(data: FsData, shelves: number): string[][] {
  const names = data.skills.map((skill) => (skill.note ? `${skill.name} (${skill.note})` : skill.name));
  const size = Math.max(1, Math.ceil(names.length / shelves));
  const groups: string[][] = [];
  for (let i = 0; i < names.length; i += size) groups.push(names.slice(i, i + size));
  return groups.map((group, i) => [`Shh. Shelf ${i + 1} of ${groups.length}: ${group.join(', ')}.`]);
}

// --- the maps --------------------------------------------------------------------------------------------------

/** Every map with its things, built from the data. */
export function buildMaps(data: FsData): BuiltMap[] {
  const who = firstName(data);
  const all = BADGES.length;
  const jobs = employers(data.experience);
  const oldest = data.experience.at(-1);
  const current = data.experience.find((job) => job.end === null);
  const skillNames = data.skills.map((skill) => skill.name);

  // The errand of the postman: a letter for the head librarian.
  const postman: ObjectSpec = {
    sprite: 'postman',
    solid: true,
    trigger: 'interact',
    under: '#',
    branches: [
      { when: { flag: 'errand:letter:done' }, do: [{ say: ['The letter arrived? Wonderful. Neither snow nor merge conflicts stop the post.'] }] },
      { when: { flag: 'errand:letter' }, do: [{ say: ['That LETTER is for the head librarian. The LIBRARY is at the bottom right of town.'] }] },
      {
        do: [
          { say: ['Post for the CONTACT OFFICE! Mostly job offers, these days.', 'Say, my round is long. Would you take this to the head librarian?'] },
          { flag: 'errand:letter' },
          { give: 'letter' },
        ],
      },
    ],
  };

  const town: MapSpec = {
    id: 'town',
    name: 'Career Town',
    rows: TOWN,
    ground: '.',
    encounters: wild('town'),
    objects: {
      '@': marker('='),
      '(': wayOut({ map: 'west', at: ')', dx: -1, dir: 'left' }),
      ')': wayOut({ map: 'east', at: '(', dx: 1, dir: 'right' }),
      A: door(into('academy')),
      a: sign('ACADEMY. Where it all started.'),
      O: door(
        into('office'),
        { when: { item: 'diploma' }, deny: 'THE OFFICE only hires graduates. Come back with a DIPLOMA from the ACADEMY.' },
        'door-brick',
      ),
      o: sign('THE OFFICE. Graduates only.', current ? `Vacancies: none. ${who} works at ${current.company} now, as ${current.title}.` : 'Vacancies: ask inside.'),
      S: door(into('workshop'), undefined, 'door-wood'),
      s: sign('WORKSHOP. Side projects are built here.'),
      L: door(into('library'), { when: { item: 'librarycard' }, deny: 'Members only. The WORKSHOP hands out LIBRARY CARDs.' }, 'door-stone'),
      l: sign('LIBRARY. Members only.'),
      P: door(into('contact'), { when: { badges: all }, deny: `The CONTACT OFFICE opens for holders of ${all} badges.` }),
      p: sign(`CONTACT OFFICE. Opens for ${all} badges.`),
      X: door(into('cafe'), undefined, 'door-brick'),
      b: sign(...CAFE_TEXT.sign),
      C: chest('chest:pizza', 'pizza', '"'),

      // Signposts.
      '0': sign(
        `CAREER TOWN. ${plural(jobs.length, 'employer')}, ${plural(data.education.length, 'school')}, ${plural(data.projects.length, 'side project')} and ${plural(data.skills.length, 'skill')} live here.`,
        'North: the plaza and the CONTACT OFFICE. Over the bridge, that is.',
        'The main road leaves town on both sides. East: HOBBY HILLS. West: the mountain and its CAVE.',
        'Tired? The CAFE is up the road, by the duck pond.',
      ),
      '7': sign('STREAM OF COMMITS. It never stops. Mind the merge conflicts between the planks.', 'North: the ACADEMY, THE OFFICE and the WORKSHOP. South: the LIBRARY.'),
      '8': sign(
        oldest ? `TOWN PLAZA. ${who} has been building software since ${yearOf(oldest.start)}. The fountain is older.` : 'TOWN PLAZA. The fountain is older than the town.',
      ),
      '9': sign('DUCK POND. Please do not feed the BUGs.'),
      F: thing('fountain', ['You toss a coin into the fountain and wish for green builds.', 'Splash. It feels like it worked.'], '#', true),
      e: thing('well', ['A deep well. Someone dropped a floppy disk down there, long ago.']),

      // The townsfolk. The ones with stroll() walk about.
      B: postman,
      '<': person(
        'maker',
        [
          `Fresh skills! Today: ${skillNames.slice(0, 3).join(', ') || 'none, sold out'}.`,
          'Not for sale, mind you. You earn them. The LIBRARY has the full list.',
        ],
      ),
      H: stroll(person('kid', [`When I grow up I want to be a ${data.profile.role}, just like ${who}!`]), 2, 90),
      E: stroll(
        person(
          'elder',
          [
            oldest
              ? `I remember ${who}'s first job: ${oldest.title} at ${oldest.company.replace(/\s*\(.*\)$/, '')}, back in ${yearOf(oldest.start)}.`
              : `I remember when ${who} wrote the first line of code.`,
            'They grow up so fast.',
          ],
        ),
        2,
        150,
      ),
      D: stroll(person('dog', ['Woof! (It sniffs your bag. It is hoping for PIZZA.)']), 3, 70),
      m: stroll(
        person('gardener', [
          data.projects[0] ? `I named this flower bed ${data.projects[0].name}. A side project needs daily care too.` : 'I talk to my plants. They are great listeners.',
          'Rumour has it gold stars are hidden all over town. Look behind things.',
        ]),
        2,
        120,
      ),

      // Gold stars, off the beaten path.
      '1': star('town-1'),
      '2': star('town-2'),
      '3': star('town-3', '"'),
      '4': star('town-4'),
      '5': star('town-5'),
      '6': star('town-6'),
    },
  };

  const schools = [...data.education].reverse().map((school) => schoolSpeech(school, who));
  const academy: MapSpec = {
    id: 'academy',
    name: 'Academy',
    rows: ACADEMY,
    ground: '_',
    objects: {
      ...seat(['1', '2', '3'], schools, ['teacher', 'librarian', 'teacher']),
      E: boss(
        'exam',
        ['Heard about every school? Then prove it.', 'Nobody leaves the ACADEMY without the FINAL EXAM!'],
        [
          { badge: 'education' },
          { give: 'diploma' },
          { say: ['THE OFFICE across town only hires graduates. Show them your DIPLOMA.'] },
        ],
      ),
      '*': star('academy'),
      m: exitTo('A'),
    },
  };

  // The first colleague lends the key card, for a coffee.
  const [first, ...others] = jobs.map((group) => employerSpeech(group, who));
  // The errand of the developer who is stuck: lend an ear, or rather a duck. The duck is in the WORKSHOP.
  const stuck: ObjectSpec = {
    sprite: 'dev',
    solid: true,
    trigger: 'interact',
    branches: [
      { when: { flag: 'errand:duck' }, do: [{ say: ['Bug fixed. That duck is a senior engineer.'] }] },
      {
        when: { item: 'duck' },
        do: [
          { say: ['Is that a RUBBER DUCK? May I? So, duck: the loop starts at one, and... oh. OH.', 'Off by one. Thank you, duck. Here, I found this under my desk.'] },
          { flag: 'errand:duck' },
          { give: COLLECT },
        ],
      },
      { do: [{ say: ['This bug makes no sense. If only I had a RUBBER DUCK to explain it to...'] }] },
    ],
  };
  const colleagues = seat(['2', '3', '4', '5', '6'], others, ['maker', 'teacher', 'dev', 'librarian']);
  const lender: ObjectSpec = {
    sprite: 'dev',
    solid: true,
    trigger: 'interact',
    branches: [
      { when: { flag: 'keycard' }, do: [{ say: [...(first ?? []), 'Thanks for the coffee! The server room is up there.'] }] },
      {
        when: { item: 'coffee' },
        do: [
          { say: [...(first ?? []), 'Is that COFFEE I smell? Trade you: my KEY CARD for a cup.'] },
          { take: 'coffee' },
          { flag: 'keycard' },
          { give: 'keycard' },
        ],
      },
      { do: [{ say: [...(first ?? []), 'I would lend you my KEY CARD, but not before coffee. The machine is in the corner.'] }] },
    ],
  };
  const office: MapSpec = {
    id: 'office',
    name: 'The Office',
    rows: OFFICE,
    ground: '_',
    objects: {
      '1': lender,
      ...colleagues,
      D: {
        sprite: 'door',
        solid: true,
        trigger: 'step',
        branches: [
          { when: { item: 'keycard' }, do: [], pass: true },
          { do: [{ say: ['The server room is locked. A colleague with a KEY CARD could help.'] }] },
        ],
      },
      B: boss(
        'legacy',
        ['Deep in the server room, something old stirs...', 'It is LEGACY CODE! Nobody dares to touch it.'],
        [{ badge: 'experience' }, { say: ['Years of experience, earned. The other buildings have badges too.'] }],
      ),
      J: stuck,
      '*': star('office'),
      m: exitTo('O'),
    },
  };

  const workshop: MapSpec = {
    id: 'workshop',
    name: 'Workshop',
    rows: WORKSHOP,
    ground: '_',
    objects: {
      ...seat(['1', '2'], data.projects.map(projectSpeech), ['maker', 'dev']),
      L: person('cat', ['Purr... (The workshop cat. Every project here was supervised by her.)']),
      C: chest('chest:duck', 'duck'),
      B: boss(
        'scope',
        ['Psst. Could the project ALSO do this? And this? And...', 'It is SCOPE CREEP!'],
        [
          { badge: 'projects' },
          { give: 'librarycard' },
          { say: ['The LIBRARY is at the bottom right of town. Your card opens it.'] },
        ],
      ),
      '*': star('workshop'),
      m: exitTo('S'),
    },
  };

  const library: MapSpec = {
    id: 'library',
    name: 'Library',
    rows: LIBRARY,
    ground: '_',
    objects: {
      ...seat(['1', '2', '3', '4'], shelfSpeeches(data, 4), ['librarian', 'teacher', 'dev', 'maker']),
      B: boss(
        'deadline',
        ['Tick. Tock. This badge is due... NOW!', 'It is the DEADLINE!'],
        [{ badge: 'skills' }, { say: [`Skills, proven. With ${all} badges the CONTACT OFFICE at the top of town opens.`] }],
      ),
      // The other end of the postman's errand.
      R: {
        sprite: 'librarian',
        solid: true,
        trigger: 'interact',
        branches: [
          {
            when: { item: 'letter' },
            do: [
              { say: ['A LETTER for me? At last: the overdue notice I sent myself.', 'Take this for your trouble.'] },
              { take: 'letter' },
              { flag: 'errand:letter:done' },
              { give: 'energydrink' },
              { coins: REWARDS.letter },
            ],
          },
          { do: [{ say: [`Welcome. ${plural(data.skills.length, 'skill')} on the shelves, and not one of them overdue. Quiet, please.`] }] },
        ],
      },
      '*': star('library'),
      m: exitTo('L'),
    },
  };

  const contact: MapSpec = {
    id: 'contact',
    name: 'Contact Office',
    rows: CONTACT,
    ground: '_',
    objects: {
      H: {
        sprite: 'wesley',
        solid: true,
        trigger: 'interact',
        branches: lastFight(data),
      },
      m: exitTo('P'),
    },
  };

  const cafe: MapSpec = {
    id: 'cafe',
    name: 'Cafe',
    rows: CAFE,
    ground: '_',
    objects: {
      B: barista(),
      V: shopkeeper('maker', 'cafe', CAFE_TEXT.shop),
      '1': person('dev', CAFE_TEXT.regular(who)),
      m: exitTo('X'),
    },
  };

  // The collector counts what the maps above hold, so adding a star needs no other change.
  const total = countCollectibles([town, academy, office, workshop, library, contact], COLLECT);
  town.objects['?'] = {
    sprite: 'teacher',
    solid: true,
    trigger: 'interact',
    branches: [
      { when: { flag: 'errand:stars' }, do: [{ say: ['A fellow collector! Wear that TROPHY with pride.'] }] },
      {
        when: { count: { item: COLLECT, min: total } },
        do: [{ say: [`All ${total} GOLD STARs! You looked under every rock. My TROPHY is yours.`] }, { flag: 'errand:stars' }, { give: 'trophy' }, { coins: REWARDS.stars }],
      },
      { do: [{ say: [`I collect GOLD STARs. ${total} are hidden in and around town.`, 'Bring them all and my TROPHY is yours. START shows how many you have.'] }] },
    ],
  };

  // --- beyond the town: all of it is extra ---------------------------------------------------------------------

  const east: MapSpec = {
    id: 'east',
    name: 'East Road',
    rows: EAST,
    ground: '.',
    encounters: wild('east'),
    objects: {
      '(': wayOut({ map: 'town', at: ')', dx: -1, dir: 'left' }),
      ')': wayOut({ map: 'hills', at: '(', dx: 1, dir: 'right' }),
      s: sign(
        'EAST ROAD. HOBBY HILLS lies ahead.',
        `The way there crosses tall grass. The wild things in it are Lv ${AREAS.east!.levels[0]} to ${AREAS.east!.levels[1]}.`,
        ROUTE_BACK,
      ),
      C: chest('chest:east', 'energydrink', '"'),
    },
  };

  const stamps = HOBBIES.length;
  const hills: MapSpec = {
    id: 'hills',
    name: 'Hobby Hills',
    rows: HILLS,
    ground: '.',
    objects: {
      '(': wayOut({ map: 'east', at: ')', dx: -1, dir: 'left' }),
      // The cat and the rabbit sit in the grass; the other stops stand on a few cobbles.
      ...Object.fromEntries(HOBBIES.map((stop) => [stop.at, hobby(stop.id, stop.sprite, stop.lines, stop.animated, ['cats', 'animals'].includes(stop.id) ? undefined : '#')])),
      s: sign(
        `HOBBY HILLS. What ${who} does when the laptop is closed.`,
        `${stamps} stops, ${stamps} stamps. Look at each one, then see the rally keeper by the pond.`,
        'The ring road passes every stop: walk it once round. The paths lead in to the pond.',
      ),
      // Where the stops are, from two corners of the ring road.
      p: sign(
        'RING ROAD, north side.',
        `East along the road: ${stops('astronomy', 'gaming', 'japan')}.`,
        `Inside the ring: ${stops('cats', 'animals')} on this side of the pond, ${stops('retro')} across it.`,
      ),
      o: sign(
        'RING ROAD, south side.',
        `West along the road: ${stops('science', 'homeserver')}.`,
        `Inside the ring: ${stops('language')} right here, ${stops('soldering')} by the shed in the west.`,
      ),
      '?': {
        sprite: 'maker',
        solid: true,
        trigger: 'interact',
        branches: [
          { when: { flag: 'rally:done' }, do: [{ say: [`A full card! You know ${who} better than most colleagues do.`] }] },
          {
            when: { count: { item: STAMP, min: stamps } },
            do: [
              { say: [`All ${stamps} stamps! That is every hobby in the hills.`, 'A full card earns a lucky charm, lunch, and something for the CAFE.'] },
              { flag: 'rally:done' },
              { give: 'omamori' },
              { give: 'bento' },
              { coins: REWARDS.rally },
            ],
          },
          { do: [{ say: [`Welcome to the HOBBY HILLS stamp rally! ${stamps} stops, one stamp each.`, 'Fill your card and come back to me. START shows how many you have.'] }] },
        ],
      },
      // The people of the hills. The ones with stroll() walk about, off the roads and away from each other.
      P: person('dev', HILLS_FOLK.gamer(who)),
      B: person('gardener', HILLS_FOLK.keeper(who)),
      // The angler at the end of the jetty faces the water and keeps fishing: his float (F) bobs in front of him.
      E: person('angler', HILLS_FOLK.angler(), '_'),
      F: { sprite: 'float', animated: true, solid: true, trigger: 'interact', under: '~', branches: [] },
      H: stroll(person('kid', HILLS_FOLK.kid()), 2, 100),
      D: stroll(person('dog', HILLS_FOLK.dog()), 2, 80),
      m: stroll(person('cat', HILLS_FOLK.cat()), 2, 110),
      // Houses nobody is home in: the doors are scenery with a note on them.
      a: thing('door', HILLS_FOLK.cottage()),
      b: thing('door', HILLS_FOLK.neighbour()),
      S: thing('door-wood', HILLS_FOLK.shed()),
    },
  };

  const west: MapSpec = {
    id: 'west',
    name: 'West Road',
    rows: WEST,
    ground: '.',
    encounters: wild('west'),
    objects: {
      ')': wayOut({ map: 'town', at: '(', dx: 1, dir: 'right' }),
      // You walk into the mountain going left, and come out in the cave at its east side, still going left.
      D: door(
        { map: 'cave', at: 'm', dx: -1, dir: 'left' },
        { when: { level: CAVE_LEVEL }, deny: `The CAVE is no place for a beginner. Come back at Lv ${CAVE_LEVEL}: wild battles and bosses make you stronger.` },
        'cavemouth',
        'cave',
      ),
      s: sign(
        `WEST ROAD. Ahead: the mountain and its CAVE. Lv ${CAVE_LEVEL} and up.`,
        `The way there crosses tall grass. The wild things in it are Lv ${AREAS.west!.levels[0]} to ${AREAS.west!.levels[1]}. In the CAVE: Lv ${AREAS.cave!.levels[0]} to ${AREAS.cave!.levels[1]}, and it is dark.`,
        ROUTE_BACK,
      ),
      C: chest('chest:west', 'energydrink', '"'),
    },
  };

  const cave: MapSpec = {
    id: 'cave',
    name: 'The Cave',
    rows: CAVE_MAP,
    ground: '_',
    dark: 1,
    encounters: wild('cave'),
    objects: {
      m: { sprite: 'caveexit', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'west', at: 'D', dx: 1, dir: 'right' }, cue: 'cave' }] }] },
      a: thing('scratches', ['Scratched into the rock: "It worked on staging."', 'Below it, in another hand: "Everything that goes wrong on production lives down here."']),
      b: thing('notice', ['A post-mortem, pinned to the wall. ROOT CAUSE: it was DNS. It is always DNS.']),
      // The dead ends and side rooms are worth the walk.
      E: chest('chest:cave', 'energydrink'),
      F: chest('chest:cave2', 'pizza'),
      G: chest('chest:cave3', 'energydrink'),
      n: person('dev', [
        'I came down here to find the root cause.',
        'That was three sprints ago. Do you know the way out? No, wait, do not tell me. I can feel that I am close.',
        // The nudge for a player who is stuck: what to look for, not where.
        ...DEEP_TEXT.hint,
      ]),
      // Where the last chamber used to be: a dead end now.
      d: thing('scratches', DEEP_TEXT.bricked),
      // The hidden way: rock with a crack in it. Looking at it (A) says what is seen, then opens it for good, with
      // a rumble; the two cells of rock behind it (x, y) go with it. Until then all three stand in the way and
      // are drawn as rock.
      w: {
        sprite: 'crack',
        solid: true,
        trigger: 'interact',
        hideWhen: { flag: DEEP_FLAGS.crack },
        branches: [{ do: [{ say: DEEP_TEXT.crack }, { flag: DEEP_FLAGS.crack, cue: 'gate' }, { say: DEEP_TEXT.crackOpen }] }],
      },
      x: { sprite: 'cavewall', solid: true, trigger: 'interact', hideWhen: { flag: DEEP_FLAGS.crack }, branches: [] },
      y: { sprite: 'cavewall', solid: true, trigger: 'interact', hideWhen: { flag: DEEP_FLAGS.crack }, branches: [] },
      // The ladder down, behind that wall. Hard to find on purpose: no sign points to it.
      L: { sprite: 'hole', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'deep', at: 'u', dy: 1, dir: 'down' }, cue: 'cave' }] }] },
    },
  };

  const deep: MapSpec = {
    id: 'deep',
    name: 'The Deep Cave',
    rows: DEEP_MAP,
    ground: '_',
    dark: 1,
    // The boulders: a boulder on each plate opens the first gate, for good.
    plates: { flag: DEEP_FLAGS.plates, do: [{ say: DEEP_TEXT.platesDown }] },
    objects: {
      u: { sprite: 'ladder', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'cave', at: 'L', dy: -1, dir: 'up' }, cue: 'cave' }] }] },

      // 1. The boulders.
      '1': { sprite: 'boulder', solid: true, trigger: 'interact', branches: [], push: 'boulder' },
      '2': { sprite: 'boulder', solid: true, trigger: 'interact', branches: [], push: 'boulder' },
      n: thing('notice', DEEP_TEXT.boulders),
      r: {
        sprite: 'lever',
        solid: true,
        trigger: 'interact',
        branches: [{ when: { flag: DEEP_FLAGS.plates }, do: [{ say: DEEP_TEXT.leverDone }] }, { do: [{ reset: true }, { say: DEEP_TEXT.lever }] }],
      },
      g: gate(DEEP_FLAGS.plates, DEEP_TEXT.gate),

      // 2. The slick rock.
      i: thing('notice', DEEP_TEXT.slick),
      v: thing('notice', DEEP_TEXT.slickWords),

      // 3. The pipeline: add, commit, push.
      h: thing('notice', DEEP_TEXT.riddle),
      A: terminal('add .', DEEP_FLAGS.add, undefined, DEEP_TEXT.add),
      C: terminal('commit', DEEP_FLAGS.commit, DEEP_FLAGS.add, DEEP_TEXT.commit),
      P: terminal('push', DEEP_FLAGS.shipped, DEEP_FLAGS.commit, DEEP_TEXT.push),
      G: gate(DEEP_FLAGS.shipped, DEEP_TEXT.pipelineGate),

      // The last chamber.
      D: {
        sprite: 'door',
        solid: true,
        trigger: 'step',
        branches: [
          { when: { level: DEEP_CAVE_LEVEL }, do: [], pass: true },
          { do: [{ say: [`A heavy door. A red light blinks: "INCIDENT ROOM. Lv ${DEEP_CAVE_LEVEL} and up." The wild things on the floor above are good practice.`] }] },
        ],
      },
      B: boss(
        'outage',
        ['Every screen in the room is red. A pager goes off. Then another.', `It is ${ENEMIES.outage!.name}!`],
        [{ say: ['The dashboards turn green, one by one. Somewhere, a pager falls silent.'] }],
      ),
      c: {
        sprite: 'chest',
        spriteWhen: { flag: 'chest:prize', sprite: 'chest-open' },
        solid: true,
        trigger: 'interact',
        branches: [{ when: { notFlag: 'chest:prize' }, do: [{ flag: 'chest:prize' }, { give: 'medal' }, { boost: 10 }] }, { do: [{ say: ['It is empty. The ladder beside it leads out of the mountain.'] }] }],
      },
      L: { sprite: 'ladder', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'west', at: 'D', dx: 1, dir: 'right' }, cue: 'cave' }] }] },
    },
  };

  // The parts of a map that have a name of their own (REGIONS in maps.ts).
  const named = (spec: BuiltMap): BuiltMap => ({ ...spec, areas: REGIONS[spec.id]?.map(({ name, x, y, w, h }) => ({ name, x, y, w, h })) });

  return [
    { ...east, legend: OUTDOORS },
    { ...hills, legend: OUTDOORS },
    { ...west, legend: OUTDOORS },
    { ...cave, legend: CAVE },
    { ...deep, legend: CAVE },
    { ...town, legend: OUTDOORS },
    { ...academy, legend: indoors('checker') },
    { ...office, legend: indoors('floor') },
    { ...workshop, legend: indoors('wood') },
    { ...library, legend: indoors('carpet') },
    { ...contact, legend: indoors('wood') },
    { ...cafe, legend: indoors('wood') },
  ].map(named);
}

/** The first lines of the game. */
export const intro = (data: FsData): string[] => [
  `Welcome to Career Town! Here, ${firstName(data)}'s career is a place to explore.`,
  `Every building is a chapter with a badge to win. Collect all ${BADGES.length} and the CONTACT OFFICE opens.`,
  'Walk up to people and press A to talk. START opens your bag, SELECT gives a hint.',
  'Tired, or beaten? The CAFE in town restores you, and sells snacks for the COINS that enemies drop.',
  'There is more beyond the town: HOBBY HILLS to the east, a mountain with a CAVE to the west. Winning battles makes you stronger.',
];

/** What Select says: the first one whose condition holds. */
export const HINTS: { when?: Cond; text: string }[] = [
  { when: { badges: BADGES.length }, text: 'All badges! The CONTACT OFFICE at the top of town is open.' },
  { when: { notFlag: 'beat:exam' }, text: 'Start at the ACADEMY, top left. Talk to everyone, then face the examiner.' },
  { when: { notFlag: 'beat:legacy' }, text: 'Your DIPLOMA opens THE OFFICE, top right. Someone there wants coffee.' },
  { when: { notFlag: 'beat:scope' }, text: 'The WORKSHOP on the left side of town has a badge too.' },
  { text: 'Your LIBRARY CARD opens the LIBRARY, bottom right.' },
];

/** The lines of the ending screen. */
export const ending = (data: FsData): string[] => [
  'THE END',
  `Thanks for visiting ${firstName(data)}'s career town.`,
  'The contact details are on this page.',
];
