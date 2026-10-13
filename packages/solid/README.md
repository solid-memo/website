# @solid-memo/solid

The adapters for Solid pods, over Inrupt's
[`@inrupt/solid-client`](https://github.com/inrupt/solid-client-js) and
`@inrupt/solid-client-authn-browser`: the session (Solid-OIDC), the
repositories of decks, cards, review state and preferences, the type
index, the instance copier, the write fence, the shape validator, the
deck archive (decks as Turtle or JSON-LD files), the drafts and the
publishing of releases, and the guest's pod kept in the browser.

## Exports

`@solid-memo/solid/<module>` is `src/<module>.ts`, one adapter per
module, such as `solidSessionGateway`, `solidDeckRepository`,
`solidReleasePublisher` and `localGuestPod`. `src/testing/` holds an
in-memory pod for tests.

## Boundaries

It may import `application`, `domain`, `vocab` and `shacl`, and
implements `application`'s ports. Only `composition` and `e2e/pod` may
import it. The Inrupt libraries are used here alone, and their access
control in `src/solidReleasePublisher.ts` alone
([boundaries.md](../../docs/boundaries.md#access-control)).

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
