# @solid-memo/site

The site's build, in node: what `apps/web`'s `vite.config.ts` adds to
Vite's build of the page, and what its tests and the root scripts that
archive and check the docs (`scripts/docsArchive.ts`, `docsVersions.ts`,
`siteVersion.ts` and `checkDocs.ts`) check the build against. Nothing
in the browser imports it.

## Exports

`@solid-memo/site/<module>` is `src/<module>.ts`:

- `siteBuild`: the values the site is built with: its version, from
  the root `package.json`, the commit, and the shapes' ruleset
  ([configuration.md](../../docs/configuration.md)).
- `siteMap`: the site's `robots.txt` and sitemap, written from the
  repository's `CNAME` ([deployment.md](../../docs/deployment.md#custom-domain-optional)).
- `publishTurtle`: the Vite plugin that publishes `ns/`, `decks/` and
  `vocab`'s `vendor/` with the site ([vocab.md](../../docs/vocab.md)).
- `diagrams`: the Mermaid blocks of a page and what each must have,
  the settings they are drawn with, their cache keys, the font's
  notice, and `checkSvg`, the check every drawing passes.
- `drawDiagrams`: drawing them, light and dark, with the official
  Mermaid in Chromium through Playwright, cached between builds.
- `slug`: a heading's id, as GitHub makes it.
- `docsIndex`: the docs' index, `docs/docs.ttl`, read with
  `readDocsIndex` into its groups and pages, every problem listed with
  its line; what it lacks against the pages in `docs/`, and the block
  to add for a page it does not list
  ([markdown.md](../../docs/markdown.md#the-docs-index)).
- `docsSite`: the docs folder as static pages, `renderDocsSite`, read
  with `markdown`'s `parseDocument`, its links made to work where the
  pages are served and every problem listed with its file and line;
  `docs.css` is their stylesheet.
- `publishDocs`: the Vite plugin that emits the pages with a build and
  serves them in dev ([markdown.md](../../docs/markdown.md#the-docs-as-a-site)).

## Boundaries

It imports `markdown`, `turtle`, and of `vocab` only `tooling/root`,
where the repository's folders are. It runs in node only. Only
`apps/web`'s `vite.config.ts` and its tests may import it
([boundaries.md](../../docs/boundaries.md)). Its development
dependencies, `mermaid`, `playwright` and
`@fontsource-variable/fredoka`, are used in `src/drawDiagrams.ts`
alone, and `vite`'s types in its three plugins.

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/site   # 100% coverage
npm run test:unit -- packages/site/src/siteMap.test.ts   # one file, from the root
```

One test draws in the real Chromium, which `npm run browsers` installs
once, and one renders the repository's own docs, so a docs edit can
fail the package's tests
([testing.md](../../docs/testing.md#strategy-per-layer)).

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: `apps/web` and the root scripts use
its TypeScript source, and its modules change with the site.

See [architecture.md](../../docs/architecture.md),
[deployment.md](../../docs/deployment.md) and
[markdown.md](../../docs/markdown.md).
