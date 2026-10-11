# @solid-memo/application

What the app does, and what it needs to do it: the use cases, and the
ports (interfaces) that the adapter packages implement. It owns the
interfaces; the adapters conform to them.

## Exports

`@solid-memo/application/<module>` is `src/<module>.ts`:

- `ports`: the driven ports, such as the session gateway, the
  repositories, the release publisher and the file exchange.
- `useCases`: the `UseCases` the UI receives, built over the ports.
- `releaseDrafts`, `releasePublishing` and `trial`: the Studio's drafts,
  publishing a release, and test-playing a draft
  ([studio.md](../../docs/studio.md)).

## Boundaries

It may import `domain` and `vocab`. `solid`, `browser`, `ui`,
`composition`, the apps and `e2e/pod` may import it. A new dependency
that performs I/O goes behind a port here, with its adapter elsewhere
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/application   # 100% coverage
npm run test:unit -- packages/application/src/useCases.test.ts   # one file, from the root
```

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md).
