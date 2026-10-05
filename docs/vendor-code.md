# Vendor-specific and vendor-independent code

Which third-party technology we depend on, where each is confined, and what
replacing one would cost.

## Vendors and their confinement

| Vendor | Packages | Confined to | Role |
|---|---|---|---|
| Inrupt Solid clients | `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `packages/solid/src/` | RDF datasets, pod I/O, Solid-OIDC auth |
| TanStack | `@tanstack/react-query` (via `preact/compat`) | `apps/web/src/ui/`, `apps/web/src/main.tsx` | Async-state caching and invalidation |
| Preact | `preact` | `apps/web/src/ui/`, `apps/web/src/main.tsx` | Rendering |
| Fontsource | `@fontsource-variable/fredoka`, `@fontsource/bangers` (both SIL OFL-1.1) | `apps/web/src/style.css` (`@import`) | Typefaces — Fredoka for text, Bangers (comic lettering) for `h1`/`h2` — self-hosted: bundled into `dist/`, no third-party font requests |
| Zazuko | `rdf-validate-shacl` (MIT; with `@rdfjs/*`, `clownface`) | `@solid-memo/shacl` (`src/engine.ts`, a lazily loaded chunk) | SHACL validation of pod and library documents against the shapes on https://pod.solid-memo.com/shapes/ |
| RDF/JS community | `n3` | `@solid-memo/turtle` and the node tooling of `shacl` | Build-time Turtle parsing for the generators and validation |

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
- **TanStack Query** → touch `apps/web/src/ui/` hooks usage and the provider in
  `main.tsx`. Use cases are plain async functions and would not change.
- **Preact** → `apps/web/src/ui/` and `main.tsx`. Domain/application are
  framework-free by construction.
