# @solid-memo/e2e-pod

End-to-end tests of the app's use cases and Solid adapters against real
Solid servers, started in Docker: Community Solid Server, Node Solid
Server, the JavaScript Solid Server, Nextcloud and others, each in
`servers/` ([testing.md](../../docs/testing.md)).

## What is in it

- `src/*.integration.test.ts`: the tests, run against every server.
- `servers/`: one folder per server, its compose file and the failures
  it is expected to have.
- `globalSetup.ts`, `servers.ts`, `contract.ts`: starting the servers
  and checking that each does what the tests need.
- `pod.ts`: `npm run pod`, a Community Solid Server at
  http://127.0.0.1:3999/ to poke at by hand.

It exports nothing; no package may import it.

## Boundaries

It may import `application`, `domain`, `vocab` and `solid`, and `n3`
for the server contract and the tests
([boundaries.md](../../docs/boundaries.md)).

## Run and test

From the root:

```sh
npm run test:pod   # the tests, against the servers they start in Docker
npm run pod        # one Community Solid Server, by hand
npx turbo run typecheck test --filter=@solid-memo/e2e-pod   # the harness's own tests, without Docker
```

Docker Engine 28.3.3 or later is needed for the servers. `npm run
check` runs only the harness's own tests.

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm.

See [testing.md](../../docs/testing.md).
