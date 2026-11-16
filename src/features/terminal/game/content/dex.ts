/**
 * The DEX: the encyclopedia of every monster in the game, on its own page of the Start menu. A monster is in it once
 * the player has met it in a battle; until then its row says ???.
 *
 * HOW TO EDIT
 * - DEX is the order of the list: the first entry is No. 1. Move a line to renumber. Every enemy of ENEMIES
 *   (battles.ts) needs exactly one entry: a test fails for one that is missing or twice.
 * - `text` is what its page says about it: a line or two in the game's voice (things going wrong in production).
 *   It must fit the page, DEX_TEXT_LINES lines of the screen's width; a test says when it is too long.
 * - `area` is where a wild one lives, one of DEX_AREAS, and only a region of the world (never a house or a room).
 *   A test checks it is the region of the map whose tall grass (or rubble) it lives in, in AREAS.
 * - `boss: true` instead of an area for one that is met only once: a guardian, the outage, or one of Wesley's three.
 */

/** The regions a wild monster can live in, in the order of AREAS in battles.ts: the town, the roads, the cave. */
export const DEX_AREAS = ['CAREER TOWN', 'EAST ROAD', 'WEST ROAD', 'THE CAVE'] as const;
export type DexArea = (typeof DEX_AREAS)[number];

export type DexEntry = { enemy: string; text: string; area?: DexArea; boss?: true };

/** How many lines of the screen a text may take on its page. */
export const DEX_TEXT_LINES = 4;

export const DEX: DexEntry[] = [
  // The meadows of Career Town.
  { enemy: 'bug', area: 'CAREER TOWN', text: 'Lives in every codebase. Squash one and two hatch in the next release.' },
  { enemy: 'typo', area: 'CAREER TOWN', text: 'Small and fast. Hides in variable names until the demo starts.' },
  { enemy: 'lint', area: 'CAREER TOWN', text: 'Shouts about a missing semicolon while the server is on fire.' },
  { enemy: 'todo', area: 'CAREER TOWN', text: 'Written in 2014. Still says it will be fixed later.' },
  // The East Road.
  { enemy: 'popup', area: 'EAST ROAD', text: 'Appears over whatever you were reading. The close button is a decoy.' },
  { enemy: 'spam', area: 'EAST ROAD', text: 'Travels in flocks of a thousand. Every one is very urgent.' },
  { enemy: 'lag', area: 'EAST ROAD', text: 'Arrives a few seconds after it attacks. Loves video calls.' },
  { enemy: 'update', area: 'EAST ROAD', text: 'Restarts your machine at 99% of a long build. Says it is for your own good.' },
  // The West Road.
  { enemy: 'flaky', area: 'WEST ROAD', text: 'Passes on your machine, fails on CI. Nobody has seen it fail twice.' },
  { enemy: 'debt', area: 'WEST ROAD', text: 'Grows quietly with interest. Feeds on "we will clean it up later".' },
  { enemy: 'meeting', area: 'WEST ROAD', text: 'Could have been an email. Lasts exactly as long as the room is booked.' },
  // The cave.
  { enemy: 'memleak', area: 'THE CAVE', text: 'Eats a little more memory every hour. Sleeps only after a restart.' },
  { enemy: 'nullptr', area: 'THE CAVE', text: 'Points at nothing at all, and crashes everything near it.' },
  { enemy: 'race', area: 'THE CAVE', text: 'Two of them run at once. Who wins depends on the weather.' },
  { enemy: 'droptable', area: 'THE CAVE', text: 'One careless query and the customers table is gone. Feared by DBAs.' },
  { enemy: 'error500', area: 'THE CAVE', text: 'Says something went wrong. Will not say what, or where.' },
  { enemy: 'friday', area: 'THE CAVE', text: 'Ships at 16:55 on a Friday. Its pager rings all weekend.' },
  { enemy: 'diskfull', area: 'THE CAVE', text: 'Made entirely of log files nobody reads. Grows a gigabyte a day.' },
  // The guardians of the badges, and the one deep in the cave.
  { enemy: 'exam', boss: true, text: 'Guards the Academy badge. Asks about the one chapter you skipped.' },
  { enemy: 'legacy', boss: true, text: 'Older than the team. Nobody dares to touch it, and everything needs it.' },
  { enemy: 'scope', boss: true, text: 'Starts as a small button. Ends as a whole new product, same deadline.' },
  { enemy: 'deadline', boss: true, text: 'Was further away yesterday. Moves only one way: closer.' },
  { enemy: 'outage', boss: true, text: 'Takes the whole site down at once. Status page: all systems normal.' },
  // What Wesley sends out in the last fight.
  { enemy: 'interview', boss: true, text: 'Asks you to reverse a tree on a whiteboard. Wesley sends it first.' },
  { enemy: 'review', boss: true, text: 'Remembers everything from last year. Wesley sends it second.' },
  { enemy: 'impostor', boss: true, text: 'Whispers that you got here by luck. It is wrong. Wesley sends it last.' },
];
