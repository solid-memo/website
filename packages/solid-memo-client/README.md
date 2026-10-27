# @solid-memo/solid-memo-client

A second implementation of the Solid client modules, with no Inrupt
library. Each of its modules exports what the module it replaces
exports, and passes the same contract tests:

| Module | Replaces | On |
|---|---|---|
| `src/rdf.ts`, `src/dataset.ts` | `packages/solid/src/client/rdf.ts` | `n3`'s RDF/JS terms |
| `src/resources.ts` | `packages/solid/src/client/resources.ts` | `fetch`, `n3` for Turtle, `jsonld-streaming-parser` for JSON-LD |
| `src/session.ts`, `src/oidc*.ts` | `packages/solid/src/client/session.ts` | `oauth4webapi`, WebCrypto, IndexedDB |
| `src/access.ts` | `packages/solid/src/client/access.ts` | `fetch` and `n3` |
| `src/turtleDocument.ts` | `packages/shacl/src/turtleDocument.ts` | `n3` |

Inrupt's client is the default. A build or a test run takes this one
with `SOLID_CLIENT=solid-memo-client`:

```sh
SOLID_CLIENT=solid-memo-client npm run build
SOLID_CLIENT=solid-memo-client npm run test:unit -w @solid-memo/shacl
```

The switched run has no coverage: the modules it replaces are never
loaded ([solid-memo-client.md](../../docs/solid-memo-client.md#switching-clients)).

The switch is a Vite plugin,
[scripts/solidClient.ts](../../scripts/solidClient.ts), in every
package's Vitest config (`vitest.shared.ts`), in `apps/web`'s Vite config
and in `e2e/pod`'s. It resolves every import of a replaced module to
this package's module of the same name, and leaves this package's own
imports alone. Any other value of `SOLID_CLIENT` stops the config from
loading.

## Exports

None that another package imports: the build switch puts its modules
in place of the ones they replace. Their exports count as used where the
replaced module's are (`npm run check:exports`).

## Boundaries

It may import `solid`: the client's interface, the SPARQL Update
bodies, `writableTerms` and, in tests, the contract suites in
`src/testing/contract/`. No package may import it, and it imports no
`@inrupt/` package, its tests included. Its browser code may use `n3`
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/solid-memo-client   # 100% coverage
npm run test:unit -- packages/solid-memo-client/src/rdf.test.ts   # one file, from the root
```

Its tests run the contract in either mode. With the switch on, the
other packages' tests and `npm run test:pod` run against this client,
as CI's advisory `solid-memo-client` jobs do
([testing.md](../../docs/testing.md#continuous-integration)).

## Status

Experimental: Inrupt's client stays the default. A private workspace
package, version `0.0.0`, never published to npm.

[solid-memo-client.md](../../docs/solid-memo-client.md) says how it
signs in, keeps the session and grants access, and where it differs
from Inrupt's. See [vendor-code.md](../../docs/vendor-code.md) and
[authentication.md](../../docs/authentication.md) too.
