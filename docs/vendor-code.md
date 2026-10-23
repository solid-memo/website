# Vendor-specific and vendor-independent code

Which third-party technology we depend on, where each is confined, and what
replacing one would cost.

## Vendors and their confinement

| Vendor | Packages | Confined to | Role |
|---|---|---|---|
| Inrupt Solid clients | `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `packages/solid/src/`; its universal access API in `solidReleasePublisher.ts` alone | RDF datasets, pod I/O, Solid-OIDC auth, and the app's one access-control write: a published release made readable by everyone, on WAC or ACP ([boundaries.md](boundaries.md#access-control)) |
| TanStack | `@tanstack/react-query` (via `preact/compat`) | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Async-state caching and invalidation |
| Preact | `preact` | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Rendering |
| Fontsource | `@fontsource-variable/fredoka`, `@fontsource/bangers`, `@fontsource-variable/noto-naskh-arabic` (all SIL OFL-1.1) | `packages/ui/src/style.css` (`@import`); Fredoka also `packages/site/src/drawDiagrams.ts` | Typefaces — Fredoka for text, Bangers (comic lettering) for `h1`/`h2`, Noto Naskh Arabic for Arabic text — self-hosted: bundled into `dist/`, no third-party font requests. Fredoka's Latin file is also embedded in each of the docs' diagrams, under the OFL-1.1, with its notice in each drawing and the license, `OFL-Fredoka.txt`, beside them ([markdown.md](markdown.md#the-diagrams-font)) |
| Zazuko | `rdf-validate-shacl` (MIT; with `@rdfjs/*`, `clownface`) | `@solid-memo/shacl` (`src/engine.ts`, a lazily loaded chunk) | SHACL validation of pod and library documents against the shapes in `ns/shapes/` |
| unified collective, tats-u | `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` (MIT; with `micromark`, `get-east-asian-width` and, through `decode-named-character-reference`, the `character-entities` table, aliased to its plain build in `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/studio/vitest.config.ts` and `packages/ui/vitest.config.ts`) | `@solid-memo/markdown` (`src/parse.ts`) | Parsing Markdown in data (CommonMark with pipe tables and CJK-friendly emphasis) into a tree the package folds into its own types ([markdown.md](markdown.md)) |
| mermaid-js | `mermaid` (MIT; with `d3`, `dagre-d3-es`, `elkjs`, `katex`, `roughjs`, `dompurify` and more) | `packages/site/src/drawDiagrams.ts`, a development tool, never in the browser | Drawing the docs' Mermaid diagrams to SVG at build time, in Chromium ([markdown.md](markdown.md#diagrams)). Pinned, and bumped apart from Playwright (`renovate.json5`) |
| Microsoft | `playwright` (Apache-2.0), `@playwright/test` | `packages/site/src/drawDiagrams.ts`; `e2e/journeys/` | Starting the Chromium the docs' diagrams are drawn in; driving the built app through the user journeys ([testing.md](testing.md#user-journeys)). One pinned version, which fixes the Chromium build |
| Deque | `@axe-core/playwright` (MPL-2.0; with `axe-core`) | `e2e/journeys/pages/App.ts` | Checking each screen the user journeys visit against WCAG's rules, in the tests only, never in the app ([testing.md](testing.md#user-journeys)). Pinned |
| RDF/JS community | `n3` | `@solid-memo/turtle`, the node tooling of `shacl`, and `e2e/pod/` (the server contract and tests) | Build-time Turtle parsing for the generators and validation; reading and writing pod documents in the end-to-end tests |

## Maturity

The app ships released versions of other code: 1.0.0 or later, with no
prerelease tag (`-alpha`, `-beta`, `-rc`). `npm run check` fails on any
other version among what the app needs at run time, the workspace's own
packages aside ([checkDependencies.ts](../scripts/checkDependencies.ts)
walks `package-lock.json` from `apps/web`). Development tools, which
are not shipped, are not checked.

One development tool brings packages before 1.0.0 with it: Mermaid,
which draws the docs' diagrams at build time, needs `elkjs` 0.9,
`katex` 0.18, `d3-sankey` 0.12, `iconv-lite` 0.6 (through `d3-dsv`)
and, through `roughjs`, `hachure-fill`, `path-data-parser`,
`points-on-curve` and `points-on-path`. They run in the build's
browser only; what the site serves is the drawings, so none of them is
shipped, and the gap of decision 14 does not grow.

The walk counts every run-time dependency, whether or not the bundle
keeps it. These versions before 1.0.0 are allowed, each for a reason.
Shipping a stable app on them is a decided gap
([decision 14](standard-for-public-code.md#decisions-made)): Solid Memo
is stable within an ecosystem that is not yet at 1.0.

| Package | Version | Why it is allowed |
|---|---|---|
| `rdf-validate-shacl` | 0.6 | The SHACL engine the app uses, maintained by Zazuko. Its 0.x minor is its major: 0.2 to 0.6 each broke something, which the `^` range keeps out. The risk is slow upkeep, one maintainer and releases far apart ([zazuko/rdf-validate-shacl#171](https://github.com/zazuko/rdf-validate-shacl/issues/171)), and the `ShapeEngine` interface and the shacl tests contain it: it is loaded lazily, and only `packages/shacl/src/engine.ts` and `packages/shacl/node/shacl.ts` touch it, so a change in it costs those two files (below). [`shacl-engine`](https://www.npmjs.com/package/shacl-engine) 1.x exists, but brings in packages before 1.0.0 of its own (`rdf-validation` 0.1, `process` 0.11) and a SPARQL engine the app does not need. |
| `rdf-validate-datatype` | 0.2 | `rdf-validate-shacl`'s check of literals against their datatypes, by the same maintainers, and replaced with it. Like it, it breaks only in a 0.x minor (0.2.0, to ESM), which `^` keeps out; its exports have not changed since 2020, and the risk is slow upkeep ([zazuko/rdf-validate-datatype#30](https://github.com/zazuko/rdf-validate-datatype/issues/30)). |
| `@inrupt/solid-client-errors` | 0.0 | Inrupt's error classes, a part of `@inrupt/solid-client` 4 that Inrupt releases with it. The app never imports it. |
| `process` | 0.11 | A browser stand-in for Node's `process`, which `readable-stream` asks for (through `n3` and the JSON-LD parser). Final at 0.11 by its maintainer's choice, who turned down a 1.0.0 ([defunctzombie/node-process#82](https://github.com/defunctzombie/node-process/issues/82)); unchanged since 2017. |

One shipped dependency is released but follows no published standard:
`micromark-extension-cjk-friendly` (2.x) reads emphasis next to Chinese,
Japanese and Korean text by the markdown-cjk-friendly amendment, a
proposal to CommonMark that CommonMark has not adopted
([markdown.md](markdown.md#the-dialect)). Its rule may change if
CommonMark settles on another; only `packages/markdown/src/parse.ts`
uses it.

To allow another, add it to `ALLOWED` in
[checkDependencies.ts](../scripts/checkDependencies.ts) and a row here:
the check fails on an allowed package this page does not name, and on
one the app no longer ships before 1.0.0.

## Vendor-independent code

`packages/domain/src/` and `packages/application/src/` import no vendor package. They express
the app in its own vocabulary (`Session`, `WebIdDocument`, ports, use cases).
This is enforced as a boundary rule ([boundaries.md](boundaries.md)).

The bridge between the two worlds is the mapper layer:
`packages/solid/src/mappers/` contains pure functions that translate
Inrupt's RDF types (`SolidDataset`, `Thing`) into domain types. Vendor types
never cross upward past a mapper.

## Cost of swapping a vendor

- **Inrupt clients** → touch `packages/solid/src/` only. Ports and
  everything above them are unchanged. A different RDF library (rdflib, LDO)
  or a plain HTTP backend means rewriting the port implementations and
  the generic reader/writer (`records.ts`), nothing else: the record ↔
  model mappers are in the domain and the shape descriptors are data.
- **rdf-validate-shacl** → `packages/shacl/src/engine.ts` and
  `packages/shacl/node/shacl.ts`: the `ShapeEngine` interface (one node against one
  shape, results as plain objects) is all the rest depends on.
- **The Markdown parser** → `packages/markdown/src/parse.ts`: the rest
  of the package and the app see only its folded tree (`MdBlock`,
  `MdInline`), which any CommonMark parser with tables and the CJK-friendly
  emphasis rule could produce.
- **TanStack Query** → touch `packages/ui/src/ui/` and `apps/studio/src/` hooks usage and the provider in
  `apps/web/src/main.tsx`. Use cases are plain async functions and would not change.
- **Preact** → `packages/ui/src/ui/`, `apps/studio/src/` and `apps/web/src/`. Domain/application are
  framework-free by construction.
