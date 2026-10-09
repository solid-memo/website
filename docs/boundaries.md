# Boundaries

Import rules between packages. These are the load-bearing walls of the
codebase; a change that violates them is wrong even if it works.

## Enforcement

`npm run check:boundaries` ([checkBoundaries.ts](../scripts/checkBoundaries.ts),
run by `npm run check` and in CI) reads every import of every workspace
package and fails on:

- a relative import that leaves its package;
- an import of a workspace package its layer may not use (the table
  below), or from a file that may not use it, or a static import of one
  that may only be loaded lazily;
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
| `markdown` | — | |
| `vocab` | `turtle` | `turtle`: `tooling/` only |
| `domain` | `vocab` | |
| `application` | `domain`, `vocab` | |
| `shacl` | `domain`, `vocab`, `turtle`, `markdown` | `turtle`, `markdown`: `node/` only |
| `solid` | `application`, `domain`, `vocab`, `shacl` | |
| `browser` | `application`, `domain` | |
| `ui` | `application`, `domain`, `vocab`, `markdown` | `markdown`: `src/ui/` only |
| `composition` | `application`, `domain`, `vocab`, `solid`, `browser` | |
| `web` | `application`, `domain`, `vocab`, `ui`, `composition`, `studio` | `composition`: `src/main.tsx` only; `studio`: `src/main.tsx` only, with a dynamic `import()` |
| `studio` | `application`, `domain`, `vocab`, `ui` | |
| `e2e-pod` | `application`, `domain`, `vocab`, `solid` | |
| `e2e-journeys` | `ui` | `ui`: `harness/strings.ts` only, for the app's messages |

Browser code: `src/` of `markdown`, `vocab`, `domain`, `application`, `shacl`,
`solid`, `browser`, `composition`, `ui`, `web` and `studio`; `vocab`'s `tooling/` is node-only.

## Vendor libraries

Each is a dependency of only the packages listed (and so, by the check,
used nowhere else):

| Library | Package | Notes |
|---|---|---|
| `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `solid` | `shacl` also uses `@inrupt/solid-client` to parse shape documents; deck files are written and read with it too ([below](#files-without-a-vendor-library)) |
| `@tanstack/react-query`, `preact` | `ui`, `web`, `studio` | the components; in `web`, `main.tsx` to render the page and `App.tsx`, the page; in `studio`, its screens |
| `@fontsource/*`, `@fontsource-variable/*` | `ui` | `src/style.css` only |
| `rdf-validate-shacl` | `shacl` | `src/engine.ts` only, loaded lazily |
| `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` | `markdown` | `src/parse.ts` only; the package's API is its own types, never `mdast`'s ([markdown.md](markdown.md)) |
| `n3` | `turtle`, the node tooling of `shacl`, and `e2e-pod` | never in the browser; in `e2e-pod`, the server contract and the tests |
| `fake-indexeddb` | `browser`, `composition` | tests only: IndexedDB in node, for the guest's pod's store |
| `@playwright/test` | `e2e-journeys` | drives the built app in Chromium; the harness also talks to the Solid server with its request API |

## Files without a vendor library

A deck saved as a file, or read from one ([studio.md](studio.md#import-and-export)),
needs no library of its own:

- `solid` writes Turtle with `@inrupt/solid-client`'s
  `solidDatasetAsTurtle`, and reads Turtle and JSON-LD with its
  `getTurtleParser` and `getJsonLdParser`. JSON-LD is written by
  [jsonLd.ts](../packages/solid/src/jsonLd.ts), a few lines over the
  triples. n3 and `@solid-memo/turtle` stay out of the browser.
- `browser` saves and opens files with what the browser has
  ([fileExchange.ts](../packages/browser/src/fileExchange.ts)): a `Blob`
  behind a link with `download`, and a hidden `<input type="file">`.
  It is the `FileExchange` port; the UI never touches a file itself.

## Further rules

- UI components never import ports or adapters. They receive `UseCases`
  as a prop.
- Generated files (`packages/vocab/src/*.generated.ts`) are never edited
  by hand: change the vocabulary or the shapes in `ns/` and run
  `npm run generate` ([shapes.md](shapes.md), [vocab.md](vocab.md)).
- Modules reachable from `vite.config.ts` spell out `.ts` on relative
  imports: Vite can load the config with Node's own loader, which needs
  them. Imports between packages go through `exports` and carry no
  extension.
- Only `composition` wires the layers together
  ([appUseCases.ts](../packages/composition/src/appUseCases.ts)). The
  site's `apps/web/src/main.tsx` calls `@solid-memo/composition`, with
  what is its own (its name, where it is served, the build's values),
  and renders its components.
- The Studio is loaded lazily: `apps/web/src/main.tsx` alone imports
  `@solid-memo/studio`, with `import()`, so the Studio stays a chunk of
  its own that learners never download ([studio.md](studio.md)).

## Adding a dependency

1. Decide which single package it belongs to, and add it to that
   package's `package.json` (`npm install <lib> -w @solid-memo/<package>`).
2. If it performs I/O, wrap it behind a port in
   `packages/application/src/ports.ts` and implement the port in an
   adapter package.
3. Add it to the vendor table above.
