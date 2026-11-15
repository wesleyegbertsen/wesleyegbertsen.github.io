import { expect, type Page } from '@playwright/test';
import { education } from '../src/data/education.ts';
import { experience } from '../src/data/experience.ts';
import { profile } from '../src/data/profile.ts';
import { skills } from '../src/data/skills.ts';
import { buildWorld } from '../src/features/terminal/game/content/world.ts';
import { routeTo } from '../src/features/terminal/game/engine/bot.ts';
import { initialGame, step } from '../src/features/terminal/game/engine/engine.ts';
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
   * In the tall grass the dice of the page and of the copy differ: a wild enemy may jump out on one side only.
   * Whoever got one fights it (A, every time), so both sides stand on the same cell again afterwards.
   */
  private async shakeOff() {
    const { map, x, y } = this.state;
    const here = world.maps[map]!;
    if (!here.tiles[here.cells[y]![x]!]?.grass) return;
    const game = gameOf(this.page);
    const busy = async () => (await game.getAttribute('data-battle')) !== '' || (await game.getAttribute('data-learn')) !== '';
    if (await busy()) {
      for (let i = 0; i < 200 && ((await busy()) || (await game.getAttribute('data-dialogue')) === 'true'); i++) await this.page.keyboard.press('z');
    }
    if (this.state.battle) for (let i = 0; i < 200 && (this.state.battle || this.state.dialogue || this.state.learn); i++) this.sim({ a: true });
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
    for (let i = 0; i < 200 && (await busy()); i++) {
      if (untilOffer && (await offered())) break;
      await this.page.keyboard.press('z');
    }
    if (!untilOffer) expect(await busy()).toBe(false);
    for (let i = 0; i < 200 && (this.state.battle || this.state.dialogue || this.state.learn); i++) {
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
