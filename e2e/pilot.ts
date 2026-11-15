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
      if (route.length === 1) break;
    }
    const game = gameOf(this.page);
    await expect(game).toHaveAttribute('data-map', this.state.map);
    await expect(game).toHaveAttribute('data-x', String(this.state.x));
    await expect(game).toHaveAttribute('data-y', String(this.state.y));
  }

  /** Presses A (the default choice, every time) until the battle and what follows it are over, on both sides. */
  async fight() {
    const game = gameOf(this.page);
    const busy = async () => (await game.getAttribute('data-battle')) !== '' || (await game.getAttribute('data-dialogue')) === 'true';
    for (let i = 0; i < 200 && (await busy()); i++) await this.page.keyboard.press('z');
    expect(await busy()).toBe(false);
    for (let i = 0; i < 200 && (this.state.battle || this.state.dialogue); i++) this.sim({ a: true });
  }
}
