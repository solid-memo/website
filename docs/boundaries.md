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
- an import of `@inrupt/solid-client`'s access control from any file
  but the release publisher's, tests aside
  ([below](#access-control)).

Test files follow the same rules as their subject; they and the vitest
configs may also use the shared test tooling of the root `package.json`.

### An example

A screen in `ui` may use what the use cases give it, since `ui` may
import `application` (the [table](#layers) below):

```ts
// packages/ui/src/ui/DeckListContainer.tsx
import type { UseCases } from "@solid-memo/application/useCases";
```

It may not reach for an adapter, such as the guest's pod in `solid`:

```ts
// packages/ui/src/ui/SomeScreen.tsx
import { createLocalPod } from "@solid-memo/solid/localPod";
```

The check names the file and the rule, once for each problem, and
fails:

```text
packages/ui/src/ui/SomeScreen.tsx: @solid-memo/ui may not import @solid-memo/solid.
packages/ui/src/ui/SomeScreen.tsx: imports @solid-memo/solid, which package.json does not declare.
2 boundary problem(s).
```

The fix is a use case: the screen calls one on `UseCases`, and
`composition` wires the adapter behind its port. A package that may
import another only from some files says which. Importing the
composition root anywhere in `apps/web` but its entry point gives:

```text
apps/web/src/App.tsx: only files matching /^src\/main\.tsx$/ may import @solid-memo/composition.
```

When every import keeps to the rules, the check prints "Every package
keeps to its boundaries."

## Layers

| Package | May import | Only from |
|---|---|---|
| `turtle` | — | |
| `markdown` | `turtle` | `turtle`: `tooling/` only, to read the docs' index ([markdown.md](markdown.md#the-docs-index)) |
| `vocab` | `turtle` | `turtle`: `tooling/` only |
| `domain` | `vocab` | |
| `application` | `domain`, `vocab` | |
| `shacl` | `domain`, `vocab`, `turtle`, `markdown` | `turtle`, `markdown`: `node/` only |
| `solid` | `application`, `domain`, `vocab`, `shacl` | |
| `browser` | `application`, `domain` | |
| `ui` | `application`, `domain`, `vocab`, `markdown` | `markdown`: `src/ui/` only |
| `composition` | `application`, `domain`, `vocab`, `solid`, `browser` | |
| `web` | `application`, `domain`, `vocab`, `ui`, `composition`, `studio`, `markdown` | `composition`: `src/main.tsx` only; `studio`: `src/main.tsx` only, with a dynamic `import()`; `markdown`: `vite.config.ts` and `src/build.test.ts` only, its node tooling, which renders the docs ([markdown.md](markdown.md#the-docs-as-a-site)) |
| `studio` | `application`, `domain`, `vocab`, `ui` | |
| `e2e-pod` | `application`, `domain`, `vocab`, `solid` | |
| `e2e-journeys` | `ui` | `ui`: `harness/strings.ts` only, for the app's messages |

Browser code: `src/` of `markdown`, `vocab`, `domain`, `application`, `shacl`,
`solid`, `browser`, `composition`, `ui`, `web` and `studio`; `vocab`'s
and `markdown`'s `tooling/` are node-only.

## Vendor libraries

Each is a dependency of only the packages listed (and so, by the check,
used nowhere else):

| Library | Package | Notes |
|---|---|---|
| `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `solid` | `shacl` also uses `@inrupt/solid-client` to parse shape documents; deck files are written and read with it too ([below](#files-without-a-vendor-library)); its access control (universal access, ACP, the ACL functions) only in `src/solidReleasePublisher.ts` ([below](#access-control)) |
| `@tanstack/react-query`, `preact` | `ui`, `web`, `studio` | the components; in `web`, `main.tsx` to render the page and `App.tsx`, the page; in `studio`, its screens |
| `@fontsource/*`, `@fontsource-variable/*` | `ui`, `markdown` | in `ui`, `src/style.css` only; in `markdown`, `@fontsource-variable/fredoka` in `tooling/drawDiagrams.ts` only, to embed Fredoka in the docs' diagrams ([markdown.md](markdown.md#the-diagrams-font)) |
| `rdf-validate-shacl` | `shacl` | `src/engine.ts` only, loaded lazily |
| `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` | `markdown` | `src/parse.ts` only; the package's API is its own types, never `mdast`'s ([markdown.md](markdown.md)) |
| `n3` | `turtle`, the node tooling of `shacl`, and `e2e-pod` | never in the browser; in `e2e-pod`, the server contract and the tests |
| `fake-indexeddb` | `browser`, `composition` | tests only: IndexedDB in node, for the guest's pod's store |
| `@playwright/test` | `e2e-journeys` | drives the built app in Chromium, Firefox and WebKit; the harness also talks to the Solid server with its request API |
| `@axe-core/playwright` | `e2e-journeys` | `pages/App.ts` only: checks the screen each journey step ends on for accessibility ([testing.md](testing.md#user-journeys)) |
| `mermaid`, `playwright` | `markdown` | `tooling/drawDiagrams.ts` only, never in the browser (the check holds both node-only): Mermaid draws the docs' diagrams in Chromium, which `playwright` starts ([markdown.md](markdown.md#diagrams)); development tools, so Mermaid's packages before 1.0.0 are not shipped ([vendor-code.md](vendor-code.md#maturity)) |

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

## Access control

The app changes who may read something in one place only: a release it
publishes is made readable by everyone
([studio.md](studio.md#publishing-a-release)). That write is confined to
the `ReleasePublisher` port's adapter,
[solidReleasePublisher.ts](../packages/solid/src/solidReleasePublisher.ts),
which calls `@inrupt/solid-client`'s `universalAccess.setPublicAccess`
for the release's document alone, asking read and nothing else. The
library writes that document's own ACL (Web Access Control) or ACR
(Access Control Policies). The fetch it is given takes only that one:
a request to another origin, or a write of anything but
`<release>.acl` or `<release>.acr`, is refused, whatever the server
names as the release's access control. No other module imports
`universalAccess`, or writes an ACL or an ACR; no folder's access
control is changed.
`npm run check:boundaries` enforces the imports
([checkBoundaries.ts](../scripts/checkBoundaries.ts), `VENDOR_ONLY_FROM`):
outside tests, only that file may import `@inrupt/solid-client`'s access
control (`universalAccess`, the `acp_*` modules, the ACL functions), or
all of the library at once (`import * as`). That no other module
writes an ACL or an ACR with a plain request, the pod fence holds
while the app runs (below).

## The pod fence

Every pod adapter is given one fetch
([appUseCases.ts](../packages/composition/src/appUseCases.ts)), and it
passes two fences before it reaches the guest's pod or the network:

- **The pod fence**
  ([podFence.ts](../packages/solid/src/podFence.ts), `createPodFence`)
  lets every read (GET, HEAD, OPTIONS) through. A request of any other
  method is refused before it is sent (`writeRefused`) unless its
  address is one Solid Memo may write to (`isSafeWriteUrl` in
  [instanceLayout.ts](../packages/domain/src/instanceLayout.ts)):
  in the form a request sends it, http(s) with no query or fragment,
  with no dot segment, no empty segment (`//`), nothing encoded a
  server might read as a step elsewhere or as another name (an encoded
  slash, backslash or percent sign, an overlong byte, a letter or digit
  encoded), and not an access control or metadata resource (`.acl`,
  `.acr`, `.meta`, in any case). Addresses come from pod data anyone
  may have written, so the fence holds whichever code sends the write.
  Which documents an instance's code may write is still the adapters'
  to check, where the instance is known
  ([data-model.md](data-model.md#where-an-instances-documents-are)):
  the type index, the profile link, registrations, releases and copies
  are written outside instances too.
- **The write fence**
  ([writeFence.ts](../packages/solid/src/writeFence.ts)) keeps an
  instance being moved or copied read-only
  ([guest-mode.md](guest-mode.md)).

The release publisher alone gets a second fetch for the access control
it writes: the same fences, its pod fence letting a document's own ACL
or ACR (`<document>.acl`, `<document>.acr`) through, never a folder's.
It uses it only inside its own check, which allows the release's two
([Access control](#access-control)). A Studio trial never writes a
pod: its fetch refuses every method but GET and HEAD
([studio.md](studio.md#the-trial)).

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
- The site's stylesheet is `ui`'s `src/style.css`, which
  `apps/web/src/main.tsx` imports; it styles `ui`'s components, and
  none that only the Studio shows. The Studio's own,
  `apps/studio/src/ui/studio.css`, is imported by its shell alone
  (`shell/StudioShell.tsx`, a relative import inside the package), so
  it ships with the Studio's chunk, and every rule in it holds only
  under `:root[data-surface="studio"]`
  ([studio.md](studio.md#layout)).

## Adding a dependency

1. Decide which single package it belongs to, and add it to that
   package's `package.json` (`npm install <lib> -w @solid-memo/<package>`).
2. If it performs I/O, wrap it behind a port in
   `packages/application/src/ports.ts` and implement the port in an
   adapter package.
3. Add it to the vendor table above.
