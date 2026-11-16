import { expect, test, type Page } from '@playwright/test';
import { frequencyOf } from '../src/features/terminal/game/audio/score.ts';
import { TRACKS } from '../src/features/terminal/game/content/music.ts';
import { audioLog, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// The player piano in the cafe: on, off, on again and out of the cafe. Reduced motion is on (one key is one whole
// move), and the page gets a recording AudioContext.

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

/** The notes each voice of a track starts with, in Hz as the stub writes them down. */
const firstOf = (track: string) =>
  TRACKS[track]!.voices.map((voice) => voice.notes.trim().split(/\s+/)[0]!.split(':')[0]!).filter((token) => /^[A-G]/.test(token)).map((name) => Math.round(frequencyOf(name)));
const heardSince = async (page: Page, from: number) => (await audioLog(page))[0]!.frequencies.slice(from);

test('the music corner of the cafe: the selector of the piano, the Moonlight Sonata, stopped, a musician, and out the door', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await expect(game(page)).toHaveAttribute('data-map', 'cafe');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  // Across the cafe to the front of the stage, where the label of the music corner comes up.
  await pilot.goTo('cafe:k');
  await expect(game(page)).toHaveAttribute('data-banner', 'Music Corner');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');

  // A: the selector, on the Moonlight Sonata. B: closed, and nothing plays.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-pick', 'moonlight');
  await expect(status(page)).toContainText('MOONLIGHT SONATA MVT 1, L. VAN BEETHOVEN, 4:57.');
  await pilot.press('b');
  await expect(game(page)).toHaveAttribute('data-pick', '');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');

  // A, A: the piece, its first notes (the triplets' G sharp and the low C sharp) on the AudioContext.
  let from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'on');
  await expect(game(page)).toHaveAttribute('data-piece', 'moonlight');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  await expect(status(page)).toHaveText('The player piano plays MOONLIGHT SONATA MVT 1.');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('moonlight')));

  // A again: it stops, no selector, and the cafe's own tune from its start.
  from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-pick', '');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await expect(status(page)).toHaveText('The player piano stops.');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('cafe')));

  // The listener behind the chairs.
  await pilot.goTo('cafe:l');
  await pilot.press('a');
  await expect(status(page)).toContainText('That piano knows its pieces by heart');
  await pilot.read();

  // On again, and out of the door: the town's tune, and the piano is off when the player comes back.
  await pilot.goTo('cafe:k');
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'on');
  await pilot.goTo('cafe:m');
  await expect(game(page)).toHaveAttribute('data-map', 'town');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'town');
  await pilot.goTo('town:X');
  await expect(game(page)).toHaveAttribute('data-map', 'cafe');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  expect(errors).toEqual([]);
});

test('the second piece of the player piano: Scarborough Fair chosen with down, its first notes heard, stopped, the Moonlight Sonata again', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await pilot.goTo('cafe:k');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-pick', 'moonlight');
  await pilot.press('down');
  await expect(game(page)).toHaveAttribute('data-pick', 'scarborough-fair');
  await expect(status(page)).toHaveText('SCARBOROUGH FAIR, KATO TATSUYA, 2:26.');
  // A: Scarborough Fair, not the Moonlight Sonata. Its first note: the left hand's C3 (the other voices start on a rest).
  const from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'scarborough-fair');
  await expect(game(page)).toHaveAttribute('data-music', 'scarborough-fair');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('scarborough-fair')));
  // A: stopped. A, A: the first piece of the list again.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'moonlight');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  expect(errors).toEqual([]);
});

test('the third piece of the player piano: Always in my heart chosen with down twice, its first notes heard, stopped, the Moonlight Sonata again', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await pilot.goTo('cafe:k');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-pick', 'moonlight');
  await pilot.press('down');
  await pilot.press('down');
  await expect(game(page)).toHaveAttribute('data-pick', 'always-in-my-heart');
  await expect(status(page)).toHaveText('ALWAYS IN MY HEART, KATO TATSUYA, 3:46.');
  // A: Always in my heart. Its first notes: the right hand's B6, A6 and G6 and the left hand's D5.
  const from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'always-in-my-heart');
  await expect(game(page)).toHaveAttribute('data-music', 'always-in-my-heart');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('always-in-my-heart')));
  // A: stopped. A, A: the first piece of the list again.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'moonlight');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  expect(errors).toEqual([]);
});

test('the fourth piece of the player piano: Unravel chosen with down three times, its first notes heard, stopped, the Moonlight Sonata again', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await pilot.goTo('cafe:k');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-pick', 'moonlight');
  await pilot.press('down');
  await pilot.press('down');
  await pilot.press('down');
  await expect(game(page)).toHaveAttribute('data-pick', 'unravel');
  await expect(status(page)).toHaveText('UNRAVEL, TK, LING TOSITE SIGURE, 1:27.');
  // A: Unravel. Every voice starts on a rest; its first notes are the melody's A#5 (932 Hz) and the left hand's G4.
  const from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'unravel');
  await expect(game(page)).toHaveAttribute('data-music', 'unravel');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining([932, 392]));
  // A: stopped. A, A: the first piece of the list again.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'moonlight');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  expect(errors).toEqual([]);
});

test('the fifth piece of the player piano: aLIEz chosen with down four times, its first notes heard, stopped, the Moonlight Sonata again', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await pilot.goTo('cafe:k');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-pick', 'moonlight');
  for (let i = 0; i < 4; i++) await pilot.press('down');
  await expect(game(page)).toHaveAttribute('data-pick', 'aliez');
  await expect(status(page)).toHaveText('ALIEZ, ALDNOAH.ZERO ED 2, 1:39.');
  // A: aLIEz. Its first note: the melody's E4 (the other voices start on a rest).
  const from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'aliez');
  await expect(game(page)).toHaveAttribute('data-music', 'aliez');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('aliez')));
  // A: stopped. A, A: the first piece of the list again.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await pilot.press('a');
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piece', 'moonlight');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  expect(errors).toEqual([]);
});
