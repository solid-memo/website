// @vitest-environment node
/**
 * The Studio's edits of metadata against a real Solid server: an
 * instance renamed everywhere its name is kept (its meta document, its
 * catalogue and both of its type index registrations), its catalogue
 * described, a deck given authors and a licence, and a course's
 * chapters completed changed. Every write is checked against the shapes,
 * and the instance stays valid. A change made elsewhere meanwhile is
 * kept: the edit is read and made again (where the server enforces
 * If-Match, preconditionsOf). Runs against each server globalSetup.ts
 * starts.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { Parser } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import type { DeckLibrary } from "@solid-memo/application/ports";
import { defaultCatalogDescription } from "@solid-memo/domain/catalog";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { changeElsewhere, ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, preconditionsOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const TITLE = "http://purl.org/dc/terms/title";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY = "https://creativecommons.org/licenses/by/4.0/";
const RELEASE = "https://solid-memo.test/decks/metadata/v1.ttl";
const at = (id: string) => `${RELEASE}#${id}`;

const chapter = (id: string, position: number): CourseOutline["chapters"][number] => ({
  id,
  url: at(id),
  position,
  title: { en: id },
  steps: [],
  reviewQuestionIds: [],
});

const content: LibraryDeckContent = {
  url: RELEASE,
  seriesUrl: librarySeriesUrlOf(RELEASE),
  title: { en: "A course" },
  description: { en: "Two chapters." },
  formatVersion: 5,
  authors: [],
  direction: "front-to-back",
  version: "1",
  themes: [],
  keywords: {},
  cards: [],
  isCourse: true,
};

const course: LibraryDeck = {
  url: RELEASE,
  seriesUrl: content.seriesUrl,
  version: "1",
  releases: [{ url: RELEASE, version: "1" }],
  themes: [],
  keywords: {},
  title: content.title,
  cardCount: 0,
  authors: [],
  direction: "front-to-back",
  sources: [],
  isCourse: true,
};

const library: DeckLibrary = {
  listLibraryDecks: async () => [course],
  fetchLibraryDeck: async () => content,
  fetchCourseOutline: async () => ({ releaseUrl: RELEASE, chapters: [chapter("ch-1", 0), chapter("ch-2", 1)] }),
  // The release check is the Studio's: no index is read here.
  readLibraryIndex: async () => ({ url: "https://site.example/decks/index.ttl", publisher: null, releases: [] }),
  // No release is added from a link here.
  readRelease: async (url) => {
    throw new Error(`No release is read from a link: ${url}`);
  },
  publishedBeside: async () => null,
};

/** The app as createAppUseCases wires it; `beforeWrite` runs before each write it makes. */
function page(beforeWrite: (url: string) => Promise<void> = async () => undefined) {
  const watching: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT" || method === "PATCH") await beforeWrite(String(input));
    return fetch(input, init);
  };
  const shapeValidator = createShaclShapeValidator({ fetch: watching, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: watching, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: library,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: watching }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository(deps),
    reviewStateRepository: createSolidReviewStateRepository(deps),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: watching }),
    instanceCopier: createSolidInstanceCopier({ fetch: watching }),
  });
}

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

/** A user with a private type index of their own, and an instance "Main" registered in it. */
async function seed(server: string) {
  const base = new URL(`metadata-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const session = { webId };
  const instance = await page().createInstance(session, { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
  return { session, instance, typeIndex };
}

/** The titles a document states, of any subject. */
async function titlesIn(url: string): Promise<string[]> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Parser({ baseIRI: url })
    .parse(turtle)
    .filter((quad) => quad.predicate.value === TITLE)
    .map((quad) => quad.object.value);
}

describe.each(SERVERS)("metadata on $name", ({ url: server }) => {
  /** Whether this server refuses an edit whose If-Match names another version. */
  let conditional = false;
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = (await preconditionsOf(server)).edits;
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("renames an instance in its meta document, its catalogue and every type index registration of its data", async () => {
    const { session, instance, typeIndex } = await seed(server);
    const useCases = page();
    // One registration for each class of the instance's data, all in the private index.
    expect(await titlesIn(typeIndex)).toEqual(Array(7).fill("Main"));

    await expect(useCases.renameInstance(session, instance, " Languages ")).resolves.toEqual({ ...instance, name: "Languages" });

    expect(await titlesIn(typeIndex)).toEqual(Array(7).fill("Languages"));
    await expect(useCases.listInstances(session)).resolves.toEqual([{ ...instance, name: "Languages" }]);
    expect(await titlesIn(`${instance.url}meta.ttl`)).toEqual(["Languages"]);
    await expect(useCases.readCatalog(instance.url)).resolves.toMatchObject({
      title: "Languages",
      description: defaultCatalogDescription("Languages"),
    });
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
  });

  it("describes the catalogue, its licence a licence document, as DCAT-AP asks, and changes it", async () => {
    const { instance } = await seed(server);
    const useCases = page();
    await expect(useCases.describeCatalog(instance.url, { description: "Decks I share.", license: CC0 })).resolves.toMatchObject({
      description: "Decks I share.",
      license: CC0,
    });
    await expect(page().readCatalog(instance.url)).resolves.toMatchObject({ description: "Decks I share.", license: CC0 });
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);

    await useCases.describeCatalog(instance.url, { description: "Decks I share.", license: BY });
    const catalog = await fetch(`${instance.url}catalog.ttl`).then((response) => response.text());
    expect(catalog).not.toContain(CC0);
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
  });

  it("describes the catalogue again when another app changed it meanwhile, keeping that change", async (context) => {
    if (!conditional) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    // The change is made in the same second as the read, which such a server's ETag does not tell apart.
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const { instance } = await seed(server);
    const catalogUrl = `${instance.url}catalog.ttl`;
    let changed = false;
    const useCases = page(async (url) => {
      if (url !== catalogUrl || changed) return;
      changed = true;
      await changeElsewhere(catalogUrl, `<#note> <http://www.w3.org/2000/01/rdf-schema#comment> "another app" .`);
    });
    await useCases.describeCatalog(instance.url, { description: "Decks I share." });
    await expect(page().readCatalog(instance.url)).resolves.toMatchObject({ description: "Decks I share." });
    expect(await fetch(catalogUrl).then((response) => response.text())).toContain("another app");
  });

  it("gives a deck its authors and licence, an author dropped leaving no agent behind", async () => {
    const { instance } = await seed(server);
    const useCases = page();
    const deck = await useCases.createDeck(instance.url, { en: "Birds" });

    await useCases.setDeckProvenance(deck, { authors: ["Ada Lovelace <ada@example.org>", "Alan Turing"], license: BY });
    await expect(useCases.listDecks(instance.url)).resolves.toEqual([
      expect.objectContaining({ authors: ["Ada Lovelace <ada@example.org>", "Alan Turing"], license: BY }),
    ]);
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);

    await useCases.setDeckProvenance(deck, { authors: ["Ada Lovelace <ada@example.org>"] });
    const [written] = await useCases.listDecks(instance.url);
    expect(written).toMatchObject({ authors: ["Ada Lovelace <ada@example.org>"] });
    expect(written).not.toHaveProperty("license");
    expect(await fetch(`${instance.url}catalog.ttl`).then((response) => response.text())).not.toContain("Alan Turing");
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
  });

  it("marks a course's chapter not done, and restarts the course", async () => {
    const { instance } = await seed(server);
    const useCases = page();
    const started = await useCases.startCourse(instance.url, course);
    await useCases.completeChapter(started, at("ch-1"));
    const deck = await useCases.completeChapter(started, at("ch-2"));

    await expect(useCases.setCompletedChapters(deck, { kind: "notDone", chapterUrl: at("ch-1") })).resolves.toMatchObject({
      completedChapters: [at("ch-2")],
    });
    expect((await useCases.getCourse(deck)).progress.chapters.map((chapter) => chapter.state)).toEqual(["open", "done"]);
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);

    await useCases.setCompletedChapters(deck, { kind: "restart" });
    expect((await useCases.getCourse(deck)).deck).not.toHaveProperty("completedChapters");
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
  });
});
