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
```

Node 22 or newer (see `.nvmrc`).

## Layout

- `src/features/*`: the hobby easter eggs (matrix backdrop, Pikachu, Poké Balls, cat, Game Boy), each with its hooks and tests
- `src/components/*`: the social bar and its skills/work-experience panels
- `src/data/*`: skills and work experience as typed data, edit these to update the CV
- `src/assets/*`: images and sounds, imported by components
- `public/*`: served as-is (`CNAME`, `docs/` PDF)

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) type-checks, lints, tests and builds on every push and pull request, and deploys `dist/` to GitHub Pages from `main`.

**One-time setting:** in the repository settings, Pages, Build and deployment, set Source to **GitHub Actions**. Do this *before* merging the migration: with the old "Deploy from a branch" source the raw `index.html` is served and the page is blank. The custom domain comes from `public/CNAME`.

Rollback: revert the merge commit on `main`, or set the Pages source back to the branch deploy.
