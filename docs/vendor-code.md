# Vendor-specific and vendor-independent code

Which third-party technology Solid Memo depends on, where each is
confined, and what replacing one would cost.

## Vendors and their confinement

| Vendor | Packages | Confined to | Role |
|---|---|---|---|
| Inrupt Solid clients | `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `packages/solid/src/`; its universal access API in `client/access.ts` alone | RDF datasets, pod I/O, Solid-OIDC auth, and the app's one access-control write: a published release made readable by everyone, on WAC or ACP ([boundaries.md](boundaries.md#access-control)) |
| TanStack | `@tanstack/react-query` (via `preact/compat`) | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Async-state caching and invalidation |
| Preact | `preact` | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Rendering |
| Fontsource | `@fontsource-variable/fredoka`, `@fontsource/bangers`, `@fontsource-variable/noto-naskh-arabic` (all SIL OFL-1.1) | `packages/ui/src/style.css` (`@import`), and, for the diagrams' Fredoka ([markdown.md](markdown.md#the-diagrams-font)), `packages/site/src/drawDiagrams.ts` | Typefaces, self-hosted: bundled into `dist/` with no third-party font requests. Fredoka for text, Bangers (comic lettering) for `h1`/`h2`, Noto Naskh Arabic for Arabic text. |
| Zazuko | `rdf-validate-shacl` (MIT; with `@rdfjs/*`, `clownface`) | `@solid-memo/shacl` (`src/engine.ts`, a lazily loaded chunk) | SHACL validation of pod and library documents against the shapes in `ns/shapes/` |
| unified collective, tats-u | `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` (MIT; with `micromark`, `get-east-asian-width` and, through `decode-named-character-reference`, the `character-entities` table, aliased to its plain build in `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/studio/vitest.config.ts` and `packages/ui/vitest.config.ts`) | `@solid-memo/markdown` (`src/parse.ts`) | Parsing Markdown in data (CommonMark with pipe tables and CJK-friendly emphasis) into a tree the package folds into its own types ([markdown.md](markdown.md)) |
| mermaid-js | `mermaid` (MIT; with `d3`, `dagre-d3-es`, `elkjs`, `katex`, `roughjs`, `dompurify` and more) | `packages/site/src/drawDiagrams.ts`, a development tool, never in the browser | Drawing the docs' Mermaid diagrams to SVG at build time, in Chromium ([markdown.md](markdown.md#diagrams)). Pinned, and bumped apart from Playwright (`renovate.json5`) |
| Microsoft | `playwright` (Apache-2.0), `@playwright/test` | `packages/site/src/drawDiagrams.ts`; `e2e/journeys/` | Starting the diagrams' Chromium; driving the built app through the user journeys ([testing.md](testing.md#user-journeys)). One pinned version, which fixes the Chromium build |
| Deque | `@axe-core/playwright` (MPL-2.0; with `axe-core`) | `e2e/journeys/pages/App.ts` | Checking each screen the user journeys visit against WCAG's rules, in the tests only, never in the app. Pinned |
| RDF/JS community | `n3` | `@solid-memo/turtle`, the node tooling of `shacl`, and `e2e/pod/` (the server contract and tests) | Build-time Turtle parsing for the generators and validation; reading and writing pod documents in the end-to-end tests |

## Maturity

The app ships only released versions: 1.0.0 or later, with no
prerelease tag (`-alpha`, `-beta`, `-rc`). `npm run check` fails on any
other version among the app's run-time dependencies, kept by the bundle
or not, the workspace's own packages aside
([checkDependencies.ts](../scripts/checkDependencies.ts) walks
`package-lock.json` from `apps/web`). Development tools aren't shipped
or checked.

Mermaid, which draws the docs' diagrams, is the only development tool
with packages before 1.0.0: `elkjs` 0.9, `katex` 0.18, `d3-sankey`
0.12, `iconv-lite` 0.6 (through `d3-dsv`) and, through `roughjs`,
`hachure-fill`, `path-data-parser`, `points-on-curve` and
`points-on-path`. They run only in the build's browser. The site serves
the drawings, so none ships and the gap of
[decision 14](standard-for-public-code.md#decisions-made) doesn't grow.

The versions allowed below are that decided gap: Solid
Memo is stable within an ecosystem that isn't yet at 1.0.

| Package | Version | Why it is allowed |
|---|---|---|
| `rdf-validate-shacl` | 0.6 | Zazuko's SHACL engine. Its 0.x minor is its major: 0.2 to 0.6 each broke something, which the `^` range keeps out. Its risk, slow upkeep with one maintainer and releases far apart ([zazuko/rdf-validate-shacl#171](https://github.com/zazuko/rdf-validate-shacl/issues/171)), stays behind the `ShapeEngine` interface and the shacl tests (below). [`shacl-engine`](https://www.npmjs.com/package/shacl-engine) 1.x brings its own packages before 1.0.0 (`rdf-validation` 0.1, `process` 0.11) and a SPARQL engine the app doesn't need. |
| `rdf-validate-datatype` | 0.2 | `rdf-validate-shacl`'s datatype check of literals, by the same maintainers and replaced with it. It breaks only in a 0.x minor (0.2.0, to ESM), which `^` keeps out. Its exports haven't changed since 2020, and the risk is slow upkeep ([zazuko/rdf-validate-datatype#30](https://github.com/zazuko/rdf-validate-datatype/issues/30)). |
| `@inrupt/solid-client-errors` | 0.0 | Inrupt's error classes, part of `@inrupt/solid-client` 4 and released with it. The app never imports it. |
| `process` | 0.11 | A browser stand-in for Node's `process`, which `readable-stream` asks for (through `n3` and the JSON-LD parser). Final at 0.11 and unchanged since 2017: its maintainer turned down a 1.0.0 ([defunctzombie/node-process#82](https://github.com/defunctzombie/node-process/issues/82)). |

One shipped release follows no published standard:
`micromark-extension-cjk-friendly` (2.x) reads emphasis next to CJK
text by the markdown-cjk-friendly amendment, a proposal CommonMark
hasn't adopted ([markdown.md](markdown.md#the-dialect)). Its rule may change if
CommonMark settles on another.

Another allowed package goes into `ALLOWED` in `checkDependencies.ts`
and this table: the check fails on an allowed package the page doesn't
name, and on one the app no longer ships before 1.0.0.

## Vendor-independent code

`packages/domain/src/` and `packages/application/src/` import no vendor
package, as a boundary rule enforces ([boundaries.md](boundaries.md)),
and express the app in its own vocabulary (`Session`, `WebIdDocument`,
ports, use cases).

The mapper layer bridges the two: pure functions in
`packages/solid/src/mappers/` translate Inrupt's RDF types
(`SolidDataset`, `Thing`) into domain types. Vendor types never cross
upward past a mapper.

## Cost of swapping a vendor

- **Inrupt clients** → `packages/solid/src/` only. Another RDF library
  (rdflib, LDO) or plain HTTP means rewriting only the port
  implementations and `records.ts`: the record ↔ model mappers are
  domain code, the shape descriptors data.
- **rdf-validate-shacl** → `packages/shacl/src/engine.ts`, the only
  module that imports it (`packages/shacl/node/shacl.ts` calls its
  `createEngine`); the rest sees only the `ShapeEngine` interface (one
  node against one shape, plain-object results).
- **The Markdown parser** → `packages/markdown/src/parse.ts`. The rest
  of the package and the app see only its folded tree (`MdBlock`,
  `MdInline`), which any CommonMark parser with tables and the
  CJK-friendly emphasis rule could produce.
- **TanStack Query** → the hook calls in `packages/ui/src/ui/` and
  `apps/studio/src/`, and the provider in `apps/web/src/main.tsx`. Use
  cases are plain async functions and don't change.
- **Preact** → `packages/ui/src/ui/`, `apps/studio/src/` and
  `apps/web/src/`.
