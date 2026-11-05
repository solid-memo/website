# Linked Web Storage

Solid Memo is written for the Solid Protocol. The W3C's Linked Web
Storage (LWS) Working Group is writing its successor,
[LWS Protocol 1.0](https://www.w3.org/TR/lws10-core/), still a Working
Draft. This page explains how the app works on a storage that speaks
LWS, why each part is made the way it is, and what LWS can't give it
yet. The servers it's tested on are in [testing.md](testing.md).

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

A server can speak both. The Community Solid Server with LWS
(`css-lws`) does, and answers every request the app makes as a Solid
pod does. One that speaks LWS alone gets the app's requests made as LWS
has them, as below.

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

## The bridge

[lwsBridge.ts](../packages/solid/src/lwsBridge.ts) sits below the
fences (`podFence.ts`, `ownPodGate.ts`), on the user's fetch and on the
fetch as no one ([appUseCases.ts](../packages/composition/src/appUseCases.ts)).
It sends each request as the app makes it, and makes one as LWS has it
only when the server's answer asks for that:

- **A folder's listing.** An answer in `application/lws+json` is read
  as LWS gives it. A 406 to Turtle, or Turtle in the LWS profile, which
  lists no `ldp:contains`, from a server that links its storage, gets
  the listing asked for again in `application/lws+json`. The bridge
  follows each page's `next` link on the same origin, and answers with
  the Turtle listing the app reads, the first page's ETag and links
  kept.
- **A new document or folder.** A PUT with `If-None-Match: *` answered
  404, 405, 415 or 501 by a server that links its storage is made
  another way. The bridge makes each missing folder above it, then
  POSTs the document to its folder, the name asked for in `Slug` as
  the address spells it. A
  resource the server names otherwise is deleted again, and the
  creation is refused with 501. When the server made it where it
  wouldn't say, or outside the folder, or the delete fails, the
  creation is refused with 502, and nothing is deleted or tried again.
- **An edit.** A SPARQL Update PATCH (`INSERT DATA`, `DELETE DATA`)
  answered the same way: the bridge reads the document, applies the
  change, and PUTs the whole document with `If-Match`. A triple to
  delete that isn't there fails the edit with 409, as a Solid server's
  PATCH does. A PATCH that had no `If-Match`, the answer log's insert,
  is written against the ETag read, never a weak one, and tried again
  up to five times when another write came first, so every concurrent
  answer is kept. A document not there yet is made as above.

**Why it reacts to the server's answer.** A Solid server takes each
request as it's made, so it gets one request, as before. Which server
speaks which protocol is never configured: the server's answer says it.
Whether a server is an LWS server is asked by a HEAD of the resource or
the nearest folder above it that's there, whose answer must link its
storage.

**Why the fences stay above it.** The pod fence and the credential gate
check each request as the app makes it, a write's target among them.
What the bridge sends besides goes to the same resource, the folders
above it, a resource its POST made in the folder, or the pages the
server links on its own origin.

**Why a name the server changes is refused.** Every address in an
instance is the app's to choose ([data-model.md](data-model.md)): a
catalog names its decks' documents by address, and a type index names
the instance. A storage that names its resources itself can't hold an
instance until the app records where each resource went. LWS has an
open issue for a creation at a name the client chooses
([w3c/lws-protocol#173](https://github.com/w3c/lws-protocol/issues/173)).

## Sign-in

An LWS storage takes a Bearer token that its authorization server
issues for the OpenID Connect ID token. The app's own Solid client
([solid-memo-client.md](solid-memo-client.md#linked-web-storage)) does
that exchange when a storage answers 401 with an LWS challenge, and
keeps one token for each storage. Inrupt's sign-in client gives the
app the ID token only in the address that ends the session, so a build that signs in to an LWS storage is made with
`SOLID_CLIENT=solid-memo-client`.

## Trying it by hand

The end-to-end tests send no credentials, so sign-in on an LWS storage
is tried by hand, with the user journeys
([e2e/journeys/css-lws/compose.yml](../e2e/journeys/css-lws/compose.yml)).
The fork's image, which `npm run servers -w @solid-memo/e2e-pod --
css-lws` builds, runs its own `config/lws.json` behind the journeys'
TLS, each account's pod a storage of its own. The app is built with
`SOLID_CLIENT=solid-memo-client`, and `JOURNEY_SERVER_URL` names the
server. A journey that writes to the pod as another app
(`harness/otherApp.ts`) fails there: its Solid-OIDC token is no LWS
storage's.

## What LWS can't give the app yet

- **A release anyone can read.** LWS defines no access control. The app
  writes a release's ACL or ACR where the server has one; the Community
  Solid Server with LWS keeps Web Access Control, so a release is made
  public there. On a server with LWS alone, a release is published
  readable by its owner alone, and asking to make it public fails
  with `publicAccessRefused`
  ([releasePublishing.ts](../packages/application/src/releasePublishing.ts)).
- **Live updates.** LWS has only webhooks, which a page in a browser
  can't receive. The app doesn't use notifications.
- **A type index the server keeps.** The app keeps its own type index
  documents, which an LWS server holds as any other data.
