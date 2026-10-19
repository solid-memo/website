// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Answer } from "@solid-memo/domain/answer";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewState } from "@solid-memo/domain/review";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CardHistoryContainer } from "./CardHistoryContainer";

const INSTANCE_URL = "https://pod.example/solid-memo/a/";
const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE_URL}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${INSTANCE_URL}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE_URL}reviews/deck-1.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
};
const card: Card = {
  id: "c-1",
  url: `${deck.cardsDocumentUrl}#c-1`,
  front: { en: "France" },
  back: { en: "Paris" },
  createdAt: "",
  formatVersion: 5,
  textFormat: SM.markdown,
  distractors: [{ id: "c-1-d1", text: { en: "*Lyon*" } }],
};
const state = (extra: Partial<ReviewState> = {}): ReviewState => ({
  cardId: card.id,
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-09-27",
  firstReviewedAt: "2026-09-01T10:00:00.000Z",
  lastReviewedAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 2,
  ...extra,
});
let n = 0;
const answer = (studyDay: string, grade: Answer["grade"], extra: Partial<Answer> = {}): Answer => ({
  id: `answer-${++n}`,
  deckUrl: deck.url,
  cardUrl: card.url,
  direction: "front-to-back",
  grade,
  answeredAt: `${studyDay}T10:${String(n).padStart(2, "0")}:00.000Z`,
  studyDay,
  nextIntervalDays: 1,
  ...extra,
});

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}

describe("CardHistoryContainer", () => {
  it("shows where the card stands and every answer to it, newest first, the repeat and course answers told apart", async () => {
    const first = answer("2026-09-01", 4);
    const lapse = answer("2026-09-02", 1, { priorIntervalDays: 1 });
    const repeat = answer("2026-09-02", 4, { priorIntervalDays: 1 });
    const review = answer("2026-09-03", 5, { priorIntervalDays: 1, nextIntervalDays: 6 });
    const wrong = answer("2026-09-04", 1, {
      priorIntervalDays: 6,
      mode: "multiple-choice",
      chosenDistractor: `${deck.cardsDocumentUrl}#c-1-d1`,
    });
    // A wrong option the card no longer has, and a wrong answer that names none.
    const gone = answer("2026-09-05", 1, {
      priorIntervalDays: 6,
      mode: "multiple-choice",
      chosenDistractor: `${deck.cardsDocumentUrl}#c-1-d9`,
    });
    const unnamed = answer("2026-09-05", 1, { priorIntervalDays: 6, mode: "multiple-choice" });
    const right = answer("2026-09-06", 3, { priorIntervalDays: 6, mode: "multiple-choice" });
    const useCases = makeUseCasesFake({
      cardAnswers: vi.fn(async () => [right, unnamed, gone, wrong, review, repeat, lapse, first]),
      listDeckReviewStates: vi.fn(async () => ({
        sm2: [state(), state({ cardId: "c-2", intervalDays: 40 })],
        fsrs: [],
      })),
    });
    withQueries(
      <CardHistoryContainer
        useCases={useCases}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    expect(screen.getByText("Loading the card's history…")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Answers to this card" });
    expect(useCases.cardAnswers).toHaveBeenCalledWith(INSTANCE_URL, deck, "c-1");
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    // One way only: no direction named.
    expect(screen.queryByRole("heading", { name: "Front → back" })).toBeNull();
    const standing = document.querySelector(".card-standing")!;
    expect(standing).toHaveTextContent(
      "Interval6 daysNext reviewSeptember 27, 2026First studiedSeptember 1, 2026",
    );
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      "September 6, 2026Course questionRight1 day",
      "September 5, 2026Course questionWrong1 day",
      "September 5, 2026Course questionWrong1 day",
      "September 4, 2026Course questionWrong: Lyon1 day",
      "September 3, 2026ReviewEasy6 days",
      "September 2, 2026Again the same dayGood1 day",
      "September 2, 2026ReviewAgain1 day",
      "September 1, 2026First answerGood1 day",
    ]);
    expect(within(table).getByText("Lyon").tagName).toBe("EM");
  });

  it("names the direction of each answer and standing for a card asked both ways", async () => {
    const both: Deck = { ...deck, direction: "bidirectional" };
    const useCases = makeUseCasesFake({
      cardAnswers: vi.fn(async () => [
        answer("2026-09-02", 4, { direction: "back-to-front" }),
        answer("2026-09-01", 4),
      ]),
      listDeckReviewStates: vi.fn(async () => ({
        sm2: [state({ direction: "back-to-front", intervalDays: 1 }), state()],
        fsrs: [],
      })),
    });
    withQueries(
      <CardHistoryContainer
        useCases={useCases}
        instanceUrl={INSTANCE_URL}
        deck={both}
        card={card}
      />,
    );
    const table = await screen.findByRole("table", { name: "Answers to this card" });
    expect(
      screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent),
    ).toEqual(["Front → back", "Back → front"]);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Day", "Direction", "Kind", "Answer", "Next interval"]);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Back → front");
  });

  it("counts the day first studied as a study day, as the answers' days are", async () => {
    // 01:30 on October 12th is still the 11th's study day, before the boundary hour.
    const night = state({ firstReviewedAt: new Date(2026, 9, 12, 1, 30).toISOString() });
    const useCases = makeUseCasesFake({
      cardAnswers: vi.fn(async () => [answer("2026-10-11", 4)]),
      listDeckReviewStates: vi.fn(async () => ({ sm2: [night], fsrs: [] })),
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, dayBoundaryHour: 4 })),
    });
    const first = withQueries(
      <CardHistoryContainer
        useCases={useCases}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    await screen.findByRole("table", { name: "Answers to this card" });
    expect(document.querySelector(".card-standing")).toHaveTextContent(
      "First studiedOctober 11, 2026",
    );
    expect(useCases.getPreferences).toHaveBeenCalledWith(INSTANCE_URL);
    first.unmount();
    // At midnight with the day beginning then; and by the default hour while the preferences cannot be read.
    const midnight = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [night], fsrs: [] })),
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, dayBoundaryHour: 0 })),
    });
    const { unmount } = withQueries(
      <CardHistoryContainer
        useCases={midnight}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".card-standing")).toHaveTextContent(
        "First studiedOctober 12, 2026",
      ),
    );
    unmount();
    const unread = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [night], fsrs: [] })),
      getPreferences: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    withQueries(
      <CardHistoryContainer useCases={unread} instanceUrl={INSTANCE_URL} deck={deck} card={card} />,
    );
    expect(await screen.findByText("October 11, 2026")).toBeInTheDocument();
  });

  it("says when the card was not studied yet, and shows its standing without answers read", async () => {
    const fresh = makeUseCasesFake();
    withQueries(
      <CardHistoryContainer useCases={fresh} instanceUrl={INSTANCE_URL} deck={deck} card={card} />,
    );
    expect(await screen.findByText("Not studied yet.")).toBeInTheDocument();
    const forgotten = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [state()], fsrs: [] })),
    });
    withQueries(
      <CardHistoryContainer
        useCases={forgotten}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    expect(await screen.findByText("6 days")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows where the card stands by FSRS-6 when it sets the due days", async () => {
    const fsrs = {
      cardId: card.id,
      direction: "front-to-back" as const,
      stability: 30,
      difficulty: 5,
      due: "2026-10-21",
      firstReviewedAt: state().firstReviewedAt,
      lastReviewedAt: state().lastReviewedAt,
      formatVersion: 1,
    };
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [state()], fsrs: [fsrs] })),
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const })),
    });
    withQueries(
      <CardHistoryContainer
        useCases={useCases}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    expect(await screen.findByText("30 days")).toBeInTheDocument();
    expect(screen.getByText("October 21, 2026")).toBeInTheDocument();
  });

  it("says quietly when the history cannot be read", async () => {
    const useCases = makeUseCasesFake({
      cardAnswers: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    withQueries(
      <CardHistoryContainer
        useCases={useCases}
        instanceUrl={INSTANCE_URL}
        deck={deck}
        card={card}
      />,
    );
    expect(
      await screen.findByText("The card's history cannot be read just now."),
    ).toBeInTheDocument();
  });
});
