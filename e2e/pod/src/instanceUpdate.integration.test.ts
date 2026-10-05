// @vitest-environment node
/**
 * The format update against a real Solid server (docs/migrations.md): the
 * app's own use cases and Solid adapters, wired as in main.tsx, with every
 * HTTP request recorded. `npm run test:pod` runs them against each server
 * globalSetup.ts starts — a Community Solid Server and node-solid-server
 * — unless SOLID_SERVER_URL names one (see docs/testing.md). What a
 * server does with preconditions is asked of it, not assumed:
 * node-solid-server gives no ETag on a read and ignores If-Match, so
 * there no edit can be made conditional; 5.7.4 also ignored
 * If-None-Match: * on a PUT, which 5.8.8 and 6.0.0 enforce.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser, Writer, type Quad } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/pod";
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
const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const PREFIXES = `@prefix sm: <https://pod.solid-memo.com/vocab/v1#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
`;
const FRIEND = "https://bob.example/profile/card#me";
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
    `${PREFIXES}<#se> a sm:Card ; sm:front "Sweden" ; sm:back "Stockholm" .
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
const RELEASE = "https://solid-memo.com/decks/capitals-of-the-world/2.ttl";

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
    dcterms:publisher <${webId}> ; dcat:themeTaxonomy <https://pod.solid-memo.com/vocab/topics> ;
    dcat:dataset <#deck-1>, <#deck-2> .
<${webId}> a foaf:Agent ; foaf:name "Alice" .
${deck("deck-1", `dcterms:title "Spanska glosor"@en, "Spanska glosor"@sv ;
    dcterms:description "Flashcards: Spanska glosor."@en, "Kortlek: Spanska glosor."@sv`)}
${deck("deck-2", `dcterms:title "Huvudstader i Europa"@en ;
    dcterms:description "Capitals of Europe."@en, "Europas huvudstader."@sv ;
    dcterms:creator <#agent-anton> ;
    dcat:theme <https://pod.solid-memo.com/vocab/topics#geography> ;
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
      (name) => `https://pod.solid-memo.com/vocab/v1#${name}`,
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
      .filter((quad) => quad.predicate.value === "https://pod.solid-memo.com/vocab/v1#formatVersion")
      .map((quad) => [quad.subject.value.replace(container, "<instance>/"), quad.object.value]),
  );
}

/** The app as main.tsx wires it, over a fetch that records every request, with the shapes read from this repository. */
function app(pod: Pod, options: { failOn?: (request: Recorded) => boolean; onRequest?: (request: Recorded) => Promise<void> } = {}) {
  // The recording sits outside the fence: it sees what the app attempts, not only what gets through.
  const writeFence = createWriteFence(fetch);
  const attempts: Recorded[] = [];
  const attemptingFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    const recorded: Recorded = {
      method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
      url: request?.url ?? String(input),
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
    writeFence,
  });
  return { useCases, attempts, podFetch: attemptingFetch, session: { webId: pod.webId } };
}

/** Every resource under a container, ACL documents included, as the server serves it: bytes, type and ETag. */
async function snapshot(container: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visit = async (url: string) => {
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
const under = (container: string) => (request: Recorded) => decodeURI(new URL(request.url).href).startsWith(container);

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

async function registeredContainers(pod: Pod): Promise<string> {
  return triples(pod.typeIndex);
}

describe.each(SERVERS)("the format update on $name", ({ url: server }) => {
  /** What this server does with preconditions (preconditionsOf). */
  let conditional: Preconditions = { edits: false, creations: false };
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = await preconditionsOf(server);
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("writes nothing to the instance it updates: the copy is completed and checked before the type index moves", async () => {
    const pod = await seedPod(server);
    const before = await snapshot(pod.source);
    const indexBefore = await registeredContainers(pod);
    const { useCases, attempts, session } = app(pod);

    expect((await useCases.planMigration(pod.source)).deckCount).toBe(1);
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, backupUrl: pod.source });
    const target = (outcome as { instanceUrl: string }).instanceUrl;
    expect(target).toMatch(new RegExp(`^${pod.base}solid-memo/main-[0-9a-f-]{36}/$`));

    // Not one write was so much as attempted on the original…
    expect(attempts.filter(isWrite).filter(under(pod.source))).toEqual([]);
    // …which is byte for byte what it was, ACLs included.
    expect(await snapshot(pod.source)).toEqual(before);

    // Every write went to the copy, but for the type index; and the type index was written last.
    const writes = attempts.filter(isWrite);
    const indexWrites = writes.filter((request) => request.url === pod.typeIndex);
    expect(writes.filter((request) => !under(target)(request) && request.url !== pod.typeIndex)).toEqual([]);
    expect(indexWrites.length).toBeGreaterThan(0);
    const firstIndexWrite = attempts.indexOf(indexWrites[0]!);
    expect(attempts.slice(firstIndexWrite).filter(isWrite).every((request) => request.url === pod.typeIndex)).toBe(true);
    // The copy was checked in full before the switch: its documents were read after the last write to it.
    const lastCopyWrite = attempts.lastIndexOf(writes.filter(under(target)).at(-1)!);
    const checked = attempts.slice(lastCopyWrite, firstIndexWrite).filter((request) => request.method === "GET").map((r) => r.url);
    expect(checked).toEqual(expect.arrayContaining([`${target}meta.ttl`, `${target}catalog.ttl`, `${target}decks/deck-1.ttl`]));

    // Every write was conditional: a creation only where nothing was
    // (If-None-Match: *), an edit only of the version read (If-Match).
    for (const write of writes) {
      if (write.method === "PUT") expect(write.ifNoneMatch, `${write.method} ${write.url}`).toBe("*");
      if (write.method === "PATCH" && conditional.edits) expect(write.ifMatch, `${write.method} ${write.url}`).toMatch(/^"/);
    }
    // And the check that nothing changed asked the pod about each version
    // copied, which said 304; a server that ignores the condition (200)
    // says its ETag, which the copier compares instead.
    const verified = attempts.filter((r) => r.method === "HEAD" && r.ifNoneMatch !== null && r.ifNoneMatch !== "*");
    expect(verified.length).toBeGreaterThan(0);
    const unchanged = conditional.edits ? [304] : [200, 304];
    expect(verified.every((r) => unchanged.includes(r.status!) && under(pod.source)(r))).toBe(true);

    // The type index now names the copy, and the original is gone from it.
    const indexAfter = await registeredContainers(pod);
    expect(indexBefore).toContain(pod.source);
    expect(indexAfter).toContain(target);
    expect(indexAfter).not.toContain(`<${pod.source}>`);

    // The copy: updated, conforming, what it replaces recorded, the unknown file intact, access rebased.
    expect(await useCases.planMigration(target)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
    expect((await useCases.validateInstance(target)).conforms).toBe(true);
    expect(await triples(`${target}meta.ttl`)).toContain(`<http://purl.org/dc/terms/replaces> <${pod.source}>`);
    const picture: ArrayBuffer = await (await fetch(`${target}attachments/picture.png`)).arrayBuffer();
    expect(new Uint8Array(picture)).toEqual(PICTURE);
    for (const acl of [await aclOf(target), await aclOf(`${target}decks/deck-1.ttl`)]) {
      const text = await triples(acl);
      expect(text).toContain(FRIEND);
      expect(text).toContain(target);
      expect(text).not.toContain(pod.source);
    }
    expect(await fetch(await aclOf(`${target}reviews/deck-1.ttl`)).then((r) => r.status)).toBe(404);

    // The backup is the original; restoring it switches back and removes the copy.
    await expect(useCases.readBackup({ url: target, name: "Main" })).resolves.toMatchObject({ url: pod.source });
    await expect(useCases.restoreBackup(session, { url: target, name: "Main" })).resolves.toEqual(pod.instance);
    expect(await registeredContainers(pod)).toContain(pod.source);
    expect(await fetch(target).then((r) => r.status)).toBe(404);
    expect(await snapshot(pod.source)).toEqual(before);
  }, 60_000);

  it.each([
    // Format 4: decks and cards are outdated; at format 5 only the decks are.
    { format: 4 as const, cardCount: 4 },
    { format: 5 as const, cardCount: 0 },
  ])(
    "moves format-$format decks to format 6 and cards to 5 with their text unchanged: stand-ins, English-tagged Swedish, unstated sides and untagged keywords kept",
    async ({ format, cardCount }) => {
      const pod = await seedOldPod(server, format);
      const documents = (container: string) =>
        ["catalog.ttl", "decks/deck-1.ttl", "decks/deck-2.ttl"].map((path) => `${container}${path}`);
      const before = await snapshot(pod.source);
      const textBefore = await textOf(pod.source, documents(pod.source));
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
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, backupUrl: pod.source });
      const target = (outcome as { instanceUrl: string }).instanceUrl;

      // Every deck is at format 6 and every card at 5 (the creator and
      // distributions, unstamped before, at their first), conforming, with
      // nothing left to update…
      expect(await statedFormats(target, documents(target))).toEqual({
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
      expect((await useCases.validateInstance(target)).conforms).toBe(true);
      expect(await useCases.planMigration(target)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
      // …and its text is what it was, value for value and language for
      // language: nothing guessed, nothing dropped (identical English copies
      // stay, as text in each language; keywords stay untagged; the user
      // states unstated languages in the app).
      expect(await textOf(target, documents(target))).toEqual(textBefore);
      expect(textBefore).toEqual(
        expect.arrayContaining([
          '<instance>/catalog.ttl#deck-1 http://purl.org/dc/terms/title "Spanska glosor"@en',
          '<instance>/catalog.ttl#deck-1 http://purl.org/dc/terms/title "Spanska glosor"@sv',
          '<instance>/catalog.ttl#deck-2 http://purl.org/dc/terms/title "Huvudstader i Europa"@en',
          '<instance>/catalog.ttl#deck-2 http://www.w3.org/ns/dcat#keyword "capitals"@',
          '<instance>/catalog.ttl#deck-2 http://www.w3.org/ns/dcat#keyword "europe"@',
          '<instance>/decks/deck-1.ttl#sol https://pod.solid-memo.com/vocab/v1#frontNote "Masculine."@en',
          '<instance>/decks/deck-1.ttl#sol https://pod.solid-memo.com/vocab/v1#frontNote "Masculine."@sv',
          '<instance>/decks/deck-1.ttl#luna https://pod.solid-memo.com/vocab/v1#front "la luna"@',
          '<instance>/decks/deck-2.ttl#no https://pod.solid-memo.com/vocab/v1#back "Oslo"@',
        ]),
      );
      // The library copy still names its release, which later releases are compared with.
      expect(await triples(`${target}catalog.ttl`)).toContain(`<http://www.w3.org/ns/prov#wasDerivedFrom> <${RELEASE}>`);
      // The original is the untouched backup.
      expect(await snapshot(pod.source)).toEqual(before);
    },
    60_000,
  );

  it("refuses, in this tab, any write to the original while the update runs", async () => {
    const pod = await seedPod(server);
    let refused: unknown = null;
    let tried = false;
    const { useCases, session, podFetch } = app(pod, {
      onRequest: async (request) => {
        if (tried || !request.url.includes("/solid-memo/main-")) return;
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

  it.each([
    ["copying a document", (target: string) => (r: Recorded) => r.method === "PUT" && r.url === `${target}decks/deck-1.ttl`],
    // Its ACL, whatever the server names it: the one other resource written beside the document.
    ["copying access control", (target: string) => (r: Recorded) =>
      r.method === "PUT" && r.url.startsWith(`${target}decks/deck-1.ttl`) && r.url !== `${target}decks/deck-1.ttl`],
    ["updating the copy", (target: string) => (r: Recorded) => r.method === "PATCH" && r.url.startsWith(`${target}reviews/`)],
    ["switching the type index", () => (r: Recorded) => isWrite(r) && r.url.includes("/settings/")],
  ])("leaves no trace when %s fails", async (_what, failOn) => {
    const pod = await seedPod(server);
    const before = await snapshot(pod.source);
    const indexBefore = await registeredContainers(pod);
    let target = "";
    const { useCases, session, attempts } = app(pod, {
      failOn: (request) => {
        const staging = /^(.*\/solid-memo\/main-[0-9a-f-]{36}\/)/.exec(request.url)?.[1];
        if (staging !== undefined) target = staging;
        return target !== "" && failOn(target)(request);
      },
    });
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome).toMatchObject({ ok: false, cleanedUp: true });
    expect(target).not.toBe("");
    expect(attempts.filter(isWrite).filter(under(pod.source))).toEqual([]);
    expect(await snapshot(pod.source)).toEqual(before);
    expect(await registeredContainers(pod)).toBe(indexBefore);
    expect(await fetch(target).then((r) => r.status)).toBe(404);
  }, 60_000);

  it("gives up, and leaves no trace, when another app changes what was already copied", async (context) => {
    // The change is made in the same second as the copy, which such a server's ETag does not tell apart.
    if (conditional.edits && !everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const pod = await seedPod(server);
    const indexBefore = await registeredContainers(pod);
    let changed = false;
    const { useCases, session } = app(pod, {
      onRequest: async (request) => {
        // While the last document is copied, another tab studies: a write straight to the pod, which
        // this tab's fence knows nothing of, to a document the update has copied already.
        if (changed || !(isWrite(request) && /main-[0-9a-f-]{36}\/reviews\/deck-1\.ttl$/.test(request.url))) return;
        changed = true;
        await changeElsewhere(`${pod.source}decks/deck-1.ttl`, `<#se> <https://pod.solid-memo.com/vocab/v1#note> "studied in another tab" .`);
      },
    });
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(changed).toBe(true);
    expect(outcome).toMatchObject({ ok: false, step: "verify", cleanedUp: true });
    expect((outcome as { error: Error }).error).toMatchObject({ code: "resourceChangedDuringCopy" });
    expect((outcome as { error: Error }).error.message).toContain(`${pod.source}decks/deck-1.ttl`);
    expect(await registeredContainers(pod)).toBe(indexBefore);
    expect(await triples(`${pod.source}decks/deck-1.ttl`)).toContain("studied in another tab");
  }, 60_000);

  it("refuses a copy where something appeared meanwhile, where the server enforces If-None-Match, and leaves no trace", async (context) => {
    if (!conditional.creations) context.skip("this server ignores If-None-Match: *, so a document that appeared meanwhile cannot be detected");
    const pod = await seedPod(server);
    const before = await snapshot(pod.source);
    const indexBefore = await registeredContainers(pod);
    let squatted = "";
    const { useCases, session } = app(pod, {
      onRequest: async (request) => {
        const target = /^(.*\/solid-memo\/main-[0-9a-f-]{36}\/)catalog\.ttl$/.exec(request.url)?.[1];
        if (squatted !== "" || target === undefined || request.method !== "PUT") return;
        squatted = `${target}catalog.ttl`;
        await fetch(squatted, { method: "PUT", headers: { "content-type": "text/turtle" }, body: "<#x> <#y> <#z> ." });
      },
    });
    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome).toMatchObject({ ok: false, step: "copy", cleanedUp: true });
    expect((outcome as { error: Error }).error).toMatchObject({ code: "createdElsewhere" });
    expect((outcome as { error: Error }).error.message).toContain(squatted);
    expect(await snapshot(pod.source)).toEqual(before);
    expect(await registeredContainers(pod)).toBe(indexBefore);
  });

  it("updates a large deck in one write of the whole document, still only of the version read", async () => {
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
    const { useCases, attempts, session } = app(pod);

    const outcome = await useCases.updateInstance(session, pod.instance);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true });
    const target = (outcome as { instanceUrl: string }).instanceUrl;
    const deckWrites = attempts.filter(isWrite).filter((request) => request.url === `${target}decks/deck-1.ttl`);
    // The copy's creation, then the update: one PUT of the whole document, If-Match the version read.
    expect(deckWrites.map((request) => request.method)).toEqual(["PUT", "PUT"]);
    if (conditional.edits) expect(deckWrites[1]!.ifMatch).toMatch(/^"/);
    expect(await useCases.planMigration(target)).toMatchObject({ deckCount: 0, cardCount: 0, reviewCount: 0 });
    expect((await useCases.validateInstance(target)).conforms).toBe(true);
    expect(await triples(`${target}decks/deck-1.ttl`)).toContain(`<${target}decks/deck-1.ttl#card-599>`);
  });

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
        await changeElsewhere(`${pod.source}preferences.ttl`, `<#it> <https://pod.solid-memo.com/vocab/v1#note> "saved in another tab" .`);
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
