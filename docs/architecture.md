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
| `@solid-memo/web` | `apps/web/` | The site: its entry point (`src/main.tsx`), which renders the app over the use cases `composition` wires, and the Vite build that also publishes `ns/` (the vocabulary and shapes) and `decks/` (the [deck library](deck-library.md)) with the app ([deployment.md](deployment.md)). |
| `@solid-memo/studio` | `apps/studio/` | Solid Memo Studio ([studio.md](studio.md)): its entry point (`src/main.tsx`), its screens and router (`src/ui/`), and the Vite build that Solid Memo's build publishes at `studio/`. |
| `@solid-memo/composition` | `packages/composition/` | The composition root (`createAppUseCases` in `src/appUseCases.ts`): every adapter behind its port, the guest's pod, the write fence, the site's documents read from where it is served, and the use cases over them. An app passes what is its own: its name, where it is served, the build's values. |
| `@solid-memo/ui` | `packages/ui/` | The Preact UI: the components and the router (`src/ui/`), the messages in each language (`src/i18n/`), the theme and the styles (`src/style.css`). It receives `UseCases` and knows no adapter. |
| `@solid-memo/application` | `packages/application/` | Use cases (what the app does) and ports (what the app needs). |
| `@solid-memo/domain` | `packages/domain/` | Pure types and pure functions: the app's vocabulary, SRS, migrations. |
| `@solid-memo/vocab` | `packages/vocab/` | The data contract: the TypeScript generated (`src/*.generated.ts`) from the RDF vocabulary and SHACL shapes in the repository's `ns/` ([vocab.md](vocab.md), [shapes.md](shapes.md)), with the generator (`tooling/`); vendored profiles (`vendor/`) and fixtures. |
| `@solid-memo/solid` | `packages/solid/` | Adapters for Solid pods (Inrupt): repositories, the type index, the instance copier, the write fence, the pod-reading shape validator, and the guest's pod kept in the browser ([guest-mode.md](guest-mode.md)). |
| `@solid-memo/shacl` | `packages/shacl/` | The SHACL engine (rdf-validate-shacl, loaded lazily), profiles and shape loading (`src/`); node-side validation of Turtle files and the deck library's index and checks, its Markdown rules among them (`node/`, `npm run library`). |
| `@solid-memo/browser` | `packages/browser/` | Adapters for browser storage: the update journal, the language, the guest's pod's store (IndexedDB). |
| `@solid-memo/turtle` | `packages/turtle/` | Node-only Turtle tooling (n3): parsing and the house-style formatter. |
| `@solid-memo/markdown` | `packages/markdown/` | Markdown in data, read into a tree of its own, folded to what the app shows and bounded at every entry point, derived as plain text, and checked by the rules for a release ([markdown.md](markdown.md)). Imports nothing of the app's. |
| `@solid-memo/e2e-pod` | `e2e/pod/` | End-to-end tests of the app's use cases and Solid adapters against real Solid servers, started in Docker ([testing.md](testing.md)). |

## Dependency rule

A package may depend only on packages below it in this graph. Adapters
implement application ports (dependency inversion): the application
owns the interfaces, adapters conform to them.

```mermaid
graph TD
    web["apps/web<br/>main.tsx"] --> ui["ui<br/>the components"]
    studio["apps/studio<br/>its screens"] --> ui
    ui --> application
    web -. main.tsx only .-> composition["composition<br/>the composition root"]
    studio -. main.tsx only .-> composition
    composition --> application & solid & browser
    ui -. src/ui/ only .-> markdown
    application --> domain --> vocab["vocab<br/>the data contract"]
    solid -. implements ports .-> application
    solid --> domain & vocab & shacl
    browser -. implements ports .-> application
    shacl --> domain & vocab
    shacl -. node/ only .-> turtle & markdown
    vocab -. tooling/ only .-> turtle
    e2e["e2e/pod"] --> application & solid
```

Packages are consumed as TypeScript source (`exports` maps
`@solid-memo/<package>/<module>` to `src/<module>.ts`): there is no
build step between packages, and Vite bundles the app from source.
`ui` maps `@solid-memo/ui/<module>` to `src/ui/<module>.tsx`, lists its
few `.ts` modules one by one, and exports `style.css` and the message
files (`i18n/<locale>.json`).

## Tasks

`turbo.json` runs each package's `typecheck`, `test`, `generate:check`,
`format:turtle:check`, `library:check` and `build` in dependency order,
cached by input. A task's inputs are its package's files and those of the
packages it depends on; the few that also read `ns/` or `decks/` add them
in their package's own `turbo.json` (`vocab`, `shacl`, `solid`,
`composition`, `apps/web` and `apps/studio`), so a deck edit reruns only the tasks that
read the library. Solid Memo's `build` also waits for the Studio's,
whose files it publishes at `studio/` ([studio.md](studio.md)).

```sh
npm run check     # every package: typecheck, tests (100% coverage), drift, formatting, the deck library; then boundaries
npm run build     # the site, the Studio at studio/ included, into apps/web/dist/
npm run dev       # the site, from source
npm run dev:studio # the Studio, from source
npm start         # the site as deployed: built, then served at http://localhost:4173
npm run test:unit # every package's tests in one run, without coverage (a file or two: `-- <path>`)
npm run test:watch # the same, in watch mode
npm run test:pod  # e2e/pod against the Solid servers it starts in Docker (testing.md)
npm run pod       # a Community Solid Server at http://127.0.0.1:3999/, to poke at by hand
npm run pod:clean # take down the servers an interrupted run left
npm run generate  # the vocab package's generated TypeScript, from ns/
npm run format:turtle  # every Turtle file in the house style
npm run library   # the deck library's index, decks/index.ttl
npm run crosscheck # the pySHACL cross-check CI runs (Python, scripts/requirements-ci.txt)
```

## Key objects

- `UseCases` ([useCases.ts](../packages/application/src/useCases.ts)) —
  the UI's only entry point. Created once by the composition root,
  `createAppUseCases` ([appUseCases.ts](../packages/composition/src/appUseCases.ts)),
  which each app's `src/main.tsx` calls (`apps/web`, `apps/studio`), and passed to
  its top component (`App`, `StudioApp`) as a prop.
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
  of as few packages as can use it, most of them only one.
- A boundary is a package's `package.json`, not a convention, and a
  script checks it.
- Every seam is injectable, which is what makes 100% unit coverage per
  package practical (see [testing.md](testing.md)).
