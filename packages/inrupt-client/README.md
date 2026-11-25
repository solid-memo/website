# @solid-memo/inrupt-client

Solid Memo's default Solid client: the modules
[`solid-client`](../solid-client/README.md) declares, over Inrupt's
[`@inrupt/solid-client`](https://github.com/inrupt/solid-client-js) and
`@inrupt/solid-client-authn-browser`. The build puts it in their place
unless `SOLID_CLIENT=solid-memo-client` names the other client
([scripts/solidClient.ts](../../scripts/solidClient.ts)).

| Module | Gives | On |
|---|---|---|
| `src/rdf.ts`, `src/inrupt.ts` | the RDF data model | `@inrupt/solid-client`'s datasets |
| `src/resources.ts`, `src/linearDataset.ts` | reading and writing resources, a document read in one pass | `@inrupt/solid-client`, `n3` to parse Turtle, `jsonld-streaming-parser` for JSON-LD |
| `src/session.ts` | the sign-in client | `@inrupt/solid-client-authn-browser` |
| `src/access.ts` | the public-read grant | `@inrupt/solid-client`'s universal access |

## Exports

None that another package imports: the build puts its modules in place
of the ones `solid-client` declares. Their exports count as used where
the declared module's are (`npm run check:exports`).

## Boundaries

It may import `solid-client` and `domain`, and in tests `solid`, for the
contract suites in `src/testing/contract/`. It is the only package that
imports an `@inrupt/` package, and only `src/access.ts` their access
control. Its `src/linearDataset.ts` may use `n3` in the browser
([boundaries.md](../../docs/boundaries.md#the-solid-client-libraries)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/inrupt-client   # 100% coverage
npm run test:unit -- packages/inrupt-client/src/rdf.test.ts   # one file, from the root
```

Its tests run the contract on its own modules, whichever client the
build puts in place for the other packages.

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace
package, version `0.0.0`, never published to npm.

See [vendor-code.md](../../docs/vendor-code.md) and
[authentication.md](../../docs/authentication.md).
