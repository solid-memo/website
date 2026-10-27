# The solid-memo-client

`@solid-memo/solid-memo-client` is a second implementation of the
Solid client modules the app reads and writes pods and signs in
through, built on no Inrupt library. Inrupt's clients stay the default,
and a build or a test run takes this one with
`SOLID_CLIENT=solid-memo-client`. This page says what it replaces, what
it's built on, how it keeps a session and grants access, where it
differs from Inrupt's, and how it's tested.

## What it replaces

The app reaches the Solid client libraries only through modules of its
own, whose types are in `client/interface.ts` and name no library
([boundaries.md](boundaries.md#the-solid-client-libraries),
[vendor-code.md](vendor-code.md#cost-of-swapping-a-vendor)). The
package, [packages/solid-memo-client/](../packages/solid-memo-client/README.md),
has a module of the same name for each, with the same exports and
types:

| Module | Replaces | Built on |
|---|---|---|
| [rdf.ts](../packages/solid-memo-client/src/rdf.ts), with [dataset.ts](../packages/solid-memo-client/src/dataset.ts) | `packages/solid/src/client/rdf.ts`: datasets and their subjects | `n3`'s RDF/JS terms. Datasets and subjects are the package's own frozen objects; a dataset's edits are a chain of steps that `changesOf` replays. |
| [resources.ts](../packages/solid-memo-client/src/resources.ts) | `packages/solid/src/client/resources.ts`: documents, containers and files, the profile lookup, and the Turtle and JSON-LD parsers | `fetch`; `n3` to parse and write Turtle; `jsonld-streaming-parser` to parse JSON-LD |
| [session.ts](../packages/solid-memo-client/src/session.ts), with `oidcLogin.ts`, `oidcSession.ts`, `oidcStore.ts` and `oidcBrowser.ts` | `packages/solid/src/client/session.ts`: the sign-in client | `oauth4webapi` for Solid-OIDC, WebCrypto for the DPoP keys, IndexedDB for the session, Web Locks between tabs |
| [access.ts](../packages/solid-memo-client/src/access.ts) | `packages/solid/src/client/access.ts`: the public-read grant | `fetch` and `n3` |
| [turtleDocument.ts](../packages/solid-memo-client/src/turtleDocument.ts) | `packages/shacl/src/turtleDocument.ts`: a shape's Turtle, read | `fetch` and `n3` |

The bodies of its PATCH requests come from `solid`'s
`client/sparqlUpdate.ts`, as Inrupt's client's do, and a write refuses
the same terms (`writableTerms.ts`). The package imports `solid` for
these, for the interface and, in its tests, for the contract suites. It
imports no `@inrupt/` package, its tests included, and no package
imports it, as `npm run check:boundaries` checks.

## Switching clients

`SOLID_CLIENT` picks the client when a Vite or Vitest config loads:

| Value | Client |
|---|---|
| unset, empty or `inrupt` | Inrupt's, in `packages/solid/src/client/`: the default |
| `solid-memo-client` | this package's |
| anything else | none: the config fails to load, and its error names the values above |

The switch is a Vite plugin, `solidClientPlugin` in
[scripts/solidClient.ts](../scripts/solidClient.ts). Every package's
Vitest config has it, through `vitest.shared.ts`, and so do
`apps/web`'s Vite config and `e2e/pod`'s Vitest config. With
`solid-memo-client`, it resolves every import of a module its
`REPLACEMENTS` list names to the package's module of the same name,
the package's own imports aside. No caller changes. With Inrupt's
client, the plugin has no hooks, so a test's `vi.mock` of a client
module works as it does without the plugin.

```sh
SOLID_CLIENT=solid-memo-client npm run build      # the site, the Studio included, on this client
SOLID_CLIENT=solid-memo-client npm run dev        # the site from source, on this client
SOLID_CLIENT=solid-memo-client npm run test:pod   # the end-to-end tests against real servers
SOLID_CLIENT=solid-memo-client npm run test:unit -w @solid-memo/shacl   # one package's tests
```

A package's tests run with the switch on without coverage, through
`test:unit`. With coverage, its `test` task fails: the modules the
switch replaces are never loaded, so its coverage falls below 100%.

The user journeys test the build in `apps/web/dist/`: a build with the
switch on, then `npm run journeys`. Run locally, the journeys reuse any
server already on port 4173, which may serve another build
([testing.md](testing.md#user-journeys)).

Under the switch, the tests of the four Inrupt modules this client
replaces (`packages/solid/src/client/{access,rdf,resources,session}.test.ts`)
test what is the library's alone, and some fail. The rest of `solid`
runs without them, as CI runs it:

```sh
SOLID_CLIENT=solid-memo-client npm run test:unit -w @solid-memo/solid -- --exclude 'src/client/{access,rdf,resources,session}.test.ts'
```

Turbo hashes `SOLID_CLIENT` (`globalEnv`) and `scripts/solidClient.ts`
(`globalDependencies`) into every task, so a result cached on one
client never stands for the other. The tasks that resolve through the
plugin have the package's `src/` and `package.json` among their
inputs: `solid`'s `test` and `test:roundtrip`, `shacl`'s and
`composition`'s `test`, and `web`'s `test` and `build`. They run again
when either changes, on either client, but not for a new release of
one of its dependencies that only `package-lock.json` names.

`npm run check:exports` counts an export of this package as used where
the module it replaces uses the same name, and `npm run check` walks
its run-time dependencies for releases before 1.0.0, as it walks the
app's ([vendor-code.md](vendor-code.md#maturity)).

## Sign-in

The sign-in client ([authentication.md](authentication.md)) runs
Solid-OIDC's authorization-code flow on `oauth4webapi`
([oidcLogin.ts](../packages/solid-memo-client/src/oidcLogin.ts)):

- **Discovery** reads the provider's
  `/.well-known/openid-configuration`.
- **The client** the app logs in as is its Client ID Document, when
  the page has one and the provider lists `webid` in
  `scopes_supported`. Otherwise the provider registers the app
  dynamically, once per issuer and redirect URL, with no secret where
  the provider allows it (`token_endpoint_auth_method` `none`).
- **The request** asks for `openid offline_access webid`, with PKCE
  (S256), a `state` and a `nonce`. A login asks with `prompt=consent`,
  which the Community Solid Server needs before it grants
  `offline_access`.
- **The token request** trades the code for DPoP-bound tokens, and is
  sent once more when the provider asks for a DPoP nonce. The ID
  token's issuer, audience and nonce are checked. Its `webid` claim is
  the WebID, or else its `sub` when that's an `http:` or `https:` URL.

### What a session keeps

Each login makes a new ES256 key pair with WebCrypto, its private key
not extractable, and binds the tokens to it. The browser keeps
([oidcStore.ts](../packages/solid-memo-client/src/oidcStore.ts)):

| Where | What |
|---|---|
| IndexedDB, database `solid-memo-oidc`, store `session` | the session a reload restores: the issuer, the client, the redirect URL, the DPoP key pair as `CryptoKey` objects, the WebID, and the refresh token when the provider gave one |
| IndexedDB, database `solid-memo-oidc`, store `registrations` | the clients providers registered the app as, by issuer and redirect URL; logout keeps them |
| `sessionStorage`, `solid-memo:oidc-login` | during a login, the request under way: the issuer, the client, the redirect URL, the PKCE code verifier, the `state` and the `nonce`, and for a silent restore the page it left; removed when the provider sends the learner back |
| memory | the access token, and when it expires |

The access token is never stored. IndexedDB keeps the key pair as
`CryptoKey` objects, which `localStorage`, holding only text, can't.

### Restore, refresh and logout

The session's requests are in
[oidcSession.ts](../packages/solid-memo-client/src/oidcSession.ts):

- **`restore()`** completes the redirect back from the provider when
  the page is one: a `state` on its address and a request under way in
  this tab. It removes the provider's parameters from the address.
- **A reload** trades the stored refresh token for new tokens without
  leaving the page, so `restoredFrom` is null and the page keeps its
  hash. Without a refresh token, or when the provider refuses it,
  `restore()` asks the provider again with `prompt=none`, as Inrupt's
  client always does. It reports the page it left once the provider
  sends the learner back. When another tab logged out, or logged in as
  someone else, after the reload read the stored session, `restore()`
  finds no one and asks the provider nothing.
- **A request** carries `Authorization: DPoP` with the access token and
  a proof of its method and its URL. It's sent once more when the pod
  answers 401 asking for a DPoP nonce, if its body can be sent again.
  Both tries keep the caller's redirect mode, so authFetch's
  `redirect: "error"` holds
  ([authentication.md](authentication.md#authenticated-requests)).
  The access token is refreshed 30 seconds before it expires.
- **Every write of the stored session**, a refresh, a login's save or a
  logout's clear, holds the Web Lock `solid-memo:oidc-session`. A
  browser without Web Locks queues the writes within its tab. So two
  tabs never spend one refresh token, and a refresh under way can't
  bring back a session a logout cleared.
- **A refresh** reads the stored session again, and takes its refresh
  token and key pair, which a login in another tab may have replaced.
  A provider that refuses the refresh token ends the stored session.
- **`logout()`** forgets the session in this browser only, as Inrupt's
  client does: the provider's own session, and its
  `end_session_endpoint`, are left alone
  ([authentication.md](authentication.md#logout)).

## The public-read grant

`grantPublicRead`
([access.ts](../packages/solid-memo-client/src/access.ts)) makes a
published release readable by everyone, on Web Access Control (WAC) or
Access Control Policies (ACP), as Inrupt's universal access does
([boundaries.md](boundaries.md#access-control)):

- **The access control** is the one the document's `Link rel="acl"`
  names, from a HEAD, or a GET when the server refuses the HEAD. It's an
  ACR when its own response's `rel="type"` says
  `acp:AccessControlResource`, or its Turtle names an ACP term, and a
  WAC ACL otherwise.
- **On WAC**, the grant adds an `acl:Authorization` of `acl:Read` for
  `acl:agentClass foaf:Agent`, with `acl:accessTo` the document alone,
  unless the ACL has one. An ACL not written yet first gets the
  `acl:default` rules of the nearest folder above that has an ACL, each
  copied as a rule of the document alone, as Inrupt's universal access
  copies them. The owner keeps what the folder's ACL gave them.
- **On ACP**, the grant adds an access control applying a policy that
  allows `acl:Read` to a matcher of `acp:PublicAgent`, as Inrupt's
  library writes one. A policy is everyone's when its matchers name
  `acp:PublicAgent` and no client, issuer or credential. A policy of
  everyone's that denies read wins: the grant then writes nothing and
  gives false.
- **Each write** is one PATCH of `INSERT DATA`, one N-Triples statement
  a line, and takes nothing away. The grant gives true only when the
  access control, read again, lets everyone read. It gives false when
  the server names no access control, or it can't be read.

Every request goes by URL, so the publisher's fence sees where each
goes.

## Differences from Inrupt's client

Both pass the same contract. Beyond it, this client differs:

- **JSON-LD contexts by URL** aren't fetched: a JSON-LD text that names
  one fails to parse (`parseQuads`). Inrupt's parser fetches it.
- **Plain HTTP:** the session sends its token only over `https:`, or
  over `http:` to this machine (`localhost`, `127.0.0.1`, `[::1]` or a
  `.localhost` name), and sends a request elsewhere without it.
  `oauth4webapi` refuses a provider on plain HTTP, except on this machine.
- **A reload** restores the session with its refresh token, not by a
  silent redirect to the provider ([above](#restore-refresh-and-logout)).
- **The ID token's signature** isn't checked against the provider's
  keys. OpenID Connect allows this for a token the client receives from
  the token endpoint over TLS
  ([OpenID Connect Core 1.0, 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)).
- **IndexedDB is required:** in a browser that refuses it, sign-in
  fails. Nothing falls back to a session that lasts only for the page.
- **A dynamic registration is kept** until the site's data is cleared.
  When a provider forgets it, the login fails at the provider, and
  nothing registers the app again.

## Tests

- **The contract.** Each module's test file runs the contract suite in
  `packages/solid/src/testing/contract/` that Inrupt's module's test
  runs: `rdf.test.ts`, `resources.test.ts`, `session.test.ts` and
  `access.test.ts`. Beside it they test what is this client's alone:
  the sign-in flow against a fake provider, the session's store on
  `fake-indexeddb`'s IndexedDB, the grant's policies and inherited
  rules, and `turtleDocument.ts`'s reads. Its tests run in
  `happy-dom` and hold the package to 100% coverage, as every package's
  do, in `npm run check` ([testing.md](testing.md#coverage-policy)).
- **The other packages' tests and the end-to-end tests**, run with the
  switch on, test the app on this client.
- **CI** runs the package's own tests in `check`, which blocks, as
  every package's. Every run that tests the tree also runs, with
  `SOLID_CLIENT=solid-memo-client`, two advisory jobs
  ([testing.md](testing.md#continuous-integration)):
  - `solid-memo-client (unit)`: `solid`'s unit tests without those of
    the four modules this client replaces, `solid`'s round trip, and
    the unit tests of `shacl`, `composition` and `web`, `web`'s with
    `DOCS_DIAGRAMS=skip`. npm runs them, not Turbo, so no result comes
    from a cache, and without coverage.
  - `solid-memo-client (<server>)`: the end-to-end tests, one job per
    blocking server, on the images in `pod`'s cache.

  A failure there is reported, and fails neither the run nor `ci-ok`,
  so it holds back no merge, release or deploy.
