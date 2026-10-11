# @solid-memo/turtle

Node-only Turtle tooling, over [n3](https://github.com/rdfjs/N3.js):
parsing Turtle into quads, and the house-style formatter that
`npm run format:turtle` runs over `ns/`, `decks/` and the fixtures.

## Exports

`@solid-memo/turtle/<module>` is `src/<module>.ts`:

- `rdf`: parsing Turtle into quads.
- `formatTurtle`: the formatter, and its command line (`run`).

## Boundaries

It imports no other package of the app. Only `vocab`'s `tooling/` and
`shacl`'s `node/` may import it, and never code that runs in the
browser ([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/turtle   # 100% coverage
npm run test:unit -- packages/turtle/src/formatTurtle.test.ts   # one file, from the root
```

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md) and
[vocab.md](../../docs/vocab.md).
