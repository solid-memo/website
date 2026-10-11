# @solid-memo/composition

The composition root: the one place where the layers meet. It puts
every adapter behind its port, sets up the guest's pod and the write
fence, reads the site's documents from where it is served, and builds
the use cases over them.

## Exports

`@solid-memo/composition/<module>` is `src/<module>.ts`:

- `appUseCases`: `createAppUseCases`, the app's `UseCases`. An app
  passes what is its own: its name, where it is served, and the build's
  values.
- `trialUseCases`: `createTrialUseCases`, the sandbox a Studio trial
  plays a draft in ([studio.md](../../docs/studio.md#the-trial)).

## Boundaries

It may import `application`, `domain`, `vocab`, `solid` and `browser`.
Only `apps/web`'s `src/main.tsx` may import it
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/composition   # 100% coverage
npm run test:unit -- packages/composition/src/appUseCases.test.ts   # one file, from the root
```

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md).
