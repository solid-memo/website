# @solid-memo/site

The site's build, in node: what `apps/web`'s `vite.config.ts` adds to
Vite's build of the page, and what its tests check the build against.
Nothing in the browser imports it.

## Exports

`@solid-memo/site/<module>` is `src/<module>.ts`:

- `siteBuild`: the values the site is built with: its version, from
  the root `package.json`, the commit, and the shapes' ruleset
  ([configuration.md](../../docs/configuration.md)).
- `siteMap`: the site's `robots.txt` and sitemap, written from the
  repository's `CNAME` ([deployment.md](../../docs/deployment.md#custom-domain-optional)).
- `publishTurtle`: the Vite plugin that publishes `ns/`, `decks/` and
  `vocab`'s `vendor/` with the site ([vocab.md](../../docs/vocab.md)).

## Boundaries

It imports `turtle`, and of `vocab` only `tooling/root`, where the
repository's folders are. It runs in node only. Only `apps/web`'s
`vite.config.ts` and its tests may import it
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/site   # 100% coverage
npm run test:unit -- packages/site/src/siteMap.test.ts   # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: `apps/web` uses its TypeScript
source, and its modules change with the site.

See [architecture.md](../../docs/architecture.md) and
[deployment.md](../../docs/deployment.md).
