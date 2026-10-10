// @vitest-environment node
/**
 * Publishing a release (docs/studio.md#publishing-a-release) against a
 * real Solid server: the next version of a library deck drafted in the
 * instance, checked, and published in the instance's releases folder,
 * one Turtle document. Someone with no login can then read it, as the
 * access control the server has (its own ACL on a server with Web
 * Access Control, its ACR on one with Access Control Policies) now says
 * of that document alone; the catalogue lists it; the draft is released,
 * and changes no more. Publishing it again, or anything else, at the
 * same address is refused, and leaves the release as it was. A learner
 * adds the release from its link, and finds the next version published
 * beside it (docs/deck-library.md#from-a-link). The tests are anonymous,
 * as the servers let anyone write: "no login" is what the release's own
 * access control says, which the publishing wrote.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch, SITE } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import { releasesContainerOf, releaseUrlIn } from "@solid-memo/domain/release/releasePlace";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckLibrary } from "@solid-memo/solid/solidDeckLibrary";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidReleaseDraftRepository } from "@solid-memo/solid/solidReleaseDraftRepository";
import { createSolidReleasePublisher } from "@solid-memo/solid/solidReleasePublisher";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";

/** A Markdown check that finds nothing, each text one chunk: what these tests publish is plain text. */
const NO_MARKDOWN_PROBLEMS = { problems: () => [], chunks: () => ({ chunks: 1, empty: 0 }) };

const SERVERS = inject("solidServers");
const STARS = `${SITE}decks/brightest-stars/v1.ttl`;

/** A page of the app as createAppUseCases wires it, every pod request through `fetch`, the library read from this repository. */
function page(fetch: typeof globalThis.fetch = globalThis.fetch) {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    // The site's library from this repository; any other release where it is published, read as anyone.
    deckLibrary: createSolidDeckLibrary({
      fetch: routedFetch({ origin: SITE, local: shapesFetch, remote: globalThis.fetch }),
      indexUrl: `${SITE}decks/index.ttl`,
    }),
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch, checkWrite }),
    shapeValidator,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    ruleset: "e2e-rules",
    releaseDraftRepository: createSolidReleaseDraftRepository({
      fetch,
      releaseFetch: routedFetch({ origin: SITE, local: shapesFetch, remote: fetch }),
      checkWrite,
    }),
    releasePublisher: createSolidReleasePublisher({ fetch, publicFetch: fetch }),
  });
}

/**
 * Version `version` of a deck of capitals published in a pod, whole
 * without an index, its series described in it and named after its
 * first version, `v1`: its text ASCII, as the in-memory stores keep a
 * document PATCHed with other text whole only by chance (testing.md).
 */
function capitals(v1: string, version: 1 | 2): string {
  const url = version === 1 ? v1 : v1.replace(/v1\.ttl$/, "v2.ttl");
  const earlier = version === 1 ? "" : `<${v1}> a dcat:Dataset ; dcterms:title "Capitals"@en ; dcterms:description "Capitals of the world."@en ; dcat:version "1" .`;
  return `@base <${url}> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix adms: <http://www.w3.org/ns/adms#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "Capitals"@en ; dcterms:description "Capitals of the world."@en ;
  dcterms:creator <#alice> ; dcterms:publisher <#alice> ;
  dcterms:license <https://creativecommons.org/publicdomain/zero/1.0/> ;
  dcterms:issued "2026-10-10T10:00:00Z"^^xsd:dateTime ;
  sm:studyDirection sm:frontToBack ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ;
  dcat:keyword "capitals"@en ;
  dcterms:language <http://publications.europa.eu/resource/authority/language/ENG> ;
  dcat:version "${version}" ;
  ${version === 1 ? "" : `dcat:prev <${v1}> ; dcat:previousVersion <${v1}> ; adms:versionNotes "Added Norway." ;`}
  dcat:inSeries <${v1}#series> ; dcat:isVersionOf <${v1}#series> ;
  dcat:distribution <#turtle> .
<${v1}#series> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
  dcterms:title "Capitals"@en ; dcterms:description "Capitals of the world."@en ; dcterms:publisher <#alice> ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ; dcat:keyword "capitals"@en ;
  dcat:first <${v1}> ; dcat:last <> ; dcat:hasVersion <${v1}>, <> ; dcat:hasCurrentVersion <> .
${earlier}
<#alice> a foaf:Agent ; foaf:name "Alice" .
<#turtle> a dcat:Distribution ; dcat:accessURL <> ; dcat:downloadURL <> ; dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .
<https://creativecommons.org/publicdomain/zero/1.0/> a dcterms:LicenseDocument .
<#se> a sm:Card ; sm:formatVersion 5 ; sm:front "Sweden"@en ; sm:back "Stockholm"@en .
${version === 1 ? "" : `<#no> a sm:Card ; sm:formatVersion 5 ; sm:front "Norway"@en ; sm:back "Oslo"@en .`}
`;
}

/** A user with a private type index and an instance, in a fresh folder of the server. */
async function seed(server: string) {
  const base = new URL(`releases-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  return page().createInstance({ webId }, { containerUrl: `${base}main/`, name: "Main", registrationTarget: "private" });
}

/** What the access control of the document says, as its server links it (rel="acl"): its own ACL, or its ACR. */
async function accessControlOf(url: string): Promise<string> {
  const links = (await fetch(url, { method: "HEAD" })).headers.get("link") ?? "";
  const acl = /<([^>]+)>\s*;\s*rel="acl"/.exec(links)?.[1];
  if (acl === undefined) throw new Error(`${url} links no access control`);
  const response = await fetch(new URL(acl, url), { headers: { accept: "text/turtle" } });
  if (!response.ok) throw new Error(`${acl}: ${response.status}`);
  return response.text();
}

describe.each(SERVERS)("releases on $name", ({ url: server }) => {
  it("publishes a draft as one document anyone can read, lists it, freezes the draft, and never writes over it", { timeout: 180_000 }, async () => {
    const instance = await seed(server);
    const useCases = page();
    const made = await useCases.createReleaseDraft(instance.url, { kind: "nextVersionOf", url: STARS });
    const draftUrl = made!.draft.url;
    const target = releaseUrlIn(releasesContainerOf(instance.url), "brightest-stars", 2);

    const published = await useCases.publishRelease(draftUrl, target, NO_MARKDOWN_PROBLEMS);
    expect(published).toEqual({ url: target, public: true });

    // Someone with no login reads it, as its own access control now says: of that document alone.
    const read = await fetch(target, { headers: { accept: "text/turtle" } });
    expect(read.status).toBe(200);
    const text = await read.text();
    expect(text).toContain(`@base <${target}>`);
    const access = await accessControlOf(target);
    expect(access).toMatch(/xmlns\.com\/foaf\/0\.1\/Agent|foaf:Agent|acp#PublicAgent|acp:PublicAgent/);
    expect(await useCases.isReleasePublic(target)).toBe(true);
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([{ url: target, public: true }]);

    // The draft is released, and changes no more.
    const draft = await useCases.getReleaseDraft(draftUrl);
    expect(draft.root.releasedAs).toBe(target);
    await expect(useCases.editReleaseDraft(draftUrl, [{ kind: "setMeta", meta: { versionNotes: "Later." } }])).resolves.toEqual({
      ok: false,
      refusal: { refused: "released" },
    });
    await expect(useCases.publishRelease(draftUrl, target, NO_MARKDOWN_PROBLEMS)).rejects.toMatchObject({ code: "draftReleased" });

    // Another draft published at the same address is refused, and the release is as it was.
    const other = await useCases.createReleaseDraft(instance.url, { kind: "nextVersionOf", url: STARS });
    await expect(useCases.publishRelease(other!.draft.url, target, NO_MARKDOWN_PROBLEMS)).rejects.toMatchObject({ code: "releaseTaken", vars: { url: target } });
    expect(await (await fetch(target, { headers: { accept: "text/turtle" } })).text()).toBe(text);
    expect((await useCases.getReleaseDraft(other!.draft.url)).root.releasedAs).toBeUndefined();
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([{ url: target, public: true }]);
  });

  it("lets a learner add a release from its link, and finds its next version in the catalogue that published it", { timeout: 300_000 }, async () => {
    const creator = await seed(server);
    const learner = await seed(server);
    const useCases = page();
    const publisher = createSolidReleasePublisher({ fetch, publicFetch: fetch });
    const v1 = releaseUrlIn(releasesContainerOf(creator.url), "capitals", 1);
    const v2 = releaseUrlIn(releasesContainerOf(creator.url), "capitals", 2);
    await publisher.publish(creator.url, capitals(v1, 1), v1);

    // Read from its link, as anyone reads it, and checked against the library's shapes: then added as the library's are.
    const release = await useCases.readReleaseFromLink(v1);
    expect(release).toMatchObject({ url: v1, seriesUrl: `${v1}#series`, version: "1", title: { en: "Capitals" }, cardCount: 1, authors: ["Alice"] });
    const copy = await useCases.importReleaseFromUrl(learner.url, release);
    expect(copy.sourceUrl).toBe(v1);
    expect((await useCases.listCards(copy)).map((card) => card.id)).toEqual(["se"]);

    // The creator's catalogue, readable here, lists what its instance published: none newer yet, then version 2.
    const listed = async () =>
      (await useCases.listLibraryUpdates(learner.url)).map(({ series, version, newer, fromLink }) => ({ series: series?.url, version, newer, fromLink }));
    expect(await listed()).toEqual([{ series: v1, version: "1", newer: false, fromLink: true }]);
    await publisher.publish(creator.url, capitals(v1, 2), v2);
    expect(await listed()).toEqual([{ series: v2, version: "1", newer: true, fromLink: true }]);
    await expect(useCases.planLibraryUpgrade(copy)).resolves.toMatchObject({ fromVersion: "1", toVersion: "2", releaseUrl: v2, add: [{ id: "no" }] });
  });

  it("finishes a publishing cut short by publishing again, and keeps the release when the instance is deleted", { timeout: 180_000 }, async () => {
    const instance = await seed(server);
    const made = await page().createReleaseDraft(instance.url, { kind: "nextVersionOf", url: STARS });
    const draftUrl = made!.draft.url;
    const target = releaseUrlIn(releasesContainerOf(instance.url), "brightest-stars", 2);

    // The catalogue's link refused, once the release is written: the draft is left as it was.
    const catalog = `${instance.url}catalog.ttl`;
    const cut: typeof globalThis.fetch = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      return String(input) === catalog && method !== "GET" && method !== "HEAD" ? new Response("refused", { status: 500 }) : fetch(input, init);
    };
    await expect(page(cut).publishRelease(draftUrl, target, NO_MARKDOWN_PROBLEMS)).rejects.toThrow();
    expect((await fetch(target, { method: "HEAD" })).ok).toBe(true);
    const useCases = page();
    expect((await useCases.getReleaseDraft(draftUrl)).root.releasedAs).toBeUndefined();
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([]);

    // Published again, at the same address: the release there is this one, finished.
    await expect(useCases.publishRelease(draftUrl, target, NO_MARKDOWN_PROBLEMS)).resolves.toEqual({ url: target, public: true });
    expect((await useCases.getReleaseDraft(draftUrl)).root.releasedAs).toBe(target);
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([{ url: target, public: true }]);

    // Deleting the instance keeps the release, and its folder, and says so.
    const webId = new URL("../profile/card.ttl#me", instance.url).href;
    await expect(useCases.deleteInstance({ webId }, instance)).resolves.toEqual({ keptFolder: instance.url, keptReleases: true });
    expect((await fetch(target, { headers: { accept: "text/turtle" } })).status).toBe(200);
  });
});
