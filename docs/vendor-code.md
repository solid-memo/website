# Vendor-specific and vendor-independent code

Which third-party technology Solid Memo depends on, where each is
confined, and what replacing one would cost.

## Vendors and their confinement

| Vendor | Packages | Confined to | Role |
|---|---|---|---|
| Inrupt Solid clients | `@inrupt/solid-client`, `@inrupt/solid-client-authn-browser` | `packages/solid/src/client/` ([boundaries.md](boundaries.md#the-solid-client-libraries)), and `packages/shacl/src/turtleDocument.ts` for reading shapes; its universal access API in `client/access.ts` alone | RDF datasets, pod I/O, Solid-OIDC auth, and the app's one access-control write: a published release made readable by everyone, on WAC or ACP ([boundaries.md](boundaries.md#access-control)). The default client: a build with `SOLID_CLIENT=solid-memo-client` ships none of it ([solid-memo-client.md](solid-memo-client.md)) |
| TanStack | `@tanstack/react-query` (via `preact/compat`) | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Async-state caching and invalidation |
| Preact | `preact` | `packages/ui/src/ui/`, `apps/studio/src/`, `apps/web/src/` | Rendering |
| Fontsource | `@fontsource-variable/fredoka`, `@fontsource/bangers`, `@fontsource-variable/noto-naskh-arabic` (all SIL OFL-1.1) | `packages/ui/src/style.css` (`@import`), and, for the diagrams' Fredoka ([markdown.md](markdown.md#the-diagrams-font)), `packages/site/src/drawDiagrams.ts` | Typefaces, self-hosted: bundled into `dist/` with no third-party font requests. Fredoka for text, Bangers (comic lettering) for `h1`/`h2`, Noto Naskh Arabic for Arabic text. |
| Zazuko | `rdf-validate-shacl` (MIT; with `@rdfjs/*`, `clownface`) | `@solid-memo/shacl` (`src/engine.ts`, a lazily loaded chunk) | SHACL validation of pod and library documents against the shapes in `ns/shapes/` |
| unified collective, tats-u | `mdast-util-from-markdown`, `micromark-extension-gfm-table`, `mdast-util-gfm-table`, `micromark-extension-cjk-friendly` (MIT; with `micromark`, `get-east-asian-width` and, through `decode-named-character-reference`, the `character-entities` table, aliased to its plain build in `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`, `apps/studio/vitest.config.ts` and `packages/ui/vitest.config.ts`) | `@solid-memo/markdown` (`src/parse.ts`) | Parsing Markdown in data (CommonMark with pipe tables and CJK-friendly emphasis) into a tree the package folds into its own types ([markdown.md](markdown.md)) |
| mermaid-js | `mermaid` (MIT; with `d3`, `dagre-d3-es`, `elkjs`, `katex`, `roughjs`, `dompurify` and more) | `packages/site/src/drawDiagrams.ts`, a development tool, never in the browser | Drawing the docs' Mermaid diagrams to SVG at build time, in Chromium ([markdown.md](markdown.md#diagrams)). Pinned, and bumped apart from Playwright (`renovate.json5`) |
| Microsoft | `playwright` (Apache-2.0), `@playwright/test` | `packages/site/src/drawDiagrams.ts`; `e2e/journeys/` | Starting the diagrams' Chromium; driving the built app through the user journeys ([testing.md](testing.md#user-journeys)). One pinned version, which fixes the Chromium build |
| Deque | `@axe-core/playwright` (MPL-2.0; with `axe-core`) | `e2e/journeys/pages/App.ts` | Checking each screen the user journeys visit against WCAG's rules, in the tests only, never in the app. Pinned |
| RDF/JS community | `jsonld-streaming-parser` (MIT; with `jsonld-context-parser`), which `@inrupt/solid-client` depends on too | `packages/solid/src/client/resources.ts` ([boundaries.md](boundaries.md#files-without-a-vendor-library)) | Reading a deck file's JSON-LD, with a document loader that fetches nothing |
| RDF/JS community | `n3` | `@solid-memo/turtle`, the node tooling of `shacl`, and `e2e/pod/` (the server contract and tests) | Build-time Turtle parsing for the generators and validation; reading and writing pod documents in the end-to-end tests |
| RDF/JS community | `n3` (MIT), `jsonld-streaming-parser` (MIT) | `@solid-memo/solid-memo-client` | In place of Inrupt's clients, with `SOLID_CLIENT=solid-memo-client`: RDF/JS terms, and parsing and writing Turtle (`n3`); parsing JSON-LD (`jsonld-streaming-parser`) |
| Filip Skokan | `oauth4webapi` (MIT) | `@solid-memo/solid-memo-client` (`src/session.ts`, `src/oidcLogin.ts`, `src/oidcSession.ts`, and `src/oidcStore.ts` for its types) | In place of Inrupt's clients: Solid-OIDC's discovery, dynamic registration, authorization-code flow with PKCE, token requests and DPoP proofs |

## Maturity

The app ships only released versions: 1.0.0 or later, with no
prerelease tag (`-alpha`, `-beta`, `-rc`). `npm run check` fails on any
other version among the app's run-time dependencies, kept by the bundle
or not, the workspace's own packages aside
([checkDependencies.ts](../scripts/checkDependencies.ts) walks
`package-lock.json` from `apps/web`, and from
`packages/solid-memo-client`, which a build can ship in place of
Inrupt's libraries). Development tools aren't shipped
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
`packages/solid/src/mappers/` translate the RDF module's own types
(`Dataset`, `Subject`, from `client/rdf.ts`) into domain types. Those
types are the app's own, in `client/interface.ts`, which names no
library, so no Inrupt import appears outside `client/`, and no RDF
type crosses upward past a mapper.

## Cost of swapping a vendor

- **Inrupt clients** → a second implementation of the four client
  modules in `packages/solid/src/client/` (`rdf.ts`, `resources.ts`,
  `session.ts`, `access.ts`) and of
  `packages/shacl/src/turtleDocument.ts`. One exists:
  `@solid-memo/solid-memo-client`, on `n3`, `jsonld-streaming-parser`
  and `oauth4webapi`, which a build or a test run takes in place of
  Inrupt's with `SOLID_CLIENT=solid-memo-client`
  ([solid-memo-client.md](solid-memo-client.md#switching-clients)).
  Inrupt's stays the default, and the switch's plugin,
  `scripts/solidClient.ts`, names it so. Their interface is the app's
  own. The types are in `client/interface.ts` (`Dataset`, `Subject`,
  the `SubjectBuilder` with only the methods the code uses, `HttpError`,
  `SessionClient`, `GrantPublicRead`), which names no library. The
  functions keep the names they have, each with a signature of those
  types. A replacement exports the same, and its
  callers, the RDF mappers and the record ↔ model mappers don't change.
  Inrupt's hands the library's objects through
  `client/inrupt.ts`, the one place that converts them; it and
  `client/linearDataset.ts` are that implementation's own, used
  by the other client modules alone. Sign-in and pod
  data can be switched apart: the composition root passes the sign-in
  client to `createSolidSession`. The SPARQL Update bodies of the
  app's PATCH requests (`client/sparqlUpdate.ts`) name no library
  either, so a replacement can send the same ones. What a replacement
  must match is pinned in two places:
  - **The contract tests** in `packages/solid/src/testing/contract/`
    take an implementation, and each client module's own test file runs
    them against Inrupt's, as `solid-memo-client`'s run them against
    its own. The RDF module's pin the data model:
    `getThingAll` leaves out blank-node subjects, and `getThing` finds
    one by its `_:label`. A subject made by name resolves against the
    URL its dataset was read from. `getDatetime` throws on some literals
    and gives an invalid date past the JavaScript date range. Language
    tags read back in lower case. `getDecimal` reads as `parseFloat`
    does, and a decimal is written as JavaScript spells it (`1`, not
    `1.0`). The change log (`changesOf`) and the source (`sourceOf`)
    behave as their comments in `rdf.ts` say. The resource module's pin
    the requests that `datasets.ts` builds its cache and its
    preconditions on. A read asks the pod and never the browser's
    cache, and with `ifNoneMatch` says when the document isn't
    modified (304). A new document is one PUT with `If-None-Match: *`.
    An edit is one PATCH of the app's own body, `If-Match` the version
    given, sent once more after a 409 with its decimals spelled as
    numbers. An edit too large for one PATCH, or asked to be whole, is
    one PUT. A write holding a term Turtle can't write as it is is
    refused before anything is sent (`writableTerms.ts`). A write gives
    the ETag the pod answered, and a delete takes `If-Match`. They pin a file's Content-Type too. A failed
    request rejects with `HttpError`, carrying `statusCode`, `response`
    and a message naming the URL and the status; `retryable.ts` and
    `typeIndex.ts` read them. A text that doesn't parse rejects with
    the parser's error, not an `HttpError`. Turtle and JSON-LD parse in
    every graph the text names, with relative IRIs resolved against the
    document's URL, and `getSolidDatasetLinear` reads what
    `getSolidDataset` reads, in one pass. On sign-in, `restore()`
    completes a login or restores the session silently, and says which,
    with the WebID and the page a silent restore left; `fetch` uses the
    current session, never one from before a login. A harness of the
    implementation's own sets up what the identity provider holds. The
    grant writes only the document's own ACL, read for everyone, and
    gives false on a pod without access control.
    `solidReleasePublisher.test.ts` runs that grant behind the
    publisher's fence, on a WAC pod and an ACP one held in memory: it
    asks by URL, and writes only the release's own ACL or ACR. What is
    the current library's alone, its error messages, its subject
    shapes, its request fixes and its sign-in events, is tested beside
    the contract, not in it, in each implementation.
  - **The end-to-end tests against real Solid servers** (`e2e/pod/`)
    cover what the unit tests don't check. Each server must take the
    requests' Accept and Content-Type headers. A saved edit goes as a
    PATCH with the body `client/sparqlUpdate.ts` writes. The grant's ACL
    and ACR writes must work on the servers themselves. CI runs them on
    `solid-memo-client` too, in advisory jobs
    ([testing.md](testing.md#continuous-integration)).
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
