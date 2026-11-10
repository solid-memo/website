# Linked Web Storage

Solid Memo is written for the Solid Protocol. The W3C's Linked Web
Storage (LWS) Working Group is writing its successor,
[LWS Protocol 1.0](https://www.w3.org/TR/lws10-core/), still a Working
Draft. This page explains how the app works on a storage that speaks
LWS, and why each part is made the way it is.

## What differs

An app that works on a Solid pod asks a few things of it that LWS
doesn't ask a server to give:

| The app needs | Solid Protocol | LWS |
|---|---|---|
| The user's storage | `pim:storage` in the profile, or the folder typed `pim:Storage` | A `Link` with `rel="https://www.w3.org/ns/lws#storage"` on every answer, and the storage's description (`application/lws+cid`), which names its root container |
| A folder's contents | Turtle, `ldp:contains` | `application/lws+json`, page by page |
| A new document at a name the app chooses | PUT with `If-None-Match: *` | POST to its container, which names it; the name asked for is a hint |
| An edit of a document | SPARQL Update or N3 Patch | JSON Patch, or the whole document again with PUT |
| Sign-in | Solid-OIDC, a DPoP-bound access token | The OpenID Connect ID token exchanged for a Bearer token for each storage |
| A release anyone can read | Web Access Control or Access Control Policies | Nothing yet |

A server can speak both. The app doesn't work on a server that refuses
the Solid Protocol's requests
([why](#why-the-app-needs-solid-requests)).

## Finding the storage

The app reads `pim:storage` from the user's profile first. Without one,
it walks from the WebID's document up its folders and asks each with a
HEAD. A Solid folder typed `pim:Storage` is the storage. An LWS answer
links its storage instead; the app reads that storage's description
and takes the root container it names, if the WebID's document is in
it ([lwsStorage.ts](../packages/solid/src/lwsStorage.ts),
`solidStorageGateway.ts`).

A deck's folder that's a storage's root holds the user's other data
too, so the app claims none of its documents
([deckPlace.ts](../packages/solid/src/deckPlace.ts)). On LWS, a folder
is a root when the storage description names it as one: the storage
link alone doesn't say so, since every resource in the storage carries
it.

**Why the app asks for Turtle first.** On the Community Solid Server
with LWS, the storage's URI is its root container's too. Asked for
anything, it answers with the storage's description, which has none of
the Solid links: no `pim:Storage` type, no link to the ACL. Each HEAD
that reads a resource's links asks for `text/turtle, */*;q=0.1`
(`TURTLE_FIRST`, `client/linkHeader.ts`). A server that has Turtle
answers with it, its Solid links kept. A server that lists a folder
only as LWS has it answers too, where Turtle alone would get
a 406.

## Why the app needs Solid requests

The app makes each request as the Solid Protocol has it, and doesn't
translate it for a server that refuses them. Translating them would help only part of the way: an
LWS server names a new resource itself, and the name a client asks for
is only a hint, but every address in an instance is the app's to choose
([data-model.md](data-model.md)). A catalog names its decks' documents
by address, and a type index names the instance. LWS has an open issue
for a creation at a name the client chooses
([w3c/lws-protocol#173](https://github.com/w3c/lws-protocol/issues/173)).

## Sign-in

An LWS storage takes a Bearer token that its authorization server
issues for the OpenID Connect ID token. The app's own Solid client
([solid-memo-client.md](solid-memo-client.md#linked-web-storage)) does
that exchange when a storage answers 401 with an LWS challenge, and
keeps one token for each storage. Inrupt's sign-in client gives the
app the ID token only in the address that ends the session, so a build that signs in to an LWS storage is made with
`SOLID_CLIENT=solid-memo-client`.
