# @solid-memo/solid

The adapters for Solid pods: the session (Solid-OIDC), the
repositories of decks, cards, review state and preferences, the type
index, the instance copier, the write fence, the shape validator, the
deck archive (decks as Turtle or JSON-LD files), the drafts and the
publishing of releases, an instance's documents read for its graph,
and the guest's pod kept in the browser.

They read and write pods through a Solid client's modules, which
[`solid-client`](../solid-client/README.md) declares: the RDF data
model (`rdf`), reading and writing resources (`resources`), the
sign-in client (`session`) and the public-read grant (`access`), of the
types in its `interface.ts`. They name no client and no library: the
build puts [`inrupt-client`](../inrupt-client/README.md) in their
place, over Inrupt's libraries, or
[`solid-memo-client`](../solid-memo-client/README.md), with none, when
`SOLID_CLIENT=solid-memo-client`
([vendor-code.md](../../../docs/vendor-code.md#cost-of-swapping-a-vendor)).

## Exports

`@solid-memo/solid/<module>` is `src/<module>.ts`, one adapter per
module, such as `solidSessionGateway`, `solidDeckRepository`,
`solidReleasePublisher` and `localGuestPod`.
`offPage`, `offPageAdapters` and the worker's entry, `offPageWorker`,
run the work on documents the app didn't write off the page
([validation.md](../../../docs/validation.md#off-the-page)).
`src/testing/` holds an in-memory pod, dataset fixtures (`datasets.ts`),
a fake sign-in client for tests, a worker run in the test's own process
(`inProcessWorker.ts`), and the contract tests both clients pass
(`contract/`).

## Boundaries

It may import `application`, `domain`, `vocab`, `shacl` and
`solid-client`, and implements `application`'s ports. Only
`composition` and `e2e/pod` may import it, and the clients' tests, for
the contract. It imports no Solid library and names no client
([boundaries.md](../../../docs/boundaries.md#the-solid-client-libraries)).
Tests mock the client's modules (`@solid-memo/solid-client/<module>`),
not the libraries.

## Tests

```sh
npx turbo run typecheck test test:roundtrip test:growth --filter=@solid-memo/solid   # 100% coverage, every library release through a draft, and the growth tests
npm run test:unit -- packages/adapters/solid/src/typeIndex.test.ts   # one file, from the root
npm run test:pod   # against real Solid servers in Docker (e2e/pod)
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [data-model.md](../../../docs/data-model.md),
[authentication.md](../../../docs/authentication.md),
[guest-mode.md](../../../docs/guest-mode.md) and
[testing.md](../../../docs/testing.md).
