import { expect, test, type Page } from '@playwright/test';
import { education } from '../src/data/education.ts';
import { profile } from '../src/data/profile.ts';
import { box, openSite } from './helpers.ts';
import { Pilot, gameOf as game, setMotion } from './pilot.ts';

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const log = (page: Page) => page.getByRole('log', { name: 'Terminal output' });
const status = (page: Page) => page.getByRole('status');
const canvas = (page: Page) => game(page).locator('canvas');
const glass = (page: Page) => page.getByRole('heading', { level: 1, name: 'Terminal' }).locator('..');
const BUTTONS = ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start', 'Select', 'Sound'];

async function run(page: Page, line: string) {
  await input(page).fill(line);
  await page.keyboard.press('Enter');
}

const glassSize = async (page: Page) => {
  const rect = await glass(page).boundingBox();
  return `${Math.round(rect!.width)}x${Math.round(rect!.height)}`;
};

/** The colours on the game's canvas, as `r,g,b` strings. */
const colours = (page: Page) =>
  canvas(page).evaluate((el) => {
    const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 160, 144);
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return [...seen].sort();
  });

/** The text types itself; A shows the rest and then turns the page. Presses A until the box is closed. */
async function closeText(page: Page, pressA: () => Promise<void>) {
  for (let i = 0; i < 60 && (await game(page).getAttribute('data-dialogue')) === 'true'; i++) {
    await pressA();
    await page.waitForTimeout(50);
  }
  await expect(game(page)).toHaveAttribute('data-dialogue', 'false');
}

/** Opens the terminal with reduced motion (one key is one whole move) and starts the game. */
async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const opened = await openSite(page, '/#/terminal');
  await run(page, 'play');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

test.describe('the adventure in the terminal', () => {
  test('play opens the game on the same page, in a panel of the same size', async ({ page }) => {
    const { errors } = await openSite(page, '/#/terminal');
    const empty = await glassSize(page);

    await run(page, 'play');

    await expect(game(page)).toBeVisible();
    await expect(game(page)).toBeFocused();
    await expect(game(page)).toHaveAttribute('data-scene', 'title');
    await expect(input(page)).toHaveCount(0);
    await expect(log(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/terminal$/);
    expect(await glassSize(page)).toBe(empty);
    await expect(canvas(page)).toHaveCount(1);
    await expect(canvas(page)).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas(page)).toHaveAttribute('width', '160');
    await expect(canvas(page)).toHaveAttribute('height', '144');
    expect(errors).toEqual([]);
  });

  test('draws the screen from the sprite sheets, in four shades of green', async ({ page }) => {
    const { pilot } = await play(page);
    // The title: light paper, dark letters, the grass and the trees.
    await expect.poll(() => colours(page)).toEqual(['136,192,112', '224,248,208', '52,104,86', '8,24,32']);

    await pilot.start();
    const town = await colours(page);
    expect(town).toEqual(['136,192,112', '224,248,208', '52,104,86', '8,24,32']);
  });

  test('scales the screen up crisply and fills the panel with the Game Boy', async ({ page, isMobile }) => {
    await play(page);
    await expect(canvas(page)).toHaveCSS('image-rendering', 'pixelated');
    const screen = await box(canvas(page));
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    // A whole number of device pixels per game pixel, and the 10:9 shape of the real screen.
    const perPixel = (screen.width / 160) * dpr;
    expect(Math.abs(perPixel - Math.round(perPixel))).toBeLessThan(0.02);
    expect(screen.width / screen.height).toBeCloseTo(160 / 144, 2);
    expect(screen.width).toBeGreaterThanOrEqual(isMobile ? 230 : 480);

    // The frame is inside the panel and takes (nearly) all of its height or width.
    const frame = await box(canvas(page).locator('xpath=ancestor::div[@data-wide]'));
    const panel = await box(glass(page));
    expect(frame.x).toBeGreaterThanOrEqual(panel.x);
    expect(frame.x + frame.width).toBeLessThanOrEqual(panel.x + panel.width);
    const area = await box(canvas(page).locator('xpath=ancestor::div[@data-wide]/..'));
    if (isMobile) expect(frame.width).toBeGreaterThan(area.width - 2);
    expect(frame.height).toBeGreaterThan(area.height - 2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('walks while an arrow key is held, and the page does not scroll', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    await page.keyboard.press('z');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    await closeText(page, () => page.keyboard.press('z'));
    const y = Number(await game(page).getAttribute('data-y'));

    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => Number(await game(page).getAttribute('data-y'))).toBeLessThan(y - 1);
    await page.keyboard.up('ArrowUp');

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tells the story in the live region: the intro, then a teacher from the data', async ({ page }) => {
    const { pilot } = await play(page);
    await expect(status(page)).toHaveText('');

    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    await expect(status(page)).toContainText('Career Town.');
    await pilot.read();

    await pilot.goTo('town:A');
    await expect(game(page)).toHaveAttribute('data-map', 'academy');
    await expect(status(page)).toHaveText('Academy');

    await pilot.goTo('academy:1');
    await pilot.press('a');
    await expect(status(page)).toContainText(education.at(-1)!.school);
  });

  test('keeps the office shut without a diploma', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:O');
    await expect(game(page)).toHaveAttribute('data-map', 'town');
    await expect(status(page)).toContainText('Graduates only.');
  });

  test('a battle starts, is won with the default choice, and earns the badge that opens the office', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-battle', 'exam');
    await expect(status(page)).toHaveText('FINAL EXAM wants to battle!');

    await pilot.press('a');
    await pilot.press('a');
    await pilot.press('a');
    await expect(status(page)).toContainText(/You use DEBUG! FINAL EXAM loses \d HP\./);

    await pilot.fight();
    await expect(game(page)).toHaveAttribute('data-battle', '');
    await expect(game(page)).toHaveAttribute('data-badges', '1');
    // Base 30, the badge 5, and the two levels the exam was worth 6.
    await expect(game(page)).toHaveAttribute('data-hp', '41');

    await pilot.press('start');
    await expect(game(page)).toHaveAttribute('data-menu', 'items');
    await pilot.press('b');
    await pilot.goTo('academy:m');
    await pilot.goTo('town:O');
    await expect(game(page)).toHaveAttribute('data-map', 'office');
  });

  test('can be played to the end, where the contact details are shown', async ({ page }) => {
    // Two battles of the last fight are played with motion: every hit blinks for about a second (round eight).
    test.setTimeout(120_000);
    const { pilot, errors } = await play(page);
    await pilot.start();
    const beat = async (boss: string) => {
      await pilot.goTo(boss);
      await pilot.press('a');
      await pilot.read();
      await pilot.fight();
    };
    await pilot.goTo('town:A');
    await beat('academy:E');
    await pilot.goTo('academy:m');
    await pilot.goTo('town:O');
    await pilot.goTo('office:1');
    await pilot.press('a');
    await pilot.read();
    await pilot.goTo('office:D');
    // LEGACY CODE is worth level 5, and level 5 offers a new move: the battle stops at the offer.
    await pilot.goTo('office:B');
    await pilot.press('a');
    await pilot.read();
    await pilot.fight(true);
    await expect(game(page)).toHaveAttribute('data-learn', 'hotfix');
    await expect(game(page)).toHaveAttribute('data-level', '5');
    await expect(status(page)).toContainText('You can learn HOTFIX');
    await pilot.press('down');
    await expect(status(page)).toHaveText('Replace DEPLOY: power 16, hits 70%, 5 PP');
    await pilot.press('a');
    // It asks first; YES is under the cursor.
    await expect(status(page)).toHaveText('Replace DEPLOY with HOTFIX? Yes or no.');
    await expect(game(page)).toHaveAttribute('data-learn', 'hotfix');
    // YES and NO stand side by side: right to NO, left back to YES.
    await pilot.press('right');
    await expect(status(page)).toHaveText('No');
    await pilot.press('left');
    await expect(status(page)).toHaveText('Yes');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-learn', '');
    await expect(status(page)).toHaveText('You forget DEPLOY and learn HOTFIX!');
    expect(pilot.state.moves).toEqual(['debug', 'refactor', 'hotfix', 'break']);
    await pilot.fight();
    await expect(game(page)).toHaveAttribute('data-badges', '2');
    await pilot.goTo('office:D');
    await pilot.goTo('office:m');
    await pilot.goTo('town:S');
    await beat('workshop:B');
    await pilot.goTo('workshop:m');
    await pilot.goTo('town:L');
    await beat('library:B');
    await pilot.goTo('library:m');
    await expect(game(page)).toHaveAttribute('data-badges', '4');
    await pilot.goTo('town:P');
    // Wesley is the final boss: three battles in a row, and only then the contact details.
    await pilot.goTo('contact:H');
    // With motion from here until the third battle is on: the way into the first one is the whole show of a
    // boss, the way into the two that follow it is the short one. Written down in the page, frame by frame.
    await setMotion(page, true);
    await page.evaluate(() => {
      const scope = window as unknown as { ways: Record<string, { kind: string; cue: string; from: number; to: number }>; watching: boolean };
      scope.ways = {};
      scope.watching = true;
      const root = document.querySelector<HTMLElement>('[role="application"]')!;
      const look = () => {
        if (!scope.watching) return;
        const { transition = '', battle = '', cue = '' } = root.dataset;
        if (transition) {
          const way = (scope.ways[battle] ??= { kind: transition, cue, from: performance.now(), to: 0 });
          way.to = performance.now();
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    const met = new Set<string>();
    const on = async (enemy: string) => (await game(page).getAttribute('data-battle')) === enemy && (await game(page).getAttribute('data-transition')) === '';
    // The text types itself now: A, with a moment in between, until the first battle is on the screen.
    for (let i = 0; i < 400 && !(await on('interview')); i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(30);
    }
    await expect(game(page)).toHaveAttribute('data-battle', 'interview');
    await expect(game(page)).toHaveAttribute('data-music', 'final');
    await expect(status(page)).toHaveText('JOB INTERVIEW wants to battle!');
    await expect(game(page)).toHaveAttribute('data-finished', 'false');
    for (let i = 0; i < 1500 && !(await on('impostor')); i++) {
      met.add((await game(page).getAttribute('data-battle')) ?? '');
      await page.keyboard.press('z');
      await page.waitForTimeout(30);
    }
    const ways = await page.evaluate(() => {
      const scope = window as unknown as { ways: Record<string, { kind: string; cue: string; from: number; to: number }>; watching: boolean };
      scope.watching = false;
      return Object.fromEntries(Object.entries(scope.ways).map(([enemy, way]) => [enemy, { kind: way.kind, cue: way.cue, ms: way.to - way.from }]));
    });
    expect(Object.fromEntries(Object.entries(ways).map(([enemy, way]) => [enemy, `${way.kind} ${way.cue}`]))).toEqual({ interview: 'boss showdown', review: 'quick round', impostor: 'quick round' });
    // 108 ticks at 60 a second are 1.8 seconds, 36 are 0.6: give or take a slow frame.
    expect(ways.interview!.ms).toBeGreaterThan(1400);
    for (const enemy of ['review', 'impostor']) {
      expect(ways[enemy]!.ms, enemy).toBeGreaterThan(350);
      expect(ways[enemy]!.ms, enemy).toBeLessThan(1300);
    }
    // The rest of it at one press per move again.
    await setMotion(page, false);
    for (let i = 0; i < 600 && (await game(page).getAttribute('data-finished')) !== 'true'; i++) {
      met.add((await game(page).getAttribute('data-battle')) ?? '');
      await page.keyboard.press('z');
    }
    expect([...met].filter(Boolean)).toEqual(['interview', 'review', 'impostor']);

    await expect(game(page)).toHaveAttribute('data-finished', 'true');
    await expect(game(page)).toContainText(profile.links.email);
    await expect(status(page)).toContainText('THE END');
    expect(errors).toEqual([]);

    // A finished game starts again.
    await page.keyboard.press('Escape');
    await run(page, 'play');
    await expect(game(page)).toHaveAttribute('data-scene', 'title');
  });

  test('Escape returns to the shell with the command line focused', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'whoami');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(input(page)).toBeFocused();
    await expect(log(page)).toContainText("Left the game. Type 'play' to carry on.");
    await expect(log(page)).toContainText(/whoami\s*guest/);
    await run(page, 'whoami');
    await expect(log(page)).toContainText(/whoami\s*guest\s*(.|\n)*whoami\s*guest/);
  });

  test('with reduced motion a press moves the game once and then it stands still', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    const picture = () => canvas(page).evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const before = await picture();

    await pilot.press('up');
    const after = await picture();
    expect(after).not.toBe(before);

    await page.waitForTimeout(500);
    expect(await picture()).toBe(after);
  });

  test('shows the D-pad and the buttons on touch devices only, and the keyboard list elsewhere', async ({ page, isMobile }) => {
    await play(page);
    for (const name of BUTTONS) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(isMobile ? 1 : 0);
    }
    await expect(page.getByText('Arrows or WASD')).toHaveCount(isMobile ? 0 : 1);
  });

  test('every on-screen button answers a touch within a 44px square', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The buttons exist on touch devices only');
    await play(page);
    for (const name of ['Up', 'Down', 'Left', 'Right', 'Select', 'Start', 'Sound', 'A', 'B']) {
      const button = page.getByRole('button', { name, exact: true });
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const owns = (x: number, y: number) => document.elementFromPoint(x, y) === el;
        // The farthest each side that still lands on this button, probed in whole pixels.
        let up = 0;
        while (up < 30 && owns(cx, cy - r.height / 2 - up - 1)) up++;
        let down = 0;
        while (down < 30 && owns(cx, cy + r.height / 2 + down + 1)) down++;
        return { height: r.height + up + down };
      });
      expect(hit.height, name).toBeGreaterThanOrEqual(43);
    }
  });

  test('the on-screen buttons play the game on a touch device and stay inside the panel', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The buttons exist on touch devices only');
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    const press = async (name: string, hold = 0) => {
      const rect = await box(page.getByRole('button', { name, exact: true }));
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      if (hold) await page.waitForTimeout(hold);
      await page.mouse.up();
    };

    const panel = await box(glass(page));
    const screen = await box(canvas(page));
    for (const name of BUTTONS) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const rect = await box(button);
      expect(rect.x).toBeGreaterThanOrEqual(panel.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(rect.y).toBeGreaterThanOrEqual(screen.y + screen.height);
      expect(Math.min(rect.width, rect.height)).toBeGreaterThanOrEqual(26);
    }

    await press('A');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    await closeText(page, () => press('A'));
    const y = Number(await game(page).getAttribute('data-y'));
    await press('Up', 600);
    await expect.poll(async () => Number(await game(page).getAttribute('data-y'))).toBeLessThan(y);

    await press('Start');
    await expect(game(page)).toHaveAttribute('data-menu', 'items');
    await press('B');
    await expect(game(page)).toHaveAttribute('data-menu', '');
    await press('Select');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
  });

  test('resumes where it was after a visit to another page, and writes nothing to storage', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page, '/#/terminal');
    const storageBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    const pilot = new Pilot(page);
    await pilot.start();
    await pilot.goTo('town:b');
    const place = { x: String(pilot.state.x), y: String(pilot.state.y) };

    const goTo = async (name: string) => {
      if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name }).click();
    };
    await goTo('Projects');
    await expect(page).toHaveURL(/#\/projects$/);
    await goTo('Terminal');

    await expect(game(page)).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-scene', 'world');
    await expect(game(page)).toHaveAttribute('data-x', place.x);
    await expect(game(page)).toHaveAttribute('data-y', place.y);
    // The picture is back too, not a blank screen.
    await expect.poll(async () => (await colours(page)).length).toBe(4);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storageBefore);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });

  test('a reload brings the shell back, and play starts at the title again', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:b');

    await page.reload();
    await expect(input(page)).toBeVisible();
    await run(page, 'play');

    await expect(game(page)).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-scene', 'title');
  });

  test('play skip prints the career as text', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'play skip');

    await expect(log(page)).toContainText('Betabit');
    await expect(log(page)).toContainText(profile.links.email);
    await expect(game(page)).toHaveCount(0);
  });

  test('the Skip button leaves the game and prints the career', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');

    await page.getByRole('button', { name: 'Skip to text' }).click();

    await expect(input(page)).toBeFocused();
    await expect(log(page)).toContainText('Betabit');
    await expect(log(page)).toContainText(profile.links.email);
  });
});
