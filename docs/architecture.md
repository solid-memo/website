# Architecture

Solid Memo is structured as hexagonal (ports & adapters) layers, and each
layer is its own npm workspace package in a [Turborepo](https://turborepo.com)
monorepo. A package's `package.json` names what it may import, and
`npm run check:boundaries` holds every import to that
([boundaries.md](boundaries.md)). The composition root is the one place
where the layers meet.

## Packages

| Package | Folder | Responsibility |
|---|---|---|
| `@solid-memo/web` | `apps/web/` | The site: Preact UI (`src/ui/`), the composition root (`src/main.tsx`), the Vite build that also publishes the vocabulary and shapes. The deck library is published by its own repository, [solid-memo/decks](https://github.com/solid-memo/decks) ([deck-library.md](deck-library.md)). |
| `@solid-memo/application` | `packages/application/` | Use cases (what the app does) and ports (what the app needs). |
| `@solid-memo/domain` | `packages/domain/` | Pure types and pure functions: the app's vocabulary, SRS, migrations. |
| `@solid-memo/vocab` | `packages/vocab/` | The data contract: the RDF vocabulary (`vocab/`), SHACL shapes (`shapes/`), vendored profiles (`vendor/`), fixtures, and the TypeScript generated from them (`src/*.generated.ts`), with the generator (`tooling/`). |
| `@solid-memo/solid` | `packages/solid/` | Adapters for Solid pods (Inrupt): repositories, the type index, the instance copier, the write fence, the pod-reading shape validator, and the guest's pod kept in the browser ([guest-mode.md](guest-mode.md)). |
| `@solid-memo/shacl` | `packages/shacl/` | The SHACL engine (rdf-validate-shacl, loaded lazily), profiles and shape loading (`src/`); build-time validation of Turtle files (`node/`). |
| `@solid-memo/browser` | `packages/browser/` | Adapters for browser storage: the update journal, the language, the guest's pod's store (IndexedDB). |
| `@solid-memo/turtle` | `packages/turtle/` | Node-only Turtle tooling (n3): parsing and the house-style formatter. |
| `@solid-memo/e2e-pod` | `e2e/pod/` | End-to-end tests of the app's use cases and Solid adapters against a real Community Solid Server. |

## Dependency rule

A package may depend only on packages below it in this graph. Adapters
implement application ports (dependency inversion): the application
owns the interfaces, adapters conform to them.

```mermaid
graph TD
    web["apps/web<br/>UI + main.tsx"] --> application
    web -. main.tsx only .-> solid & browser
    application --> domain --> vocab["vocab<br/>the data contract"]
    solid -. implements ports .-> application
    solid --> domain & vocab & shacl
    browser -. implements ports .-> application
    shacl --> domain & vocab
    shacl -. node/ only .-> turtle
    vocab -. tooling/ only .-> turtle
    e2e["e2e/pod"] --> application & solid
```

Packages are consumed as TypeScript source (`exports` maps
`@solid-memo/<package>/<module>` to `src/<module>.ts`): there is no
build step between packages, and Vite bundles the app from source.

## Tasks

`turbo.json` runs each package's `typecheck`, `test`, `generate:check`,
`format:turtle:check` and `build` in dependency order, cached by input.

```sh
npm run check     # every package: typecheck, tests (100% coverage), drift, formatting; then boundaries
npm run build     # the site, into apps/web/dist/
npm run dev       # the site, from source
npm start         # the site as deployed: built, then served at http://localhost:4173
npm run test:pod  # e2e/pod against `npm run pod` (a local Community Solid Server)
```

## Key objects

- `UseCases` ([useCases.ts](../packages/application/src/useCases.ts)) —
  the UI's only entry point. Created once by the composition root and
  passed to `App` as a prop.
- Ports ([ports.ts](../packages/application/src/ports.ts)) — narrow
  interfaces (one per external capability) implemented by factories in
  `packages/solid/src/` and `packages/browser/src/`.
- Domain types ([packages/domain/src/](../packages/domain/src/)) — free
  of any library type, so every layer above can be tested without
  adapters. The record types they map to are generated in the vocab
  package from the SHACL [shapes](shapes.md); the migration chain in
  `packages/domain/src/shapes/migrations/` is hand-written.

## Why

- Vendor code stays swappable and upgradeable in isolation (see
  [vendor-code.md](vendor-code.md)): each vendor library is a dependency
  of exactly one package.
- A boundary is a package's `package.json`, not a convention, and a
  script checks it.
- Every seam is injectable, which is what makes 100% unit coverage per
  package practical (see [testing.md](testing.md)).
