# Boundaries

Import rules between packages: a change that breaks them is wrong even
when it works.

## Enforcement

`npm run check:boundaries` ([checkBoundaries.ts](../scripts/checkBoundaries.ts))
runs in `npm run check` and in CI. It reads every workspace package's
imports and fails on:

- a relative import that leaves its package;
- a workspace package the layer or the importing file may not use
  (the table below);
- a static import of a package that may only be loaded lazily;
- an entry point the importer may not use;
- an import of a package the importer's `package.json` doesn't
  declare (npm hoists it to the root, where it would still resolve and
  type-check);
- a node-only import (`node:*`, `n3`, `@solid-memo/turtle`,
  `@solid-memo/site`, any package's `tooling/` or `node/` entry) in
  browser code;
- an import of a Solid client library, any `@inrupt/` package, from
  any file but `solid`'s client modules and `shacl`'s Turtle reader,
  tests aside ([below](#the-solid-client-libraries));
- an import of `@inrupt/solid-client`'s access control from any file
  but the public-read grant's, tests aside ([below](#access-control)).

Test files follow their subject's rules and, like the vitest configs,
may use the root `package.json`'s shared test tooling.

### An example

A screen in `ui` may import `application` (the [table](#layers)
below):

```ts
// packages/ui/src/ui/DeckListContainer.tsx
import type { UseCases } from "@solid-memo/application/useCases";
```

It may not import an adapter, such as the guest's pod in `solid`:

```ts
// packages/ui/src/ui/SomeScreen.tsx
import { createLocalPod } from "@solid-memo/solid/localPod";
```

The check names the file and rule per problem, and fails:

```text
packages/ui/src/ui/SomeScreen.tsx: @solid-memo/ui may not import @solid-memo/solid.
packages/ui/src/ui/SomeScreen.tsx: imports @solid-memo/solid, which package.json does not declare.
2 boundary problem(s).
```

The fix is a use case on `UseCases`, with `composition` wiring the
adapter behind its port. A rule that allows only some files names them;
importing the composition root anywhere in `apps/web` but its entry
point gives:

```text
apps/web/src/App.tsx: only files matching /^src\/main\.tsx$/ may import @solid-memo/composition.
```

With no problem, the check prints "Every package keeps to its
boundaries."

## Layers

| Package | May import | Only from |
|---|---|---|
| `turtle` | — | |
| `markdown` | — | |
| `vocab` | `turtle` | `turtle`: `tooling/` only |
| `site` | `vocab`, `turtle`, `markdown` | `vocab`: `tooling/root` alone (the repository's folders); `turtle` for the docs' index ([markdown.md](markdown.md#the-docs-index)); `markdown` to render the docs ([markdown.md](markdown.md#the-docs-as-a-site)) |
| `domain` | `vocab` | |
| `application` | `domain`, `vocab` | |
| `shacl` | `domain`, `vocab`, `turtle`, `markdown` | `turtle`, `markdown`: `node/` only |
| `solid` | `application`, `domain`, `vocab`, `shacl` | |
| `browser` | `application`, `domain` | |
| `ui` | `application`, `domain`, `vocab`, `markdown` | `markdown`: `src/ui/` only |
| `composition` | `application`, `domain`, `vocab`, `solid`, `browser` | |
| `web` | `application`, `domain`, `vocab`, `ui`, `composition`, `studio`, `site` | `composition`, and `studio` with a dynamic `import()`: `src/main.tsx` only; `site`: `vite.config.ts` (the site's build, which renders the docs) and tests only |
| `studio` | `application`, `domain`, `vocab`, `ui` | |
| `e2e-pod` | `application`, `domain`, `vocab`, `solid` | |
| `e2e-journeys` | `ui`, `studio` | `ui` and `studio`: `harness/strings.ts` only, for their messages |

Browser code is the `src/` of `markdown`, `vocab`, `domain`,
`application`, `shacl`, `solid`, `browser`, `composition`, `ui`, `web`
and `studio`.

## Vendor libraries

Each library is a dependency of, and allowed in, only the packages
listed:

| Library | Package | Notes |
|---|---|---|
| `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `solid` | `src/client/` only ([below](#the-solid-client-libraries)); `shacl` uses `@inrupt/solid-client` in `src/turtleDocument.ts` only, to parse shapes; its access control only in `src/client/access.ts` ([below](#access-control)) |
| `@tanstack/react-query`, `preact` | `ui`, `web`, `studio` | components; in `web`, `main.tsx`, which renders the page, and `App.tsx`, the page; in `studio`, its screens |
| `@fontsource/*`, `@fontsource-variable/*` | `ui`, `site` | in `ui`, `src/style.css` only; in `site`, `@fontsource-variable/fredoka` in `src/drawDiagrams.ts` only, to embed Fredoka in the diagrams ([markdown.md](markdown.md#the-diagrams-font)) |
| `rdf-validate-shacl` | `shacl` | `src/engine.ts` only, loaded lazily |
| `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` | `markdown` | `src/parse.ts` only; the package's API is its own types, never `mdast`'s ([markdown.md](markdown.md)) |
| `n3` | `turtle`, the node tooling of `shacl`, and `e2e-pod` | in `e2e-pod`, the server contract and the tests |
| `fake-indexeddb` | `browser`, `composition` | tests only: IndexedDB in node, for the guest's pod's store |
| `@playwright/test` | `e2e-journeys` | drives the built app in Chromium, Firefox and WebKit; the harness talks to the Solid server with its request API |
| `@axe-core/playwright` | `e2e-journeys` | `pages/App.ts` only: checks the screen each journey step ends on for accessibility ([testing.md](testing.md#user-journeys)) |
| `mermaid`, `playwright` | `site` | `src/drawDiagrams.ts` only, both node-only in the check: Mermaid draws the docs' diagrams in Chromium, which `playwright` starts ([markdown.md](markdown.md#diagrams)); development tools, not shipped ([vendor-code.md](vendor-code.md#maturity)) |

## The Solid client libraries

The rest of the code calls the Solid client libraries through modules
of the app's own, in
[packages/solid/src/client/](../packages/solid/src/client/), so another
library could take their place there alone
([vendor-code.md](vendor-code.md)):

| Module | What it has |
|---|---|
| [interface.ts](../packages/solid/src/client/interface.ts) | the types the other modules take and give, `HttpError`, the sign-in client's interface and the grant's type; it imports no library |
| [rdf.ts](../packages/solid/src/client/rdf.ts) | the data model: datasets and their subjects, read and built |
| [linearDataset.ts](../packages/solid/src/client/linearDataset.ts) | a document read into a dataset in one pass, where the library takes time in the square of its size, for `resources.ts` and `rdf.ts` alone |
| [resources.ts](../packages/solid/src/client/resources.ts) | reading and writing pods, conditional reads and writes among them, and the Turtle and JSON-LD parsers |
| [sparqlUpdate.ts](../packages/solid/src/client/sparqlUpdate.ts) | the SPARQL Update bodies of the app's PATCH requests; it imports no library |
| [inrupt.ts](../packages/solid/src/client/inrupt.ts) | the library's objects behind the interface's types, for the other modules alone |
| [session.ts](../packages/solid/src/client/session.ts) | the sign-in client, on `@inrupt/solid-client-authn-browser` |
| [access.ts](../packages/solid/src/client/access.ts) | the public-read grant ([below](#access-control)) |

`shacl` may not import `solid`, so it reads a shape's Turtle with a
module of its own,
[turtleDocument.ts](../packages/shacl/src/turtleDocument.ts), as pod
documents are read.

`npm run check:boundaries`
([checkBoundaries.ts](../scripts/checkBoundaries.ts), `VENDOR_ONLY_IN`)
lets only these files but `interface.ts`, outside tests, import any
`@inrupt/` package, with any import: named, a namespace, a subpath such as
`@inrupt/solid-client/universal`, or a dynamic `import()`. Such an
import elsewhere is reported once, not again by the access-control
rule. Tests mock the client modules, not the libraries, and the
client modules' own tests run the contract in
[src/testing/contract/](../packages/solid/src/testing/contract/),
which another implementation must pass too
([vendor-code.md](vendor-code.md#cost-of-swapping-a-vendor)).

## Files without a vendor library

A deck saved as a file, or read from one ([studio.md](studio.md#import-and-export)),
needs no library of its own:

- `solid` writes Turtle with `@inrupt/solid-client`'s
  `solidDatasetAsTurtle` and JSON-LD with
  [jsonLd.ts](../packages/solid/src/jsonLd.ts), a few lines over the
  triples. It reads both with `parseQuads`, on the library's Turtle and
  JSON-LD parsers. Both are in
  [client/resources.ts](../packages/solid/src/client/resources.ts).
- `browser`'s `FileExchange` port saves and opens files with what the
  browser has ([fileExchange.ts](../packages/browser/src/fileExchange.ts)):
  a `Blob` behind a link with `download`, and a hidden
  `<input type="file">`. The UI never touches a file.

## Access control

The app changes access in one place only: a published release becomes
readable by everyone ([studio.md](studio.md#publishing-a-release)).
Only the `ReleasePublisher` port's adapter,
[solidReleasePublisher.ts](../packages/solid/src/solidReleasePublisher.ts),
makes that write, with the grant it is given:
[client/access.ts](../packages/solid/src/client/access.ts) has
`@inrupt/solid-client`'s `universalAccess.setPublicAccess`, read only,
for the release's document, writing its own ACL (Web Access Control) or
ACR (Access Control Policies). The publisher's fetch refuses another
origin, or a write of anything but `<release>.acl` or `<release>.acr`,
whatever the server names as the release's access control. No folder's
access control changes.

`npm run check:boundaries`
([checkBoundaries.ts](../scripts/checkBoundaries.ts), `VENDOR_ONLY_FROM`)
lets only `client/access.ts`, outside tests, import `@inrupt/solid-client`'s
access control (`universalAccess`, the `acp_*` modules, the ACL
functions) or all of the library (`import * as`). Another client
module may import the rest of the library, never its access control.
At run time, the
[pod fence](#the-pod-fence) refuses any other module's ACL or ACR
write.

## The pod fence

Every pod adapter's one fetch
([appUseCases.ts](../packages/composition/src/appUseCases.ts)) passes
two fences before the guest's pod or the network:

- **The pod fence**
  ([podFence.ts](../packages/solid/src/podFence.ts), `createPodFence`)
  lets reads (GET, HEAD, OPTIONS) through and refuses other methods
  before they're sent (`writeRefused`), unless the address is safe to
  write (`isSafeWriteUrl` in
  [instanceLayout.ts](../packages/domain/src/instanceLayout.ts)). Such
  an address, as sent:
  - is http(s), with no query, fragment, dot segment or empty segment
    (`//`);
  - has nothing encoded a server might read as a step elsewhere or
    another name: a slash, backslash, percent sign, letter or digit, or
    an overlong byte;
  - isn't an access control or metadata resource (`.acl`, `.acr`,
    `.meta`, in any case).

  It holds for every write and sender (addresses come from pod data
  anyone may have written). Where the instance is known,
  adapters still check which documents its code may write
  ([data-model.md](data-model.md#where-an-instances-documents-are));
  the type index, the profile link, registrations, releases and copies
  are written outside instances.
- **The write fence**
  ([writeFence.ts](../packages/solid/src/writeFence.ts)) keeps an
  instance being moved or copied read-only
  ([guest-mode.md](guest-mode.md)).

The release publisher alone gets a second fetch for its access
control, through the same fences, whose pod fence lets a document's own
ACL or ACR (`<document>.acl`, `<document>.acr`) through, never a
folder's. It's used only inside the publisher's check, which allows the
release's two ([Access control](#access-control)). A Studio trial's
fetch allows only GET and HEAD ([studio.md](studio.md#the-trial)).

## Further rules

- UI components never import ports or adapters; they get `UseCases`,
  or the slices they use, as a prop.
- Generated files (`packages/vocab/src/*.generated.ts`) are never edited
  by hand: change the vocabulary or the shapes in `ns/` and run
  `npm run generate` ([shapes.md](shapes.md), [vocab.md](vocab.md)).
- Modules reachable from `vite.config.ts` spell out `.ts` on relative
  imports. Vite can load the config with Node's own loader, which
  needs them.
  Imports between packages go through `exports`, with no extension.
- Only `composition` wires the layers together
  ([appUseCases.ts](../packages/composition/src/appUseCases.ts), and a
  Studio trial's [trialUseCases.ts](../packages/composition/src/trialUseCases.ts)),
  every port, or a "none" it means, such as a trial's `NO_DEVICE`.
  `apps/web/src/main.tsx` calls `@solid-memo/composition` with the
  site's own values (its name, where it's served, the build's), and
  renders its components.
- The Studio is loaded lazily (the [table](#layers)), a chunk of its
  own that learners never download ([studio.md](studio.md)).
- `ui`'s `src/style.css`, the site's stylesheet, imported by
  `apps/web/src/main.tsx`, styles `ui`'s components (none only the
  Studio shows) with the color roles of `src/palettes.css`, which it
  imports ([theme.md](theme.md#color-roles)).
- The Studio's stylesheet, `apps/studio/src/ui/studio.css`, imported
  only by `shell/StudioShell.tsx` (a relative import inside the
  package), so it ships in the Studio's chunk. Its rules hold only under
  `:root[data-surface="studio"]` ([studio.md](studio.md#layout)).

## Adding a dependency

1. Add it to the one package it belongs to
   (`npm install <lib> -w @solid-memo/<package>`).
2. If it performs I/O, put it behind a port in
   `packages/application/src/ports.ts`, implemented in an adapter
   package.
3. Add it to the vendor table above.
