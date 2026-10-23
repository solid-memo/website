# @solid-memo/web

The site, <https://solid-memo.com/>: the app's page, the About page, and
the Vite build that publishes them together with the vocabulary and shapes
(`ns/`), the deck library (`decks/`), the vendored shapes and the docs
(`docs/`, at `/docs/`) ([deployment.md](../../docs/deployment.md)).

## What is in it

- `index.html`: the page, with its Content Security Policy and the
  script that sets the theme before the first paint.
- `src/main.tsx`: the entry point. It calls `@solid-memo/composition`
  with what is the site's own (its name, where it is served, the
  build's values) and renders `src/App.tsx`, which shows Solid Memo, or
  the Studio at its routes, loaded lazily.
- `public/`: files served as they are: the icons, the About page
  (`about/`) and the Studio's old address (`studio/`).
- `vite.config.ts`: the build. It also writes `robots.txt` and
  `sitemap.xml`, on the domain in the repository's `CNAME`
  (`siteMapPlugin`, in `@solid-memo/site/siteMap`), and
  renders the docs to pages under `docs/`, their diagrams drawn in
  Chromium (`docsSitePlugin`, in `@solid-memo/markdown/tooling/publishDocs`,
  [markdown.md](../../docs/markdown.md#the-docs-as-a-site)).

It exports nothing; no package may import it.

## Boundaries

It may import `application`, `domain`, `vocab` and `ui`;
`composition` from `src/main.tsx` only; `studio` from
`src/main.tsx` only, with a dynamic `import()`; `markdown`'s node
tooling from `vite.config.ts` and `src/build.test.ts` only; and
`site`, the site's build, from `vite.config.ts` and tests only
([boundaries.md](../../docs/boundaries.md)).

## Run and test

The build and its test draw the docs' diagrams in Chromium, which
`npm run browsers` installs once (from the root); `DOCS_DIAGRAMS=skip`
builds without them ([configuration.md](../../docs/configuration.md#docs_diagrams)).

```sh
npm run dev     # the site, from source (from the root); the docs at /docs/
npm start       # the site as deployed: built, then served at http://localhost:4173
npx turbo run typecheck test --filter=@solid-memo/web   # 100% coverage, the production build included
npm run test:unit -- apps/web/src/build.test.ts         # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`; it is deployed, never published to npm.

See [deployment.md](../../docs/deployment.md) and
[architecture.md](../../docs/architecture.md).
