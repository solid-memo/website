# @solid-memo/solid

The adapters for Solid pods: the session (Solid-OIDC), the
repositories of decks, cards, review state and preferences, the type
index, the instance copier, the write fence, the shape validator, the
deck archive (decks as Turtle or JSON-LD files), the drafts and the
publishing of releases, an instance's documents read for its graph,
and the guest's pod kept in the browser.

They read and write pods through modules of the package's own in
`src/client/`: the RDF data model (`rdf.ts`), reading and writing
resources (`resources.ts`), the sign-in client (`session.ts`) and the
public-read grant (`access.ts`), of the types in `interface.ts`, which
names no library. These are the default implementation, over
Inrupt's
[`@inrupt/solid-client`](https://github.com/inrupt/solid-client-js) and
`@inrupt/solid-client-authn-browser`, and another library would replace
them alone ([vendor-code.md](../../docs/vendor-code.md#cost-of-swapping-a-vendor)).
[`solid-memo-client`](../solid-memo-client/README.md) is a second one,
with no Inrupt library, which a build takes with
`SOLID_CLIENT=solid-memo-client`.

## Exports

`@solid-memo/solid/<module>` is `src/<module>.ts`, one adapter per
module, such as `solidSessionGateway`, `solidDeckRepository`,
`solidReleasePublisher` and `localGuestPod`, and
`@solid-memo/solid/client/<module>` is a client module.
`src/testing/` holds an in-memory pod, dataset fixtures (`datasets.ts`),
a fake sign-in client for tests, and the contract tests every
implementation of the client modules passes (`contract/`).

## Boundaries

It may import `application`, `domain`, `vocab` and `shacl`, and
implements `application`'s ports. Only `composition` and `e2e/pod` may
import it. Of its files, only those in `src/client/` import the Inrupt
libraries, and only `src/client/access.ts` their access control
([boundaries.md](../../docs/boundaries.md#the-solid-client-libraries)).
Tests mock the client modules, not the libraries.

## Tests

```sh
npx turbo run typecheck test test:roundtrip --filter=@solid-memo/solid   # 100% coverage, and every library release through a draft
npm run test:unit -- packages/solid/src/typeIndex.test.ts   # one file, from the root
npm run test:pod   # against real Solid servers in Docker (e2e/pod)
```

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [data-model.md](../../docs/data-model.md),
[authentication.md](../../docs/authentication.md),
[guest-mode.md](../../docs/guest-mode.md) and
[testing.md](../../docs/testing.md).
