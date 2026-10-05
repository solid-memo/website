# Boundaries

Import rules between packages. These are the load-bearing walls of the
codebase; a change that violates them is wrong even if it works.

## Enforcement

`npm run check:boundaries` ([checkBoundaries.ts](../scripts/checkBoundaries.ts),
run by `npm run check` and in CI) reads every import of every workspace
package and fails on:

- a relative import that leaves its package;
- an import of a workspace package its layer may not use (the table
  below), or from a file that may not use it;
- an import of any package its `package.json` does not declare — npm
  hoists every dependency to the root, so an undeclared import would
  otherwise resolve and pass the type check;
- a node-only import (`node:*`, `n3`, `@solid-memo/turtle`, any
  package's `tooling/` or `node/` entry) in code that runs in the
  browser.

Test files follow the same rules as their subject; they and the vitest
configs may also use the shared test tooling of the root `package.json`.

## Layers

| Package | May import | Only from |
|---|---|---|
| `turtle` | — | |
| `vocab` | `turtle` | `tooling/` (node-only) |
| `domain` | `vocab` | |
| `application` | `domain`, `vocab` | |
| `shacl` | `domain`, `vocab`, `turtle` | `turtle`: `node/` only |
| `solid` | `application`, `domain`, `vocab`, `shacl` | |
| `browser` | `application`, `domain` | |
| `web` | `application`, `domain`, `vocab`, `solid`, `browser` | `solid`, `browser`: `src/main.tsx` only |
| `e2e-pod` | `application`, `domain`, `vocab`, `solid` | |

Browser code: `src/` of `domain`, `application`, `shacl`, `solid`,
`browser` and `web`.

## Vendor libraries

Each is a dependency of exactly one package (and so, by the check, used
nowhere else):

| Library | Package | Notes |
|---|---|---|
| `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `solid` | `shacl` also uses `@inrupt/solid-client` to parse shape documents |
| `@tanstack/react-query`, `preact` | `web` | UI and `main.tsx` |
| `@fontsource/*`, `@fontsource-variable/*` | `web` | `src/style.css` only |
| `rdf-validate-shacl` | `shacl` | `src/engine.ts` only, loaded lazily |
| `n3` | `turtle`, and the node tooling of `shacl` | never in the browser |
| `@solid/community-server` | `e2e-pod` | the local pod the end-to-end tests run against |
| `fake-indexeddb` | `browser` | tests only: IndexedDB in node, for the guest's pod's store |

## Further rules

- UI components never import ports or adapters. They receive `UseCases`
  as a prop.
- Generated files (`packages/vocab/src/*.generated.ts`) are never edited
  by hand: change the vocabulary or the shapes on their pods and run
  `npm run generate` ([shapes.md](shapes.md), [vocab.md](vocab.md)).
- Modules reachable from `vite.config.ts` spell out `.ts` on relative
  imports: Vite can load the config with Node's own loader, which needs
  them. Imports between packages go through `exports` and carry no
  extension.
- `apps/web/src/main.tsx` is the only module that wires the layers
  together.

## Adding a dependency

1. Decide which single package it belongs to, and add it to that
   package's `package.json` (`npm install <lib> -w @solid-memo/<package>`).
2. If it performs I/O, wrap it behind a port in
   `packages/application/src/ports.ts` and implement the port in an
   adapter package.
3. Add it to the vendor table above.
