# @solid-memo/ui

The Preact UI: the components and the router, the messages in each
language, the theme and the site's stylesheet. It receives `UseCases`
as a prop and knows no adapter.

## Exports

- `@solid-memo/ui/<Component>` is `src/ui/<Component>.tsx`, such as
  `App`, `Footer` and `DeckListScreen`.
- A few `.ts` modules, listed one by one in `package.json`, such as
  `router` and `documentTitle`.
- `@solid-memo/ui/style.css`, the site's stylesheet, and
  `@solid-memo/ui/i18n/<locale>.json`, the messages
  ([i18n.md](../../docs/i18n.md)).
- `@solid-memo/ui/test/*`: the test setup and a fake `UseCases`, for
  the apps' tests.

## Boundaries

It may import `application`, `domain` and `vocab`, and `markdown` from
`src/ui/` only. It never imports a port's adapter. `apps/web`,
`apps/studio` and `e2e/journeys` (`harness/strings.ts` alone, for the
app's text) may import it. Preact, TanStack Query and the fonts are
used here and in the apps ([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/ui   # 100% coverage
npm run test:unit -- packages/ui/src/ui/Footer.test.tsx   # one file, from the root
```

The tests run in happy-dom with Testing Library. A message added to
`en.json` needs the same key in every locale.

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md),
[i18n.md](../../docs/i18n.md), [theme.md](../../docs/theme.md) and
[routing.md](../../docs/routing.md).
