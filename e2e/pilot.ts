import { expect, type Page } from '@playwright/test';
import { education } from '../src/data/education.ts';
import { experience } from '../src/data/experience.ts';
import { profile } from '../src/data/profile.ts';
import { skills } from '../src/data/skills.ts';
import { buildWorld } from '../src/features/terminal/game/content/world.ts';
import { routeTo, routeToCell } from '../src/features/terminal/game/engine/bot.ts';
import { initialGame, step } from '../src/features/terminal/game/engine/engine.ts';
import { solve } from '../src/features/terminal/game/engine/solve.ts';
import { NO_INPUT, type GameState, type Input } from '../src/features/terminal/game/engine/types.ts';
import { placeOf } from '../src/features/terminal/game/engine/wander.ts';

// The same world as the site's, minus the projects (their module imports images, which Node cannot load here).
// The maps are the same either way, so routes found in this copy are valid on the page.
const world = buildWorld({ profile, skills, experience, education, projects: [] });

type Press = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
const KEYS: Record<Press, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'z',
  b: 'x',
  start: 'p',
  select: 'h',
};

export const gameOf = (page: Page) => page.getByRole('application');

/**
 * Switches motion on or off in the middle of a game and waits until the game has followed (`data-motion`). Never
 * press a key right after `page.emulateMedia` without this wait: the game follows the media query one render
 * later, and a key that lands before that is still one whole move, with nothing held, no transition and no hop.
 */
export async function setMotion(page: Page, on: boolean) {
  await page.emulateMedia({ reducedMotion: on ? 'no-preference' : 'reduce' });
  await expect(gameOf(page)).toHaveAttribute('data-motion', on ? 'full' : 'reduced');
}

/**
 * Plays the game on the page and in a copy of the engine at the same time, so a test can ask for "walk to the
 * Academy's door" instead of a list of keys. Start with reduced motion on the page: one key is then one whole
 * move. `motion(true)` switches motion on later (for the puzzles of the deep cave); the Pilot then waits for
 * every key to land. Battles are random on the page, so they are played until they are over on both sides.
 *
 * The townsfolk stroll, on the page and in the copy alike (their walk follows the game clock, not the dice), and
 * may step into the way: the route is planned again after every key.
 */
export class Pilot {
  state: GameState = initialGame(world, 1);

  constructor(private readonly page: Page) {}

  private sim(input: Partial<Input>) {
    this.state = step(this.state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  }

  /** The page plays with motion (see `motion`): every press is waited for until it has landed. */
  private moving = false;

  async press(key: Press) {
    const input = key === 'up' || key === 'down' || key === 'left' || key === 'right' ? { dir: key, pressed: key } : { [key]: true };
    if (!this.moving) {
      await this.page.keyboard.press(KEYS[key]);
      this.sim(input);
      return;
    }
    // With motion a text box of the copy is not turned key for key: `land` presses A as often as the page needs.
    if (!(key === 'a' && this.state.dialogue)) await this.page.keyboard.press(KEYS[key]);
    this.sim(input);
    await this.land();
  }

  /**
   * Switches motion on or off on the page in the middle of a game (the game follows the media query live). With
   * motion on, one key is no longer one whole move there: a step takes ten ticks, a slide many, a push goes at
   * walking pace and text types itself, while the copy still makes whole moves. So after every key the Pilot
   * waits until the page has landed where the copy is (`land`). Only for places without wild enemies, and call it
   * while nothing is under way.
   */
  async motion(on: boolean) {
    await setMotion(this.page, on);
    this.moving = on;
  }

  /**
   * Waits until the page is where the copy is: the same cell, the same way round, the boulders in the same
   * places and no step, slide or push under way any more (`data-walking`; a direction pressed during one is
   * lost). Then the text box: a page types itself, and A first finishes the page and then turns it, so A is
   * pressed, one change of `data-page` or `data-typed` at a time, until the page shows the page the copy is on,
   * or no text box when the copy has none.
   */
  private async land() {
    const game = gameOf(this.page);
    const { map, x, y, dir } = this.state;
    const pushed = world.maps[map]!.objects.filter((object) => object.push).map((object) => placeOf(object, this.state)).map((at) => `${at.x},${at.y}`).join(' ');
    const want = { map, x: String(x), y: String(y), dir, pushed, walking: 'false' };
    await game.evaluate(
      (el, wanted) =>
        new Promise<void>((resolve, reject) => {
          const started = performance.now();
          const look = () => {
            const data = (el as HTMLElement).dataset;
            if (Object.entries(wanted).every(([name, value]) => data[name] === value)) return resolve();
            if (performance.now() - started > 15000) return reject(new Error(`The game did not land: wanted ${JSON.stringify(wanted)}, got ${JSON.stringify({ ...data })}`));
            requestAnimationFrame(look);
          };
          look();
        }),
      want,
    );
    const page = this.state.dialogue ? String(this.state.dialogue.page) : null;
    const text = () => game.evaluate((el) => ({ open: (el as HTMLElement).dataset.dialogue === 'true', page: (el as HTMLElement).dataset.page ?? '', typed: (el as HTMLElement).dataset.typed === 'true' }));
    /** Waits, frame by frame in the page, until the text box is no longer as it was. */
    const changed = (was: Awaited<ReturnType<typeof text>>) =>
      game.evaluate(
        (el, before) =>
          new Promise<void>((resolve, reject) => {
            const started = performance.now();
            const look = () => {
              const data = (el as HTMLElement).dataset;
              if (`${data.dialogue}|${data.page}|${data.typed}` !== before) return resolve();
              if (performance.now() - started > 10000) return reject(new Error(`The text box did not change: ${before}`));
              requestAnimationFrame(look);
            };
            look();
          }),
        `${was.open}|${was.page}|${was.typed}`,
      );
    for (let i = 0; i < 200; i++) {
      const now = await text();
      if (page === null ? !now.open : now.open && now.page === page) return;
      if (!now.open) {
        // The copy has a text box and the page not yet: the key that opens it has been pressed, it comes by itself.
        await expect(game).toHaveAttribute('data-dialogue', 'true');
        continue;
      }
      // A is only pressed on a page that is typed out, once, and then the change is waited for: a press on a guess
      // could land after the box has closed, and A would then talk to whatever the player faces.
      if (now.typed) await this.page.keyboard.press('z');
      await changed(now);
    }
    throw new Error('The text box on the page never caught up with the copy');
  }

  /** From the title screen to standing in town, the intro read. */
  async start() {
    await this.press('a');
    await this.read();
  }

  /** Presses A until the text box is closed, on both sides. */
  async read() {
    if (this.moving) {
      for (let i = 0; i < 40 && this.state.dialogue; i++) this.sim({ a: true });
      await this.land();
      return;
    }
    const game = gameOf(this.page);
    for (let i = 0; i < 40 && (await game.getAttribute('data-dialogue')) === 'true'; i++) await this.page.keyboard.press('z');
    await expect(game).toHaveAttribute('data-dialogue', 'false');
    for (let i = 0; i < 40 && this.state.dialogue; i++) this.sim({ a: true });
  }

  /** Walks to an object (`<map>:<character>`, see content/maps.ts) and faces it, or steps on it if it is a door. */
  async goTo(objectId: string) {
    for (let i = 0; ; i++) {
      const route = routeTo(world, this.state, objectId);
      if (!route || i > 400) throw new Error(`No way to ${objectId} from ${this.state.map} ${this.state.x},${this.state.y}`);
      await this.press(route[0]!);
      await this.shakeOff();
      if (route.length === 1) break;
    }
    const game = gameOf(this.page);
    await expect(game).toHaveAttribute('data-map', this.state.map);
    await expect(game).toHaveAttribute('data-x', String(this.state.x));
    await expect(game).toHaveAttribute('data-y', String(this.state.y));
  }

  /** Walks to a cell of the current map (where nothing stands to walk up to). */
  async walkTo(x: number, y: number) {
    for (let i = 0; this.state.x !== x || this.state.y !== y; i++) {
      const route = routeToCell(world, this.state, x, y);
      if (!route || i > 400) throw new Error(`No way to ${x},${y} from ${this.state.map} ${this.state.x},${this.state.y}`);
      await this.press(route[0]!);
      await this.shakeOff();
    }
    const game = gameOf(this.page);
    await expect(game).toHaveAttribute('data-x', String(x));
    await expect(game).toHaveAttribute('data-y', String(y));
  }

  /**
   * Solves a puzzle: searches the copy of the game for the fewest presses that lead to a state for which `goal`
   * holds (engine/solve.ts: boulders are pushed, slick rock is slid over, levers are pulled), and plays them on
   * the page and in the copy. Text boxes on the way are part of the presses. For maps without wild enemies.
   */
  async solve(goal: (state: GameState) => boolean) {
    const keys = solve(world, this.state, goal);
    if (!keys) throw new Error(`No way to solve that from ${this.state.map} ${this.state.x},${this.state.y}`);
    for (const key of keys) await this.press(key);
    const game = gameOf(this.page);
    await expect(game).toHaveAttribute('data-map', this.state.map);
    await expect(game).toHaveAttribute('data-x', String(this.state.x));
    await expect(game).toHaveAttribute('data-y', String(this.state.y));
    await expect(game).toHaveAttribute('data-dialogue', String(!!this.state.dialogue));
    return keys;
  }

  /**
   * In the tall grass the dice of the page and of the copy differ: a wild enemy may jump out on one side only.
   * Whoever got one runs from it. RUN always works against a wild enemy and costs nothing, so both sides stand on
   * the same cell afterwards with the same energy, XP and level: the routes out of town cannot be walked without
   * the grass, and a walk along them must not change what a test goes on to check. (Fighting would: XP, levels,
   * and now and then a lost battle that sends the page back to the cafe.)
   *
   * The keys work in every part of a battle: down, down, A reads on while the text is up, and picks RUN (the
   * third entry) once the menu is.
   */
  private async shakeOff() {
    const { map, x, y } = this.state;
    const here = world.maps[map]!;
    if (!here.tiles[here.cells[y]![x]!]?.grass) return;
    const game = gameOf(this.page);
    for (let i = 0; i < 40 && (await game.getAttribute('data-battle')) !== ''; i++) {
      for (const key of ['ArrowDown', 'ArrowDown', 'z']) await this.page.keyboard.press(key);
    }
    await expect(game).toHaveAttribute('data-battle', '');
    for (let i = 0; i < 40 && this.state.battle; i++) {
      this.sim({ dir: 'down', pressed: 'down' });
      this.sim({ dir: 'down', pressed: 'down' });
      this.sim({ a: true });
    }
  }

  /**
   * Presses A (the default choice, every time) until the battle and what follows it are over, on both sides. A new
   * level may offer a move on the way: A takes it (in place of the second move). With `untilOffer` it stops there
   * instead, on both sides, so a test can look at the offer.
   */
  async fight(untilOffer = false) {
    const game = gameOf(this.page);
    const offered = async () => (await game.getAttribute('data-learn')) !== '';
    const busy = async () => (await game.getAttribute('data-battle')) !== '' || (await game.getAttribute('data-dialogue')) === 'true' || (await offered());
    for (let i = 0; i < 600 && (await busy()); i++) {
      if (untilOffer && (await offered())) break;
      await this.page.keyboard.press('z');
    }
    if (!untilOffer) expect(await busy()).toBe(false);
    for (let i = 0; i < 600 && (this.state.battle || this.state.dialogue || this.state.learn); i++) {
      if (untilOffer && this.state.learn) break;
      this.sim({ a: true });
    }
  }

  /**
   * Walks into the tall grass towards an object until a wild enemy jumps out on the page. The dice of the page
   * and of the copy differ, so a battle the copy alone gets is fought there at once, and one the page gets ends
   * the hunt: the test takes over. Paces up and down once it has arrived.
   */
  async hunt(objectId: string) {
    const game = gameOf(this.page);
    const settle = () => {
      for (let i = 0; i < 200 && (this.state.battle || this.state.dialogue); i++) this.sim({ a: true });
    };
    for (let i = 0; i < 300; i++) {
      const route = routeTo(world, this.state, objectId);
      // Arrived (or on top of it): turn round and walk back the way we came, and so on.
      const dir = route && route.length > 1 ? route[0]! : (['left', 'right', 'up', 'down'] as const)[i % 4]!;
      await this.press(dir);
      settle();
      if ((await game.getAttribute('data-battle')) !== '') return;
      // The page may have been stopped by a text box (a find): read it.
      if ((await game.getAttribute('data-dialogue')) === 'true') await this.read();
      await expect(game).toHaveAttribute('data-x', String(this.state.x));
      await expect(game).toHaveAttribute('data-y', String(this.state.y));
    }
    throw new Error(`No wild enemy on the way to ${objectId}`);
  }
}
