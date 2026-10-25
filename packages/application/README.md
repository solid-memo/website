# @solid-memo/application

What the app does, and what it needs to do it: the use cases, and the
ports (interfaces) that the adapter packages implement. It owns the
interfaces; the adapters conform to them.

## Exports

`@solid-memo/application/<module>` is `src/<module>.ts`:

- `ports`: the driven ports, such as the session gateway, the
  repositories, the release publisher and the file exchange.
- `useCases`: the `UseCases` the UI receives, every slice in one, and
  `createUseCases`, which builds them over the ports, each required.
- The slices, each `create<Feature>UseCases` and its
  `<Feature>UseCases`, from only the ports it uses: `session`,
  `instances`, `preferences`, `decks`, `cards`, `library`,
  `mistakeReports`, `whatsNew`, `courses`, `study`, `statistics` and
  `instanceChecks`; and the Studio's `releaseDrafts`,
  `releasePublishing`, `instanceGraph` and `trial` (test-playing a
  draft, and `TrialUseCases`, the slices a trial plays)
  ([studio.md](../../docs/studio.md)).
- `preferenceStore`, `answerStore` and `digestStore`: what the slices
  share, made once by `createUseCases`; `writes` and `progress`, their
  helpers.
- `testing/*`: the fixtures, the fake ports and `NO_PORTS`, for tests.

## Boundaries

It may import `domain` and `vocab`. `solid`, `browser`, `ui`,
`composition`, the apps and `e2e/pod` may import it. A new dependency
that performs I/O goes behind a port here, with its adapter elsewhere
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/application   # 100% coverage
npm run test:unit -- packages/application/src/decks.test.ts   # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md).
