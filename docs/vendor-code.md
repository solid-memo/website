# Vendor-specific and vendor-independent code

Which third-party technology we depend on, where each is confined, and what
replacing one would cost.

## Vendors and their confinement

| Vendor | Packages | Confined to | Role |
|---|---|---|---|
| Inrupt Solid clients | `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `packages/solid/src/` | RDF datasets, pod I/O, Solid-OIDC auth |
| TanStack | `@tanstack/react-query` (via `preact/compat`) | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Async-state caching and invalidation |
| Preact | `preact` | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Rendering |
| Fontsource | `@fontsource-variable/fredoka`, `@fontsource/bangers` (both SIL OFL-1.1) | `packages/ui/src/style.css` (`@import`) | Typefaces — Fredoka for text, Bangers (comic lettering) for `h1`/`h2` — self-hosted: bundled into `dist/`, no third-party font requests |
| Zazuko | `rdf-validate-shacl` (MIT; with `@rdfjs/*`, `clownface`) | `@solid-memo/shacl` (`src/engine.ts`, a lazily loaded chunk) | SHACL validation of pod and library documents against the shapes in `ns/shapes/` |
| unified collective, tats-u | `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` (MIT; with `micromark`, `get-east-asian-width` and, through `decode-named-character-reference`, the `character-entities` table, aliased to its plain build in `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/studio/vitest.config.ts` and `packages/ui/vitest.config.ts`) | `@solid-memo/markdown` (`src/parse.ts`) | Parsing Markdown in data (CommonMark with pipe tables and CJK-friendly emphasis) into a tree the package folds into its own types ([markdown.md](markdown.md)) |
| RDF/JS community | `n3` | `@solid-memo/turtle`, the node tooling of `shacl`, and `e2e/pod/` (the server contract and tests) | Build-time Turtle parsing for the generators and validation; reading and writing pod documents in the end-to-end tests |

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
