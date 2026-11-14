---
name: site-e2e
description: Use when testing, debugging or visually checking wesleyegbertsen.github.io (the Vite + React site) in a real browser with Playwright, when adding or changing an e2e test, or when a change touches the easter eggs, panels, matrix backdrop, layout or deploy output. Holds how to run the suite on Windows and the traps found while building it.
---

# Site e2e (Playwright)

Unit tests (Vitest + jsdom, `src/**/*.test.*`) cover logic. Playwright (`e2e/`) covers what jsdom cannot:
real audio, real canvas pixels, layout at real sizes, the built output. Use both.

## Run it

```
npm run e2e                                   # build, preview, run everything (desktop 1440x900 + mobile 360x740)
npx playwright test -g "Poké Balls"           # one test by title
npx playwright test --project=mobile          # one viewport
npx playwright show-trace test-results/<dir>/trace.zip   # after a failure
```

- Takes about 15 s. It always runs `npm run build` first and serves `dist/` with `vite preview` on port 4173.
- Browser: on Windows outside CI it drives the Edge that ships with Windows (`channel: 'msedge'`), so no download. Elsewhere, and in CI, it uses Playwright's Chromium (`npx playwright install --with-deps chromium`). Set `PW_CHANNEL=chrome` (or `msedge`) to force an installed browser.
- CI: `.github/workflows/deploy.yml` has an `e2e` job (installs Chromium, runs `npm run e2e`) and the deploy job needs it. The harness runtime gate also runs `npm run e2e` (`.wesharness.json`), so it needs port 4173 free.
- Headless by default (no window opens). Watch it with `npx playwright test --headed --workers=1` or `--ui`.
- Failures leave screenshots and traces in `test-results/` (git-ignored).

## Traps (each one cost time)

1. **Never reuse a running preview server.** An old `vite preview` on 4173 serves a stale `dist/`, and Playwright then skips the rebuild, so tests pass against old code. The config sets `reuseExistingServer: false` for this reason; if the port is busy the run fails loudly. Find and stop the leftover on Windows: `Get-NetTCPConnection -LocalPort 4173 -State Listen` then `Stop-Process -Id <pid> -Force` (`pkill` does nothing here).
2. **Prove a new test can fail.** Break the behaviour on purpose (for example change a volume in the component), run that test, see it fail, then `git checkout` the file. A green test you never saw red proves little. This is how trap 1 was found.
3. **`getByRole` skips hidden elements.** The cat starts hidden (`visibility: hidden` and `inert`), so use `getByRole('button', { name: 'Cat', includeHidden: true })`, or `toBeHidden()`/`toHaveAttribute()` assertions find nothing and time out. The video is found by `getByTitle('Titan cat video')`.
4. **Audio is checked through the real `play()`.** `e2e/helpers.ts` wraps `HTMLMediaElement.prototype.play` before the page loads and records `src`, `volume`, start offset and whether the promise resolved (so autoplay refusals show up). Built asset names are hashed (`cat-AbC123.mp3`), so match a substring, and note `'cat-'` matches the meow but not `cat_rap`. `playsOf(page, 'gb-')` style.
5. **Stub YouTube, and make the stub opaque.** The hidden video is a YouTube embed; `stubYouTube` keeps tests offline. A stub page with a transparent body makes the iframe look empty in screenshots (the rain shows through) even though it is visible. It looked like a bug and was not.
6. **Headless Edge cannot go below about 500 px wide from the CLI** (`msedge --headless --screenshot --window-size=360,...` renders a 500 px layout and crops it). Use Playwright's `viewport`/devices for mobile, never the CLI.
7. **Unfound Poké Balls are almost invisible on purpose.** `pokeball.png` is 2052x2048 and the button shows only its 32x32 corner until found. They are real buttons named `Poké Ball 1`..`4`, so click them by role.
8. **Matrix backdrop.** Click the exposed background at `(3, 3)` to cycle the colour (the card covers the middle). Read pixels with `getImageData` (`litPixels`) to check it rains, stays black under `page.emulateMedia({ reducedMotion: 'reduce' })`, and stops when `document.hidden` is overridden to `true` and `visibilitychange` is dispatched. Storage key: `currentMatrixFontColorIndex`, valid values `0`-`3`; anything else falls back to green.
9. **The cat overlaps the social bar** (cat z-index 3, bar 2). That is how the original site behaved; it is not a regression.
10. **Panels live in a fixed dialog above the social bar**, not anchored to their button. Check them with `toBeInViewport({ ratio: 1 })` at both viewports; work experience scrolls inside the panel, so the last job starts out of view.

## Looking at the page (not just asserting)

Assertions do not tell you it looks right. To see it, add a temporary spec such as `e2e/_shots.spec.ts` that opens the site with `openSite(page)`, drives it, and calls `page.screenshot({ path: '<scratchpad>/name.png' })`; run it with `npx playwright test _shots`, `Read` the images, then delete the spec. Do not commit it.

## Adding a test

- Put it in `e2e/*.spec.ts`; start with `const { errors } = await openSite(page)` (it records audio, stubs YouTube and collects console errors) and assert `errors` is empty if the page should be clean.
- Query by role and accessible name like a user; the easter eggs are real buttons with `aria-label`s. State that has no accessible form is exposed as `data-*` (`data-playing`, `data-glasses`, `data-visible`, `data-found`).
- Run it on both projects. Keep timeouts honest: the Pikachu clip really takes a few seconds.
- Logic that does not need a browser belongs in Vitest instead (`src/**/*.test.*`; Vitest is configured to ignore `e2e/`).

## Unit-test learnings (Vitest)

- `userEvent` under `vi.useFakeTimers()` hangs. Use `vi.useFakeTimers({ shouldAdvanceTime: true })`, and assert timer boundaries with margins (1800 ms absent, 2200 ms present), not exact milliseconds, because real time leaks in.
- jsdom has no media playback or canvas: `src/test/setup.ts` stubs `play`/`pause`, `src/test/fakeAudio.ts` records `Audio` instances, and canvas tests mock `getContext`.
- Check the Pikachu art with the pinned SHA-256 in `pikachu.test.ts`; `.gitattributes` has `*.txt -text` so line endings never change the hash.

## Other repo facts

- Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (the harness runtime gate runs all five; CI runs them too).
- Deploy: GitHub Actions publishes `dist/` to Pages. The repository's Pages source must be "GitHub Actions" before the migration merges or the live site is blank.
- Windows prints "LF will be replaced by CRLF" warnings on `git add`; they are harmless.
- When writing many files from the shell, prefer the Write tool: a large bash heredoc once failed to parse and wrote nothing.
