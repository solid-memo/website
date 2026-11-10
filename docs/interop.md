# Interoperability report

What Solid Memo's end-to-end tests find wrong on the advisory Solid
servers, one entry per cause, written for the people who build those
servers. Each entry says what the specification asks for, what the
server does, where in its code, and the fewest HTTP requests that show
it, with no Solid Memo involved.

The tests and how they run are in [testing.md](testing.md).
The Interop workflow runs them, and the user journeys on the servers
with Linked Web Storage, weekly and on changes to the app, its Solid
code or the journeys.
Each server's `e2e/pod/servers/<id>/expected-failures.json` names the
tests a cause fails, and its `e2e/journeys/servers/<id>/expected-failures.json`
the journeys, by the cause's id on this page.

A cause here is one that the tests hit and a live run reproduced. The
servers are set up for testing, and each entry says when the setup
plays a part. A server not on this page, or with no entries, passes
every test and journey.

## How to read an entry

- **Requirement** is the strongest clause the behavior goes against,
  with its level: a MUST of the [Solid Protocol 0.11](https://solidproject.org/TR/protocol)
  or of [Web Access Control 1.0.0](https://solidproject.org/TR/wac), a
  definition in an RDF, SPARQL or HTTP specification, or none. On a
  server with Linked Web Storage, it may be a clause of
  [LWS Protocol 1.0](https://www.w3.org/TR/lws10-core/). An optional
  feature done wrong says so. So does something the app needs that LWS
  doesn't define.
- **Reproduction** uses `$POD` for the pod's root URL, ending in `/`.
  The test pods are open to anyone, so the requests carry no
  credentials, unless an entry says it's from the
  [signed-in tests](testing.md#the-signed-in-tests) or the
  [user journeys](testing.md#user-journeys), which sign in. Headers and bodies are trimmed to what matters.
- **Upstream** links the issue or pull request that tracks the cause,
  or says that none does yet.

## JavaScript Solid Server

Version 0.0.224 from npm, started with `--conneg` (Turtle as well as
JSON-LD) and `--public` (no access control), files in the container.
The source links are at gitHead
[`7c9b0de7`](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/tree/7c9b0de7f50e12084642234fdded5b826ea06239).

| Id | Cause | Requirement |
|---|---|---|
| [`jss-lang-tag`](#jss-lang-tag) | SPARQL Update drops the language tag of a literal in its body | Definition (RDF 1.1); optional feature |
| [`jss-own-iri`](#jss-own-iri) | A document's own IRI is stored as `"."`, which reads back as its container | MUST (N3 Patch) |
| [`jss-acl-turtle`](#jss-acl-turtle) | PUT of a Turtle ACL gets 415, though `Accept-Put` lists Turtle | MUST (`Accept-Put`) |
| [`jss-no-extension`](#jss-no-extension) | A Turtle document without a file extension is served as `application/octet-stream` | MUST |

### jss-lang-tag

**SPARQL Update drops the language tag of a literal in its body.**
`"x"@en` in a PATCH with `Content-Type: application/sparql-update`
becomes `"x"^^rdf:langString` with no tag. An INSERT DATA stores that
literal. A DELETE DATA of a stored `"x"@en` never matches it, so the
server answers 409 and applies none of the PATCH.

- **Requirement:** RDF 1.1 Concepts, [literals](https://www.w3.org/TR/rdf11-concepts/#section-Graph-Literal):
  the datatype is `rdf:langString` "if and only if" there's a non-empty
  language tag. SPARQL 1.1 Update, [INSERT DATA](https://www.w3.org/TR/sparql11-update/#insertData)
  and [DELETE DATA](https://www.w3.org/TR/sparql11-update/#deleteData).
  SPARQL Update is optional in the Solid Protocol; JSS offers it in
  `Accept-Patch`. N3 Patch, the required format, keeps the tag.
- **Observed:** `termToJsonLdValue` tests a term's datatype before its
  language, and N3.js gives a tagged literal the datatype
  `rdf:langString`
  ([sparql-update.js L140–160](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/blob/7c9b0de7f50e12084642234fdded5b826ea06239/src/patch/sparql-update.js#L140-L160)).
  The stored document then holds a literal that strict parsers refuse,
  such as N3.js 2, which reports a language-tagged string with an
  explicit datatype. The code is unchanged in 0.0.225.
- **Upstream:** none yet. [#633](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/pull/633)
  moved SPARQL Update onto quads and kept this converter.

```http
PUT $POD/lang.ttl
Content-Type: text/turtle

<#a> <http://purl.org/dc/terms/title> "Put"@en .
→ 201 Created

PATCH $POD/lang.ttl
Content-Type: application/sparql-update

INSERT DATA { <#b> <http://purl.org/dc/terms/title> "Patched"@en . }
→ 204 No Content

GET $POD/lang.ttl
Accept: text/turtle
→ 200 OK
<$POD/lang.ttl#a> dc:title "Put"@en .
<$POD/lang.ttl#b> dc:title "Patched"^^rdf:langString .

PATCH $POD/lang.ttl
Content-Type: application/sparql-update

DELETE DATA { <#a> <http://purl.org/dc/terms/title> "Put"@en . }
→ 409 Conflict
{"error":"Conflict","message":"Triple to delete not found: …#a http://purl.org/dc/terms/title"}
```

The same two changes sent as N3 Patch (`text/n3`) succeed and keep
the tag.

### jss-own-iri

**A document's own IRI is stored as `"."`, which reads back as its
container.** `<>` in a Turtle PUT, or in an N3 Patch's
`solid:inserts`, is written as the JSON-LD `"@id": "."`. On read,
`"."` resolves to the parent container, as a subject or an object.

- **Requirement:** for N3 Patch, a MUST of the Solid Protocol,
  [N3 Patch semantics](https://solidproject.org/TR/protocol#server-patch-n3-semantics):
  "The triples resulting from ?insertions are to be added to the RDF
  dataset". For PUT, Turtle's [relative IRI resolution](https://www.w3.org/TR/turtle/#sec-iri-references),
  since the protocol only asks that GET can answer in Turtle and JSON-LD.
- **Observed:** `makeRelative` writes the document's own IRI as `"."`
  ([turtle.js L508–517](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/blob/7c9b0de7f50e12084642234fdded5b826ea06239/src/rdf/turtle.js#L508-L517)),
  and the read resolves it with `new URL(".", base)`. The PUT case
  needs `--conneg`; the PATCH case hits every resource stored as
  JSON-LD, which includes every one a PATCH creates. A JSON-LD body
  with `"@id": ""` keeps its IRI.
- **Upstream:** [#636](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/pull/636),
  open, fixes it.

```http
PUT $POD/own/doc.ttl
Content-Type: text/turtle

<> <http://example.org/p> <http://example.org/o> .
<#it> <http://example.org/p> <> .
→ 201 Created

GET $POD/own/doc.ttl
Accept: text/turtle
→ 200 OK
<$POD/own/> <http://example.org/p> <http://example.org/o> .
<$POD/own/doc.ttl#it> <http://example.org/p> <$POD/own/> .

PATCH $POD/own/new.ttl
Content-Type: text/n3

@prefix solid: <http://www.w3.org/ns/solid/terms#> .
_:p a solid:InsertDeletePatch ;
  solid:inserts { <> <http://example.org/q> <http://example.org/r> . } .
→ 201 Created

GET $POD/own/new.ttl
Accept: text/turtle
→ 200 OK
<$POD/own/> <http://example.org/q> <http://example.org/r> .
```

### jss-acl-turtle

**PUT of a Turtle ACL gets 415, though `Accept-Put` lists Turtle.**
JSS takes an ACL resource on PUT in JSON-LD only, on purpose: PR
[#339](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/pull/339)
added the check against data loss in a round trip. PATCH of an ACL,
and GET of one as Turtle, work.

- **Requirement:** refusing Turtle breaks no requirement. Neither the
  Solid Protocol nor WAC names a media type the server must take on a
  PUT of an ACL. The protocol's [`Accept-Put`](https://solidproject.org/TR/protocol#server-accept-headers)
  clause is a MUST: responses to GET, HEAD and OPTIONS name the types
  a PUT takes. On a `.acl` URL, JSS lists `text/turtle` and then
  refuses it.
- **Observed:** the 415 comes from
  [resource.js L963–977](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/blob/7c9b0de7f50e12084642234fdded5b826ea06239/src/handlers/resource.js#L963-L977);
  the `Accept-Put` from `getAcceptHeaders` in `src/rdf/conneg.js`,
  which has no ACL exception. WAC clients, mashlib and Inrupt's
  `solid-client` among them, write ACLs in Turtle.
- **Upstream:** [#328](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/issues/328),
  open, asks JSS to take Turtle ACLs. None on the `Accept-Put`.

```http
OPTIONS $POD/acl/doc.ttl.acl
→ 204 No Content
Accept-Put: application/ld+json, application/json, text/turtle, text/n3, */*

PUT $POD/acl/doc.ttl.acl
Content-Type: text/turtle

@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#public> a acl:Authorization ; acl:agentClass foaf:Agent ;
  acl:accessTo <doc.ttl> ; acl:mode acl:Read .
→ 415 Unsupported Media Type
Accept-Put: application/ld+json, application/json
{"error":"Unsupported Media Type","message":"ACL resources must be sent as application/ld+json or application/json."}
```

### jss-no-extension

**A Turtle document without a file extension is served as
`application/octet-stream`.** A PUT with `Content-Type: text/turtle` to
`profile/card` succeeds. Every GET then answers with the JSON-LD JSS
stored, labeled `application/octet-stream`, whatever the `Accept`.
HEAD says the same.

- **Requirement:** MUST, Solid Protocol,
  [Turtle and JSON-LD representations](https://solidproject.org/TR/protocol#server-representation-turtle-jsonld):
  once a PUT, POST or PATCH creates an RDF source, "the server MUST
  satisfy GET requests on this resource" that ask for `text/turtle` or
  `application/ld+json`.
- **Observed:** JSS keeps no record of the type the client gave. It
  works the type out from the extension on every read
  ([url.js L220–254](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/blob/7c9b0de7f50e12084642234fdded5b826ea06239/src/utils/url.js#L220-L254)),
  falls back to `application/octet-stream`, and converts stored JSON-LD
  back only for an RDF type. Without `--conneg`, the PUT gets 415
  instead.
- **Upstream:** [#460](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer/issues/460),
  open.

```http
PUT $POD/ext/profile/card
Content-Type: text/turtle

<#me> <http://xmlns.com/foaf/0.1/name> "Alice" .
→ 201 Created

GET $POD/ext/profile/card
Accept: text/turtle
→ 200 OK
Content-Type: application/octet-stream
{"@context": {…}, "@id": "#me", "foaf:name": "Alice"}
```

The same PUT to `profile/card.ttl` is served as `text/turtle`.

## Solid-Nextcloud

The Solid app at commit
[`a7315d90`](https://github.com/pdsinterop/solid-nextcloud/tree/a7315d90a145ae669762ba5b4fc4465101f42df5)
(its version 0.11.0), on Nextcloud 32.0.15 with SQLite. The app's
lockfile pins `pdsinterop/solid-crud` 0.9.0, where most of these causes
are, and `pdsinterop/solid-auth` 0.15.0. The test pod is
`apps/solid/~alice/storage/`, with a root ACL that gives anyone full
access.

| Id | Cause | Requirement |
|---|---|---|
| [`nc-delete-all-values`](#nc-delete-all-values) | A deletion removes every value of the subject and predicate | MUST (N3 Patch); definition (SPARQL Update) |
| [`nc-acl-link`](#nc-acl-link) | Every document's `rel="acl"` Link names its folder's ACL | MUST (WAC) |
| [`nc-n3-last-triple`](#nc-n3-last-triple) | N3 Patch applies only the last triple of each formula | MUST (N3 Patch) |
| [`nc-acl-member`](#nc-acl-member) | A folder holding only its ACL can't be deleted | MUST |
| [`nc-head-204`](#nc-head-204) | HEAD answers 204 where GET answers 404 | MUST (HEAD) |
| [`nc-concurrent-patch`](#nc-concurrent-patch) | Concurrent PATCHes lose inserts answered 201 | None (HTTP semantics) |
| [`nc-put-type`](#nc-put-type) | PUT ignores `Content-Type`, so a Turtle document without an extension can't be read as Turtle | MUST |
| [`nc-reported-privately`](#nc-reported-privately) | Reported in private | Held back |

### nc-delete-all-values

**A deletion removes every value of the subject and predicate.** A
SPARQL Update DELETE DATA, or an N3 Patch's `solid:deletes`, removes
every object of the subject and predicate it names, not the named
triple alone. That holds for any predicate IRI with a `/` in it, and
even when the named triple isn't there.

- **Requirement:** MUST for N3 Patch, Solid Protocol,
  [N3 Patch semantics](https://solidproject.org/TR/protocol#server-patch-n3-semantics):
  "The triples resulting from ?deletions are to be removed", and a 409
  when one of them is missing. SPARQL 1.1 Update defines
  [DELETE DATA](https://www.w3.org/TR/sparql11-update/#deleteData) as
  a set difference: "the deletion of non-existing triples has no
  effect".
- **Observed:** for each subject and predicate, php-solid-crud calls
  EasyRdf's `Resource::all()` with the predicate's full IRI. EasyRdf
  reads that as a property path, splits it at `/` and finds nothing.
  php-solid-crud then calls `Graph::delete()` with no value, which
  removes every value
  ([Server.php L327–344](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L327-L344)).
- **Upstream:** none on this cause. EasyRdf's
  [#275](https://github.com/easyrdf/easyrdf/issues/275) describes the
  property-path reading.

```http
PUT $POD/del.ttl
Content-Type: text/turtle

<http://example.org/s> <http://example.org/p> <http://example.org/a>, <http://example.org/b> .
→ 201 Created

PATCH $POD/del.ttl
Content-Type: application/sparql-update

DELETE DATA { <http://example.org/s> <http://example.org/p> <http://example.org/a> . }
→ 201 Created

GET $POD/del.ttl
Accept: text/turtle
→ 200 OK
(empty: the triple with <http://example.org/b> is gone too)
```

A DELETE DATA of `<s> <p> <zzz>`, which isn't in the document, removes
both values as well. With the predicate `urn:example:q`, which has no
`/`, only the named triple goes.

### nc-acl-link

**Every document's `rel="acl"` Link names its folder's ACL.** Every
response carries `Link: <.acl>; rel="acl"`, which for `f/doc.ttl`
resolves to `f/.acl`. The server still enforces `f/doc.ttl.acl`. A
client that writes a document's ACL where the Link says, as WAC
requires, replaces the folder's ACL.

- **Requirement:** MUST, WAC,
  [ACL resource discovery](https://solidproject.org/TR/wac#server-link-acl):
  "the server MUST advertise the ACL resource that is associated with a
  resource". A client "MUST NOT" build that URL itself
  ([`client-acl-uri`](https://solidproject.org/TR/wac#client-acl-uri)).
- **Observed:** php-solid-auth's `addWACHeaders` adds a fixed `<.acl>`
  ([WAC.php L26–45](https://github.com/pdsinterop/php-solid-auth/blob/55d82119d588f34f167b879a69b2cf213ba53691/src/WAC.php#L26-L45)),
  and Solid-Nextcloud calls it. A Read-only rule for one document,
  written at the Link's target, locks the folder: its other documents,
  the folder and its `.acl` answer 403, so it can't be undone over HTTP.
- **Upstream:** [pdsinterop/php-solid-auth#67](https://github.com/pdsinterop/php-solid-auth/issues/67),
  open, describes this cause.

```http
PUT $POD/acl/doc.ttl
PUT $POD/acl/other.ttl
→ 201 Created

HEAD $POD/acl/doc.ttl
→ 204 No Content
Link: <.acl>; rel="acl"

PUT $POD/acl/doc.ttl.acl
Content-Type: text/turtle

@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#r> a acl:Authorization ; acl:agentClass foaf:Agent ;
  acl:accessTo <doc.ttl> ; acl:mode acl:Read .
→ 201 Created

GET $POD/acl/other.ttl
→ 403 Forbidden

GET $POD/acl/
→ 403 Forbidden
```

### nc-n3-last-triple

**N3 Patch applies only the last triple of each formula.** With two
triples in `solid:inserts`, only the second is stored; with two in
`solid:deletes`, only the second is removed. The PATCH answers 201.

- **Requirement:** MUST, Solid Protocol,
  [N3 Patch](https://solidproject.org/TR/protocol#n3-patch): "Servers
  MUST process a patch resource against the target document as
  follows", which adds every triple of `?insertions` and removes every
  triple of `?deletions`.
- **Observed:** `normalizeN3` stores each triple of a formula with
  `$parsedGraph[$graph] = $value;`, which replaces the one before
  ([Server.php L379–409](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L379-L409)).
  php-solid-crud 0.10.0 has the same code.
- **Upstream:** none yet.

```http
PUT $POD/n3.ttl
Content-Type: text/turtle
→ 201 Created

PATCH $POD/n3.ttl
Content-Type: text/n3

@prefix solid: <http://www.w3.org/ns/solid/terms#> .
_:p a solid:InsertDeletePatch ; solid:inserts {
  <http://example.org/a> <http://example.org/p> "one" .
  <http://example.org/b> <http://example.org/p> "two" .
} .
→ 201 Created

GET $POD/n3.ttl
Accept: text/turtle
→ 200 OK
<http://example.org/b> <http://example.org/p> "two" .
```

### nc-acl-member

**A folder holding only its ACL can't be deleted.** The folder's
listing names its `.acl` as a member (`ldp:contains`). A DELETE on a
folder that holds nothing else answers 400 "not empty", and the folder
and its ACL stay.

- **Requirement:** MUST, Solid Protocol,
  [deleting containers](https://solidproject.org/TR/protocol#server-delete-protect-nonempty-container):
  a container that contains no resources MUST be deleted, and a
  non-empty one gets 409. An ACL is an auxiliary resource, deleted with
  its subject ([auxiliary resources](https://solidproject.org/TR/protocol#server-auxiliary-resources-management)).
  Either way, 400 isn't the answer.
- **Observed:** the listing filter in `listDirectoryAsTurtle` tests
  `$item['extension']`, which flysystem-nextcloud's listing items
  don't have, so it never removes a `.acl`
  ([Server.php L838–875](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L838-L875)).
  The DELETE counts the same listing. The code comment says "ACL and
  meta files should not be listed in directory overview".
- **Upstream:** none yet.

```http
PUT $POD/only-acl/doc.ttl
Content-Type: text/turtle
→ 201 Created

PUT $POD/only-acl/.acl
Content-Type: text/turtle
(an Authorization for <./>)
→ 201 Created

DELETE $POD/only-acl/doc.ttl
→ 204 No Content

GET $POD/only-acl/
Accept: text/turtle
→ 200 OK
<> a ldp:BasicContainer ; ldp:contains <.acl> .

DELETE $POD/only-acl/
→ 400 Bad Request
Only empty containers can be deleted, "/only-acl/" is not empty
```

### nc-head-204

**HEAD answers 204 where GET answers 404.** Every authorized HEAD
answers 204 No Content, whatever GET answers: 404 for a resource that
doesn't exist or was deleted, 200 for one that does, and 410, 307 or
308 from link metadata.

- **Requirement:** MUST, Solid Protocol,
  [safe methods](https://solidproject.org/TR/protocol#server-safe-methods):
  "Servers MUST support the HTTP GET, HEAD and OPTIONS methods
  [RFC9110]". [RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
  defines HEAD as "identical to GET except that the server MUST NOT
  send content".
- **Observed:** `handle()` sends HEAD through `handleReadRequest()`,
  which sets the right status, then sets 204 whatever it was
  ([Server.php L180–189](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L180-L189)).
  The line is the same in 0.10.0.
- **Upstream:** none yet.

```http
GET $POD/never.txt
→ 404 Not Found

HEAD $POD/never.txt
→ 204 No Content
Link: <.acl>; rel="acl"
WAC-Allow: user="read write append control",public="read write append control"
```

### nc-concurrent-patch

**Concurrent PATCHes lose inserts answered 201.** Of ten PATCHes sent
at once to one document, each inserting its own triple, each answers
201, or now and then 500 when another request holds the file's lock,
and a few of the triples are stored.

- **Requirement:** none in the Solid Protocol, which doesn't cover
  concurrent writes. A 2xx says the request succeeded
  ([RFC 9110 §15.3](https://www.rfc-editor.org/rfc/rfc9110#section-15.3)),
  and SPARQL 1.1 Update asks that each request be atomic (SHOULD).
- **Observed:** a PATCH is a read, a change and a write with no lock
  held across them
  ([Server.php L291–377](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L291-L377)),
  so the last write wins. flysystem-nextcloud 0.4.0's `write()` catches
  every exception (`// FIXME: throw?`), so a failed write still answers
  201. The 500s are Nextcloud's `LockedException` on the read, which
  doesn't wait for the lock. They come from file locking, not SQLite,
  and would happen on any database.
- **Upstream:** [pdsinterop/php-solid-server#54](https://github.com/pdsinterop/php-solid-server/issues/54),
  open, on the same read-then-write in a sibling server.

```sh
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X PATCH "${POD}c.ttl" \
    -H 'Content-Type: application/sparql-update' \
    --data "INSERT DATA { <#a$i> <urn:ex:n> \"$i\" . };" &
done; wait
# 201 each, or now and then 500
curl -s -H 'Accept: text/turtle' "${POD}c.ttl"
# fewer than ten of the subjects
```

Sent one after the other, all ten are stored.

### nc-put-type

**PUT ignores `Content-Type`, so a Turtle document without an
extension can't be read as Turtle.** Nextcloud types a file by its
extension, so `profile/card` is stored as `application/octet-stream`.
A GET for Turtle has the file's format guessed, which gives one of two
results:

- Turtle with no `@prefix` near the start is taken for N-Triples or
  not recognized, and the GET answers 500.
- Turtle with a `@prefix` is served re-based on the server's name
  without its port. The WebID `http://127.0.0.1:47310/…/profile/card#me`
  comes back as `http://127.0.0.1/…/profile/card#me`, another IRI.

- **Requirement:** MUST, Solid Protocol,
  [Turtle and JSON-LD representations](https://solidproject.org/TR/protocol#server-representation-turtle-jsonld),
  as for `jss-no-extension`. The protocol's type heuristics cover only
  a path's ending slash, not file extensions.
- **Observed:** the PUT branch reads only the `Link` header and writes
  the bytes with no media type
  ([Server.php L268–282](https://github.com/pdsinterop/php-solid-crud/blob/6f1d44445ac70f7901400df89d195d6555eb12a9/src/Server.php#L268-L282)).
  The base IRI is `REQUEST_SCHEME://SERVER_NAME` and the request path,
  and `SERVER_NAME` has no port. On a server on a default port, the
  WebID survives; behind a TLS proxy, the scheme doesn't.
- **Upstream:** [pdsinterop/solid-nextcloud#225](https://github.com/pdsinterop/solid-nextcloud/issues/225),
  open, on the base IRI's scheme. None on the ignored `Content-Type`.

```http
PUT $POD/type/card
Content-Type: text/turtle

<#me> <http://xmlns.com/foaf/0.1/name> "Alice" .
→ 201 Created

GET $POD/type/card
Accept: text/turtle
→ 500 Internal Server Error
(log: Could not convert file "type/card" to format "turtle": Failed to parse statement on line 1)

PUT $POD/type/card2
Content-Type: text/turtle

@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#me> foaf:name "Alice" .
→ 201 Created

GET $POD/type/card2
Accept: text/turtle
→ 200 OK
<http://127.0.0.1/apps/solid/~alice/storage/type/card2#me> foaf:name "Alice" .
```

The same PUT to `card.ttl` is served as sent.

### nc-reported-privately

**Reported to the maintainers in private.** It gets an entry like the
others once a fixed release is out.

## Community Solid Server with Linked Web Storage

`css-lws`: the Linked Web Storage branch of a fork of the Community
Solid Server, not yet merged
([jeswr/CommunitySolidServer#126](https://github.com/jeswr/CommunitySolidServer/pull/126)),
at commit
[`ef6d664f`](https://github.com/jeswr/CommunitySolidServer/tree/ef6d664f1253662cbfcb0f1786fe45d32849e067)
(version 8.0.0-alpha.3). Its configuration is the fork's
`config/solid-lws.json`: the Solid Protocol and LWS side by side, with
Web Access Control. The pod tests run it in memory, its root open to
anyone. The signed-in tests and the user journeys run its signed-in
instance, behind TLS.

No causes: every pod test and every journey passes.

## Community Solid Server with Linked Web Storage alone

`css-lws-only`: the same commit, with the fork's `config/lws.json`, LWS
alone with Web Access Control. This configuration takes the Solid
Protocol's requests too, so the app's requests are answered as on
`css-lws`. The pod tests and the signed-in instance are run as for
`css-lws`.

No causes: every pod test and every journey passes.
