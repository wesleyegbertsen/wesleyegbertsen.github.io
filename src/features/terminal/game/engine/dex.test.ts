import { ENTER_TICKS } from './battle.ts';
import { MENU_TABS, initialGame, step } from './engine.ts';
import { playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, type GameState, type World } from './types.ts';

// The test world with a dex of three: the rat, a ghost nobody meets, the ogre.
const world: World = {
  ...testWorld,
  enemies: { ...testWorld.enemies, ghost: { ...testWorld.enemies.rat!, name: 'GHOST' } },
  dex: [
    { enemy: 'rat', area: 'MEADOW', text: 'Nibbles cables.' },
    { enemy: 'ghost', area: 'MEADOW', text: 'Never seen.' },
    { enemy: 'ogre', boss: true, text: 'Smashes.' },
  ],
};
const play = (state: GameState, ...inputs: Parameters<typeof playIn>[2][]) => playIn(world, state, ...inputs);
const started = () => play(initialGame(world, 7), 'a', 'a');
/** The Start menu on the DEX tab. */
const dexTab = (state: GameState) => play(state, 'start', 'right', 'right');

describe('meeting a monster', () => {
  it('registers it when it is in place and cries: at once with reduced motion', () => {
    expect(started().seen ?? []).toEqual([]);
    const met = play(started(), 'down', 'right');
    expect(met.battle?.enemy).toBe('rat');
    expect(met.seen).toEqual(['rat']);
    // Once is enough: meeting it again keeps one entry.
    expect(play({ ...started(), seen: ['rat'] }, 'down', 'right').seen).toEqual(['rat']);
  });

  it('with motion, only at the end of its way in, with its cry', () => {
    let result = step(play(started(), 'down'), { ...NO_INPUT, dir: 'right', pressed: 'right' }, world);
    for (let i = 0; i < 400 && !result.cues.includes('cry:rat'); i++) {
      expect(result.state.seen ?? []).toEqual([]);
      result = step(result.state, NO_INPUT, world);
    }
    expect(result.cues).toContain('cry:rat');
    expect(result.state.seen).toEqual(['rat']);
    expect(ENTER_TICKS).toBeGreaterThan(0);
  });
});

describe('the DEX page of the Start menu', () => {
  const seenRat = () => ({ ...started(), seen: ['rat'] });

  it('is a tab between the badges and the settings; left and right go on as on the other tabs', () => {
    expect(MENU_TABS).toEqual(['items', 'badges', 'dex', 'settings']);
    expect(dexTab(started()).menu).toEqual({ tab: 'dex', cursor: 0 });
    expect(play(dexTab(started()), 'right').menu?.tab).toBe('settings');
    expect(play(dexTab(started()), 'left').menu?.tab).toBe('badges');
  });

  it('runs down the list with up and down and tells each row: the name once seen, else that it is not', () => {
    const open = dexTab(seenRat());
    const down = step(open, { ...NO_INPUT, dir: 'down', pressed: 'down' }, world, { instant: true });
    expect(down.state.menu).toEqual({ tab: 'dex', cursor: 1 });
    expect(down.cues).toEqual(['cursor']);
    expect(down.events.map((event) => event.text)).toEqual(['2. Not seen yet']);
    const up = step(down.state, { ...NO_INPUT, dir: 'up', pressed: 'up' }, world, { instant: true });
    expect(up.events.map((event) => event.text)).toEqual(['1. RAT']);
    // It stops at the ends.
    expect(play(open, 'down', 'down', 'down', 'down').menu?.cursor).toBe(2);
  });

  it('opens a seen one with A, and does nothing but bump on one not seen yet', () => {
    const open = dexTab(seenRat());
    const opened = step(open, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(opened.state.menu).toEqual({ tab: 'dex', cursor: 0, detail: { at: 0, focus: 0 } });
    expect(opened.cues).toEqual(['confirm']);
    expect(opened.events.map((event) => event.text).join(' ')).toMatch(/^No\. 1 RAT\. MEADOW\. Nibbles cables\./);
    const ghost = step(play(open, 'down'), { ...NO_INPUT, a: true }, world, { instant: true });
    expect(ghost.state.menu).toEqual({ tab: 'dex', cursor: 1 });
    expect(ghost.cues).toEqual(['bump']);
  });

  it('on a page: left and right pick CRY or BACK, A presses it; B goes back to the list, Start closes the menu', () => {
    const page = play(dexTab(seenRat()), 'a');
    const cry = step(page, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(cry.cues).toEqual(['cry:rat']);
    expect(cry.state.menu).toEqual(page.menu);
    const back = play(page, 'right');
    expect(back.menu?.detail).toEqual({ at: 0, focus: 1 });
    expect(play(back, 'right').menu?.detail).toEqual({ at: 0, focus: 1 });
    expect(play(back, 'left').menu?.detail).toEqual({ at: 0, focus: 0 });
    expect(play(back, 'a').menu).toEqual({ tab: 'dex', cursor: 0 });
    expect(play(page, 'b').menu).toEqual({ tab: 'dex', cursor: 0 });
    expect(play(page, 'start').menu).toBeNull();
  });

  it('on a page: up and down go to the previous or next one seen, past those not seen yet, and stop at the ends', () => {
    const both = { ...started(), seen: ['rat', 'ogre'] };
    const page = play(dexTab(both), 'a');
    const next = step(page, { ...NO_INPUT, dir: 'down', pressed: 'down' }, world, { instant: true });
    expect(next.state.menu).toEqual({ tab: 'dex', cursor: 2, detail: { at: 2, focus: 0 } });
    expect(next.cues).toEqual(['cursor']);
    expect(next.events.map((event) => event.text).join(' ')).toMatch(/^No\. 3 OGRE\. BOSS\. Smashes\./);
    expect(play(next.state, 'down').menu?.detail?.at).toBe(2);
    expect(play(next.state, 'up').menu).toEqual({ tab: 'dex', cursor: 0, detail: { at: 0, focus: 0 } });
    // Back to the list where the page was.
    expect(play(next.state, 'b').menu).toEqual({ tab: 'dex', cursor: 2 });
  });

  it('gates nothing: a world without a dex has no DEX tab content, and the badges tab is unchanged', () => {
    const plain = playIn(testWorld, playIn(testWorld, initialGame(testWorld, 7), 'a', 'a'), 'start', 'right', 'right');
    expect(plain.menu).toEqual({ tab: 'dex', cursor: 0 });
    expect(playIn(testWorld, plain, 'a').menu).toEqual({ tab: 'dex', cursor: 0 });
  });
});
