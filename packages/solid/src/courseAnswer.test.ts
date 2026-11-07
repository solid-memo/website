// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Answering a course's question for a card the deck already has, through
 * the app's own use cases and Solid adapters over a pod in memory: what
 * the learner made of the card stays (docs/courses.md).
 */
import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LibraryCard, LibraryDeckContent } from "@solid-memo/domain/library";
import { planLibraryUpgrade } from "@solid-memo/domain/libraryUpgrade";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { createSolidAnswerLog } from "./solidAnswerLog";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const RELEASE = "https://course.example/releases/1.0.0.ttl";
const NOON = new Date("2026-11-06T12:00:00.000Z");

const course: Deck = {
  id: "course",
  url: `${INSTANCE}catalog.ttl#course`,
  title: { en: "A course" },
  cardsDocumentUrl: `${INSTANCE}decks/course.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/course.ttl`,
  createdAt: "2026-01-01T00:00:00.000Z",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
  sourceUrl: RELEASE,
};

/** The release's question at the id the deck's card may have too. */
const question: LibraryCard = {
  id: "shared",
  front: { en: "The release's front" },
  back: { en: "The release's back" },
  distractors: [{ id: "shared-wrong", text: { en: "The release's wrong option" } }],
  formatVersion: 7,
};

const releaseOf = (url: string, version: string, cards: LibraryCard[]): LibraryDeckContent => ({
  ...firstRelease(RELEASE),
  url,
  version,
  title: course.title,
  formatVersion: 7,
  authors: [],
  direction: "front-to-back",
  cards,
});

function app() {
  const pod = fakePod();
  const ids = { now: () => NOON, randomId: () => crypto.randomUUID() };
  const deckRepository = createSolidDeckRepository({ fetch: pod.fetch, ...ids });
  const useCases = createUseCases({
    ...NO_PORTS,
    sessionGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: undefined as never,
    storageGateway: undefined as never,
    instanceRepository: undefined as never,
    deckRepository,
    preferencesRepository: createSolidPreferencesRepository({ fetch: pod.fetch }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: pod.fetch }),
    shapeValidator: undefined as never,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    answerLog: createSolidAnswerLog({ fetch: pod.fetch }),
  });
  const answer = () =>
    useCases.answerCourseQuestion(INSTANCE, course, question, { correct: true }, NOON);
  const theCard = async (): Promise<Card> => {
    const cards = await deckRepository.listCards(course);
    expect(cards.map((card) => card.id)).toEqual(["shared"]);
    return cards[0]!;
  };
  return { pod, deckRepository, useCases, answer, theCard };
}

const stateOf = (useCases: ReturnType<typeof app>["useCases"]) =>
  useCases.getStudyQueue(INSTANCE, course, NOON);

describe("answering a course question", () => {
  it("writes a card the deck does not have, naming the release", async () => {
    const { answer, theCard } = app();
    await expect(answer()).resolves.toMatchObject({ effect: "introduce" });
    expect(await theCard()).toMatchObject({
      front: question.front,
      back: question.back,
      distractors: question.distractors,
      fromRelease: RELEASE,
    });
  });

  it("grades a card of the user's at that id as it stands, and a later release leaves it", async () => {
    const { deckRepository, answer, theCard, pod } = app();
    const mine = {
      id: "shared",
      front: { en: "My front" },
      back: { en: "My back" },
      distractors: [{ id: "my-wrong", text: { en: "My wrong option" } }],
    };
    await deckRepository.applyCardChanges(course, { save: [mine], remove: [] });
    const before = await theCard();
    const cardTriples = pod.triples(course.cardsDocumentUrl);
    const writes = () => pod.requests.filter((request) => request.method !== "GET").length;
    const written = writes();
    // Not added: it was there, so nothing says it joined the deck.
    await expect(answer()).resolves.toMatchObject({
      effect: "review",
      state: { cardId: "shared", repetitions: 1 },
    });

    expect(await theCard()).toEqual(before);
    expect(before.fromRelease).toBeUndefined();
    // Only the state and the answer are written, not the cards document.
    expect(pod.triples(course.cardsDocumentUrl)).toEqual(cardTriples);
    expect(writes()).toBeGreaterThan(written);
    // With the card out of the plan, this release has nothing to offer: the mark alone puts it in.
    const removedBy = (card: Card) =>
      planLibraryUpgrade({
        deck: course,
        cards: [card],
        from: releaseOf(RELEASE, "1", [question]),
        to: releaseOf("https://course.example/releases/2.0.0.ttl", "2", []),
        releases: [],
        linked: true,
        course: true,
      })?.remove.map((removed) => removed.id);
    const sameAsTheRelease = { ...before, ...question };
    expect(removedBy(before)).toBeUndefined();
    expect(removedBy(sameAsTheRelease)).toBeUndefined();
    expect(removedBy({ ...sameAsTheRelease, fromRelease: RELEASE })).toEqual(["shared"]);
  });

  it("keeps the mark of a card another release of the series wrote", async () => {
    const { deckRepository, answer, theCard } = app();
    const earlier = "https://course.example/releases/0.9.0.ttl";
    await deckRepository.applyCardChanges(course, {
      save: [{ ...question, front: { en: "Earlier" }, fromRelease: earlier }],
      remove: [],
    });
    await answer();
    expect(await theCard()).toMatchObject({ front: { en: "Earlier" }, fromRelease: earlier });
  });

  it("leaves a retired card retired: the state is written, and study still doesn't show it", async () => {
    const { deckRepository, useCases, answer, theCard } = app();
    await deckRepository.applyCardChanges(course, {
      save: [{ ...question, front: { en: "Retired" }, retired: true }],
      remove: [],
    });
    await expect(answer()).resolves.toMatchObject({
      effect: "review",
      state: { cardId: "shared" },
    });
    expect(await theCard()).toMatchObject({ front: { en: "Retired" }, retired: true });
    const queue = await stateOf(useCases);
    expect(queue.newPrompts).toEqual([]);
    expect(queue.due).toEqual([]);
  });

  it("logs the release's option as given, even when it is another card's: the card isn't refused for it", async () => {
    const { pod, deckRepository, useCases } = app();
    await deckRepository.applyCardChanges(course, {
      save: [
        { id: "shared", front: { en: "Mine" }, back: { en: "Mine" } },
        {
          id: "other",
          front: { en: "Other" },
          back: { en: "Other" },
          distractors: [{ id: "other-wrong", text: { en: "Other's wrong option" } }],
        },
      ],
      remove: [],
    });
    const before = pod.triples(course.cardsDocumentUrl);
    await expect(
      useCases.answerCourseQuestion(
        INSTANCE,
        course,
        question,
        { correct: false, distractorId: "other-wrong" },
        NOON,
      ),
    ).resolves.toMatchObject({ effect: "review", state: { repetitions: 0 } });
    expect(pod.triples(course.cardsDocumentUrl)).toEqual(before);
    await vi.waitFor(() =>
      expect(pod.triples(`${INSTANCE}history/2026-11.ttl`)).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`chosenDistractor> <${course.cardsDocumentUrl}#other-wrong>`),
        ]),
      ),
    );
  });

  it.each([
    [
      "today's study is reset",
      ({ useCases }: ReturnType<typeof app>) => useCases.resetStudyDay(INSTANCE, course, NOON),
    ],
    [
      "the card is forgotten",
      ({ useCases }: ReturnType<typeof app>) => useCases.resetCards(INSTANCE, course, ["shared"]),
    ],
  ])(
    "keeps an edit made after a first answer when %s and the question is answered again",
    async (_, reset) => {
      const running = app();
      const { deckRepository, answer, theCard, useCases } = running;
      await answer();
      const edited = await deckRepository.updateCard(course, await theCard(), {
        front: { en: "My edit" },
        back: question.back,
      });
      await expect(reset(running)).resolves.toBe(1);
      expect((await stateOf(useCases)).newPrompts.map((prompt) => prompt.card.id)).toEqual([
        "shared",
      ]);

      await expect(answer()).resolves.toMatchObject({ effect: "review" });

      expect(await theCard()).toMatchObject({ front: edited.front, fromRelease: RELEASE });
      expect((await stateOf(useCases)).newPrompts).toEqual([]);
    },
  );
});
