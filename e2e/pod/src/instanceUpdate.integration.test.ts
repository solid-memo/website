// @vitest-environment node
/**
 * The format update against a real Solid server (docs/migrations.md): the
 * app's own use cases and Solid adapters, wired as in main.tsx, with every
 * HTTP request recorded, both as the app attempts it and as it reaches
 * the server (after the write fence). `npm run test:pod` runs them against
 * each server globalSetup.ts starts — a Community Solid Server and
 * node-solid-server — unless SOLID_SERVER_URL names one (see
 * docs/testing.md). What a server does with preconditions is asked of it,
 * not assumed: node-solid-server gives no ETag on a read and ignores
 * If-Match, so there an edit is held to its version by the fence checking
 * it just before; 5.7.4 also ignored If-None-Match: * on a PUT, which
 * 5.8.8 and 6.0.0 enforce. "Byte for byte" is what the server serves for
 * a document asked for as the app asks (Accept: text/turtle), before and
 * after.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer, type Quad } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { ShapeValidator } from "@solid-memo/application/ports";
import type { Backup } from "@solid-memo/domain/backup";
import type { Instance } from "@solid-memo/domain/instance";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidDocumentBackups } from "@solid-memo/solid/solidDocumentBackups";
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
    /** Answers the request with a failure of its own, before the fence: the pod never sees it. */
    failOn?: (request: Recorded) => boolean;
    /** Runs as the app is about to make the request: another device's doing. */
    onRequest?: (request: Recorded) => Promise<void>;
    /** The request is made, and its answer lost on the way: the app sees a network failure. */
    loseAnswer?: (request: Recorded) => boolean;
    /** What the shape check says of a document, from what it would have said. */
    check?: (url: string, report: Awaited<ReturnType<ShapeValidator["validateDocument"]>>) => typeof report;
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
  /** Each request as it reaches the server, after the fence: with the If-Match it set, and its own checks. */
  const sent: Recorded[] = [];
  const sending: typeof fetch = async (input, init) => {
    const recorded = record(input, init);
    sent.push(recorded);
    const response = await fetch(input, init);
    recorded.status = response.status;
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
    if (options.loseAnswer?.(recorded)) throw new TypeError("Failed to fetch");
    return response;
  };
  const validator = createShaclShapeValidator({
    fetch: attemptingFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const shapeValidator: typeof validator =
    options.check === undefined
      ? validator
      : { ...validator, validateDocument: async (url) => options.check!(url, await validator.validateDocument(url)) };
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
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: attemptingFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: attemptingFetch }),
    documentBackups: createSolidDocumentBackups({ fetch: attemptingFetch, checkWrite }),
    writeFence,
  });
  return { useCases, attempts, sent, podFetch: attemptingFetch, session: { webId: pod.webId } };
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

/** The Content-Type the server serves each document with, asked for as the app asks: what a backup keeps it with. */
async function servedTypes(urls: readonly string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (const url of urls) result.set(url, (await fetch(url, { headers: { accept: "text/turtle" } })).headers.get("content-type"));
  return result;
}

/** The bytes a file of a backup holds, as stored, one character a byte. */
async function fileBytes(url: string): Promise<string> {
  return Buffer.from(await (await fetch(url)).arrayBuffer()).toString("latin1");
}

const status = async (url: string) => (await fetch(url, { method: "HEAD" })).status;
const isWrite = (request: Recorded) => !READS.has(request.method);
const under = (container: string) => (request: Recorded) => request.url.startsWith(container);

/**
 * Every write to one of the documents was held to the version it was
 * read at — If-Match where the server enforces it, else right after a
 * read of it (the fence's check, or a restore's) — and every resource
 * made in the update's `folder` was first written where nothing was.
 */
function expectConditional(sent: Recorded[], documents: readonly string[], folder: string, conditional: Preconditions): void {
  const made = new Set<string>();
  for (const [index, request] of sent.entries()) {
    if (!isWrite(request)) continue;
    if (documents.includes(request.url)) {
      if (conditional.edits) expect(request.ifMatch, `${request.method} ${request.url}`).toMatch(/^"/);
      else expect(sent[index - 1], `${request.method} ${request.url}`).toMatchObject({ method: "GET", url: request.url });
    }
    if (request.url.startsWith(folder) && request.method === "PUT" && !made.has(request.url)) {
      made.add(request.url);
      expect(request.ifNoneMatch, `PUT ${request.url}`).toBe("*");
    }
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

  /** The instance's one backup, as its manifest says. */
  async function onlyBackup(useCases: UseCases, pod: Pod): Promise<Backup> {
    const backups = await useCases.listBackups(pod.instance);
    expect(backups).toHaveLength(1);
    return backups[0]!;
  }

  it("backs up each document's bytes, updates and checks a working copy, then each document in place, every write conditional; addresses, unknown files, sharing and foreign triples kept", async () => {
    const pod = await seedPod(server);
    const backups = `${pod.source}backups/`;
    const documents = UPDATED.map((path) => `${pod.source}${path}`);
    const before = await snapshot(pod.source);
    const bytesBefore = await servedBytes(documents);
    const indexBefore = await registeredContainers(pod);
    const { useCases, attempts, sent, session } = app(pod);

    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    const backupUrl = (outcome as { backupUrl: string }).backupUrl;
    expect(backupUrl).toMatch(new RegExp(`^${backups}\\d{8}T\\d{6}Z-[0-9a-f]{8}/$`));
    const backup = await onlyBackup(useCases, pod);
    expect(backup).toMatchObject({ url: backupUrl, of: pod.source });
    expect(backup.entries.map((entry) => entry.document)).toEqual(documents);

    // Every write went to a document the backup names, or into the update's folder, but the last: the type index,
    // once updated, given the registrations of the instance's data it lacked, If-Match where the server enforces it.
    const writes = sent.filter(isWrite);
    expect(writes.filter((request) => !documents.includes(request.url) && !under(backupUrl)(request))).toEqual([writes.at(-1)]);
    expect(writes.at(-1)).toMatchObject({ method: "PATCH", url: pod.typeIndex });
    if (conditional.edits) expect(writes.at(-1)!.ifMatch).toMatch(/^"/);
    // No access control but the update's own files' is written: an update changes no one's access.
    expect(writes.filter((request) => request.url.endsWith(".acl") && !under(backupUrl)(request))).toEqual([]);
    // Each document was written once: after its bytes were kept and its working copy updated and checked,
    // only of the version backed up (If-Match it, where the server enforces it; else checked just before).
    const staged = (document: string) => document.replace(pod.source, `${backupUrl}staging/`);
    /** The index of the last request that matches, -1 when none does. */
    const lastIndex = (requests: Recorded[], matches: (request: Recorded) => boolean) =>
      requests.reduce((last, request, index) => (matches(request) ? index : last), -1);
    const firstWrite = sent.findIndex((request) => isWrite(request) && documents.includes(request.url));
    for (const entry of backup.entries) {
      const own = writes.filter((request) => request.url === entry.document);
      expect(own, entry.document).toHaveLength(1);
      expect(writes.indexOf(own[0]!), entry.document).toBeGreaterThan(writes.findIndex((request) => request.url === entry.copy));
      expect(writes.indexOf(own[0]!), entry.document).toBeGreaterThan(
        lastIndex(writes, (request) => request.url === staged(entry.document) && request.method !== "DELETE"),
      );
      // Its working copy was read and checked once written, before any document of the user's was written.
      const lastStagedWrite = lastIndex(sent, (request) => isWrite(request) && request.method !== "DELETE" && request.url === staged(entry.document));
      expect(
        sent.slice(lastStagedWrite + 1, firstWrite).some((request) => request.method === "GET" && request.url === staged(entry.document)),
        entry.document,
      ).toBe(true);
      if (conditional.edits) expect(own[0]!.ifMatch, entry.document).toBe(entry.versionBackedUp);
      else expect(sent[sent.indexOf(own[0]!) - 1], entry.document).toMatchObject({ method: "GET", url: entry.document });
      expect(entry.versionUpdated, entry.document).toBeDefined();
      expect(entry.contentType, entry.document).toMatch(/^text\/turtle/);
      // Its bytes, kept as they were served, as no RDF.
      expect(entry.copy).toBe(`${backupUrl}${entry.document.slice(pod.source.length)}.orig`);
      expect(await fileBytes(entry.copy!), entry.document).toBe(bytesBefore.get(entry.document));
    }
    expectConditional(sent, documents, backupUrl, conditional);
    // The working copy is gone; the backup stays, the previous version.
    expect(await status(`${backupUrl}staging/`)).toBe(404);
    // Nothing else in the tab wrote meanwhile; the attempts are the writes sent.
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
    // Another app's triple, its file and the access rules are as they were.
    expect(await triples(`${pod.source}decks/deck-1.ttl`)).toContain(`<${FOREIGN}> "kept"`);
    const after = await snapshot(pod.source, (url) => url.startsWith(backups));
    for (const unchanged of [`${pod.source}attachments/picture.png`, await aclOf(pod.source), await aclOf(`${pod.source}decks/deck-1.ttl`)]) {
      expect(after.get(unchanged), unchanged).toBe(before.get(unchanged));
    }
    const picture: ArrayBuffer = await (await fetch(`${pod.source}attachments/picture.png`)).arrayBuffer();
    expect(new Uint8Array(picture)).toEqual(PICTURE);
    // A document's bytes are no more open than it: one shared on its own is shared alike…
    const copy = backup.entries.find((entry) => entry.document === `${pod.source}decks/deck-1.ttl`)!.copy!;
    const copyAcl = await triples(await aclOf(copy));
    expect(copyAcl).toContain(FRIEND);
    expect(copyAcl).toContain(`<${copy}>`);
    // …and one that inherits its access (from the instance's folder) gives its bytes that access as their own.
    const metaCopy = backup.entries.find((entry) => entry.document === `${pod.source}meta.ttl`)!.copy!;
    const inherited = await triples(await aclOf(metaCopy));
    expect(inherited).toContain(FRIEND);
    expect(inherited).toContain(`<${metaCopy}>`);
    expect(inherited).not.toContain("http://www.w3.org/ns/auth/acl#default");
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
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });

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

  it("restores, byte for byte, the documents still as the update left them, keeps one studied since, and deletes only its own files", async () => {
    const pod = await seedPod(server);
    const documents = UPDATED.map((path) => `${pod.source}${path}`);
    const original = await servedBytes(documents);
    const { useCases, session, sent } = app(pod);
    expect(await useCases.updateInstance(session, pod.instance)).toMatchObject({ ok: true });
    const backup = await onlyBackup(useCases, pod);
    // Another tab studies after the update: the reviews document changes.
    const reviews = `${pod.source}reviews/deck-1.ttl`;
    if (!everyEdit) await sleep(1100);
    await changeElsewhere(reviews, `<#no> <${FOREIGN}> "studied since" .`);
    const studied = (await servedBytes([reviews])).get(reviews);

    const restoring = sent.length;
    const restored = await useCases.restoreBackup(pod.instance, backup);

    // Each document put back only while it is still as the update left it: If-Match that version where the
    // server enforces it, else right after a read of it, with the Content-Type it was served with; the one studied
    // since is not written.
    const putBack = sent.slice(restoring);
    for (const entry of backup.entries) {
      const own = putBack.filter((request) => isWrite(request) && request.url === entry.document);
      if (entry.document === reviews) {
        expect(own, entry.document).toEqual([]);
        continue;
      }
      expect(own, entry.document).toMatchObject([{ method: "PUT", contentType: entry.contentType }]);
      if (conditional.edits) expect(own[0]!.ifMatch, entry.document).toBe(entry.versionUpdated);
      else expect(putBack[putBack.indexOf(own[0]!) - 1], entry.document).toMatchObject({ method: "GET", url: entry.document });
    }

    expect(restored).toEqual({
      restored: UPDATED.filter((path) => !path.startsWith("reviews/")).reverse().map((path) => `${pod.source}${path}`),
      kept: [{ document: reviews, copy: `${backup.url}reviews/deck-1.ttl.orig` }],
      removed: false,
    });
    // Byte for byte as before the update, but the one studied since.
    expect(await servedBytes(documents)).toEqual(new Map([...original].map(([url, bytes]) => [url, url === reviews ? studied! : bytes])));
    expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
    // Restored, the instance is offered the update again; the backup stays, holding the kept document's bytes from before.
    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    await expect(useCases.listBackups(pod.instance)).resolves.toHaveLength(1);
    expect(await fileBytes(`${backup.url}reviews/deck-1.ttl.orig`)).toBe(original.get(reviews));

    // Deleting the backup deletes what Solid Memo put in it, and keeps another app's file, and the folder with it.
    await fetch(`${backup.url}notes.txt`, { method: "PUT", headers: { "content-type": "text/plain" }, body: "another app's" });
    await expect(useCases.deleteBackup(backup)).resolves.toEqual({ keptFolder: backup.url });
    for (const url of [`${backup.url}manifest.ttl`, ...backup.entries.map((entry) => entry.copy!)]) {
      expect(await status(url), url).toBe(404);
    }
    expect(await fetch(`${backup.url}notes.txt`).then((r) => r.text())).toBe("another app's");
    await expect(useCases.listBackups(pod.instance)).resolves.toEqual([]);
    // Once the other app's file is gone, deleting it again leaves no folder: each file's access control went with it.
    await fetch(`${backup.url}notes.txt`, { method: "DELETE" });
    await expect(useCases.deleteBackup(backup)).resolves.toEqual({ keptFolder: null });
    expect(await status(backup.url)).toBe(404);
  }, 60_000);

  it("refuses, in this tab, any write to the instance while the update runs but its own", async () => {
    const pod = await seedPod(server);
    let refused: unknown = null;
    let tried = false;
    const { useCases, session, podFetch } = app(pod, {
      onRequest: async (request) => {
        if (tried || !request.url.includes("/backups/")) return;
        tried = true;
        refused = await podFetch(`${pod.source}meta.ttl`, { method: "DELETE" }).then(
          () => null,
          (error: unknown) => error,
        );
      },
    });
    expect(await useCases.updateInstance(session, pod.instance)).toMatchObject({ ok: true });
    expect(refused).toMatchObject({ code: "instanceBeingUpdated" });
    expect(await status(`${pod.source}meta.ttl`)).toBe(200);
  }, 60_000);

  it("updates a large deck in one write of the whole document, still only of the version backed up", async () => {
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
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    const deckWrites = sent.filter(isWrite).filter((request) => request.url === `${pod.source}decks/deck-1.ttl`);
    expect(deckWrites.map((request) => request.method)).toEqual(["PUT"]);
    const entry = (await onlyBackup(useCases, pod)).entries.find((candidate) => candidate.document === `${pod.source}decks/deck-1.ttl`)!;
    if (conditional.edits) expect(deckWrites[0]!.ifMatch).toBe(entry.versionBackedUp);
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
    await expect(useCases.readLegacyBackup(updated)).resolves.toEqual({ url: pod.source, replacedAt: "2026-09-28T10:00:00.000Z" });
    await expect(useCases.restoreLegacyBackup({ webId: copy.webId }, updated)).resolves.toEqual({
      instance: { url: pod.source, name: "Main" },
      keptFolder: copy.source,
    });
    expect(await registeredContainers(copy)).toContain(`<${pod.source}>`);
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

  /**
   * A failed update leaves every document of the user's exactly as it
   * was: the bytes the server serves for it, asked for as the app asks,
   * are those it served before, prefixes, comments, order and all
   * (seedHandWritten's documents, which a server's rewrite would not keep
   * so); nothing of the update is left in the instance; the type index is
   * as it was; and every write to a document was conditional.
   */
  describe("byte for byte", () => {
    async function prepared() {
      const pod = await seedHandWritten(server);
      const documents = UPDATED.map((path) => `${pod.source}${path}`);
      const [meta, preferences, cards, reviews, catalog] = documents as [string, string, string, string, string];
      return {
        pod,
        documents,
        meta,
        preferences,
        cards,
        reviews,
        catalog,
        before: await servedBytes(documents),
        types: await servedTypes(documents),
        index: await servedBytes([pod.typeIndex]),
      };
    }

    /**
     * Each document put back was sent whole (PUT) with the Content-Type it
     * was served with before, and every write to a document was held to
     * the version it was read at (expectConditional).
     */
    function expectPutBack(seeded: Awaited<ReturnType<typeof prepared>>, sent: Recorded[], putBack: readonly string[]): void {
      for (const document of putBack) {
        const puts = sent.filter((request) => request.method === "PUT" && request.url === document);
        expect(puts.length, document).toBeGreaterThan(0);
        expect(puts.at(-1)!.contentType, document).toBe(seeded.types.get(document));
      }
      expectConditional(sent, seeded.documents, `${seeded.pod.source}backups/`, conditional);
    }

    /** Every document's bytes as before, but those `except` gives; nothing of the update in the instance; the type index as it was. */
    async function expectAsItWas(seeded: Awaited<ReturnType<typeof prepared>>, except = new Map<string, string>()): Promise<void> {
      const after = await servedBytes(seeded.documents);
      for (const document of seeded.documents) expect(after.get(document), document).toBe(except.get(document) ?? seeded.before.get(document));
      expect(await status(`${seeded.pod.source}backups/`)).toBe(404);
      expect(await servedBytes([seeded.pod.typeIndex])).toEqual(seeded.index);
      expect(new Uint8Array(await (await fetch(`${seeded.pod.source}attachments/picture.png`)).arrayBuffer())).toEqual(PICTURE);
    }

    it("leaves every document as it was, and nothing of the update, when its working copy cannot be written", async () => {
      const seeded = await prepared();
      const { useCases, sent, session } = app(seeded.pod, {
        failOn: (request) => isWrite(request) && request.url.includes("/staging/decks/"),
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "copy", undo: null });
      expect(outcome).not.toHaveProperty("backupUrl");
      expect(sent.filter(isWrite).filter((request) => seeded.documents.includes(request.url))).toEqual([]);
      await expectAsItWas(seeded);
    }, 60_000);

    it("leaves every document as it was, and nothing of the update, when backing one up fails", async () => {
      const seeded = await prepared();
      const { useCases, sent, session } = app(seeded.pod, {
        failOn: (request) => request.method === "PUT" && request.url.endsWith("decks/deck-1.ttl.orig"),
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "backup", undo: null });
      expect(outcome).not.toHaveProperty("backupUrl");
      expect(sent.filter(isWrite).filter((request) => seeded.documents.includes(request.url))).toEqual([]);
      await expectAsItWas(seeded);
    }, 60_000);

    it("writes no document of the user's when one changed elsewhere after it was backed up", async () => {
      const seeded = await prepared();
      let changed = false;
      const { useCases, sent, session } = app(seeded.pod, {
        onRequest: async (request) => {
          // As the working copy is written, another device studies.
          if (changed || !isWrite(request) || !request.url.includes("/staging/")) return;
          changed = true;
          if (!everyEdit) await sleep(1100);
          await changeElsewhere(seeded.reviews, `<#se> <${FOREIGN}> "studied elsewhere" .`);
        },
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(changed).toBe(true);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, step: "verify", undo: null });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "changedDuringUpdate", vars: { url: seeded.reviews } });
      expect(sent.filter(isWrite).filter((request) => seeded.documents.includes(request.url))).toEqual([]);
      expect(await triples(seeded.reviews)).toContain("studied elsewhere");
      await expectAsItWas(seeded, await servedBytes([seeded.reviews]));
    }, 60_000);

    it("puts back what it wrote when a document changed elsewhere just before its write, and keeps that change; a second run finishes", async () => {
      const seeded = await prepared();
      let changed = false;
      const { useCases, sent, session } = app(seeded.pod, {
        onRequest: async (request) => {
          // As the update is about to write the cards, another device edits one.
          if (changed || !isWrite(request) || request.url !== seeded.cards) return;
          changed = true;
          if (!everyEdit) await sleep(1100);
          await changeElsewhere(seeded.cards, `<#se> <${FOREIGN}> "edited elsewhere" .`);
        },
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(changed).toBe(true);
      // The record and the preferences were written, and are put back; the cards' write was refused, so never made.
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "rewrite",
        undo: { restored: [seeded.preferences, seeded.meta], kept: [], removed: true },
      });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "changedElsewhere", vars: { url: seeded.cards } });
      expect(outcome).not.toHaveProperty("backupUrl");
      expect(await triples(seeded.cards)).toContain("edited elsewhere");
      await expectAsItWas(seeded, await servedBytes([seeded.cards]));
      expectPutBack(seeded, sent, [seeded.preferences, seeded.meta]);

      // Run again, it finishes, the other device's edit kept.
      const second = app(seeded.pod);
      expect(await second.useCases.updateInstance(second.session, seeded.pod.instance)).toMatchObject({ ok: true });
      expect(await second.useCases.planMigration(seeded.pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      expect(await triples(seeded.cards)).toContain("edited elsewhere");
    }, 60_000);

    it("puts back every document it wrote when a write fails after others were written", async () => {
      const seeded = await prepared();
      const { useCases, sent, session } = app(seeded.pod, {
        failOn: (request) => isWrite(request) && request.url === seeded.catalog,
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "rewrite",
        undo: { restored: [seeded.reviews, seeded.cards, seeded.preferences, seeded.meta], kept: [], removed: true },
      });
      expectPutBack(seeded, sent, [seeded.reviews, seeded.cards, seeded.preferences, seeded.meta]);
      await expectAsItWas(seeded);
    }, 60_000);

    it("puts back a document whose write was made but its answer lost, told by what its working copy says, and the others", async () => {
      const seeded = await prepared();
      let lost = false;
      const { useCases, sent, session } = app(seeded.pod, {
        // The update's write of the reviews reaches the pod; its answer does not reach the app.
        loseAnswer: (request) => !lost && isWrite(request) && request.url === seeded.reviews && (lost = true),
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "rewrite",
        undo: { restored: [seeded.reviews, seeded.cards, seeded.preferences, seeded.meta], kept: [], removed: true },
      });
      expectPutBack(seeded, sent, [seeded.reviews, seeded.cards, seeded.preferences, seeded.meta]);
      await expectAsItWas(seeded);
    }, 60_000);

    it("puts back every document it wrote when one fails its check once written", async () => {
      const seeded = await prepared();
      let checks = 0;
      const injected = { message: { en: "Injected." }, severity: "violation" as const, constraint: "MinCount" };
      const { useCases, sent, session } = app(seeded.pod, {
        // The second check of the cards in place is after the update wrote them.
        check: (url, report) =>
          url !== seeded.cards || ++checks < 2
            ? report
            : { ...report, subjects: [...report.subjects, { url: `${url}#se`, status: "checked", shape: "card", version: 5, violations: [injected] }] },
      });
      const outcome = await useCases.updateInstance(session, seeded.pod.instance);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({
        ok: false,
        step: "validate",
        undo: {
          restored: [seeded.catalog, seeded.reviews, seeded.cards, seeded.preferences, seeded.meta],
          kept: [],
          removed: true,
        },
      });
      expect((outcome as { error: unknown }).error).toMatchObject({ code: "updatedInstanceInvalid", vars: { count: 1 } });
      expectPutBack(seeded, sent, seeded.documents);
      await expectAsItWas(seeded);
    }, 60_000);

    it("keeps each document's bytes, and gives them all back when the update is restored", async () => {
      const seeded = await prepared();
      const { useCases, sent, session } = app(seeded.pod);
      expect(await useCases.updateInstance(session, seeded.pod.instance)).toMatchObject({ ok: true });
      expect(await useCases.planMigration(seeded.pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      const backup = await onlyBackup(useCases, seeded.pod);
      for (const entry of backup.entries) expect(await fileBytes(entry.copy!), entry.document).toBe(seeded.before.get(entry.document));
      // Updated, the documents read differently: the server rewrote each one.
      for (const document of seeded.documents) expect((await servedBytes([document])).get(document), document).not.toBe(seeded.before.get(document));

      const restoring = sent.length;
      await expect(useCases.restoreBackup(seeded.pod.instance, backup)).resolves.toEqual({
        restored: [...seeded.documents].reverse(),
        kept: [],
        removed: true,
      });
      for (const entry of backup.entries) {
        expect(sent.slice(restoring).filter((request) => isWrite(request) && request.url === entry.document), entry.document).toMatchObject([
          { method: "PUT", contentType: entry.contentType },
        ]);
      }
      expectConditional(sent.slice(restoring), seeded.documents, `${seeded.pod.source}backups/`, conditional);
      await expectAsItWas({ ...seeded, index: await servedBytes([seeded.pod.typeIndex]) });
      expect((await useCases.planMigration(seeded.pod.source)).deckCount).toBe(1);
    }, 60_000);
  });
});
