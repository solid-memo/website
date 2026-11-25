# @solid-memo/solid-client

The seam between Solid Memo's Solid adapters (`solid`) and a Solid
client. Neither `solid` nor any other package names a client: they
import this package, and the build puts the client `SOLID_CLIENT` names
in place of the modules a client gives
([scripts/solidClient.ts](../../scripts/solidClient.ts)).

| Module | What it has |
|---|---|
| `src/rdf.ts`, `src/resources.ts`, `src/session.ts`, `src/access.ts` | What a client gives: the RDF data model, reading and writing resources, the sign-in client and the public-read grant, declared with no body. An import of one resolves to the module of the same name in [`inrupt-client`](../inrupt-client/README.md), the default, or [`solid-memo-client`](../solid-memo-client/README.md) |
| `src/interface.ts` | The types the modules take and give, `HttpError` and `ReadLimitError`; it names no library |
| `src/readLimits.ts` | The limits a read takes in, the fetch and the tally that hold a read to them, and the parts a Turtle text is parsed in |
| `src/linkHeader.ts` | The bound on the `Link` and `WAC-Allow` headers of a response |
| `src/sparqlUpdate.ts` | The SPARQL Update bodies of the app's PATCH requests |
| `src/turtleWriter.ts`, `src/writableTerms.ts` | The Turtle a write sends, and the terms it cannot write as they are |
| `src/providerRedirect.ts` | The sessionStorage key either client's sign-in marks the tab under |

## Exports

`@solid-memo/solid-client/<module>` is `src/<module>.ts`.

## Boundaries

It may import `domain` and `vocab`, and names no client's library, its
tests included. `solid`, `composition` and `e2e/pod` import it, and both
clients implement it ([boundaries.md](../../docs/boundaries.md#the-solid-client-libraries)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/solid-client   # 100% coverage
npm run test:unit -- packages/solid-client/src/readLimits.test.ts   # one file, from the root
```

Its tests read through the client the build puts in place, as `solid`'s
do. The declared modules hold no code to cover. Each client checks that
it gives every declaration with its type (`clientTypes.test.ts`), and
passes the contract in `packages/solid/src/testing/contract/`.

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace
package, version `0.0.0`, never published to npm.
