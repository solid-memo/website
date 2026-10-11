# @solid-memo/shacl

SHACL validation. In the browser (`src/`): the engine
(rdf-validate-shacl, loaded lazily), the published profiles Solid Memo
data must also meet (DCAT-AP and SKOS), which shape a subject is checked
against, and loading the shape documents. In node (`node/`): validating
Turtle files against the shapes in `ns/`, and the deck library's index
and checks (`npm run library`).

## Exports

- `@solid-memo/shacl/<module>` is `src/<module>.ts`: `engine`,
  `profiles`, `registry` and `shapeLoader`.
- `@solid-memo/shacl/node/<module>` is `node/<module>.ts`, node only:
  `shacl` (validating a Turtle document), `deckLibrary` (`npm run
  library` and `npm run library:check`, [deck-library.md](../../docs/deck-library.md)),
  `quadsToReleaseModel` and `releaseMessages` (the release rules over
  the library's files).

## Boundaries

It may import `domain` and `vocab`, and, from `node/` only, `turtle`
and `markdown`. Only `solid` may import it. `rdf-validate-shacl` is
used in `src/engine.ts` alone, loaded lazily
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test library:check --filter=@solid-memo/shacl   # 100% coverage
npm run test:unit -- packages/shacl/src/engine.test.ts   # one file, from the root
```

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [validation.md](../../docs/validation.md),
[shapes.md](../../docs/shapes.md) and
[deck-library.md](../../docs/deck-library.md).
