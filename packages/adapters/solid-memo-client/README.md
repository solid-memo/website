# @solid-memo/solid-memo-client

Solid Memo's Solid client with no Inrupt library: the modules
[`solid-client`](../solid-client/README.md) declares, as
[`inrupt-client`](../inrupt-client/README.md) gives them on Inrupt's.
Each of its modules exports what the module declared exports, and
passes the same contract tests:

| Module | In place of | On |
|---|---|---|
| `src/rdf.ts`, `src/dataset.ts` | `packages/adapters/solid-client/src/rdf.ts` | `n3`'s RDF/JS terms |
| `src/resources.ts` | `packages/adapters/solid-client/src/resources.ts` | `fetch`, `n3` to parse Turtle, `jsonld-streaming-parser` for JSON-LD |
| `src/session.ts`, `src/oidc*.ts` | `packages/adapters/solid-client/src/session.ts` | `oauth4webapi`, WebCrypto, IndexedDB |
| `src/access.ts` | `packages/adapters/solid-client/src/access.ts` | `fetch` and `n3` |
| `src/turtleDocument.ts` | `packages/adapters/shacl/src/turtleDocument.ts` | `n3` |

`inrupt-client` is the default. A build or a test run takes this one
with `SOLID_CLIENT=solid-memo-client`:

```sh
SOLID_CLIENT=solid-memo-client npm run build
SOLID_CLIENT=solid-memo-client npm run test:unit -w @solid-memo/shacl
```

The switched run has no coverage: the default client's modules are
never loaded ([solid-memo-client.md](../../../docs/solid-memo-client.md#switching-clients)).

The switch is a Vite plugin,
[scripts/solidClient.ts](../../../scripts/solidClient.ts), in every
package's Vitest config (`vitest.shared.ts`), in `apps/web`'s Vite config
and in `e2e/pod`'s. It resolves every import of a declared module to
the chosen client's module of the same name, and leaves that client's
own imports alone. Any other value of `SOLID_CLIENT` stops the config
from loading.

## Exports

None that another package imports: the build switch puts its modules
in place of the ones `solid-client` declares. Their exports count as
used where the declared module's are (`npm run check:exports`).

## Boundaries

It may import `solid-client`: the client's interface, the SPARQL
Update bodies, the Turtle writer (`turtleWriter`) and `writableTerms`;
and in tests `solid`, for the contract suites in
`src/testing/contract/`. No package may import it, and it imports no
`@inrupt/` package, its tests included. Its browser code may use `n3`
([boundaries.md](../../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/solid-memo-client   # 100% coverage
npm run test:unit -- packages/adapters/solid-memo-client/src/rdf.test.ts   # one file, from the root
```

Its tests run the contract in either mode. With the switch on, the
other packages' tests and `npm run test:pod` run against this client,
as CI's advisory `solid-memo-client` jobs do
([testing.md](../../../docs/testing.md#continuous-integration)).

## Status

Experimental: `inrupt-client` stays the default. A private workspace
package, version `0.0.0`, never published to npm.

[solid-memo-client.md](../../../docs/solid-memo-client.md) says how it
signs in, keeps the session and grants access, and where it differs
from Inrupt's. See [vendor-code.md](../../../docs/vendor-code.md) and
[authentication.md](../../../docs/authentication.md) too.
