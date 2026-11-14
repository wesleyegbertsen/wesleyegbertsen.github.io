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

## Layout

An architecture overview drawn from the code, with source citations, is in [docs/architecture/overview.html](docs/architecture/overview.html) (open it in a browser).

- `src/features/*`: the hobby easter eggs (matrix backdrop, Pikachu, Poké Balls, cat, Game Boy), each with its hooks and tests
- `src/components/*`: the social bar and its skills/work-experience panels
- `src/data/*`: skills and work experience as typed data, edit these to update the CV
- `src/assets/*`: images and sounds, imported by components
- `public/*`: served as-is (the `docs/` PDF; `CNAME` is an unneeded leftover, see Deployment)

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) type-checks, lints, tests and builds on every push and pull request, and deploys `dist/` to GitHub Pages from `main`.

**One-time setting:** in the repository settings, Pages, Build and deployment, set Source to **GitHub Actions**. Do this *before* merging the migration: with the old "Deploy from a branch" source the raw `index.html` is served and the page is blank. The custom domain is managed in the repository's Pages settings (Custom domain: `www.wesleyegbertsen.nl`, Enforce HTTPS on), not by a file: an Actions-based Pages deploy ignores `CNAME`. `public/CNAME` is a leftover from the branch deploy, where GitHub kept it at the repo root. It is harmless but not needed (see the follow-up issue to remove it). After switching the source, confirm the domain and HTTPS still show in the settings, and after the first deploy check the live site and the PDF URL.

Rollback: revert the merge commit on `main`, or set the Pages source back to the branch deploy.
