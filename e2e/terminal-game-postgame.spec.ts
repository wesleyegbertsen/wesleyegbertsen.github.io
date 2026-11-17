import { expect, test, type Page } from '@playwright/test';
import { CRIES } from '../src/features/terminal/game/content/music.ts';
import { DEX } from '../src/features/terminal/game/content/dex.ts';
import { audioLog, box, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// After the end: KEEP EXPLORING, then the world as before (a walk, a find, a wild fight) and the DEX with the three
// of the last fight. Reduced motion is on (one key is one whole move), and the page gets a recording AudioContext.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');

async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await input(page).fill('play');
  await page.keyboard.press('Enter');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

/** Presses one of the on-screen buttons the way a finger does. */
async function touch(page: Page, name: string) {
  const rect = await box(page.getByRole('button', { name, exact: true }));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test('KEEP EXPLORING after the end: the world as before, and THE IMPOSTOR in the DEX with its cry', async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  const { pilot, errors } = await play(page);
  await pilot.start();
  const beat = async (boss: string) => {
    await pilot.goTo(boss);
    await pilot.press('a');
    await pilot.read();
    await pilot.fight();
  };
  // The four badges, then Wesley's three.
  await pilot.goTo('town:A');
  await beat('academy:E');
  await pilot.goTo('academy:m');
  await pilot.goTo('town:O');
  await pilot.goTo('office:1');
  await pilot.press('a');
  await pilot.read();
  await pilot.goTo('office:D');
  await beat('office:B');
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
  await pilot.goTo('contact:H');
  await pilot.press('a');
  await pilot.fight();
  await expect(game(page)).toHaveAttribute('data-finished', 'true');
  await expect(game(page)).toHaveAttribute('data-scene', 'ending');
  await expect(status(page)).toContainText('THE END');
  await expect(game(page)).toHaveAttribute('data-seen', /\d+/);

  // KEEP EXPLORING: A on the keyboard, the Keep exploring button on a phone (there is no D-pad on the ending screen).
  await pilot.keepExploring(isMobile ? () => touch(page, 'Keep exploring') : undefined);
  await expect(game(page)).toHaveAttribute('data-finished', 'true');
  await expect(game(page)).toHaveAttribute('data-map', 'contact');
  if (isMobile) await expect(page.getByRole('button', { name: 'Up', exact: true })).toBeVisible();

  // Wesley again: a line and the details, and the ending screen once more; no battle. Then back out.
  await pilot.press('a');
  await expect(status(page)).toContainText('Still exploring?');
  await pilot.read();
  await expect(game(page)).toHaveAttribute('data-scene', 'ending');
  await expect(game(page)).toHaveAttribute('data-battle', '');
  await pilot.keepExploring();

  // A walk out, and a find: the chest on the East Road (coins and an item).
  await pilot.goTo('contact:m');
  await expect(game(page)).toHaveAttribute('data-map', 'town');
  const coins = Number(await game(page).getAttribute('data-coins'));
  await pilot.goTo('town:)');
  await pilot.goTo('east:C');
  await pilot.press('a');
  await pilot.read();
  expect(Number(await game(page).getAttribute('data-coins'))).toBeGreaterThan(coins);

  // A wild fight in the tall grass round the chest, won, with XP when there is a level left.
  const xp = Number(await game(page).getAttribute('data-xp'));
  const level = Number(await game(page).getAttribute('data-level'));
  await pilot.hunt('east:C');
  await expect(game(page)).not.toHaveAttribute('data-battle', '');
  await pilot.fight();
  await expect(game(page)).toHaveAttribute('data-battle', '');
  if (level < 10) expect(Number(await game(page).getAttribute('data-xp'))).toBeGreaterThan(xp);

  // The DEX: THE IMPOSTOR (No. 26) is seen; its page, and its cry.
  await pilot.press('start');
  await pilot.press('right');
  await pilot.press('right');
  await expect(game(page)).toHaveAttribute('data-menu', 'dex');
  const row = DEX.findIndex((entry) => entry.enemy === 'impostor');
  for (let i = 0; i < row; i++) await pilot.press('down');
  await expect(game(page)).toHaveAttribute('data-dex-row', 'impostor');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-dex', 'impostor');
  await expect(status(page)).toContainText(`No. ${row + 1} THE IMPOSTOR. BOSS.`);
  const before = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-cue', 'cry:impostor');
  await expect.poll(async () => (await audioLog(page))[0]!.frequencies.slice(before)).toContain(Math.round(CRIES.impostor!.from));
  // The other two of the last fight are a press away.
  await pilot.press('up');
  await expect(game(page)).toHaveAttribute('data-dex', 'review');
  await pilot.press('up');
  await expect(game(page)).toHaveAttribute('data-dex', 'interview');
  await pilot.press('b');
  await pilot.press('b');
  await expect(game(page)).toHaveAttribute('data-menu', '');
  expect(errors).toEqual([]);
});
