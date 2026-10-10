// @vitest-environment node
/**
 * A course against a real Solid server (docs/courses.md): the app's own
 * use cases and Solid adapters, wired as in createAppUseCases, every write checked
 * against the shapes. Starting a course makes an empty deck; answering a
 * step's question writes its card, with its distractors, and its first
 * review state, and logs a multiple-choice answer; completing a chapter
 * notes it on the deck's catalog entry. Runs against each server
 * globalSetup.ts starts.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import type { DeckLibrary } from "@solid-memo/application/ports";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { LibraryCard, LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";

const SERVERS = inject("solidServers");
const RELEASE = "https://solid-memo.test/decks/solid/v1.ttl";
const at = (id: string) => `${RELEASE}#${id}`;

const question = (id: string, back: string, wrong: string[]): LibraryCard => ({
  id,
  front: { en: `${id}?` },
  back: { en: back },
  backNote: { en: "Why it is so." },
  formatVersion: 5,
  distractors: wrong.map((text, i) => ({ id: `${id}-d${i + 1}`, text: { en: text }, note: { en: `Not ${text}.` } })),
});

const cards = [
  question("q-iri", "Any thing at all", ["Only web pages", "Only people"]),
  question("q-triple", "Subject, predicate, object", ["Key and value", "Row and column"]),
];

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
  keywords: { en: ["solid"] },
  cards,
  isCourse: true,
};

const outline: CourseOutline = {
  releaseUrl: RELEASE,
  chapters: [
    {
      id: "ch-linked-data",
      url: at("ch-linked-data"),
      position: 0,
      title: { en: "Linked data and IRIs" },
      steps: [{ id: "ch-linked-data-1", url: at("ch-linked-data-1"), position: 0, theory: { en: "IRIs name things." }, questionIds: ["q-iri"] }],
      reviewQuestionIds: [],
    },
    {
      id: "ch-rdf",
      url: at("ch-rdf"),
      position: 1,
      title: { en: "RDF and Turtle" },
      steps: [{ id: "ch-rdf-1", url: at("ch-rdf-1"), position: 0, theory: { en: "RDF is triples." }, questionIds: ["q-triple"] }],
      reviewQuestionIds: [],
    },
  ],
};

const course: LibraryDeck = {
  url: RELEASE,
  seriesUrl: content.seriesUrl,
  version: "1",
  releases: [{ url: RELEASE, version: "1" }],
  themes: [],
  keywords: content.keywords,
  title: content.title,
  cardCount: cards.length,
  authors: content.authors,
  direction: "front-to-back",
  sources: [],
  isCourse: true,
};

const library: DeckLibrary = {
  listLibraryDecks: async () => [course],
  fetchLibraryDeck: async () => content,
  fetchCourseOutline: async () => outline,
  // The release check is the Studio's: no index is read here.
  readLibraryIndex: async () => ({ url: "https://site.example/decks/index.ttl", publisher: null, releases: [] }),
};

/** The app as createAppUseCases wires it, every write checked against the shapes read from this repository. */
function app() {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  const deckRepository = createSolidDeckRepository(deps);
  const reviewStateRepository = createSolidReviewStateRepository(deps);
  const answerLog = createSolidAnswerLog({ fetch, checkWrite });
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: library,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository,
    preferencesRepository: createSolidPreferencesRepository(deps),
    reviewStateRepository,
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch }),
    instanceCopier: createSolidInstanceCopier({ fetch }),
    answerLog,
  });
  return { useCases, deckRepository, reviewStateRepository, answerLog };
}

describe.each(SERVERS)("a course on $name", ({ url: server }) => {
  it("starts with an empty deck, and adds a card, its distractors and its review state when its question is answered", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const { useCases, deckRepository, reviewStateRepository, answerLog } = app();
    const deck = await useCases.startCourse(instanceUrl, course);
    expect(deck).toMatchObject({ sourceUrl: RELEASE, title: content.title });
    await expect(deckRepository.listCards(deck)).resolves.toEqual([]);
    // Started once: starting again returns the same deck.
    await expect(useCases.startCourse(instanceUrl, course)).resolves.toMatchObject({ url: deck.url });

    const now = new Date();
    const answered = await useCases.answerCourseQuestion(
      instanceUrl,
      deck,
      cards[0]!,
      { correct: false, distractorId: "q-iri-d1" },
      now,
    );
    expect(answered).toMatchObject({ effect: "introduce", state: { cardId: "q-iri", repetitions: 0, intervalDays: 1 } });

    const [card] = await deckRepository.listCards(deck);
    expect(card).toMatchObject({
      id: "q-iri",
      url: `${deck.cardsDocumentUrl}#q-iri`,
      back: { en: "Any thing at all" },
      distractors: cards[0]!.distractors,
    });
    await expect(reviewStateRepository.getReviewState(deck, { cardId: "q-iri", direction: "front-to-back" })).resolves.toEqual(
      answered.state,
    );

    // The answer reaches the log once the session's answers are flushed.
    await useCases.refreshStudyDigest(instanceUrl, deck);
    const months = await answerLog.months(instanceUrl);
    const logged = (await Promise.all(months.map((month) => answerLog.readMonth(instanceUrl, month)))).flat();
    expect(logged).toEqual([
      expect.objectContaining({
        cardUrl: card!.url,
        grade: 1,
        mode: "multiple-choice",
        chosenDistractor: `${deck.cardsDocumentUrl}#q-iri-d1`,
      }),
    ]);

    // The step is done; study finds nothing new, the card being due tomorrow.
    const progress = (await useCases.getCourse(deck)).progress;
    expect(progress.chapters[0]).toMatchObject({ state: "open", doneStepIds: ["ch-linked-data-1"] });
    await expect(useCases.getStudyQueue(instanceUrl, deck, now)).resolves.toMatchObject({ due: [], newPrompts: [] });
  });

  it("notes a chapter completed on the deck's catalog entry, unlocking the next", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const { useCases, deckRepository } = app();
    const deck = await useCases.startCourse(instanceUrl, course);
    const done = await useCases.completeChapter(deck, at("ch-linked-data"));
    expect(done.completedChapters).toEqual([at("ch-linked-data")]);
    await expect(deckRepository.readDeck(deck.url)).resolves.toMatchObject({ completedChapters: [at("ch-linked-data")] });
    const progress = (await useCases.getCourse(deck)).progress;
    expect(progress.chapters.map((chapter) => chapter.state)).toEqual(["done", "open"]);
    // The entry keeps it through an ordinary write of the deck.
    await useCases.renameDeck(done, { en: "Solid, mine" });
    await expect(deckRepository.readDeck(deck.url)).resolves.toMatchObject({
      title: { en: "Solid, mine" },
      completedChapters: [at("ch-linked-data")],
    });
  });
});
