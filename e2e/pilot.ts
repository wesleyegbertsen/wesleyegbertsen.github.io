import { expect, type Page } from '@playwright/test';
import { education } from '../src/data/education.ts';
import { experience } from '../src/data/experience.ts';
import { profile } from '../src/data/profile.ts';
import { skills } from '../src/data/skills.ts';
import { buildWorld } from '../src/features/terminal/game/content/world.ts';
import { routeTo } from '../src/features/terminal/game/engine/bot.ts';
import { initialGame, step } from '../src/features/terminal/game/engine/engine.ts';
import { solve } from '../src/features/terminal/game/engine/solve.ts';
import { NO_INPUT, type GameState, type Input } from '../src/features/terminal/game/engine/types.ts';

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
 * Plays the game on the page and in a copy of the engine at the same time, so a test can ask for "walk to the
 * Academy's door" instead of a list of keys. Needs reduced motion on the page: one key is then one whole move.
 * Battles are random on the page, so they are played until they are over on both sides.
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

  async press(key: Press) {
    await this.page.keyboard.press(KEYS[key]);
    this.sim(key === 'up' || key === 'down' || key === 'left' || key === 'right' ? { dir: key, pressed: key } : { [key]: true });
  }

  /** From the title screen to standing in town, the intro read. */
  async start() {
    await this.press('a');
    await this.read();
  }

  /** Presses A until the text box is closed, on both sides. */
  async read() {
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
   * and now and then a lost battle that sends the page back to a coffee machine.)
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
