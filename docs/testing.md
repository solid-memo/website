# Testing

Unit tests with [Vitest](https://vitest.dev/) in every package, in node
unless the package runs in the browser: `apps/web`, `solid` and `browser`
run in `happy-dom`, and the UI's tests use `@testing-library/preact`
([vitest.shared.ts](../vitest.shared.ts)). Coverage is enforced at
**100%** (statements, branches, functions, lines) per package: each
package's own tests cover its own code — `npm test` fails below that.

## Commands

```sh
npm test          # every package's tests, with coverage thresholds (turbo)
npm run check     # the same, plus typecheck, drift, formatting, boundaries
npm run test:unit -- apps/web/src/ui/App.test.tsx   # some files, or all with none, without coverage (root vitest.config.ts)
npm run test:watch # watch mode, every package's tests
npm run test:unit -w @solid-memo/domain -- account.test.ts   # one package's (test:watch too)
npm run crosscheck # the pySHACL cross-check, as CI runs it (needs scripts/requirements-ci.txt)
npm run test:pod  # the end-to-end tests, against the Solid servers they start in Docker
npm run servers -w @solid-memo/e2e-pod   # pull or build those servers' images ahead (`-- css-6` for one)
npm run pod       # a Community Solid Server at http://127.0.0.1:3999/, in memory, to poke at by hand
npm run pod:clean # take down the servers an interrupted run left
```

`npm run test:pod` runs `e2e/pod/` once against each Solid server
[servers.ts](../e2e/pod/servers.ts) knows, which its global setup
([globalSetup.ts](../e2e/pod/globalSetup.ts)) starts in Docker, each on a
free port of 127.0.0.1 and told that URL, and takes down after (or as
the run ends, on Ctrl-C); the test names say which server and version:

| Id | Server | Image | Tier |
|---|---|---|---|
| `css-7` | Community Solid Server 7.x, in memory | its own, `solidproject/community-server`, pinned by digest | blocking |
| `css-6` | Community Solid Server 6.x, in memory | the same | blocking |
| `nss-6` | node-solid-server 6.x | built here from its lockfile ([servers/nss/](../e2e/pod/servers/nss/Dockerfile)), in a root whose ACL lets anyone read and write | blocking |
| `nss-5` | node-solid-server 5.x | the same | blocking |
| `css-8` | Community Solid Server 8, still in alpha, in memory | its own, pinned by digest | advisory |
| `pivot` | Pivot, the server of solidcommunity.net (the Community Solid Server 7 with Pivot's components), in memory | built here from its lockfile ([servers/pivot/](../e2e/pod/servers/pivot/Dockerfile)) with a configuration of its own, its root open | advisory |
| `nextcloud` | Solid-Nextcloud: Nextcloud 30 with the Solid app, on SQLite, the pod `apps/solid/~alice/storage/` | built here from a commit of the app ([servers/nextcloud/](../e2e/pod/servers/nextcloud/Dockerfile)), installed on every start, alice's pod opened by a hook | advisory |
| `jss` | JavaScript Solid Server, files in the container, open to anyone (`--public`, which skips its access control) | built here from its lockfile ([servers/jss/](../e2e/pod/servers/jss/Dockerfile)), unmodified and pushed nowhere (it is AGPL) | advisory |

A **blocking** server's tests gate CI, and so deploys and Renovate's
merges: every test passes or skips, for a reason the tests give. An
**advisory** server's results are reported, not a gate: the Interop
workflow ([interop.yml](../.github/workflows/interop.yml)) runs them on
pushes to `main` that touch the app's Solid code, weekly, and by hand,
and a job fails only on a test failing that
`e2e/pod/servers/<id>/expected-failures.json` (`{ "<file> > <test>":
"<why>" }`, the test named without its server) does not list, or when
no test ran ([compare.ts](../e2e/pod/compare.ts) says which in the job's
summary, and what passes though listed, to take off the list). CI still
checks that every advisory server starts and meets the contract, so a
change that breaks one is not merged unnoticed. Solid-Nextcloud's SQLite
refuses writes made at once, so with it in a run the test files run one
at a time (`serialFiles` in servers.ts); what it fails, and why, is its
`expected-failures.json`. css-8 becomes blocking at
8.0.0, and css-6 then goes.

Each server is a compose file, `e2e/pod/servers/<id>/compose.yml`. It may
ask only for `E2E_PORT` (the port on 127.0.0.1 the harness picked, which
the server must be told) and `E2E_SECRET` (a password made up for the
run), publishes on 127.0.0.1 only, and gets nothing of the host; `npm
test` checks that of every one ([servers.test.ts](../e2e/pod/servers.test.ts)).
Images built here are tagged `localhost/solid-memo-e2e-<id>:local` and
pushed nowhere; the others are pulled once. Before the tests, every
server must meet a contract ([contract.ts](../e2e/pod/contract.ts)): a
document anyone writes in its pod root reads back, is listed there at the
URL it was written to, and deletes. A server that is not open, or does
not know the URL it is reached at, fails there, saying so, not in every
test. What a server prints goes to `e2e/pod/logs/<id>.log`, which CI
keeps when a job fails.

`SOLID_SERVERS=css-7,nss-5` runs the suite against some only (`all`
against every one; unset, the blocking ones; `css-8` for the advisory);
`SOLID_SERVER_URL` against a server of your own instead, which must let
anyone read and write, as `npm run pod`'s does (`SOLID_SERVER_NAME` names
it in the tests; `NODE_EXTRA_CA_CERTS` trusts its certificate, if a CA of
your own signed it). CI runs one job per blocking server, side by side, none
stopping the others ([migrations.md](migrations.md#proof-on-a-real-server));
Renovate keeps each server on its major (`renovate.json5`), and which
servers each workflow runs is the table's in servers.ts (`npm test`
checks).

They need Docker: Docker Engine 28.3.3 or later on Linux (before it, a
port published on 127.0.0.1 could be reached from the local network,
CVE-2025-54388), or Docker Desktop. A run killed before its teardown
leaves its servers; the next run takes them down, as does `npm run
pod:clean`. `npm run pod`'s server lets anyone read and write: keep no
real data in it, and stop it when done.

The servers differ in what they enforce, and the tests ask each rather
than assume ([serverTraits.ts](../e2e/pod/src/serverTraits.ts)):

- **node-solid-server** gives no ETag on a read and ignores `If-Match`, so
  there an edit cannot be made conditional and the test that proves an
  edit is refused is skipped; without ETags no
  [digest](data-model.md#the-digest) is kept either, so the test of two
  pages learning at once is skipped, and the others check that every
  visit reads everything. (5.7.4 also ignored `If-None-Match: *` on a
  PUT; 5.8.8 and 6.0.0 enforce it.)
- **Community Solid Server 6** builds its ETag from the modification time
  in whole seconds: an edit in the same second as a read keeps the ETag,
  so a changed document looks unchanged. The tests edit within the
  second, so there the test that proves an edit is refused and the
  digest's tests are skipped. 7 stamps milliseconds.

Every skip says why. Everything else runs on every server. A test may
skip only where the server does something the Solid Protocol allows and
the app copes with, as above; what the app needs and has no way around (a
PATCH it can send, an ACL it can write, every insert of several at once
kept) is never a reason to skip, and a probe that cannot tell throws.
What the tests need only for themselves they ask of the server too: an
ACL document is where its `Link rel="acl"` says, and a change "another
app" makes is an N3 Patch, a SPARQL Update or the whole document, as its
`Accept-Patch` allows. What each blocking server does is pinned
([serverTraits.integration.test.ts](../e2e/pod/src/serverTraits.integration.test.ts)):
a release that changes it fails there, not as tests quietly starting or
stopping to skip, and the pin moves by hand once the change is
understood.

The Community Solid Server's in-memory store (the one these tests use)
cuts a document short after a PATCH to it when the document holds
characters outside ASCII (`å`, `ä`, `ö`), even when the patch itself is
ASCII: it stores as many bytes as there were characters. Its file store
does not; keep test data that is patched ASCII, or measure on
`-c @css:config/file.json -f <dir>`.

solid-server 6.0.0 is packaged with faults its image works around: it
lacks the root ACL template it copies on first start (so the image has
one in its config folder), and it lists its own commit-hook tool
`@fastify/pre-commit` as a dependency, whose install script would put a
git hook in place; 5.8.8 does too. The image installs without install
scripts. node-solid-server prints every request it handles (`solid:*`),
so its log runs to tens of megabytes.

The vocabulary, the deck library and the pod catalog fixtures are also
cross-checked by pySHACL in CI (`npm run crosscheck`;
see [validation.md](validation.md#the-ci-cross-check)).

Apart from the end-to-end tests' Docker images, nothing needs the
network: the vocabulary, the shapes and the deck library are read from
the repository's `ns/` and `decks/`, at the IRIs the site publishes
them under.

## Coverage policy

100% of every package's `src/` (and `tooling/` or `node/` where it has
one), set up once in [vitest.shared.ts](../vitest.shared.ts), with these
documented exclusions:

- `apps/web/src/main.tsx` — composition root; pure wiring, no logic
  (configured in [vite.config.ts](../apps/web/vite.config.ts)).
- `src/test/` and `src/testing/` — test setup and helpers other
  packages' tests import (`@solid-memo/domain/testing/libraryDeck`,
  `@solid-memo/shacl/testing/turtle`), not product code.

Code that cannot reach 100% is restructured until it can (e.g. an
unreachable defensive branch is removed rather than excluded). New code
ships with its tests in the same change; coverage never dips.

## Strategy per layer

Dependency inversion gives every layer a seam that makes mocks trivial:

| Layer | Seam | Technique |
|---|---|---|
| Domain | none needed | Pure functions; inputs (including `now: Date`) passed as parameters. Plain assertions. |
| Application | ports | Inject fake port objects (`vi.fn` per method). No module mocking. |
| UI | `UseCases` prop | Render with a fake `UseCases`; assert via testing-library queries. Query-dependent components get a fresh `QueryClient` (retries off). |
| Infrastructure mappers | none needed | Pure `SolidDataset`/`Thing` → domain functions; feed in-memory datasets built with `mockSolidDatasetFrom`/`buildThing`. |
| Infrastructure I/O shells | injected `fetch` + `vi.mock` | Mock `@inrupt/*` module functions; assert the shell orchestrates fetch → map → return. |
| Shapes (`packages/shacl/`, `packages/solid/src/conformance.test.ts`) | the real engine | The real `rdf-validate-shacl` over the real shapes in `ns/shapes/`: fixture documents under `packages/vocab/fixtures/` pass or fail as a table says; a record written through every descriptor, and every migration step's output, conforms (`conformance.test.ts`). Every library deck passes too, by `npm run library:check` ([deck-library.md](deck-library.md#checks)). Shape documents are read through a `fetch` that serves the repository's files at their IRIs (`shapesFetch` in [sources.ts](../packages/vocab/tooling/sources.ts), a `Response` with its `url` set), exactly as the browser reads them. |
| Generated code | drift test | `packages/vocab/tooling/generate.test.ts` renders the generators' output and compares it with the committed files; generated modules are data only, so importing them covers them (`packages/vocab/src/generated.test.ts`). |
| End to end | real Solid servers | `e2e/pod/` wires the real use cases and Solid adapters as `main.tsx` does, over a fetch that records every request, against Community Solid Server 7 and 6 and node-solid-server 6 and 5. |

```mermaid
graph LR
    D["domain<br/>pure fns"] -->|plain calls| T1[tests]
    A["application<br/>use cases"] -->|fake ports| T2[tests]
    U["ui<br/>components"] -->|fake UseCases| T3[tests]
    M["infra mappers<br/>pure fns"] -->|in-memory datasets| T4[tests]
    S["infra I/O shells"] -->|vi.mock @inrupt/*| T5[tests]
```

## Conventions

- Tests are colocated: `foo.ts` ↔ `foo.test.ts`.
- Test files follow the same import boundaries as their subject
  ([boundaries.md](boundaries.md)); `packages/shacl/src/testing/turtle.ts` parses Turtle
  through `@inrupt/solid-client` for the SHACL tests.
- Node tooling tests may read the repository's `ns/` and `decks/`
  (through `NS_ROOT` and `DECKS_ROOT`) and the vocab package's `vendor/`
  and `fixtures/` (through `VOCAB_ROOT`): they are the fixtures.
- Preact-compat note: `@tanstack/react-query` must be inlined in the vitest
  server deps so the `react → preact/compat` alias applies (see
  `apps/web/vite.config.ts`).
