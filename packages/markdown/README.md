# @solid-memo/markdown

Markdown in Solid Memo's data: a card's side, a step's theory, a
deck's description; and the repository's own docs, in the same dialect.
It reads the text into a tree of its own, folds it
to what the app shows, bounds it at every entry point, derives plain
text from it, and checks it by the rules for a release
([markdown.md](../../docs/markdown.md)).

## Exports

`@solid-memo/markdown/<module>` is `src/<module>.ts`:

- `parse`: Markdown as Solid Memo reads it (CommonMark with pipe tables
  and CJK-friendly emphasis), into the package's own tree; and, with
  `parseDocument`, the repository's own Markdown in the same dialect,
  headings kept, longer than data may be, refused where data would be
  folded.
- `inline`: the profile for a place that holds one line, such as an
  option's label.
- `plainText`: the profile for a place that takes only text, such as a
  window's title.
- `chunks`: a step's theory split at its thematic breaks.
- `links`: whether a link is followed, and where it leads.
- `problems`: what a field of Markdown may hold, for a release.

Its API is its own types, never `mdast`'s.

## Boundaries

It imports nothing of the app's. `ui` may import it from `src/ui/`
only, and `shacl` from `node/` only. Its parser libraries
(`mdast-util-from-markdown` and its extensions) are used in
`src/parse.ts` alone ([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/markdown   # 100% coverage
npm run test:unit -- packages/markdown/src/parse.test.ts      # one file, from the root
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [markdown.md](../../docs/markdown.md) and
[architecture.md](../../docs/architecture.md).
