# @solid-memo/markdown

Markdown in Solid Memo's data: a card's side, a step's theory, a
deck's description; and the repository's own docs, in the same dialect.
It reads the text into a tree of its own, folds it
to what the app shows, bounds it at every entry point, derives plain
text from it, and checks it by the rules for a release
([markdown.md](../../docs/markdown.md)). Its node tooling renders the
docs to static pages and draws their Mermaid diagrams to SVG, in
Chromium ([markdown.md](../../docs/markdown.md#the-docs-as-a-site)).

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

`@solid-memo/markdown/tooling/<module>` is `tooling/<module>.ts`, for
node only, at build time:

- `diagrams`: the Mermaid blocks of a page and what each must have,
  the settings they are drawn with, their cache keys, the font's
  notice, and `checkSvg`, the check every drawing passes.
- `drawDiagrams`: drawing them, light and dark, with the official
  Mermaid in Chromium through Playwright, cached between builds.
- `slug`: a heading's id, as GitHub makes it.
- `docsSite`: the docs folder as static pages, `renderDocsSite`, its
  links made to work where the pages are served and every problem
  listed with its file and line; `docs.css` is their stylesheet.
- `publishDocs`: the Vite plugin that emits the pages with a build and
  serves them in dev.

## Boundaries

It imports nothing of the app's. `ui` may import it from `src/ui/`
only, `shacl` from `node/` only, and `web` from its build
(`vite.config.ts`) and its build's test (`src/build.test.ts`) only. Its parser libraries
(`mdast-util-from-markdown` and its extensions) are used in
`src/parse.ts` alone ([boundaries.md](../../docs/boundaries.md)).
`tooling/` is node-only. Its development dependencies, `mermaid`,
`playwright` and `@fontsource-variable/fredoka`, are used in
`tooling/drawDiagrams.ts` alone, and `vite`'s types in
`tooling/publishDocs.ts`.

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/markdown   # 100% coverage
npm run test:unit -- packages/markdown/src/parse.test.ts      # one file, from the root
```

One test draws in the real Chromium, which `npm run browsers` installs
once, and one renders the repository's own docs, so a docs edit can
fail the package's tests
([testing.md](../../docs/testing.md#strategy-per-layer)).

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [markdown.md](../../docs/markdown.md) and
[architecture.md](../../docs/architecture.md).
