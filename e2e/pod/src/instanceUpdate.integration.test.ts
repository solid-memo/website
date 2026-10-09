// @vitest-environment node
/**
 * The format update against a real Solid server (docs/migrations.md "The
 * pod migration"): the app's own use cases and Solid adapters, wired as in
 * main.tsx, with every HTTP request recorded, both as the app attempts it
 * and as it reaches the server. `npm run test:pod` runs them against each
 * server globalSetup.ts starts — Community Solid Server and
 * node-solid-server — unless SOLID_SERVER_URL names one (see
 * docs/testing.md). Each outdated document is updated on its own, in one
 * write held to the version it was read at; a document that cannot be
 * updated stays as it was, the rest go on. What a server does with
 * preconditions is asked of it, not assumed: node-solid-server gives no
 * ETag on a read and ignores If-Match, so there a write follows a read of
 * the document, and a change made between the two is not seen. "Byte for
 * byte" is what the server serves for a document asked for as the app
 * asks (Accept: text/turtle), before and after.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer, type Quad } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { aclOf, changeElsewhere, ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, preconditionsOf, type Preconditions } from "./serverTraits";

const SERVERS = inject("solidServers");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
`;
const FRIEND = "https://bob.example/profile/card#me";
/** A predicate of another app's, which the update keeps where it is. */
const FOREIGN = "https://other-app.example/ns#note";
/** A PNG's first bytes and some that are not valid UTF-8: a file Solid Memo does not know, which must survive byte for byte. */
const PICTURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);

interface Pod {
  base: string;
  webId: string;
  typeIndex: string;
  source: string;
  instance: Instance;
}

interface Recorded {
  method: string;
  url: string;
  ifMatch: string | null;
  ifNoneMatch: string | null;
  contentType: string | null;
  /** The pod's answer, once it came. */
  status?: number;
  /** The ETag of the pod's answer, once it came. */
  etag?: string | null;
}

/** A user's pod in a fresh folder of the server: a profile, a private type index and a format-1/2 instance. */
async function seedPod(server: string): Promise<Pod> {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const source = `${base}solid-memo/main/`;
  const put = async (url: string, body: string | Blob, type = "text/turtle") => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": type }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card`,
    `${PREFIXES}<#me> a foaf:Person ; foaf:name "Alice" ; solid:privateTypeIndex <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `${PREFIXES}<> a solid:TypeIndex, solid:UnlistedDocument .
<#main> a solid:TypeRegistration ; solid:forClass sm:Instance ;
    solid:instanceContainer <${source}> ; dcterms:title "Main" .`,
  );
  await put(
    `${source}meta.ttl`,
    `${PREFIXES}<#it> a sm:Instance ; dcterms:title "Main" ; sm:formatVersion 1 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime .`,
  );
  await put(
    `${source}catalog.ttl`,
    `${PREFIXES}<#deck-1> a sm:Deck ; dcterms:title "Capitals" ; sm:formatVersion 2 ;
    sm:direction "bidirectional" ;
    sm:cardsDocument <${source}decks/deck-1.ttl> ;
    sm:reviewsDocument <${source}reviews/deck-1.ttl> .`,
  );
  await put(
    `${source}decks/deck-1.ttl`,
    `${PREFIXES}<#se> a sm:Card ; sm:front "Sweden" ; sm:back "Stockholm" ; <${FOREIGN}> "kept" .
<#no> a sm:Card ; sm:front "Norway" ; sm:back "Oslo" ; sm:formatVersion 1 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime .`,
  );
  await put(
    `${source}reviews/deck-1.ttl`,
    `${PREFIXES}<#se> a sm:ReviewState ; sm:easeFactor 2.5 ; sm:intervalDays 6 ; sm:repetitions 2 ;
    sm:due "2026-09-28" ; sm:firstReviewedAt "2026-09-20T10:00:00Z"^^xsd:dateTime ;
    sm:lastReviewedAt "2026-09-22T10:00:00Z"^^xsd:dateTime .`,
  );
  await put(
    `${source}preferences.ttl`,
    `${PREFIXES}<#it> a sm:Preferences ; sm:newCardsPerDay 20 ; sm:maxReviewsPerDay 200 ; sm:dayBoundaryHour 4 .`,
  );
  await put(`${source}attachments/picture.png`, new Blob([PICTURE]), "image/png");
  // Shared: the instance with a friend, and one deck's cards with the friend alone.
  const everyone = (target: string, inherit: boolean) => `
<#public> a acl:Authorization ; acl:agentClass foaf:Agent ; acl:accessTo <${target}> ;
    ${inherit ? `acl:default <${target}> ;` : ""} acl:mode acl:Read, acl:Write, acl:Control .
<#friend> a acl:Authorization ; acl:agent <${FRIEND}> ; acl:accessTo <${target}> ;
    ${inherit ? `acl:default <${target}> ;` : ""} acl:mode acl:Read .`;
  await put(await aclOf(source), `${PREFIXES}${everyone(source, true)}`);
  await put(await aclOf(`${source}decks/deck-1.ttl`), `${PREFIXES}${everyone(`${source}decks/deck-1.ttl`, false)}`);
  return { base, webId, typeIndex, source, instance: { url: source, name: "Main" } };
}

/** The library release the copied deck of seedOldPod came from. */
const RELEASE = "https://solid-memo.com/decks/capitals-of-the-world/v2.ttl";

/**
 * A pod as a format-4 app left it (deck format 4, card format 4), or the
 * same pod as a format-5 app left it (deck and card format 5, which hold
 * it as it is): every record at the latest format but decks (and, at 4,
 * cards), one deck of the user's own and one copied from the library, with
 * the text that format left behind — a deck title and a note saved the
 * same in English and Swedish (the stand-ins a format-4 app wrote for
 * English), Swedish text tagged English, card sides and keywords that do
 * not say their language. Its text is ASCII: the Community Solid Server's
 * in-memory store cuts a document with other characters short when it is
 * patched (docs/testing.md).
 */
async function seedOldPod(server: string, format: 4 | 5): Promise<Pod> {
  const pod = await seedPod(server);
  const { source, webId } = pod;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  const prefixes = `${PREFIXES}@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
`;
  const deck = (id: string, text: string) => `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion ${format} ;
    ${text} ;
    sm:studyDirection sm:frontToBack ;
    dcat:distribution <#${id}-cards> ;
    sm:cardsDocument <${source}decks/${id}.ttl> ;
    sm:reviewsDocument <${source}reviews/${id}.ttl> .
<#${id}-cards> a dcat:Distribution ; dcat:accessURL <${source}decks/${id}.ttl> ;
    dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .`;
  await put(
    `${source}meta.ttl`,
    `${PREFIXES}<#it> a sm:Instance ; dcterms:title "Main" ; sm:formatVersion 2 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime .`,
  );
  await put(
    `${source}preferences.ttl`,
    `${PREFIXES}<#it> a sm:Preferences ; sm:formatVersion 4 ; sm:newCardsPerDay 20 ; sm:maxReviewsPerDay 200 ;
    sm:dayBoundaryHour 4 ; sm:answerScale "sm2" ; sm:developerMode false ;
    sm:invalidDataPolicy sm:warnOnly ; sm:theme sm:darkTheme .`,
  );
  await put(
    `${source}catalog.ttl`,
    `${prefixes}<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
    dcterms:publisher <${webId}> ; dcat:themeTaxonomy <https://solid-memo.com/ns/vocab/topics.ttl> ;
    dcat:dataset <#deck-1>, <#deck-2> .
<${webId}> a foaf:Agent ; foaf:name "Alice" .
${deck("deck-1", `dcterms:title "Spanska glosor"@en, "Spanska glosor"@sv ;
    dcterms:description "Flashcards: Spanska glosor."@en, "Kortlek: Spanska glosor."@sv`)}
${deck("deck-2", `dcterms:title "Huvudstader i Europa"@en ;
    dcterms:description "Capitals of Europe."@en, "Europas huvudstader."@sv ;
    dcterms:creator <#agent-anton> ;
    dcat:theme <https://solid-memo.com/ns/vocab/topics.ttl#geography> ;
    dcat:keyword "capitals", "europe" ;
    prov:wasDerivedFrom <${RELEASE}>`)}
<#agent-anton> a foaf:Agent ; foaf:name "Anton" .`,
  );
  await put(
    `${source}decks/deck-1.ttl`,
    `${PREFIXES}<#sol> a sm:Card ; sm:formatVersion ${format} ; sm:front "el sol"@es ; sm:back "the sun"@en, "solen"@sv ;
    sm:frontNote "Masculine."@en, "Masculine."@sv ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime .
<#luna> a sm:Card ; sm:formatVersion ${format} ; sm:front "la luna" ; sm:back "the moon" .`,
  );
  await put(
    `${source}decks/deck-2.ttl`,
    `${PREFIXES}<#se> a sm:Card ; sm:formatVersion ${format} ; sm:front "Sweden"@en, "Sverige"@sv ;
    sm:backLabel "Capital"@en, "Capital"@sv ; sm:back "Stockholm"@en, "Stockholm"@sv .
<#no> a sm:Card ; sm:formatVersion ${format} ; sm:front "Norway" ; sm:back "Oslo" ;
    sm:backNote "Since 1299."@en .`,
  );
  await put(
    `${source}reviews/deck-1.ttl`,
    `${PREFIXES}<#sol> a sm:ReviewState ; sm:formatVersion 2 ; sm:easeFactor 2.5 ; sm:intervalDays 6 ; sm:repetitions 2 ;
    sm:due "2026-09-28" ; sm:firstReviewedAt "2026-09-20T10:00:00Z"^^xsd:dateTime ;
    sm:lastReviewedAt "2026-09-22T10:00:00Z"^^xsd:dateTime .`,
  );
  return pod;
}

/**
 * The seeded pod's instance as an older app, or a person, wrote it by
 * hand, every document outdated: prefixes of its own, comments, statements
 * in no order Solid Memo writes, relative IRIs (one through @base), a
 * blank node and another app's decimal with a trailing zero, which a
 * server's rewrite would not keep as they are. Its text is ASCII: the
 * Community Solid Server's in-memory store cuts a document with other
 * characters short when it is patched (docs/testing.md). What
 * node-solid-server cannot patch is left out: a document with SPARQL-style
 * `PREFIX` directives, and a value the update rewrites spelled otherwise
 * than Solid Memo spells it (`2.50`), which its PATCH cannot delete.
 */
async function seedHandWritten(server: string): Promise<Pod> {
  const pod = await seedPod(server);
  const { source } = pod;
  const put = async (path: string, body: string) => {
    const response = await fetch(`${source}${path}`, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${path}: ${response.status}`);
  };
  await put(
    "meta.ttl",
    `# The instance's record, written by hand.
@prefix memo: <https://solid-memo.com/ns/vocab/v1.ttl#>.
@prefix dc:   <http://purl.org/dc/terms/>.
@prefix xs:   <http://www.w3.org/2001/XMLSchema#>.

<#it>   dc:created "2026-09-21T10:00:00Z"^^xs:dateTime ;
        a memo:Instance ;     # no format version: format 1
        dc:title "Main" .
`,
  );
  await put(
    "preferences.ttl",
    `@prefix : <https://solid-memo.com/ns/vocab/v1.ttl#> .
# Study caps, and nothing else.
<#it> :dayBoundaryHour 4 ; :maxReviewsPerDay 200 ;
   a :Preferences ;
   :newCardsPerDay 20 .
`,
  );
  await put(
    "catalog.ttl",
    `@base <./> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix t: <http://purl.org/dc/terms/> .
# One deck, its documents named from the folder.
<catalog.ttl#deck-1> sm:reviewsDocument <reviews/deck-1.ttl> ;
  sm:cardsDocument <decks/deck-1.ttl> ;
  sm:direction "bidirectional" ;
  a sm:Deck ; sm:formatVersion 2 ; t:title "Capitals" .
`,
  );
  await put(
    "decks/deck-1.ttl",
    `@prefix card: <https://solid-memo.com/ns/vocab/v1.ttl#>.
@prefix other: <https://other-app.example/ns#> .
@prefix d:<http://purl.org/dc/terms/> .

# Cards, in no particular order.
<#no> card:back "Oslo" ; card:front "Norway" ; a card:Card ; card:formatVersion 1 ;
  d:created "2026-09-21T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
<#se> a card:Card ;
   other:annotation [ other:by "another app" ; other:at "2026-09-01" ] ;
   card:front "Sweden" ; card:back "Stockholm" .
`,
  );
  await put(
    "reviews/deck-1.ttl",
    `@prefix s: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix x: <http://www.w3.org/2001/XMLSchema#> .

<#se>
    s:lastReviewedAt "2026-09-22T10:00:00Z"^^x:dateTime ;
    s:firstReviewedAt "2026-09-20T10:00:00Z"^^x:dateTime ;
    s:due "2026-09-28" ;
    <https://other-app.example/ns#weight> 1.50 ;   # another app's, its trailing zero kept
    s:repetitions 2 ; s:intervalDays 6 ; s:easeFactor 2.5 ;
    a s:ReviewState .
`,
  );
  return pod;
}


const TEXT = new Set(
  ["http://purl.org/dc/terms/title", "http://purl.org/dc/terms/description", "http://www.w3.org/ns/dcat#keyword"].concat(
    ["front", "back", "frontNote", "backLabel", "backNote", "frontImageDescription", "backImageDescription"].map(
      (name) => `https://solid-memo.com/ns/vocab/v1.ttl#${name}`,
    ),
  ),
);

/** The documents' quads, as the server serves them. */
async function quadsOf(urls: string[]) {
  const quads: Quad[] = [];
  for (const url of urls) {
    const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
    quads.push(...new Parser({ baseIRI: url }).parse(turtle));
  }
  return quads;
}

/** The documents' text, each value with its language (or none) and the subject it is about, under `container`'s URL as `<instance>/`. */
async function textOf(container: string, urls: string[]): Promise<string[]> {
  return (await quadsOf(urls))
    .filter((quad) => quad.object.termType === "Literal" && TEXT.has(quad.predicate.value))
    .map((quad) => {
      const literal = quad.object as { value: string; language: string };
      return `${quad.subject.value.replace(container, "<instance>/")} ${quad.predicate.value} ${JSON.stringify(literal.value)}@${literal.language}`;
    })
    .sort();
}

/** The format each Solid Memo subject of the documents states. */
async function statedFormats(container: string, urls: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(
    (await quadsOf(urls))
      .filter((quad) => quad.predicate.value === "https://solid-memo.com/ns/vocab/v1.ttl#formatVersion")
      .map((quad) => [quad.subject.value.replace(container, "<instance>/"), quad.object.value]),
  );
}


/** The app as main.tsx wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(
  pod: Pod,
  options: {
    /** Answers the request with a failure of its own: the pod never sees it. */
    failOn?: (request: Recorded) => boolean;
    /** Runs as the app is about to make the request: another device's doing. */
    onRequest?: (request: Recorded) => Promise<void>;
  } = {},
) {
  const record = (input: RequestInfo | URL, init?: RequestInit): Recorded => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    return {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
      contentType: headers.get("Content-Type"),
    };
  };
  /** Each request as it reaches the server, with its answer's status and ETag. */
  const sent: Recorded[] = [];
  const sending: typeof fetch = async (input, init) => {
    const recorded = record(input, init);
    sent.push(recorded);
    const response = await fetch(input, init);
    recorded.status = response.status;
    recorded.etag = response.headers.get("ETag");
    return response;
  };
  const writeFence = createWriteFence(sending);
  // The recording of attempts sits outside the fence: it sees what the app attempts, not only what gets through.
  const attempts: Recorded[] = [];
  const attemptingFetch: typeof fetch = async (input, init) => {
    const recorded = record(input, init);
    attempts.push(recorded);
    await options.onRequest?.(recorded);
    if (options.failOn?.(recorded)) return new Response("injected failure", { status: 500 });
    const response = await writeFence.fetch(input, init);
    recorded.status = response.status;
    return response;
  };
  const validator = createShaclShapeValidator({
    fetch: attemptingFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = validator.checkSubjects;
  const useCases: UseCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: attemptingFetch }),
    instanceRepository: createSolidInstanceRepository({
      fetch: attemptingFetch,
      checkWrite,
      now: () => new Date(),
      randomId: () => crypto.randomUUID(),
    }),
    deckRepository: createSolidDeckRepository({
      fetch: attemptingFetch,
      checkWrite,
      now: () => new Date(),
      randomId: () => crypto.randomUUID(),
    }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: attemptingFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: attemptingFetch, checkWrite }),
    shapeValidator: validator,
    repairRepository: createSolidRepairRepository({ fetch: attemptingFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: attemptingFetch }),
    writeFence,
  });
  return { useCases, attempts, sent, session: { webId: pod.webId } };
}

/** Every resource under a container, ACL documents included, as the server serves it: bytes, type and ETag. */
async function snapshot(container: string, skip: (url: string) => boolean = () => false): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visit = async (url: string) => {
    if (skip(url)) return;
    const response = await fetch(url, { headers: { accept: "text/turtle" } });
    if (response.status === 404) return;
    const body = new Uint8Array(await response.arrayBuffer());
    result.set(url, `${response.headers.get("content-type")} ${response.headers.get("etag")} ${Buffer.from(body).toString("base64")}`);
    const link = /<([^>]+)>;\s*rel="acl"/.exec(response.headers.get("link") ?? "")?.[1];
    const acl = link === undefined ? undefined : new URL(link, url).href;
    if (acl !== undefined && !result.has(acl)) {
      const aclResponse = await fetch(acl);
      if (aclResponse.ok) result.set(acl, await aclResponse.text());
    }
    if (url.endsWith("/")) {
      const listing = new TextDecoder().decode(body);
      const children = [...listing.matchAll(/<([^>]+)>/g)]
        .map((match) => new URL(match[1]!, url).href)
        .filter((child) => child.startsWith(url) && child !== url && !child.includes("#"));
      for (const child of [...new Set(children)].sort()) await visit(child);
    }
  };
  await visit(container);
  return result;
}

/** The bytes the server serves for each document, asked for as the app asks (Accept: text/turtle), one character a byte; "(none)" for none. */
async function servedBytes(urls: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const url of urls) {
    const response = await fetch(url, { headers: { accept: "text/turtle" } });
    result.set(url, response.status === 404 ? "(none)" : Buffer.from(await response.arrayBuffer()).toString("latin1"));
  }
  return result;
}

const status = async (url: string) => (await fetch(url, { method: "HEAD" })).status;
const isWrite = (request: Recorded) => !READS.has(request.method);

/**
 * Every write to one of the documents was held to the version it was read
 * at: If-Match the ETag the server gave the last read of it, where the
 * server enforces If-Match; else made right after a read of it.
 */
function expectConditional(sent: Recorded[], documents: readonly string[], conditional: Preconditions): void {
  for (const [index, request] of sent.entries()) {
    if (!isWrite(request) || !documents.includes(request.url)) continue;
    const named = `${request.method} ${request.url}`;
    if (!conditional.edits) {
      expect(sent[index - 1], named).toMatchObject({ method: "GET", url: request.url });
      continue;
    }
    const read = sent
      .slice(0, index)
      .reverse()
      .find((earlier) => earlier.method === "GET" && earlier.url === request.url && typeof earlier.etag === "string");
    expect(read, named).toBeDefined();
    expect(request.ifMatch, named).toBe(read!.etag);
  }
}

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

async function registeredContainers(pod: Pod): Promise<string> {
  return triples(pod.typeIndex);
}

/** The documents of the seeded pod the update changes, in the order it writes them. */
const UPDATED = ["meta.ttl", "preferences.ttl", "decks/deck-1.ttl", "reviews/deck-1.ttl", "catalog.ttl"];
/** What each of them holds, as the update names a document. */
const HOLDS = [
  { holds: "instance" },
  { holds: "preferences" },
  { holds: "cards", deck: expect.anything() },
  { holds: "reviews", deck: expect.anything() },
  { holds: "catalog" },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(SERVERS)("the format update on $name", ({ url: server }) => {
  /** What this server does with preconditions (preconditionsOf). */
  let conditional: Preconditions = { edits: false, creations: false };
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = await preconditionsOf(server);
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("updates each document where it is, once, held to the version it read; addresses, unknown files, sharing and foreign triples kept", async () => {
    const pod = await seedPod(server);
    const documents = UPDATED.map((path) => `${pod.source}${path}`);
    const before = await snapshot(pod.source);
    const indexBefore = await registeredContainers(pod);
    const { useCases, attempts, sent, session } = app(pod);

    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toEqual({
      updated: documents.map((url, index) => ({ url, ...HOLDS[index] })),
      failed: [],
    });

    // Every write went to one of the documents, once each, in order, but the last: the type index, once updated,
    // given the registrations of the instance's data it lacked, If-Match where the server enforces it.
    const writes = sent.filter(isWrite);
    expect(writes.map((request) => request.url)).toEqual([...documents, pod.typeIndex]);
    expect(writes.at(-1)).toMatchObject({ method: "PATCH", url: pod.typeIndex });
    if (conditional.edits) expect(writes.at(-1)!.ifMatch).toMatch(/^"/);
    // Each write of a document held to the version it was read at.
    expectConditional(sent, documents, conditional);
    // Nothing is kept beside the documents: no copy, no backup.
    expect(await status(`${pod.source}backups/`)).toBe(404);
    expect(attempts.filter(isWrite).map((request) => request.url)).toEqual(writes.map((request) => request.url));

    // The instance: updated, conforming, at its address; the type index as it was, and each class of its data registered.
    const indexAfter = await registeredContainers(pod);
    for (const triple of indexBefore.split("\n").filter((line) => line !== "")) expect(indexAfter).toContain(triple);
    for (const [forClass, predicate, target] of [
      ["http://www.w3.org/ns/dcat#Catalog", "instance", `${pod.source}catalog.ttl#catalog`],
      [`${SM}Deck`, "instance", `${pod.source}catalog.ttl`],
      [`${SM}Card`, "instanceContainer", `${pod.source}decks/`],
      [`${SM}ReviewState`, "instanceContainer", `${pod.source}reviews/`],
      [`${SM}Answer`, "instanceContainer", `${pod.source}history/`],
    ]) {
      const registration = new RegExp(`^(<[^>]+>) <http://www.w3.org/ns/solid/terms#forClass> <${forClass}> \\.$`, "m");
      const subject = registration.exec(indexAfter)?.[1];
      expect(subject, forClass).toBeDefined();
      expect(indexAfter).toContain(`${subject} <http://www.w3.org/ns/solid/terms#${predicate}> <${target}> .`);
      expect(indexAfter).toContain(`${subject} <http://purl.org/dc/terms/title> "Main" .`);
    }
    expect(await useCases.planMigration(pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0, catalogMissing: false });
    expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
    expect(await useCases.listDecks(pod.source)).toMatchObject([
      { url: `${pod.source}catalog.ttl#deck-1`, cardsDocumentUrl: `${pod.source}decks/deck-1.ttl` },
    ]);
    // Another app's triple, its file and the access rules are as they were; no access control was written.
    expect(await triples(`${pod.source}decks/deck-1.ttl`)).toContain(`<${FOREIGN}> "kept"`);
    expect(writes.filter((request) => request.url.endsWith(".acl"))).toEqual([]);
    const after = await snapshot(pod.source);
    for (const unchanged of [`${pod.source}attachments/picture.png`, await aclOf(pod.source), await aclOf(`${pod.source}decks/deck-1.ttl`)]) {
      expect(after.get(unchanged), unchanged).toBe(before.get(unchanged));
    }
    const picture: ArrayBuffer = await (await fetch(`${pod.source}attachments/picture.png`)).arrayBuffer();
    expect(new Uint8Array(picture)).toEqual(PICTURE);
    // No resource came or went: every one is where it was.
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  }, 60_000);

  it.each([
    // Format 4: decks and cards are outdated; at format 5 only the decks are.
    { format: 4 as const, cardCount: 4 },
    { format: 5 as const, cardCount: 0 },
  ])(
    "moves format-$format decks to format 6 and cards to 5 with their text unchanged: stand-ins, English-tagged Swedish, unstated sides and untagged keywords kept",
    async ({ format, cardCount }) => {
      const pod = await seedOldPod(server, format);
      const documents = ["catalog.ttl", "decks/deck-1.ttl", "decks/deck-2.ttl"].map((path) => `${pod.source}${path}`);
      const textBefore = await textOf(pod.source, documents);
      expect(textBefore.length).toBeGreaterThan(20);
      const { useCases, session } = app(pod);

      expect(await useCases.planMigration(pod.source)).toMatchObject({
        deckCount: 2,
        cardCount,
        reviewCount: 0,
        preferencesOutdated: false,
        instanceOutdated: false,
      });
      expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
      const outcome = await useCases.updateInstance(session, pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ failed: [] });

      // Every deck is at format 6 and every card at 5 (the creator and
      // distributions, unstamped before, at their first), conforming, with
      // nothing left to update…
      expect(await statedFormats(pod.source, documents)).toEqual({
        "<instance>/catalog.ttl#agent-anton": "1",
        "<instance>/catalog.ttl#deck-1": "6",
        "<instance>/catalog.ttl#deck-1-cards": "1",
        "<instance>/catalog.ttl#deck-2": "6",
        "<instance>/catalog.ttl#deck-2-cards": "1",
        "<instance>/decks/deck-1.ttl#sol": "5",
        "<instance>/decks/deck-1.ttl#luna": "5",
        "<instance>/decks/deck-2.ttl#se": "5",
        "<instance>/decks/deck-2.ttl#no": "5",
      });
      expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
      expect(await useCases.planMigration(pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      // …and its text is what it was, value for value and language for
      // language: nothing guessed, nothing dropped (identical English copies
      // stay, as text in each language; keywords stay untagged; the user
      // states unstated languages in the app).
      expect(await textOf(pod.source, documents)).toEqual(textBefore);
      expect(textBefore).toEqual(
        expect.arrayContaining([
          '<instance>/catalog.ttl#deck-1 http://purl.org/dc/terms/title "Spanska glosor"@en',
          '<instance>/catalog.ttl#deck-1 http://purl.org/dc/terms/title "Spanska glosor"@sv',
          '<instance>/catalog.ttl#deck-2 http://purl.org/dc/terms/title "Huvudstader i Europa"@en',
          '<instance>/catalog.ttl#deck-2 http://www.w3.org/ns/dcat#keyword "capitals"@',
          '<instance>/catalog.ttl#deck-2 http://www.w3.org/ns/dcat#keyword "europe"@',
          '<instance>/decks/deck-1.ttl#sol https://solid-memo.com/ns/vocab/v1.ttl#frontNote "Masculine."@en',
          '<instance>/decks/deck-1.ttl#sol https://solid-memo.com/ns/vocab/v1.ttl#frontNote "Masculine."@sv',
          '<instance>/decks/deck-1.ttl#luna https://solid-memo.com/ns/vocab/v1.ttl#front "la luna"@',
          '<instance>/decks/deck-2.ttl#no https://solid-memo.com/ns/vocab/v1.ttl#back "Oslo"@',
        ]),
      );
      // The library copy still names its release, which later releases are compared with.
      expect(await triples(`${pod.source}catalog.ttl`)).toContain(`<http://www.w3.org/ns/prov#wasDerivedFrom> <${RELEASE}>`);
    },
    60_000,
  );

  /**
   * A document that cannot be updated now stays as it was: the bytes the
   * server serves for it, asked for as the app asks, are those it served
   * before (seedHandWritten's documents, prefixes, comments, order and
   * all, which a server's rewrite would not keep so); the others are
   * updated, and the instance reads and conforms with the mix.
   */
  describe("document by document", () => {
    async function prepared() {
      const pod = await seedHandWritten(server);
      const documents = UPDATED.map((path) => `${pod.source}${path}`);
      const [meta, preferences, cards, reviews, catalog] = documents as [string, string, string, string, string];
      return { pod, documents, meta, preferences, cards, reviews, catalog, before: await servedBytes(documents), index: await servedBytes([pod.typeIndex]) };
    }

    /** The instance read and checked with some documents updated and others not: every deck, card and review state there. */
    async function expectReadable(useCases: UseCases, seeded: Awaited<ReturnType<typeof prepared>>): Promise<void> {
      expect((await useCases.validateInstance(seeded.pod.source)).conforms).toBe(true);
      const [deck] = await useCases.listDecks(seeded.pod.source);
      expect(deck).toMatchObject({ url: `${seeded.catalog}#deck-1`, cardsDocumentUrl: seeded.cards, reviewsDocumentUrl: seeded.reviews });
      expect((await useCases.listCards(deck!)).map((card) => card.id).sort()).toEqual(["no", "se"]);
      expect(await useCases.getStudyCounts(seeded.pod.source, deck!, new Date("2026-09-30T12:00:00Z"))).toMatchObject({ dueCount: expect.any(Number) });
    }

    it("goes on past a document it cannot write, which is left byte for byte as it was, the instance readable; a second run finishes", async () => {
      const seeded = await prepared();
      const { useCases, sent, session } = app(seeded.pod, {
        failOn: (request) => isWrite(request) && request.url === seeded.cards,
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        updated: [seeded.meta, seeded.preferences, seeded.reviews, seeded.catalog].map((url) => ({ url })),
        failed: [{ url: seeded.cards, holds: "cards", deck: { en: "Capitals" } }],
      });
      // The cards as they were, byte for byte; every other document updated, each write held to its read.
      const after = await servedBytes(seeded.documents);
      expect(after.get(seeded.cards)).toBe(seeded.before.get(seeded.cards));
      for (const document of [seeded.meta, seeded.preferences, seeded.reviews, seeded.catalog]) {
        expect(after.get(document), document).not.toBe(seeded.before.get(document));
      }
      expectConditional(sent, seeded.documents, conditional);
      // With something left, the type index is as it was, and only the cards are left to update.
      expect(await servedBytes([seeded.pod.typeIndex])).toEqual(seeded.index);
      expect(await useCases.planMigration(seeded.pod.source)).toMatchObject({
        instanceOutdated: false,
        preferencesOutdated: false,
        deckCount: 0,
        cardCount: 2,
        reviewCount: 0,
      });
      await expectReadable(useCases, seeded);

      // Run again, it updates what is left, and nothing else.
      const second = app(seeded.pod);
      expect(await second.useCases.updateInstance(second.session, seeded.pod.instance)).toMatchObject({
        updated: [{ url: seeded.cards }],
        failed: [],
      });
      expect(second.sent.filter(isWrite).map((request) => request.url)).toEqual([seeded.cards, seeded.pod.typeIndex]);
      expect(await second.useCases.planMigration(seeded.pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      await expectReadable(second.useCases, seeded);
      // Another app's blank node on a card is kept through it all.
      expect(await triples(seeded.cards)).toMatch(/_:\S+ <https:\/\/other-app\.example\/ns#by> "another app" \./);
    }, 60_000);

    it("leaves a document another device changed since it was read as that device left it (412); a second run updates it, the change kept", async (context) => {
      if (!conditional.edits) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
      const seeded = await prepared();
      let changed: string | undefined;
      const { useCases, sent, session } = app(seeded.pod, {
        onRequest: async (request) => {
          // As the update is about to write the review states, another device studies.
          if (changed !== undefined || !isWrite(request) || request.url !== seeded.reviews) return;
          // A server whose ETag is stamped to the second needs the next second to tell.
          if (!everyEdit) await sleep(1100);
          await changeElsewhere(seeded.reviews, `<#se> <${FOREIGN}> "studied elsewhere" .`);
          changed = (await servedBytes([seeded.reviews])).get(seeded.reviews);
        },
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(changed).toBeDefined();
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        updated: [seeded.meta, seeded.preferences, seeded.cards, seeded.catalog].map((url) => ({ url })),
        failed: [{ url: seeded.reviews, holds: "reviews", error: { code: "changedElsewhere" } }],
      });
      // Refused by the pod, the update's write was never made: the document is as the other device left it.
      expect(sent.find((request) => isWrite(request) && request.url === seeded.reviews)).toMatchObject({ status: 412 });
      expect((await servedBytes([seeded.reviews])).get(seeded.reviews)).toBe(changed);
      expect(await useCases.planMigration(seeded.pod.source)).toMatchObject({ cardCount: 0, reviewCount: 1, deckCount: 0 });
      await expectReadable(useCases, seeded);

      const second = app(seeded.pod);
      expect(await second.useCases.updateInstance(second.session, seeded.pod.instance)).toMatchObject({
        updated: [{ url: seeded.reviews }],
        failed: [],
      });
      expect(await second.useCases.planMigration(seeded.pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      expect(await triples(seeded.reviews)).toContain("studied elsewhere");
      await expectReadable(second.useCases, seeded);
    }, 60_000);
  });

  it("updates a large deck in one write of the whole document, held to the version it read", async () => {
    const pod = await seedPod(server);
    // 600 cards: updating each card's format makes an edit larger than
    // node-solid-server reads in one PATCH (100 kB), as a real deck does.
    const cards = Array.from({ length: 600 }, (_, i) => `<#card-${i}> a sm:Card ; sm:front "Front ${i}" ; sm:back "Back ${i}" ; sm:formatVersion 2 .`);
    const response = await fetch(`${pod.source}decks/deck-1.ttl`, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `${PREFIXES}${cards.join("\n")}`,
    });
    expect(response.ok).toBe(true);
    const { useCases, sent, session } = app(pod);

    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ failed: [] });
    const deckWrites = sent.filter(isWrite).filter((request) => request.url === `${pod.source}decks/deck-1.ttl`);
    expect(deckWrites.map((request) => request.method)).toEqual(["PUT"]);
    expectConditional(sent, [`${pod.source}decks/deck-1.ttl`], conditional);
    expect(await useCases.planMigration(pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
    expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
    expect(await triples(`${pod.source}decks/deck-1.ttl`)).toContain(`<${pod.source}decks/deck-1.ttl#card-599>`);
  }, 60_000);

  it("refuses to write over what a newer version of the app wrote, and leaves it as it is", async () => {
    const pod = await seedPod(server);
    const cards = `${pod.source}decks/deck-1.ttl`;
    await fetch(cards, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `${PREFIXES}<#se> a sm:Card ; sm:front "Sweden" ; sm:back "Stockholm" ; sm:formatVersion 99 .`,
    });
    const { useCases } = app(pod);
    const [deck] = await useCases.listDecks(pod.source);
    const [card] = await useCases.listCards(deck!);
    await expect(useCases.updateCard(deck!, card!, { front: { en: "Sweden" }, back: { en: "Oslo" } })).rejects.toMatchObject({
      code: "writtenByNewerApp",
    });
    expect(await triples(cards)).toContain('"Stockholm"');
    expect(await triples(cards)).toContain('"99"');
  });

  it("still restores, or deletes, the copy an update by an earlier version of the app left", async () => {
    // As an earlier version left it: the updated copy registered, naming the original it replaced.
    const pod = await seedPod(server);
    const copy = await seedPod(server);
    const updated: Instance = { url: copy.source, name: "Main" };
    await fetch(`${copy.source}meta.ttl`, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `${PREFIXES}<#it> a sm:Instance ; dcterms:title "Main" ; sm:formatVersion 2 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime ;
    dcterms:replaces <${pod.source}> ; dcterms:modified "2026-09-28T10:00:00Z"^^xsd:dateTime .`,
    });
    const { useCases } = app(copy);
    const indexBefore = await registeredContainers(copy);
    expect(indexBefore).toContain(`<${copy.source}>`);
    await expect(useCases.readLegacyBackup(updated)).resolves.toEqual({ url: pod.source, replacedAt: "2026-09-28T10:00:00.000Z" });
    await expect(useCases.restoreLegacyBackup({ webId: copy.webId }, updated)).resolves.toEqual({
      instance: { url: pod.source, name: "Main" },
      keptFolder: copy.source,
    });
    // Every registration's link moved from the updated instance to the original, none removed; and, as ever,
    // the original's catalogue registered where the index registered no catalogue of it.
    const lines = (text: string) => text.split("\n").filter((line) => line !== "");
    const indexAfter = lines(await registeredContainers(copy));
    expect(indexAfter.join("\n")).not.toContain(`<${copy.source}`);
    const moved = lines(indexBefore.split(`<${copy.source}`).join(`<${pod.source}`));
    expect(indexAfter).toEqual(expect.arrayContaining(moved));
    const added = indexAfter.filter((line) => !moved.includes(line));
    const [registration, ...others] = new Set(added.map((line) => line.slice(0, line.indexOf(" "))));
    expect(others).toEqual([]);
    expect(added.sort()).toEqual(
      [
        `${registration} <http://purl.org/dc/terms/title> "Main" .`,
        `${registration} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/solid/terms#TypeRegistration> .`,
        `${registration} <http://www.w3.org/ns/solid/terms#forClass> <http://www.w3.org/ns/dcat#Catalog> .`,
        `${registration} <http://www.w3.org/ns/solid/terms#instance> <${pod.source}catalog.ttl#catalog> .`,
      ].sort(),
    );
    expect(await status(`${copy.source}meta.ttl`)).toBe(404);

    // Deleting such a backup deletes what Solid Memo wrote of it, and keeps the unknown file.
    const other = await seedPod(server);
    await fetch(`${copy.source}meta.ttl`, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `${PREFIXES}<#it> a sm:Instance ; dcterms:title "Main" ; sm:formatVersion 2 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime ; dcterms:replaces <${other.source}> .`,
    });
    await expect(useCases.deleteLegacyBackup(updated)).resolves.toEqual({ keptFolder: other.source });
    expect(await status(`${other.source}meta.ttl`)).toBe(404);
    expect(new Uint8Array(await (await fetch(`${other.source}attachments/picture.png`)).arrayBuffer())).toEqual(PICTURE);
    await expect(useCases.readLegacyBackup(updated)).resolves.toBeNull();
  }, 60_000);

  it("never overwrites a change made since the document was read, where the server enforces If-Match: the save fails, the change stays", async (context) => {
    if (!conditional.edits) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const pod = await seedPod(server);
    let interfered = false;
    const { useCases } = app(pod, {
      onRequest: async (request) => {
        if (interfered || request.method !== "PATCH" || request.url !== `${pod.source}preferences.ttl`) return;
        interfered = true;
        // Another tab saves the preferences first.
        await changeElsewhere(`${pod.source}preferences.ttl`, `<#it> <https://solid-memo.com/ns/vocab/v1.ttl#note> "saved in another tab" .`);
      },
    });
    const preferences = await useCases.getPreferences(pod.source);
    await expect(useCases.savePreferences(pod.source, { ...preferences, newCardsPerDay: 7 })).rejects.toThrow(
      `since Solid Memo read it, so nothing was saved. Reload the page and try again.\nurl: ${pod.source}preferences.ttl`,
    );
    const stored = await triples(`${pod.source}preferences.ttl`);
    expect(stored).toContain("saved in another tab");
    expect(stored).not.toContain('"7"');
    // Read again, the save goes through.
    await useCases.savePreferences(pod.source, { ...preferences, newCardsPerDay: 7 });
    expect(await triples(`${pod.source}preferences.ttl`)).toMatch(/newCardsPerDay> "?7/);
  });
});
