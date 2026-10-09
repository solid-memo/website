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
 * 5.8.8 and 6.0.0 enforce.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer, type Quad } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
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
function app(pod: Pod, options: { failOn?: (request: Recorded) => boolean; onRequest?: (request: Recorded) => Promise<void> } = {}) {
  /** Each request as it reaches the server, after the fence: with the If-Match it set, and its own checks. */
  const sent: Recorded[] = [];
  const sending: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    const recorded: Recorded = {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
    };
    sent.push(recorded);
    const response = await fetch(input, init);
    recorded.status = response.status;
    return response;
  };
  const writeFence = createWriteFence(sending);
  // The recording of attempts sits outside the fence: it sees what the app attempts, not only what gets through.
  const attempts: Recorded[] = [];
  const attemptingFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    const recorded: Recorded = {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: decodeURI(request?.url ?? String(input)),
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
    };
    attempts.push(recorded);
    await options.onRequest?.(recorded);
    if (options.failOn?.(recorded)) return new Response("injected failure", { status: 500 });
    const response = await writeFence.fetch(input, init);
    recorded.status = response.status;
    return response;
  };
  const shapeValidator = createShaclShapeValidator({
    fetch: attemptingFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
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

const isWrite = (request: Recorded) => !READS.has(request.method);
const under = (container: string) => (request: Recorded) => request.url.startsWith(container);

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** A document's triples, one a line, sorted: what it says, however the server writes it. */
async function sortedTriples(url: string): Promise<string[]> {
  return (await triples(url)).split("\n").filter((line) => line !== "").sort();
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

  it("updates each document in place, once, after backing it up, every write conditional; addresses, unknown files and foreign triples kept", async () => {
    const pod = await seedPod(server);
    const backups = `${pod.source}backups/`;
    const before = await snapshot(pod.source);
    const indexBefore = await registeredContainers(pod);
    const { useCases, attempts, sent, session } = app(pod);

    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    const backupUrl = (outcome as { backupUrl: string }).backupUrl;
    expect(backupUrl).toMatch(new RegExp(`^${backups}\\d{8}T\\d{6}Z-[0-9a-f]{8}/$`));
    const backup = await onlyBackup(useCases, pod);
    expect(backup).toMatchObject({ url: backupUrl, of: pod.source });
    expect(backup.entries.map((entry) => entry.document)).toEqual(UPDATED.map((path) => `${pod.source}${path}`));

    // Every write went to a document the backup lists, or into the backup, but the last: the type index,
    // once updated, given the registrations of the instance's data it lacked, If-Match where the server enforces it.
    const writes = sent.filter(isWrite);
    const documents = new Set(backup.entries.map((entry) => entry.document));
    expect(writes.filter((request) => !documents.has(request.url) && !under(backupUrl)(request))).toEqual([writes.at(-1)]);
    expect(writes.at(-1)).toMatchObject({ method: "PATCH", url: pod.typeIndex });
    if (conditional.edits) expect(writes.at(-1)!.ifMatch).toMatch(/^"/);
    // Each document was written once, and only after the backup's manifest and its own copy were.
    const manifest = writes.findIndex((request) => request.url === `${backupUrl}manifest.ttl`);
    for (const entry of backup.entries) {
      const own = writes.filter((request) => request.url === entry.document);
      expect(own, entry.document).toHaveLength(1);
      expect(writes.indexOf(own[0]!)).toBeGreaterThan(manifest);
      expect(writes.indexOf(own[0]!), entry.document).toBeGreaterThan(
        writes.findIndex((request) => request.url === entry.copy),
      );
      // Only of the version backed up: If-Match it, where the server enforces it; else checked just before.
      if (conditional.edits) expect(own[0]!.ifMatch, entry.document).toBe(entry.versionBackedUp);
      else expect(sent[sent.indexOf(own[0]!) - 1], entry.document).toMatchObject({ method: "GET", url: entry.document });
      // The version the update left it at is noted, so a restore can tell a document changed since.
      expect(entry.versionUpdated, entry.document).toBeDefined();
    }
    // Everything the backup holds was created where nothing was.
    for (const write of writes.filter(under(backupUrl))) {
      if (write.method === "PUT") expect(write.ifNoneMatch, `${write.method} ${write.url}`).toBe("*");
      if (write.method === "PATCH" && conditional.edits) expect(write.ifMatch, `${write.method} ${write.url}`).toMatch(/^"/);
    }
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
    // The backup's copy holds the document as it was; a document shared on its own is no more open there.
    const copy = backup.entries.find((entry) => entry.document === `${pod.source}decks/deck-1.ttl`)!.copy!;
    expect(await triples(copy)).toContain(`<${pod.source}decks/deck-1.ttl#se> <https://solid-memo.com/ns/vocab/v1.ttl#back> "Stockholm"`);
    expect(await triples(copy)).toContain(`<${pod.source}decks/deck-1.ttl#no> <https://solid-memo.com/ns/vocab/v1.ttl#formatVersion> "1"`);
    expect(await triples(copy)).not.toContain('formatVersion> "5"');
    const copyAcl = await triples(await aclOf(copy));
    expect(copyAcl).toContain(FRIEND);
    expect(copyAcl).toContain(copy);
    // A document that inherits its access (from the instance's folder) gives its copy that access as its own.
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

  it("restores the documents still as the update left them, keeps one studied since, and deletes only its own files", async () => {
    const pod = await seedPod(server);
    const original = new Map<string, string[]>();
    for (const path of UPDATED) original.set(`${pod.source}${path}`, await sortedTriples(`${pod.source}${path}`));
    const { useCases, session, sent } = app(pod);
    expect(await useCases.updateInstance(session, pod.instance)).toMatchObject({ ok: true });
    const backup = await onlyBackup(useCases, pod);
    // Another tab studies after the update: the reviews document changes.
    const reviews = `${pod.source}reviews/deck-1.ttl`;
    if (!everyEdit) await sleep(1100);
    await changeElsewhere(reviews, `<#no> <${FOREIGN}> "studied since" .`);
    const studied = await sortedTriples(reviews);

    const restoring = sent.length;
    const restored = await useCases.restoreBackup(pod.instance, backup);

    // Each document put back only while it is still as the update left it: If-Match that version
    // where the server enforces it, else right after a read of it; the one studied since is not written.
    const putBack = sent.slice(restoring);
    for (const entry of backup.entries) {
      const own = putBack.filter((request) => isWrite(request) && request.url === entry.document);
      if (entry.document === reviews) {
        expect(own, entry.document).toEqual([]);
        continue;
      }
      expect(own, entry.document).toHaveLength(1);
      if (conditional.edits) expect(own[0]!.ifMatch, entry.document).toBe(entry.versionUpdated);
      else expect(putBack[putBack.indexOf(own[0]!) - 1], entry.document).toMatchObject({ method: "GET", url: entry.document });
    }

    expect(restored).toEqual({
      restored: UPDATED.filter((path) => !path.startsWith("reviews/")).reverse().map((path) => `${pod.source}${path}`),
      kept: [reviews],
      removed: false,
    });
    for (const [url, triplesBefore] of original) {
      expect(await sortedTriples(url), url).toEqual(url === reviews ? studied : triplesBefore);
    }
    expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
    // Restored, the instance is offered the update again; the backup stays, holding the kept document's earlier version.
    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    await expect(useCases.listBackups(pod.instance)).resolves.toHaveLength(1);

    // Deleting the backup deletes what Solid Memo put in it, and keeps another app's file, and the folder with it.
    await fetch(`${backup.url}notes.txt`, { method: "PUT", headers: { "content-type": "text/plain" }, body: "another app's" });
    await expect(useCases.deleteBackup(backup)).resolves.toEqual({ keptFolder: backup.url });
    for (const url of [`${backup.url}manifest.ttl`, ...backup.entries.map((entry) => entry.copy!).filter(Boolean)]) {
      expect(await fetch(url, { method: "HEAD" }).then((r) => r.status), url).toBe(404);
    }
    expect(await fetch(`${backup.url}notes.txt`).then((r) => r.text())).toBe("another app's");
    await expect(useCases.listBackups(pod.instance)).resolves.toEqual([]);
    expect(await triples(`${pod.source}decks/deck-1.ttl`)).toContain(`<${FOREIGN}> "kept"`);
    // Once the other app's file is gone, deleting it again leaves no folder: each copy's access control went with it.
    await fetch(`${backup.url}notes.txt`, { method: "DELETE" });
    await expect(useCases.deleteBackup(backup)).resolves.toEqual({ keptFolder: null });
    expect(await fetch(backup.url, { method: "HEAD" }).then((r) => r.status)).toBe(404);
  }, 60_000);

  it("stops at a document changed elsewhere after it was backed up, leaving a readable, valid, partly updated instance that a second run finishes", async () => {
    const pod = await seedPod(server);
    const reviews = `${pod.source}reviews/deck-1.ttl`;
    let changed = false;
    const { useCases, session } = app(pod, {
      onRequest: async (request) => {
        // As the update is about to write the reviews document, another device studies.
        if (changed || !isWrite(request) || request.url !== reviews) return;
        changed = true;
        // A server whose versions are to the second needs the next second to tell.
        if (!everyEdit) await sleep(1100);
        await changeElsewhere(reviews, `<#se> <${FOREIGN}> "studied elsewhere" .`);
      },
    });

    const outcome = await useCases.updateInstance(session, pod.instance);

    expect(changed).toBe(true);
    expect(outcome).toMatchObject({
      ok: false,
      step: "upgrade",
      updated: ["meta.ttl", "preferences.ttl", "decks/deck-1.ttl"].map((path) => `${pod.source}${path}`),
      backupUrl: expect.stringContaining(`${pod.source}backups/`),
    });
    expect((outcome as { error: Error }).error).toMatchObject({ code: "changedElsewhere", vars: { url: reviews } });
    // The other device's study is kept; the instance reads and conforms, each subject at its own format.
    expect(await triples(reviews)).toContain("studied elsewhere");
    expect((await useCases.validateInstance(pod.source)).conforms).toBe(true);
    expect(await useCases.listCards((await useCases.listDecks(pod.source))[0]!)).toHaveLength(2);
    expect(await useCases.planMigration(pod.source)).toMatchObject({
      instanceOutdated: false,
      preferencesOutdated: false,
      cardCount: 0,
      reviewCount: 1,
      deckCount: 1,
    });

    // Run again, it updates what is still outdated, and backs up only that.
    const second = app(pod).useCases;
    const again = await second.updateInstance(session, pod.instance);
    expect(again, JSON.stringify(again)).toMatchObject({ ok: true });
    // Read by the tab that ran it: another tab's reads may be answered from what it read before, on a
    // server whose ETag outlives an edit made in the same second (Community Solid Server 6).
    expect(await second.planMigration(pod.source)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
    expect((await second.validateInstance(pod.source)).conforms).toBe(true);
    expect(await triples(reviews)).toContain("studied elsewhere");
    const backups = await second.listBackups(pod.instance);
    expect(backups.map((backup) => backup.entries.map((entry) => entry.document.slice(pod.source.length)))).toEqual([
      ["reviews/deck-1.ttl", "catalog.ttl"],
      UPDATED,
    ]);
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
    expect(await fetch(`${pod.source}meta.ttl`).then((r) => r.status)).toBe(200);
  }, 60_000);

  it("leaves no trace when it fails before writing a document", async () => {
    const pod = await seedPod(server);
    const before = await snapshot(pod.source);
    const { useCases, session } = app(pod, {
      failOn: (request) => request.method === "PUT" && request.url.includes("/backups/") && request.url.endsWith("decks/deck-1.ttl"),
    });
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome).toMatchObject({ ok: false, step: "backup", updated: [] });
    expect(outcome).not.toHaveProperty("backupUrl");
    // Every document as it was (a container's listing changes with the backups folder made and removed).
    const documents = (map: Map<string, string>) => [...map].filter(([url]) => !url.endsWith("/"));
    expect(documents(await snapshot(pod.source, (url) => url.startsWith(`${pod.source}backups/`)))).toEqual(documents(before));
    await expect(app(pod).useCases.listBackups(pod.instance)).resolves.toEqual([]);
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
  });

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
    expect(await fetch(`${copy.source}meta.ttl`, { method: "HEAD" }).then((r) => r.status)).toBe(404);

    // Deleting such a backup deletes what Solid Memo wrote of it, and keeps the unknown file.
    const other = await seedPod(server);
    await fetch(`${copy.source}meta.ttl`, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: `${PREFIXES}<#it> a sm:Instance ; dcterms:title "Main" ; sm:formatVersion 2 ;
    dcterms:created "2026-09-21T10:00:00Z"^^xsd:dateTime ; dcterms:replaces <${other.source}> .`,
    });
    await expect(useCases.deleteLegacyBackup(updated)).resolves.toEqual({ keptFolder: other.source });
    expect(await fetch(`${other.source}meta.ttl`, { method: "HEAD" }).then((r) => r.status)).toBe(404);
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
