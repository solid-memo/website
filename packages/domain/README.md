# @solid-memo/domain

Pure types and pure functions, with no I/O: decks, cards, instances,
reviews and their scheduling (SM-2), the library and releases and the
rules a release must meet, statistics, migrations between format
versions, and the app's errors.

## Exports

`@solid-memo/domain/<module>` is `src/<module>.ts`, for example `sm2`
(one SM-2 transition, [srs.md](../../docs/srs.md)), `deck`, `course`,
`library` and `release/*` (the release rules). The migrations of the
shapes' format versions are `@solid-memo/domain/shapes/migrations`
([migrations.md](../../docs/migrations.md)). `src/testing/` holds
builders for tests.

## Boundaries

It may import `vocab` and nothing else of the app's. Every layer above
it may import it ([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/domain   # 100% coverage
npm run test:unit -- packages/domain/src/sm2.test.ts        # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md),
[srs.md](../../docs/srs.md) and [migrations.md](../../docs/migrations.md).
