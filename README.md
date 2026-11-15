# wesleyegbertsen.github.io

Personal site at <https://www.wesleyegbertsen.nl/>, built with Vite, React and TypeScript.

## Develop

```
npm ci
npm run dev        # dev server
npm test           # unit and component tests
npm run typecheck
npm run lint
npm run build      # production build into dist/
npm run e2e        # real-browser tests with Playwright (see .claude/skills/site-e2e)
```

Node 24 or newer (see `.nvmrc`).

`package.json` has an npm `overrides` entry that lets `eslint-plugin-jsx-a11y` run on ESLint 10: the plugin works there (checked with deliberate violations) but its declared peer range still stops at ESLint 9 (upstream: jsx-eslint/eslint-plugin-jsx-a11y#1075). Remove the override once a release declares support.

TypeScript runs side by side, as Microsoft recommends for 7.0: `tsc` (typecheck and build) is TypeScript 7 (`@typescript/native`), while the package named `typescript` is the 6.0 compatibility package (`@typescript/typescript6`), because TypeScript 7 has no programmatic API and `typescript-eslint` needs one (tracked in typescript-eslint#10940; a new API is expected in TypeScript 7.1). When `typescript-eslint` supports TypeScript 7, point `typescript` back at the real package and drop `@typescript/native`.

## Layout

An architecture overview drawn from the code, with source citations, is in [docs/architecture/overview.html](docs/architecture/overview.html) (open it in a browser).

- `src/features/*`: the hobby easter eggs (matrix backdrop, Poké Balls, cat, Game Boy), each with its hooks and tests
- `src/pages/*`: the two routed pages, `HomePage` (`#/`) and `ProjectsPage` (`#/projects`); `src/App.tsx` holds what every page shares (backdrop, site menu, Game Boy, social bar)
- `src/components/*`: the social bar and its panels, the left site menu (`SiteMenu`) and the project card
- `src/data/*`: skills, work experience, education, menu items and projects as typed data, edit these to update the site: add a line to `navigation.ts` for a menu item, add an entry to `projects.ts` (with screenshots in `src/assets/images/projects/`) for a project
- `src/features/theme/*`: the matrix background colour is the site theme. `themes.ts` holds one palette per colour (green, red, blue, white) and is the only place to change a colour; a test checks every pairing for contrast. The chosen theme is set on `<html>` as `data-theme` plus the CSS custom properties `--accent`, `--accent-hover`, `--accent-on-light`, `--accent-soft` and `--on-accent`, which the CSS modules use instead of hard-coded colours (GitHub and LinkedIn keep their brand colours)
- `src/features/terminal/*`: the shell on `#/terminal`. Its `play` command opens Career Quest, a Game Boy-style adventure in `game/`: `engine/` is the pure game logic, `content/` is what to edit (maps as text grids in `maps.ts`: the town, the roads east and west, Hobby Hills and the cave; people, signposts, gold stars, errands and the ten hobby stops (`HOBBIES`, a draft to rewrite) in `story.ts`; enemies per area (`AREAS`), levels and XP (`LEVELS`), the moves offered at level 5 and 10 (`LEARN`) and items in `battles.ts`; the tunes and sound effects as note text in `music.ts`; the facts come from `src/data`), `render.ts` draws it on a 160x144 canvas, `audio/` plays the music and the effects (synthesized with the Web Audio API like a Game Boy: two pulse voices, a triangle and noise; no audio files). `M` or the Sound button switches the sound off, and the Start menu has a volume row (left and right, 0 to 100%, 50% at the start); both are kept in memory for the session. Wins give XP (levels 1 to 10); the four badges are all the ending needs, the rest of the world is optional. A test proves the first move beats every enemy from full energy at the worst luck, at the lowest level a player can have in each place. `npm test` plays the whole game with a bot and fails if it can no longer be finished
- `scripts/sprites/*`: the game's pixel art as text (`tiles.mjs`, `scenery.mjs`, `characters.mjs`, `enemies.mjs`, `font.mjs`; one character is one pixel, `0`-`3` are the four shades, `.` is see-through). After a change run `npm run sprites`: it rewrites the PNG sheets and `atlas.ts` in `src/features/terminal/game/assets/` (commit them; a test fails when they are out of date). `npm run sprites -- --preview <folder>` also writes 4x enlarged copies to look at. The four shades are `PALETTE` in `generate.mjs`
- `src/assets/*`: images and sounds, imported by components
- `public/*`: served as-is (the `docs/` PDF)

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) type-checks, lints, tests and builds on every push and pull request, and deploys `dist/` to GitHub Pages from `main`.

**One-time setting:** in the repository settings, Pages, Build and deployment, set Source to **GitHub Actions**. Do this *before* merging the migration: with the old "Deploy from a branch" source the raw `index.html` is served and the page is blank. The custom domain is managed in the repository's Pages settings (Custom domain: `www.wesleyegbertsen.nl`, Enforce HTTPS on), not by a file: an Actions-based Pages deploy ignores `CNAME`. After switching the source, confirm the domain and HTTPS still show in the settings, and after the first deploy check the live site and the PDF URL.

Rollback: revert the merge commit on `main`, or set the Pages source back to the branch deploy.
