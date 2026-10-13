# @solid-memo/vocab

The data contract. Solid Memo's RDF vocabulary and SHACL shapes live in
the repository's [`ns/`](../../ns/); this package holds the TypeScript
generated from them, the generator, the vendored profiles and the
fixtures ([vocab.md](../../docs/vocab.md), [shapes.md](../../docs/shapes.md)).

## Exports

- `@solid-memo/vocab/<module>` is `src/<module>.ts`: the generated
  terms, record types, concepts and shape descriptors
  (`*.generated.ts`), where the vocabulary and shapes are published
  (`ns`), and the descriptor type (`shapeDescriptor`).
- `@solid-memo/vocab/tooling/<module>` is `tooling/<module>.ts`, node
  only: the generator (`npm run generate`, `npm run generate:check`),
  publishing `ns/`, `decks/` and `vendor/` with the site
  (`publishTurtle`), and the values the site is built with
  (`siteBuild`).

`vendor/` holds the DCAT-AP and SkoHub SKOS shapes, copied verbatim
under their own licenses ([vendor/README.md](vendor/README.md)).

The `*.generated.ts` files are never edited by hand: change `ns/` and
run `npm run generate`.

## Boundaries

`src/` imports no other package. `tooling/` may import `turtle`, and
runs in node only. Every layer above may import `src/`
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test generate:check format:turtle:check --filter=@solid-memo/vocab   # 100% coverage
npm run test:unit -- packages/vocab/tooling/generate.test.ts   # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app. The vocabulary it is
generated from is versioned on its own ([vocab.md](../../docs/vocab.md#versioning-policy)).

See [vocab.md](../../docs/vocab.md), [shapes.md](../../docs/shapes.md)
and [architecture.md](../../docs/architecture.md).
