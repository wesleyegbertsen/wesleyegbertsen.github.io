import { expect, test, type Page } from '@playwright/test';
import { audioLog, box, openSite, removeAudioContext, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// The sound of Career Quest. No sound is made here: the page gets a recording AudioContext (see helpers.ts), and
// the game says which tune it wants through data-music and which effect it asked for last through data-cue.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');
const VOLUME = 0.125;

async function run(page: Page, line: string) {
  await input(page).fill(line);
  await page.keyboard.press('Enter');
}

/** Opens the terminal with a recording AudioContext and reduced motion (one key is one whole move), and starts the game. */
async function play(page: Page, audio: 'stub' | 'none' = 'stub') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (audio === 'stub') await stubAudioContext(page);
  else await removeAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await run(page, 'play');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

const only = async (page: Page) => {
  const log = await audioLog(page);
  expect(log).toHaveLength(1);
  return log[0]!;
};

test.describe('the sound of the adventure', () => {
  test('play makes one audio context, wakes it and starts the title tune at a modest volume', async ({ page }) => {
    await stubAudioContext(page);
    const { errors } = await openSite(page, '/#/terminal');
    expect(await audioLog(page)).toEqual([]);

    await run(page, 'play');
    await expect(game(page)).toHaveAttribute('data-music', 'title');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');

    const audio = await only(page);
    expect(audio.state).toBe('running');
    expect(audio.resumes).toBeGreaterThanOrEqual(1);
    expect(audio.master).toBe(VOLUME);
    expect(audio.started).toBeGreaterThan(0);
    // The first note of the title tune is a C5 on the pulse voice.
    expect(audio.frequencies[0]).toBe(523);

    // The tune goes on by itself: more notes are started as time passes.
    await expect.poll(async () => (await only(page)).started, { timeout: 4000 }).toBeGreaterThan(audio.started + 4);
    expect(errors).toEqual([]);
  });

  test('M switches the sound off and on again, and says so', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-music', 'town');

    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await expect(status(page)).toHaveText('Sound off');
    expect((await only(page)).master).toBe(0);
    await expect(page.getByText('Sound: off')).toHaveCount(await page.getByText('Arrows or WASD').count());

    // While it is off nothing is started: no notes, no effects.
    const silent = (await only(page)).started;
    await pilot.press('start');
    await pilot.press('b');
    await pilot.press('up');
    await page.waitForTimeout(600);
    expect((await only(page)).started).toBe(silent);

    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
    await expect(status(page)).toHaveText('Sound on');
    const audio = await only(page);
    expect(audio.master).toBe(VOLUME);
    expect(audio.started).toBeGreaterThan(silent);
  });

  test('the speaker on the screen is crossed out while the sound is off', async ({ page }) => {
    await play(page);
    const picture = () => game(page).locator('canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    // Wait for the title to be drawn from the sheets: four shades or more are on the screen then (it starts in
    // colour, so more than the Game Boy's four).
    const shades = () =>
      game(page)
        .locator('canvas')
        .evaluate((el) => {
          const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 160, 144);
          const seen = new Set<number>();
          for (let i = 0; i < data.length; i += 4) seen.add(data[i]!);
          return seen.size;
        });
    await expect.poll(shades).toBeGreaterThanOrEqual(4);
    const on = await picture();
    await page.keyboard.press('m');
    const off = await picture();
    expect(off).not.toBe(on);
    await page.keyboard.press('m');
    expect(await picture()).toBe(on);
  });

  test('Escape stops everything: the context is closed, and playing again makes a fresh one', async ({ page }) => {
    await play(page);
    await page.keyboard.press('Escape');
    await expect(input(page)).toBeFocused();

    const left = await only(page);
    expect(left.state).toBe('closed');
    expect(left.closes).toBe(1);
    await page.waitForTimeout(500);
    expect((await only(page)).started).toBe(left.started);

    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    const log = await audioLog(page);
    expect(log.map((context) => context.state)).toEqual(['closed', 'running']);
    expect(log[0]!.started).toBe(left.started);
  });

  test('the Leave and Skip buttons stop the sound too', async ({ page }) => {
    await play(page);
    await page.getByRole('button', { name: 'Leave' }).click();
    expect((await only(page)).state).toBe('closed');
    await run(page, 'play');
    await page.getByRole('button', { name: 'Skip to text' }).click();
    expect((await audioLog(page)).map((context) => context.state)).toEqual(['closed', 'closed']);
  });

  test('going to another page stops the sound', async ({ page, isMobile }) => {
    await play(page);
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/#\/projects$/);
    // The address changes first; the page follows a render later, and the game tidies up after that. Wait for the
    // other page, and then for the context to be closed, in the page (a look straight after the address is too early).
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(game(page)).toHaveCount(0);
    await page.waitForFunction(() => (window as unknown as { __audio: { state: string }[] }).__audio.every((context) => context.state === 'closed'));
    const left = await only(page);
    expect(left.state).toBe('closed');
    expect(left.closes).toBe(1);
  });

  test('a hidden tab freezes the sound, and it carries on when the tab shows again', async ({ page }) => {
    await play(page);
    const show = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);

    await show(true);
    const frozen = await only(page);
    expect(frozen.state).toBe('suspended');
    expect(frozen.suspends).toBe(1);
    await page.waitForTimeout(500);
    expect((await only(page)).started).toBe(frozen.started);

    await show(false);
    expect((await only(page)).state).toBe('running');
    await expect.poll(async () => (await only(page)).started, { timeout: 4000 }).toBeGreaterThan(frozen.started);
  });

  test('the tune follows the place: town, indoors, a boss battle, and the town again', async ({ page }) => {
    const { pilot } = await play(page);
    await expect(game(page)).toHaveAttribute('data-music', 'title');
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-music', 'town');

    await pilot.goTo('town:A');
    await expect(game(page)).toHaveAttribute('data-music', 'indoors');
    await expect(game(page)).toHaveAttribute('data-cue', 'door');

    const before = (await only(page)).started;
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-battle', 'exam');
    await expect(game(page)).toHaveAttribute('data-music', 'boss');
    // The showdown, then the examiner's cry (it calls out from 700 Hz down to 500).
    await expect(game(page)).toHaveAttribute('data-cue', 'cry:exam');
    // The boss tune opens on an E5 (659 Hz) over a low E.
    const battle = await only(page);
    expect(battle.started).toBeGreaterThan(before);
    expect(battle.frequencies.slice(before)).toContain(659);
    expect(battle.frequencies.slice(before)).toContain(700);

    await pilot.fight();
    await expect(game(page)).toHaveAttribute('data-badges', '1');
    await expect(game(page)).toHaveAttribute('data-music', 'indoors');
    await pilot.goTo('academy:m');
    await expect(game(page)).toHaveAttribute('data-music', 'town');
  });

  test('picking up a gold star plays its effect and counts it', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    const before = await only(page);

    await pilot.goTo('town:5');

    await expect(game(page)).toHaveAttribute('data-cue', 'star');
    await expect(status(page)).toHaveText(/^Found a GOLD STAR! 1 of \d+\.$/);
    await expect(game(page)).toHaveAttribute('data-dialogue', 'false');
    // The two notes of the star effect, a B6 and an E7.
    const after = await only(page);
    expect(after.frequencies.slice(before.frequencies.length)).toEqual(expect.arrayContaining([1976, 2637]));
  });

  test('has a Sound button on touch devices only, which answers a touch within 44px', async ({ page, isMobile }) => {
    await play(page);
    const button = page.getByRole('button', { name: 'Sound', exact: true });
    await expect(button).toHaveCount(isMobile ? 1 : 0);
    await expect(page.getByText('Sound: on')).toHaveCount(isMobile ? 0 : 1);
    if (!isMobile) return;

    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const rect = await box(button);
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await expect(status(page)).toHaveText('Sound off');
    expect((await only(page)).master).toBe(0);

    await page.mouse.down();
    await page.mouse.up();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect((await only(page)).master).toBe(VOLUME);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('remembers that the sound is off for the session, in memory only: a reload starts with it on', async ({ page }) => {
    await play(page);
    const storageBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await page.keyboard.press('Escape');
    await run(page, 'play');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    // The new context starts silent, and stays silent.
    const log = await audioLog(page);
    expect(log.at(-1)!.master).toBe(0);
    expect(log.at(-1)!.started).toBe(0);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storageBefore);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

    await page.reload();
    await expect(input(page)).toBeVisible();
    await run(page, 'play');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
  });

  test('plays in silence, without an error, in a browser that has no AudioContext', async ({ page }) => {
    const { pilot, errors } = await play(page, 'none');
    expect(await page.evaluate(() => 'AudioContext' in window && !!window.AudioContext)).toBe(false);
    await expect(game(page)).toHaveAttribute('data-scene', 'title');

    await pilot.start();
    await pilot.goTo('town:5');
    await expect(status(page)).toHaveText(/^Found a GOLD STAR!/);
    await pilot.goTo('town:A');
    await expect(game(page)).toHaveAttribute('data-map', 'academy');
    // The switch still works: it is what the next visit, in a browser with sound, starts from.
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await expect(status(page)).toHaveText('Sound off');
    await page.keyboard.press('Escape');
    await expect(input(page)).toBeFocused();
    expect(errors).toEqual([]);
  });
});
