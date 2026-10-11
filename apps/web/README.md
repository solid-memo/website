# @solid-memo/web

The site, https://solid-memo.com/: the app's page, the About page, and
the Vite build that publishes them together with the vocabulary and shapes
(`ns/`), the deck library (`decks/`) and the vendored shapes
([deployment.md](../../docs/deployment.md)).

## What is in it

- `index.html`: the page, with its Content Security Policy and the
  script that sets the theme before the first paint.
- `src/main.tsx`: the entry point. It calls `@solid-memo/composition`
  with what is the site's own (its name, where it is served, the
  build's values) and renders `src/App.tsx`, which shows Solid Memo, or
  the Studio at its routes, loaded lazily.
- `public/`: files served as they are: the icons, `robots.txt`,
  `sitemap.xml`, the About page (`about/`) and the Studio's old address
  (`studio/`).
- `vite.config.ts`: the build.

It exports nothing; no package may import it.

## Boundaries

It may import `application`, `domain`, `vocab` and `ui`;
`composition` from `src/main.tsx` only; and `studio` from
`src/main.tsx` only, with a dynamic `import()`
([boundaries.md](../../docs/boundaries.md)).

## Run and test

```sh
npm run dev     # the site, from source (from the root)
npm start       # the site as deployed: built, then served at http://localhost:4173
npx turbo run typecheck test --filter=@solid-memo/web   # 100% coverage, the production build included
npm run test:unit -- apps/web/src/build.test.ts         # one file, from the root
```

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`; it is deployed, never published to npm.

See [deployment.md](../../docs/deployment.md) and
[architecture.md](../../docs/architecture.md).
