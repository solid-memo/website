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
 * same address is refused, and leaves the release as it was. The tests
 * are anonymous, as the servers let anyone write: "no login" is what
 * the release's own access control says, which the publishing wrote.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch, SITE } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import { releasesContainerOf, releaseUrlIn } from "@solid-memo/domain/release/releasePlace";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
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
    deckLibrary: undefined as never,
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
