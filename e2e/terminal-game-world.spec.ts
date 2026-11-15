import { expect, test, type Page } from '@playwright/test';
import { audioLog, box, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game, setMotion } from './pilot.ts';

// The wider world of Career Quest: the volume wheel, levels and XP, the roads out of town, Hobby Hills and the
// dark cave. Reduced motion is on (one key is one whole move), and the page gets a recording AudioContext.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');
const canvas = (page: Page) => game(page).locator('canvas');
const DARKEST = '8,24,32';

async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await input(page).fill('play');
  await page.keyboard.press('Enter');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

const master = async (page: Page) => (await audioLog(page))[0]!.master;

/** How many pixels of a part of the game's screen have the darkest shade, and how many it has in all. */
const darkIn = (page: Page, x: number, y: number, w: number, h: number) =>
  canvas(page).evaluate(
    (el, [left, top, width, height, darkest]) => {
      const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(left as number, top as number, width as number, height as number);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (`${data[i]},${data[i + 1]},${data[i + 2]}` === darkest) dark++;
      return { dark, all: data.length / 4 };
    },
    [x, y, w, h, DARKEST] as const,
  );

/** Presses one of the on-screen buttons the way a finger does. */
async function touch(page: Page, name: string) {
  const rect = await box(page.getByRole('button', { name, exact: true }));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test.describe('the volume wheel', () => {
  test('starts at 50%, turns with left and right on the volume row of the Settings tab, and says so', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-volume', '50');
    expect(await master(page)).toBe(0.125);

    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-row', 'volume');
    await expect(status(page)).toHaveText('Volume. Left and right change it.');

    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '60');
    await expect(status(page)).toHaveText('Volume 60%');
    expect(await master(page)).toBeCloseTo(0.15, 6);

    for (let i = 0; i < 6; i++) await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '100');
    await expect(status(page)).toHaveText('Volume 100%');
    expect(await master(page)).toBe(0.25);

    for (let i = 0; i < 12; i++) await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-volume', '0');
    await expect(status(page)).toHaveText('Volume 0%');
    expect(await master(page)).toBe(0);
    // Still the settings: left and right did not switch the tab.
    await expect(game(page)).toHaveAttribute('data-menu', 'settings');
    expect(errors).toEqual([]);
  });

  test('is drawn on the screen as steps that fill up', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    // The ten steps of the wheel sit at 64..104 by 59..67 on the 160 x 144 screen.
    const wheel = () => darkIn(page, 64, 59, 40, 8);
    const half = (await wheel()).dark;
    expect(half).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) await pilot.press('right');
    const full = (await wheel()).dark;
    expect(full).toBeGreaterThan(half * 2);
    for (let i = 0; i < 10; i++) await pilot.press('left');
    expect((await wheel()).dark).toBe(0);
  });

  test('is apart from the M switch: off stays silent while the wheel turns, on comes back at the new level', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('right');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '70');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    expect(await master(page)).toBe(0);
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
    expect(await master(page)).toBeCloseTo(0.175, 6);
  });

  test('lasts for the session, in memory only: a reload starts at 50% again', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-volume', '40');
    await page.keyboard.press('Escape');
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-volume', '40');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /volume|sound|game/i.test(key)))).toEqual([]);
    await page.reload();
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-volume', '50');
  });

  test('turns with the D-pad on a touch device', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The D-pad exists on touch devices only');
    await play(page);
    await touch(page, 'A');
    for (let i = 0; i < 12 && (await game(page).getAttribute('data-dialogue')) === 'true'; i++) await touch(page, 'A');
    await touch(page, 'Start');
    await touch(page, 'Left');
    await touch(page, 'Down');
    await expect(game(page)).toHaveAttribute('data-row', 'volume');
    await touch(page, 'Right');
    await touch(page, 'Right');
    await expect(game(page)).toHaveAttribute('data-volume', '70');
    await expect(status(page)).toHaveText('Volume 70%');
    await touch(page, 'Left');
    await expect(game(page)).toHaveAttribute('data-volume', '60');
    expect(await master(page)).toBeCloseTo(0.15, 6);
  });
});

test.describe('the settings', () => {
  test('are the third tab of the Start menu, and SOUND there is the same switch as M', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-menu', 'badges');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-menu', 'settings');
    await expect(game(page)).toHaveAttribute('data-row', 'sound');
    await expect(status(page)).toHaveText('Settings. Sound, volume and screen.');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await expect(status(page)).toHaveText('Sound off');
    expect(await master(page)).toBe(0);
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
    expect(await master(page)).toBe(0.125);
    // The bag no longer has a volume row: down stays in the list.
    await pilot.press('right');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-menu', 'items');
    await expect(game(page)).toHaveAttribute('data-row', '');
  });

  test('the screen has an LCD look laid over it, which SCREEN switches off and on', async ({ page, isMobile }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    const lcd = page.getByTestId('lcd');
    await expect(game(page)).toHaveAttribute('data-lcd', 'on');
    await expect(lcd).toHaveAttribute('aria-hidden', 'true');
    // Exactly over the screen, and it lets the pointer through.
    const over = await box(lcd);
    const under = await box(canvas(page));
    for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(over[side] - under[side])).toBeLessThan(1);
    expect(await lcd.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await lcd.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    // The lens: a shadow along the inner edge, wider at the top and the left than at the bottom and the right.
    const shadow = await lcd.evaluate((el) => getComputedStyle(el).boxShadow);
    const insets = [...shadow.matchAll(/(-?\d+)px (-?\d+)px (\d+)px (-?\d+)px inset/g)].map((match) => match.slice(1, 5).map(Number));
    expect(insets).toHaveLength(2);
    // Both ways: the first shadow comes in from the left and from the top, the second from the right and from the
    // bottom, and the first reaches more than twice as far in each direction.
    for (const axis of [0, 1]) {
      expect(insets[0]![axis], `axis ${axis}`).toBeGreaterThan(0);
      expect(insets[1]![axis], `axis ${axis}`).toBeLessThan(0);
      expect(insets[0]![axis], `axis ${axis}`).toBeGreaterThan(Math.abs(insets[1]![axis]!) * 2);
    }
    // The grid is drawn fainter on a phone than on a desktop, where a game pixel is bigger.
    const grid = await lcd.evaluate((el) => getComputedStyle(el).backgroundImage);
    const alpha = Number(/rgba\(8, 24, 32, ([\d.]+)\)/.exec(grid)![1]);
    if (isMobile) expect(alpha).toBeLessThanOrEqual(0.08);
    else expect(alpha).toBeGreaterThanOrEqual(0.12);
    // The grid is one cell per game pixel.
    const cell = await lcd.evaluate((el) => parseFloat(getComputedStyle(el).backgroundSize));
    expect(cell).toBeCloseTo(under.width / 160, 1);
    // The picture under it is untouched: still the four shades and nothing else.
    const shades = await canvas(page).evaluate((el) => {
      const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 160, 144);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return seen.size;
    });
    expect(shades).toBeLessThanOrEqual(4);

    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-row', 'screen');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-lcd', 'off');
    await expect(status(page)).toHaveText('LCD look off');
    await expect(lcd).toHaveCount(0);
    await pilot.press('a');
    await expect(lcd).toHaveCount(1);
    await expect(status(page)).toHaveText('LCD look on');
    expect(errors).toEqual([]);
  });
});

test.describe('levels', () => {
  test('a wild enemy has a level, and beating it gives XP by that level', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-level', '1');
    await expect(game(page)).toHaveAttribute('data-xp', '0');
    // Into the meadow at the bottom left of town, where a gold star lies in the tall grass.
    await pilot.hunt('town:3');
    const enemy = await game(page).getAttribute('data-battle');
    expect(['bug', 'typo', 'lint', 'todo']).toContain(enemy);
    await expect(status(page)).toHaveText(/^A wild [A-Z ]+ appeared!$/);
    const level = Number(await game(page).getAttribute('data-foe-level'));
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(2);

    const heard: string[] = [];
    for (let i = 0; i < 80 && (await game(page).getAttribute('data-battle')) !== ''; i++) {
      await page.keyboard.press('z');
      heard.push((await status(page).textContent()) ?? '');
    }
    await expect(game(page)).toHaveAttribute('data-battle', '');
    expect(heard).toContain(`You gain ${level * 3} XP.`);
    await expect(game(page)).toHaveAttribute('data-xp', String(level * 3));
    // It drops coins by its level too: two per level, on top of the fifteen of the start.
    expect(heard).toContain(`You pick up ${level * 2} COINS.`);
    await expect(game(page)).toHaveAttribute('data-coins', String(15 + level * 2));
  });

  test('a boss is worth a level or two, which shows in the energy', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-foe-level', '3');
    await pilot.fight();
    // FINAL EXAM is level 3: 30 XP, which is level 3. Base 30, a badge 5, two levels 6.
    await expect(game(page)).toHaveAttribute('data-xp', '30');
    await expect(game(page)).toHaveAttribute('data-level', '3');
    await expect(game(page)).toHaveAttribute('data-hp', '41');
    // And a boss drops far more than a wild enemy: ten coins per level.
    await expect(game(page)).toHaveAttribute('data-coins', '45');
  });
});

test.describe('the cafe', () => {
  test('is a building in town with a tune of its own, where the barista restores energy and moves', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-coins', '15');
    await pilot.goTo('town:X');
    await expect(game(page)).toHaveAttribute('data-map', 'cafe');
    await expect(game(page)).toHaveAttribute('data-banner', 'Cafe');
    await expect(game(page)).toHaveAttribute('data-music', 'cafe');
    await expect(status(page)).toHaveText('Cafe');
    await pilot.goTo('cafe:B');
    // With motion the rest is played through: its jingle first, and only after it her words, on the screen and in
    // the status region. The moments are taken in the page, frame by frame.
    await pilot.motion(true);
    await game(page).evaluate((el) => {
      const times: Record<string, number> = {};
      (window as unknown as { __rest: Record<string, number> }).__rest = times;
      const region = document.querySelector('[role="status"]')!;
      const before = region.textContent;
      const look = () => {
        const data = (el as HTMLElement).dataset;
        if (data.cue === 'rest') times.rest ??= performance.now();
        if (data.dialogue === 'true') times.words ??= performance.now();
        if (region.textContent !== before) times.told ??= performance.now();
        if (!times.words || !times.told) requestAnimationFrame(look);
      };
      look();
    });
    await pilot.press('a');
    // (The cue is `rest` while it plays; with motion the typing of her words blips after it.)
    const times = await page.evaluate(() => (window as unknown as { __rest: Record<string, number> }).__rest);
    expect(times.rest).toBeGreaterThan(0);
    expect(times.words! - times.rest!).toBeGreaterThanOrEqual(2500);
    expect(times.told! - times.rest!).toBeGreaterThanOrEqual(2500);
    await expect(status(page)).not.toHaveText('Cafe');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-hp', '30');
    await pilot.motion(false);
    // Back out onto the road in front of its door.
    await pilot.goTo('cafe:m');
    await expect(game(page)).toHaveAttribute('data-map', 'town');
    await expect(game(page)).toHaveAttribute('data-music', 'town');
    expect(errors).toEqual([]);
  });

  test('has a shop: A buys one, too few coins buy nothing, B leaves, and the money is in memory only', async ({ page }) => {
    const { pilot } = await play(page);
    const storage = await page.evaluate(() => Object.keys(localStorage).sort());
    await pilot.start();
    await pilot.goTo('town:X');
    await pilot.goTo('cafe:V');
    await pilot.press('a');
    await expect(status(page)).toHaveText(/We take COINS/);
    await expect(game(page)).toHaveAttribute('data-shop', '');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-shop', 'cafe');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'stroopwafel');
    await expect(status(page)).toHaveText('CAFE SHOP. You have 15 COINS. A buys, left and right change how many, B leaves. STROOPWAFEL, 5 COINS: Restores 10 energy. In your bag: 0.');
    // The list is on the screen in place of the map: mostly the lightest shade, and no player walks about.
    const place = { x: await game(page).getAttribute('data-x'), y: await game(page).getAttribute('data-y') };
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-x', place.x!);

    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'coffee');
    await expect(status(page)).toHaveText('COFFEE, 10 COINS: Restores 20 energy. In your bag: 2.');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-coins', '5');
    await expect(game(page)).toHaveAttribute('data-cue', 'coin');
    await expect(status(page)).toHaveText('You buy one COFFEE for 10 COINS. 5 COINS left.');
    expect(pilot.state.items.coffee).toBe(3);

    // The energy drink is 25: nothing is bought, and it says why.
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'energydrink');
    await pilot.press('a');
    await expect(status(page)).toHaveText('Not enough COINS: the ENERGY DRINK is 25, you have 5.');
    await expect(game(page)).toHaveAttribute('data-coins', '5');
    await expect(game(page)).toHaveAttribute('data-shop', 'cafe');

    await pilot.press('b');
    await expect(game(page)).toHaveAttribute('data-shop', '');
    await expect(game(page)).toHaveAttribute('data-shop-row', '');
    await expect(status(page)).toHaveText('Thanks! Come back any time.');
    await pilot.read();

    // Nothing was written anywhere: the coins live in the session. Leaving and playing again keeps them; a reload does not.
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storage);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await page.keyboard.press('Escape');
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-coins', '5');
    await page.reload();
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toBeFocused();
    await page.keyboard.press('z');
    await expect(game(page)).toHaveAttribute('data-coins', '15');
  });

  test('the shop sells several at once: left and right pick how many, up to what the coins pay for', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:X');
    await pilot.goTo('cafe:V');
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-shop-row', 'stroopwafel');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '1');
    // 15 COINS and a STROOPWAFEL is 5: two, three, and not four.
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '2');
    await expect(status(page)).toHaveText('2 STROOPWAFEL for 10 COINS.');
    await pilot.press('right');
    await expect(status(page)).toHaveText('3 STROOPWAFEL for 15 COINS.');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '3');
    await expect(game(page)).toHaveAttribute('data-cue', 'bump');
    await expect(status(page)).toHaveText('Not enough COINS for 4 STROOPWAFEL: that is 20, you have 15.');
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '2');
    await expect(game(page)).toHaveAttribute('data-coins', '15');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-coins', '5');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '1');
    await expect(status(page)).toHaveText('You buy 2 STROOPWAFEL for 10 COINS. 5 COINS left.');
    expect(pilot.state.items.stroopwafel).toBe(2);
    // Another row starts at one again; the way out has no count.
    await pilot.press('right');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'coffee');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '1');
    await pilot.press('b');
    await expect(game(page)).toHaveAttribute('data-shop-amount', '');
    await pilot.read();
  });

  test('the shop is bought from with the buttons on a touch device', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The buttons exist on touch devices only');
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:X');
    await pilot.goTo('cafe:V');
    // From here on a finger does it: A to talk and to read on, the D-pad down the list, A to buy, B to leave.
    await touch(page, 'A');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    for (let i = 0; i < 12 && (await game(page).getAttribute('data-dialogue')) === 'true'; i++) await touch(page, 'A');
    await expect(game(page)).toHaveAttribute('data-shop', 'cafe');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'stroopwafel');
    await touch(page, 'A');
    await expect(game(page)).toHaveAttribute('data-coins', '10');
    await expect(status(page)).toHaveText('You buy one STROOPWAFEL for 5 COINS. 10 COINS left.');
    await touch(page, 'Down');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'coffee');
    await touch(page, 'A');
    await expect(game(page)).toHaveAttribute('data-coins', '0');
    await touch(page, 'A');
    await expect(status(page)).toHaveText('Not enough COINS: the COFFEE is 10, you have 0.');
    await expect(game(page)).toHaveAttribute('data-coins', '0');
    await touch(page, 'Up');
    await expect(game(page)).toHaveAttribute('data-shop-row', 'stroopwafel');
    await touch(page, 'B');
    await expect(game(page)).toHaveAttribute('data-shop', '');
    await expect(status(page)).toHaveText('Thanks! Come back any time.');
    // The list fitted the screen of the phone: the whole Game Boy is still in view.
    await expect(game(page).locator('canvas')).toBeInViewport({ ratio: 1 });
  });
});

test.describe('beyond the town', () => {
  test('the main road leads east to Hobby Hills, where a stop stamps the card', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await pilot.goTo('town:)');
    await expect(game(page)).toHaveAttribute('data-map', 'east');
    await expect(game(page)).toHaveAttribute('data-music', 'route');
    // A road, not a door: it sounds like steps.
    await expect(game(page)).toHaveAttribute('data-cue', 'path');
    await expect(status(page)).toHaveText('East Road');
    await pilot.goTo('east:)');
    await expect(game(page)).toHaveAttribute('data-map', 'hills');
    await expect(game(page)).toHaveAttribute('data-music', 'hills');

    await pilot.goTo('hills:1');
    await pilot.press('a');
    await expect(status(page)).toContainText('A telescope');
    await pilot.read();
    await expect(status(page)).toHaveText('Found a HOBBY STAMP! 1 of 10.');
    await expect(game(page)).toHaveAttribute('data-cue', 'star');
    // Looking again gives the text, not a second stamp.
    await pilot.press('a');
    await pilot.read();
    await expect(status(page)).not.toHaveText(/HOBBY STAMP/);
    expect(pilot.state.items.stamp).toBe(1);

    // A signpost at the corner of the ring road says where the stops are.
    await pilot.goTo('hills:p');
    await pilot.press('a');
    await expect(status(page)).toHaveText('RING ROAD, north side.');
    await pilot.press('a');
    await expect(status(page)).toHaveText('East along the road: the TELESCOPE, the ARCADE and the GATE.');
    await pilot.read();
    // Someone fishes at the end of the jetty in the pond: out onto the planks, over the water, to talk.
    await pilot.goTo('hills:E');
    await expect(game(page)).toHaveAttribute('data-x', '14');
    await expect(game(page)).toHaveAttribute('data-y', '11');
    await expect(game(page)).toHaveAttribute('data-dir', 'up');
    await pilot.press('a');
    await expect(status(page)).toContainText('I come here to fish.');
    await pilot.read();
    expect(errors).toEqual([]);
  });

  test('the cave turns a beginner away', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:(');
    await expect(game(page)).toHaveAttribute('data-map', 'west');
    await pilot.goTo('west:D');
    await expect(game(page)).toHaveAttribute('data-map', 'west');
    await expect(status(page)).toContainText('Come back at Lv 3');
  });

  test('a ledge across the road is a wall on the way out and a hop on the way back, which stays out of the grass', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await pilot.goTo('town:)');
    // Straight on along the road: the first line of ledges stops the player, eight cells in.
    for (let i = 0; i < 12; i++) await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-map', 'east');
    await expect(game(page)).toHaveAttribute('data-x', '8');
    await expect(game(page)).toHaveAttribute('data-cue', 'bump');
    expect(pilot.state.x).toBe(8);
    // Round the ledges through the grass (the Pilot runs from what jumps out), to the far end and back onto the road.
    await pilot.goTo('east:)');
    await pilot.goTo('hills:(');
    await expect(game(page)).toHaveAttribute('data-map', 'east');
    await expect(game(page)).toHaveAttribute('data-x', '24');

    // Back: one key, all the way. Each ledge is one press that goes two cells, with its own sound.
    const seen: number[] = [];
    const cues: string[] = [];
    let heard = Number(await game(page).getAttribute('data-cues'));
    for (let i = 0; i < 30 && (await game(page).getAttribute('data-map')) === 'east'; i++) {
      await pilot.press('left');
      if ((await game(page).getAttribute('data-map')) !== 'east') break;
      seen.push(Number(await game(page).getAttribute('data-x')));
      // The sound of this press, if it made one: the count of sounds so far tells.
      const count = Number(await game(page).getAttribute('data-cues'));
      cues.push(count > heard ? ((await game(page).getAttribute('data-cue')) ?? '') : '');
      heard = count;
      await expect(game(page)).toHaveAttribute('data-battle', '');
      await expect(game(page)).toHaveAttribute('data-y', '5');
    }
    await expect(game(page)).toHaveAttribute('data-map', 'town');
    // The cells of the ledges (19 and 9) are never stood on: 20 is followed by 18, 10 by 8.
    expect(seen).not.toContain(19);
    expect(seen).not.toContain(9);
    expect(seen[seen.indexOf(20) + 1]).toBe(18);
    expect(seen[seen.indexOf(10) + 1]).toBe(8);
    expect(cues[seen.indexOf(18)]).toBe('jump');
    expect(cues[seen.indexOf(8)]).toBe('jump');
    expect(cues.filter((cue) => cue === 'jump')).toHaveLength(2);
    expect(cues).not.toContain('bump');
    expect(pilot.state.map).toBe('town');
    expect(errors).toEqual([]);
  });

  test('a hop over a ledge is an arc through the air when motion is allowed', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:(');
    // Out to the chest in the far band of grass of the West Road, and back to the road left of the first line of
    // ledges (a bush closes its top end).
    await pilot.goTo('west:C');
    await pilot.walkTo(15, 4);
    await expect(game(page)).toHaveAttribute('data-x', '15');
    await expect(game(page)).toHaveAttribute('data-y', '4');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-y', '5');

    await setMotion(page, true);
    // Every frame the browser draws: where the game says the player is, whether a hop is under way, and how much
    // of the shadow under the hop shows. The view follows the player here, who is always drawn at 72, 64; the
    // shadow is 8 by 2 pixels of the dark shade at the feet, and the feet themselves cover it on the ground.
    await page.evaluate(() => {
      const scope = window as unknown as { frames: unknown[]; recording: boolean };
      scope.frames = [];
      scope.recording = true;
      const root = document.querySelector<HTMLElement>('[role="application"]')!;
      const screen = root.querySelector('canvas')!;
      const look = () => {
        if (!scope.recording) return;
        const { data } = screen.getContext('2d')!.getImageData(76, 77, 8, 2);
        let shadow = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] === 52 && data[i + 1] === 104 && data[i + 2] === 86) shadow++;
        scope.frames.push({ at: performance.now(), x: Number(root.dataset.x), jump: root.dataset.jump, cue: root.dataset.cue, shadow });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    // Right, and hold it: over the ledge and on along the road.
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('[role="application"]')!.dataset.x) >= 19);
    await page.keyboard.up('ArrowRight');
    const frames = (await page.evaluate(() => {
      const scope = window as unknown as { frames: unknown[]; recording: boolean };
      scope.recording = false;
      return scope.frames;
    })) as { at: number; x: number; jump: string; cue: string; shadow: number }[];
    const hop = frames.filter((frame) => frame.jump === 'true');
    // Sixteen ticks at sixty a second, about a quarter of a second. The game counts the player as landed from the
    // start, two cells on: never a stop on the ledge's own cell. After it, plain steps again.
    expect(hop.length).toBeGreaterThanOrEqual(5);
    // It ended somewhere between the last frame that showed it and the first frame after. When the browser skips
    // a few frames right at the landing, the frames in the air alone look too short (112 ms was seen once), so
    // the least it must have lasted is measured up to the first frame on the ground, the most over the frames in the air.
    const landed = frames.find((frame) => frame.at > hop.at(-1)!.at)!;
    expect(landed.jump).toBe('false');
    expect(landed.at - hop[0]!.at).toBeGreaterThan(120);
    expect(hop.at(-1)!.at - hop[0]!.at).toBeLessThan(700);
    for (const frame of hop) expect(frame.x).toBe(17);
    // In the air the whole shadow shows; on the ground it never does.
    expect(hop.some((frame) => frame.shadow === 16)).toBe(true);
    expect(Math.max(...frames.filter((frame) => frame.jump !== 'true').map((frame) => frame.shadow))).toBeLessThan(16);
    expect(hop.some((frame) => frame.cue === 'jump')).toBe(true);
    const cells = frames.map((frame) => frame.x);
    expect(cells).not.toContain(16);
    expect(cells).toContain(18);
    expect(frames.filter((frame) => frame.x >= 18).every((frame) => frame.jump === 'false')).toBe(true);
  });

  test('the cave is dark: light around the player, black further off, and the tune changes', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    // Level 3 first: the FINAL EXAM is worth that.
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await pilot.fight();
    await pilot.goTo('academy:m');
    await pilot.goTo('town:(');
    // In daylight the screen is far from black.
    const outside = await darkIn(page, 0, 0, 160, 144);
    expect(outside.dark / outside.all).toBeLessThan(0.35);

    await pilot.goTo('west:D');
    await expect(game(page)).toHaveAttribute('data-map', 'cave');
    await expect(game(page)).toHaveAttribute('data-music', 'cave');
    await expect(status(page)).toHaveText('The Cave');
    // Walked in going left: arrived at the east side of the cave, still facing left, with the sound of a cave.
    await expect(game(page)).toHaveAttribute('data-dir', 'left');
    await expect(game(page)).toHaveAttribute('data-x', '21');
    await expect(game(page)).toHaveAttribute('data-cue', 'cave');

    const whole = await darkIn(page, 0, 0, 160, 144);
    expect(whole.dark / whole.all).toBeGreaterThan(0.6);
    // The far corner is black (the top left: the speaker sits in the top right); the player's own cell is not.
    const corner = await darkIn(page, 0, 0, 32, 32);
    expect(corner.dark).toBe(corner.all);
    const x = Number(await game(page).getAttribute('data-x'));
    const y = Number(await game(page).getAttribute('data-y'));
    // The cave is 24 x 17 cells and the view 10 x 9: the camera holds the player near the right edge.
    const left = Math.max(0, Math.min(24 * 16 - 160, x * 16 + 8 - 80));
    const top = Math.max(0, Math.min(17 * 16 - 144, y * 16 + 8 - 72));
    const here = await darkIn(page, x * 16 - left, y * 16 - top, 16, 16);
    expect(here.dark).toBeLessThan(here.all * 0.8);
    // A step on, the light has moved along.
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-x', String(x - 1));
    const after = await darkIn(page, 0, 0, 160, 144);
    expect(after.dark / after.all).toBeGreaterThan(0.6);
    expect(errors).toEqual([]);
  });
});

test.describe('the deep cave', () => {
  /** Where a cell of the deep cave (24 x 19) is on the 160 x 144 screen, with the player at `px`, `py`. */
  const onScreen = (px: number, py: number, x: number, y: number) => {
    const left = Math.max(0, Math.min(24 * 16 - 160, px * 16 + 8 - 80));
    const top = Math.max(0, Math.min(19 * 16 - 144, py * 16 + 8 - 72));
    return { x: x * 16 - left, y: y * 16 - top };
  };

  /**
   * Starts writing down, frame by frame in the page, what the game shows while motion is on: how many frames a
   * step was under way, how many a text was half typed, and every cell the player was on, in order.
   */
  const watch = (page: Page) =>
    page.evaluate(() => {
      const seen = { walking: 0, typing: 0, cells: [] as string[], on: true };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      const el = document.querySelector<HTMLElement>('[role="application"]')!;
      let last = `${el.dataset.x},${el.dataset.y}`;
      const look = () => {
        if (!seen.on) return;
        if (el.dataset.walking === 'true') seen.walking++;
        if (el.dataset.dialogue === 'true' && el.dataset.typed === 'false') seen.typing++;
        const cell = `${el.dataset.x},${el.dataset.y}`;
        if (cell !== last) seen.cells.push(cell);
        last = cell;
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
  /** Stops it and hands over what was seen. */
  const watched = (page: Page) =>
    page.evaluate(() => {
      const { __seen: seen } = window as unknown as { __seen: { walking: number; typing: number; cells: string[]; on: boolean } };
      seen.on = false;
      return seen;
    });

  test('a ladder behind a cracked wall leads down to it; boulders are pushed onto plates, slick rock is slid over, and the last door asks for level 5; the puzzles are played with motion', async ({ page }) => {
    test.slow();
    const { pilot, errors } = await play(page);
    await pilot.start();
    // Level 3 first: the FINAL EXAM is worth that.
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await pilot.fight();
    await pilot.goTo('academy:m');
    await pilot.goTo('town:(');
    await pilot.goTo('west:D');
    await expect(game(page)).toHaveAttribute('data-map', 'cave');

    // The ladder is behind a wall. A long walk through the dark, past rubble (the Pilot runs from what jumps out),
    // to the chest room at the far end: in its east wall the rock has a crack.
    await pilot.goTo('cave:w');
    await expect(game(page)).toHaveAttribute('data-x', '5');
    await expect(game(page)).toHaveAttribute('data-y', '1');
    // It is drawn as rock (dark, with the darkest shade in it), and walking into it is walking into rock.
    const wall = await darkIn(page, 6 * 16 - 8, 16, 16, 16);
    expect(wall.all).toBe(256);
    expect(wall.dark).toBeGreaterThan(40);
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-x', '5');
    await expect(game(page)).toHaveAttribute('data-cue', 'bump');
    // Looked at, it says what is seen, and then gives way with a rumble: the wall is floor now, for good.
    await pilot.press('a');
    await expect(status(page)).toHaveText('This rock has a crack in it. A draught whistles through.');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-cue', 'gate');
    await expect(status(page)).toHaveText('You lean on it. It gives way! A passage leads on into the dark.');
    await pilot.read();
    expect((await darkIn(page, 6 * 16 - 8, 16, 16, 16)).dark).toBe(0);
    await pilot.goTo('cave:L');
    await expect(game(page)).toHaveAttribute('data-map', 'deep');
    await expect(game(page)).toHaveAttribute('data-cue', 'cave');
    await expect(game(page)).toHaveAttribute('data-music', 'cave');
    await expect(game(page)).toHaveAttribute('data-banner', 'The Deep Cave');
    await expect(status(page)).toHaveText('The Deep Cave');
    await expect(game(page)).toHaveAttribute('data-pushed', '11,2 14,3');

    // Dark, but the fire bowl of the boulder hall lights the cells around it: the floor beside it, four cells from
    // the player, is beyond the player's own light and still plain to see.
    await pilot.goTo('deep:r');
    const x = Number(await game(page).getAttribute('data-x'));
    const y = Number(await game(page).getAttribute('data-y'));
    const bowl = onScreen(x, y, 12, 2);
    const fire = await darkIn(page, bowl.x, bowl.y, 16, 16);
    expect(fire.all).toBe(256);
    expect(fire.dark).toBeLessThan(fire.all * 0.2);
    // The corridor behind the player is black, away from every light.
    const behind = onScreen(x, y, x - 4, y + 2);
    const rock = await darkIn(page, behind.x, behind.y, 16, 16);
    expect(rock.dark).toBe(rock.all);

    // One push, by hand: into the hall, round the first boulder, and push it down.
    await pilot.goTo('deep:n');
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-x', '11');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-pushed', '11,3 14,3');
    await expect(game(page)).toHaveAttribute('data-cue', 'push');
    await expect(status(page)).toHaveText('You push the boulder down.');
    // Against the rock below it does not move.
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-pushed', '11,3 14,3');
    await expect(game(page)).toHaveAttribute('data-cue', 'bump');
    await expect(status(page)).toHaveText('The boulder does not move down: something is in the way.');
    // The lever puts it back.
    await pilot.goTo('deep:r');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-pushed', '11,2 14,3');
    await expect(status(page)).toHaveText('You pull the lever. The boulders roll back to where they started.');
    await pilot.read();

    // From here on WITH motion, as most people play: a step takes ten ticks, a push goes at walking pace, a slide
    // goes cell by cell and text types itself. The Pilot waits for every key to land before the next.
    await pilot.motion(true);
    await watch(page);

    // The gate is shut until both plates are down. The Pilot finds the pushes by searching its copy of the game.
    const pushes = await pilot.solve((state) => !!state.flags['deep:plates'] && !state.dialogue);
    await expect(game(page)).toHaveAttribute('data-pushed', '15,4 16,2');
    // The last page of what is said then (the first one says that both plates are down).
    await expect(status(page)).toContainText('will not move again.');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'false');
    // It really moved: steps were seen under way, about ten ticks each, and the text was seen half typed.
    const hall = await watched(page);
    const steps = pushes.filter((key) => key !== 'a').length;
    expect(hall.walking).toBeGreaterThan(steps * 4);
    expect(hall.typing).toBeGreaterThan(10);

    // Through the open gate and on to the slick rock. Once with reduced motion: one press is the whole slide.
    await pilot.motion(false);
    await pilot.goTo('deep:i');
    await expect(game(page)).toHaveAttribute('data-banner', 'Slick Rock');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-y', '14');
    await expect(game(page)).toHaveAttribute('data-x', '19');
    await expect(game(page)).toHaveAttribute('data-cue', 'bump');
    await expect(status(page)).toHaveText('You slide down 5 steps and stop against a rock.');
    // On into the rock: nothing moves, and the status says why.
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-y', '14');
    await expect(status(page)).toHaveText('You cannot slide down: a rock is in the way.');

    // The rest of it with motion: every slide passes over the cells between, one by one, and says where it ended.
    await pilot.motion(true);
    await watch(page);
    await pilot.press('left');
    const first = await watched(page);
    await expect(status(page)).toHaveText(/^You slide left \d steps and stop against a (rock|fire bowl)\.$/);
    const landed = Number(await game(page).getAttribute('data-x'));
    expect(landed).toBeLessThan(18);
    expect(first.cells).toEqual(Array.from({ length: 19 - landed }, (_, i) => `${18 - i},14`));
    const slides = await pilot.solve((state) => state.x === 12 && state.y === 13);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    await expect(game(page)).toHaveAttribute('data-x', '12');
    await expect(status(page)).toHaveText(/^You slide left \d steps? and stop on firm ground\.$/);

    // The riddle: add, commit, push. Three terminals whose text types itself.
    await pilot.solve((state) => !!state.flags['deep:shipped'] && !state.dialogue);
    await expect(status(page)).toContainText('rolls open.');
    await pilot.motion(false);

    // The way to the boss is open and short, and the door still asks for level 5.
    await expect(game(page)).toHaveAttribute('data-level', '3');
    await pilot.goTo('deep:D');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    await expect(status(page)).toContainText('Lv 5 and up');
    await expect(game(page)).toHaveAttribute('data-battle', '');
    expect(errors).toEqual([]);
  });
});

test.describe('the name of a place', () => {
  // The label is a box of the name's width plus 11 pixels, centred at the top: its top edge is a dark line.
  const edge = (page: Page, name: string) => {
    const width = name.length * 6 + 11;
    return darkIn(page, Math.floor((160 - width) / 2), 0, width, 1);
  };

  test('is shown on a label at the top when the game starts and on the way into a building, and said once', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-banner', 'Career Town');
    const shown = await edge(page, 'Career Town');
    expect(shown.dark).toBe(shown.all);
    // With reduced motion it is whole or gone: a few moves later it is gone, and stays away while in town.
    for (let i = 0; i < 6; i++) await pilot.press(i % 2 === 0 ? 'left' : 'right');
    await expect(game(page)).toHaveAttribute('data-banner', '');
    expect((await edge(page, 'Career Town')).dark).toBeLessThan(shown.all);

    await pilot.goTo('town:A');
    await expect(game(page)).toHaveAttribute('data-map', 'academy');
    await expect(game(page)).toHaveAttribute('data-banner', 'Academy');
    await expect(status(page)).toHaveText('Academy');
    const inside = await edge(page, 'Academy');
    expect(inside.dark).toBe(inside.all);
    // Back outside the town is named again.
    await pilot.goTo('academy:m');
    await expect(game(page)).toHaveAttribute('data-banner', 'Career Town');
    await expect(status(page)).toHaveText('Career Town');
    expect(errors).toEqual([]);
  });

  test('names a part of the town on the way in, and not on the way out', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:F');
    await expect(game(page)).toHaveAttribute('data-banner', 'Fountain Plaza');
    await expect(status(page)).toHaveText('Fountain Plaza');
    // Down the road again, out of the plaza: no new label, and the old one runs out.
    await pilot.goTo('town:7');
    await expect(game(page)).toHaveAttribute('data-banner', '');
    await expect(status(page)).toHaveText('Fountain Plaza');
  });

  test('slides in and out by itself when motion is allowed', async ({ page }) => {
    await stubAudioContext(page);
    await openSite(page, '/#/terminal');
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toBeFocused();
    await page.keyboard.press('z');
    await expect(game(page)).toHaveAttribute('data-dialogue', 'true');
    // The label waits above the screen while the intro is read: the game clock stands still in a text box.
    await expect(game(page)).toHaveAttribute('data-banner', '');
    // The text types itself; A shows the rest and turns the page.
    for (let i = 0; i < 200 && (await game(page).getAttribute('data-dialogue')) === 'true'; i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(50);
    }
    await expect(game(page)).toHaveAttribute('data-dialogue', 'false');
    // No key is touched from here on: the label comes down, stays a moment and goes back up.
    await expect(game(page)).toHaveAttribute('data-banner', 'Career Town');
    await expect.poll(async () => (await edge(page, 'Career Town')).dark, { timeout: 3000, intervals: [50] }).toBe(77);
    await expect(game(page)).toHaveAttribute('data-banner', '', { timeout: 6000 });
    expect((await edge(page, 'Career Town')).dark).toBeLessThan(77);
  });
});
