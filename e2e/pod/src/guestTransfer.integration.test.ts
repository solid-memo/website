// @vitest-environment node
/**
 * Keeping a guest's study (docs/guest-mode.md) against a real Solid server:
 * a guest studies in the pod kept on their device, then logs in and moves
 * their study into their pod on the server, as a new instance or added to
 * the instance they have, their drafts of releases copied with it —
 * through the app's own use cases and Solid
 * adapters, wired as in createAppUseCases: one fetch routed to the guest's pod or
 * the server by URL. Runs against each server globalSetup.ts starts.
 */
import { describe, expect, inject, it } from "vitest";
import { Parser, Writer } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import type { DeckLibrary } from "@solid-memo/application/ports";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import type { LibraryCard, LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidReleaseDraftRepository } from "@solid-memo/solid/solidReleaseDraftRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";

const SERVERS = inject("solidServers");

/** A course of one question in a library of its own, for a guest to start. */
const RELEASE = "https://solid-memo.test/decks/solid/v1.ttl";
const CHAPTER = `${RELEASE}#ch-linked-data`;
const question: LibraryCard = {
  id: "q-iri",
  front: { en: "What can an IRI name?" },
  back: { en: "Any thing at all" },
  formatVersion: 5,
  distractors: [{ id: "q-iri-d1", text: { en: "Only web pages" } }],
};
const content: LibraryDeckContent = {
  url: RELEASE,
  seriesUrl: librarySeriesUrlOf(RELEASE),
  title: { en: "Solid fundamentals" },
  description: { en: "Linked data, RDF and Solid." },
  formatVersion: 5,
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  version: "1",
  themes: [],
  keywords: {},
  cards: [question],
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
  cardCount: 1,
  authors: content.authors,
  direction: "front-to-back",
  sources: [],
  isCourse: true,
};
const library: DeckLibrary = {
  listLibraryDecks: async () => [course],
  fetchLibraryDeck: async () => content,
  fetchCourseOutline: async () => ({ releaseUrl: RELEASE, chapters: [] }),
  // The release check is the Studio's: no index is read here.
  readLibraryIndex: async () => ({ url: "https://site.example/decks/index.ttl", publisher: null, releases: [] }),
  // No release is added from a link here.
  readRelease: async (url) => {
    throw new Error(`No release is read from a link: ${url}`);
  },
  publishedBeside: async () => null,
};

/**
 * A user's empty pod in a fresh folder of the server: a profile naming its
 * storage and an empty private type index. The profile is card.ttl, not
 * card: servers that serve a document without an extension as
 * application/octet-stream (the JavaScript Solid Server, Solid-Nextcloud)
 * then serve it as Turtle, as their own profiles are.
 */
async function seedPod(server: string) {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card.ttl`,
    `<#me> a <http://xmlns.com/foaf/0.1/Person> ; <http://xmlns.com/foaf/0.1/name> "Alice" ;
    <http://www.w3.org/ns/pim/space#storage> <${base}> ;
    <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
  );
  return { base, session: { webId } };
}

/** The app as createAppUseCases wires it, its guest's pod in memory, the user's pod on the server. */
function app() {
  const guestStore = createMemoryResourceStore();
  const guestFetch = createLocalPod({ root: GUEST_ORIGIN, store: guestStore, newEtag: () => `"${crypto.randomUUID()}"` });
  const writeFence = createWriteFence(routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: fetch }));
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    deckLibrary: library,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    storageGateway: createSolidStorageGateway({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository({ fetch: podFetch, checkWrite, ...ids }),
    deckRepository: createSolidDeckRepository({ fetch: podFetch, checkWrite, ...ids }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    guestPod: createLocalGuestPod({ fetch: guestFetch, store: guestStore }),
    writeFence,
    releaseDraftRepository: createSolidReleaseDraftRepository({ fetch: podFetch, checkWrite }),
  });
  return { useCases, guestStore };
}

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
function nTriples(url: string, turtle: string): string {
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** Every resource below a container, as the server serves it. */
async function contents(container: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visit = async (url: string) => {
    const body = await (await fetch(url, { headers: { accept: "text/turtle" } })).text();
    result.set(url, body);
    if (!url.endsWith("/")) return;
    const children = [...body.matchAll(/<([^>]+)>/g)]
      .map((match) => new URL(match[1]!, url).href)
      .filter((child) => child.startsWith(url) && child !== url && !child.includes("#"));
    for (const child of [...new Set(children)].sort()) await visit(child);
  };
  await visit(container);
  return result;
}

describe.each(SERVERS)("a guest's study on $name", ({ url: server }) => {
  it("moves into the pod the guest logs in to, as theirs, and leaves the device", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(guestInstance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const now = new Date();
    const queue = await useCases.getStudyQueue(guestInstance!.url, deck, now);
    await useCases.recordReview(guestInstance!.url, deck, queue.newPrompts[0]!, 4, now);

    const [storage] = await useCases.listStorages(session);
    expect(storage!.url).toBe(base);
    const target = `${base}solid-memo/main/`;
    const outcome = await useCases.transferGuestStudy(session, guestInstance!, {
      containerUrl: target,
      registrationTarget: "private",
    });

    expect(outcome).toEqual({ ok: true, instance: { url: target, name: "My study" }, tidied: true });
    expect(await useCases.listInstances(session)).toEqual([{ url: target, name: "My study" }]);
    const [moved] = await useCases.listDecks(target);
    expect((await useCases.listCards(moved!)).map((card) => card.front)).toEqual([{ en: "Sweden" }]);
    expect((await useCases.getStudyQueue(target, moved!, now)).newPrompts).toEqual([]);
    expect((await useCases.getStatistics(target, now)).totals.answers).toBe(1);
    expect((await useCases.validateInstance(target)).conforms).toBe(true);
    const served = await contents(target);
    expect([...served.keys()].some((url) => url.endsWith("/history/"))).toBe(true);
    expect([...served].filter(([, body]) => body.includes(GUEST_ORIGIN)).map(([url]) => url)).toEqual([]);
    expect(nTriples(`${target}catalog.ttl`, served.get(`${target}catalog.ttl`)!)).toContain(
      `<${target}catalog.ttl#catalog> <http://purl.org/dc/terms/publisher> <${session.webId}> .`,
    );
    expect(await guestStore.urls()).toEqual([]);
  });

  it("leaves the guest's study as it was when the folder in the pod is taken", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const taken = `${base}solid-memo/main/`;
    const put = await fetch(`${taken}note.ttl`, { method: "PUT", headers: { "content-type": "text/turtle" }, body: "" });
    expect(put.ok).toBe(true);
    const before = (await guestStore.urls()).sort();

    const outcome = await useCases.transferGuestStudy(session, guestInstance!, {
      containerUrl: taken,
      registrationTarget: "private",
    });

    expect(outcome).toMatchObject({ ok: false, step: "stage", cleanedUp: true });
    expect((await guestStore.urls()).sort()).toEqual(before);
    expect(await useCases.listInstances(session)).toEqual([]);
    expect((await fetch(`${taken}note.ttl`)).ok).toBe(true);
  });

  it("adds the guest's decks to the instance the user has, each a new deck with its progress, and leaves the device", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    // The user's instance, with a deck and preferences of its own.
    const target = await useCases.createInstance(session, {
      containerUrl: `${base}solid-memo/main/`,
      name: "Main",
      registrationTarget: "private",
    });
    const mine = await useCases.createDeck(target.url, { en: "Mine" });
    const theirCourse = await useCases.startCourse(target.url, course);
    await useCases.savePreferences(target.url, { ...DEFAULT_PREFERENCES, newCardsPerDay: 7 });
    // The guest's: a deck with a card studied, and a course with its question answered and a chapter done, in a group.
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const capitals = await useCases.createDeck(guestInstance!.url, { en: "Capitals" });
    await useCases.addCard(capitals, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const now = new Date();
    const queue = await useCases.getStudyQueue(guestInstance!.url, capitals, now);
    await useCases.recordReview(guestInstance!.url, capitals, queue.newPrompts[0]!, 4, now);
    const started = await useCases.startCourse(guestInstance!.url, course);
    await useCases.answerCourseQuestion(guestInstance!.url, started, question, { correct: false, distractorId: "q-iri-d1" }, now);
    const guestCourse = await useCases.completeChapter(started, CHAPTER);
    await useCases.savePreferences(guestInstance!.url, { ...DEFAULT_PREFERENCES, newCardsPerDay: 3 });
    const group = useCases.newDeckGroup(guestInstance!.url, { en: "Learning" });
    await useCases.editDeckTree(guestInstance!.url, { kind: "combine", dragged: guestCourse.url, target: capitals.url, group });
    // The course the instance has too is added beside it, not merged into it.
    expect(await useCases.planGuestMerge(guestInstance!, target)).toEqual({
      decks: [
        { deck: expect.objectContaining({ url: capitals.url }), sameRelease: [] },
        { deck: expect.objectContaining({ url: guestCourse.url }), sameRelease: [expect.objectContaining({ url: theirCourse.url })] },
      ],
      drafts: 0,
    });

    const outcome = await useCases.mergeGuestStudy(session, guestInstance!, target);

    expect(outcome).toMatchObject({ ok: true, instance: target, tidied: true });
    const decks = await useCases.listDecks(target.url);
    expect(decks.map((deck) => deck.title.en).sort()).toEqual(["Capitals", "Mine", "Solid fundamentals", "Solid fundamentals"]);
    const addedCapitals = decks.find((deck) => deck.title.en === "Capitals")!;
    const addedCourse = decks.find((deck) => deck.title.en === "Solid fundamentals" && deck.url !== theirCourse.url)!;
    expect(outcome.ok && outcome.added.map((deck) => deck.url).sort()).toEqual([addedCapitals.url, addedCourse.url].sort());
    expect(addedCapitals.id).not.toBe(capitals.id);
    expect((await useCases.listCards(addedCapitals)).map((card) => card.front)).toEqual([{ en: "Sweden" }]);
    expect((await useCases.getStudyQueue(target.url, addedCapitals, now)).newPrompts).toEqual([]);
    expect(addedCourse).toMatchObject({ sourceUrl: RELEASE, completedChapters: [CHAPTER] });
    const [courseCard] = await useCases.listCards(addedCourse);
    expect(courseCard).toMatchObject({ id: "q-iri", url: `${addedCourse.cardsDocumentUrl}#q-iri`, distractors: question.distractors });
    expect((await useCases.getCourse(addedCourse)).answeredCardIds).toEqual(["q-iri"]);
    const statistics = await useCases.getStatistics(target.url, now);
    expect(statistics.totals.answers).toBe(2);
    expect((await useCases.getStatistics(target.url, now, { deckUrl: addedCourse.url })).totals.answers).toBe(1);
    // The instance's preferences stay; the guest's are not carried over.
    expect((await useCases.getPreferences(target.url)).newCardsPerDay).toBe(7);
    const tree = await useCases.listDeckTree(target.url);
    // Members without a position come in document order, which a server may serialise as it likes.
    const topLevel = tree.children.map((node) => (node.kind === "deck" ? node.deck.url : [node.group.title, node.children.length]));
    expect(topLevel).toHaveLength(3);
    expect(topLevel).toEqual(expect.arrayContaining([mine.url, theirCourse.url, [{ en: "Learning" }, 2]]));
    await expect(useCases.listCards(theirCourse)).resolves.toEqual([]);
    expect((await useCases.validateInstance(target.url)).conforms).toBe(true);
    const served = await contents(target.url);
    expect([...served].filter(([, body]) => body.includes(GUEST_ORIGIN)).map(([url]) => url)).toEqual([]);
    // The links other apps follow: a review state to its card, a cards document to its deck, a card to its options.
    const reviews = nTriples(addedCourse.reviewsDocumentUrl, served.get(addedCourse.reviewsDocumentUrl)!);
    expect(reviews).toContain(
      `<${addedCourse.reviewsDocumentUrl}#q-iri> <https://solid-memo.com/ns/vocab/v1.ttl#reviewOf> <${addedCourse.cardsDocumentUrl}#q-iri> .`,
    );
    const cards = nTriples(addedCourse.cardsDocumentUrl, served.get(addedCourse.cardsDocumentUrl)!);
    expect(cards).toContain(`<${addedCourse.cardsDocumentUrl}> <http://purl.org/dc/terms/isPartOf> <${addedCourse.url}> .`);
    expect(cards).toContain(
      `<${addedCourse.cardsDocumentUrl}#q-iri> <https://schema.org/suggestedAnswer> <${addedCourse.cardsDocumentUrl}#q-iri-d1> .`,
    );
    expect(await useCases.listInstances(session)).toEqual([target]);
    expect(await guestStore.urls()).toEqual([]);
  });

  it("copies the guest's drafts to the instance the user has, never over one of its own", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    const target = await useCases.createInstance(session, {
      containerUrl: `${base}solid-memo/main/`,
      name: "Main",
      registrationTarget: "private",
    });
    // The instance has a draft of the name the guest's will want.
    const theirs = await useCases.createReleaseDraft(target.url, { kind: "blankCourse", title: { en: "Solid" } });
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const written = await useCases.createReleaseDraft(guestInstance!.url, { kind: "blankCourse", title: { en: "Solid" } });
    await useCases.editReleaseDraft(written!.draft.url, [
      { kind: "addChapter", id: "ch-a", text: { title: { en: "A" } } },
      { kind: "addStep", id: "ch-a-1", chapter: "ch-a", text: { theory: { en: "Pods hold data." } } },
      { kind: "addCard", id: "q-a-1a", card: { front: { en: "What holds data?" }, back: { en: "A pod" } } },
      { kind: "addQuestion", card: "q-a-1a", place: { kind: "step", step: "ch-a-1" } },
    ]);
    expect(await useCases.planGuestMerge(guestInstance!, target)).toEqual({ decks: [], drafts: 1 });

    const outcome = await useCases.mergeGuestStudy(session, guestInstance!, target);

    expect(outcome).toMatchObject({ ok: true, instance: target, tidied: true });
    const drafts = await useCases.listReleaseDrafts(target.url);
    expect(drafts.map((draft) => draft.name).sort()).toEqual(["solid", "solid-2"]);
    const copy = await useCases.getReleaseDraft(draftUrlOf(target.url, "solid-2", 1));
    expect(copy.chapters.map((node) => node.id)).toEqual(["ch-a"]);
    expect(copy.steps.map((node) => node.data.theory)).toEqual([{ en: "Pods hold data." }]);
    expect(copy.steps[0]!.data.checkedBy).toEqual([`${copy.url}#q-a-1a`]);
    expect(copy.cards.map((node) => node.data.front)).toEqual([{ en: "What holds data?" }]);
    // The instance's own draft is as it was.
    expect((await useCases.getReleaseDraft(theirs!.draft.url)).chapters).toEqual([]);
    expect((await useCases.validateInstance(target.url)).conforms).toBe(true);
    const served = await contents(target.url);
    expect([...served].filter(([, body]) => body.includes(GUEST_ORIGIN)).map(([url]) => url)).toEqual([]);
    expect(await guestStore.urls()).toEqual([]);
  });
});
