// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CardProgressReport, DeckProgress } from "@solid-memo/application/useCases";
import type { HardCard } from "@solid-memo/domain/cardHistory";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CardProgressContainer } from "./CardProgressContainer";
import { HardestCardsContainer } from "./HardestCardsContainer";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const deckOf = (id: string, title: string): Deck => ({
  id,
  url: `${INSTANCE.url}catalog.ttl#${id}`,
  title: { en: title },
  cardsDocumentUrl: `${INSTANCE.url}decks/${id}.ttl`,
  reviewsDocumentUrl: `${INSTANCE.url}reviews/${id}.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
});
const capitals = deckOf("deck-1", "Capitals");
const rivers = deckOf("deck-2", "Rivers");
const cardOf = (deck: Deck, id: string, front: string, extra: Partial<Card> = {}): Card => ({
  id,
  url: `${deck.cardsDocumentUrl}#${id}`,
  front: { en: front },
  back: { en: `${front}?` },
  createdAt: "",
  formatVersion: 5,
  ...extra,
});
const hard = (card: Card, lapses: number, reviews: number): HardCard<Card> => ({
  card,
  lapses,
  reviews,
});
/** A deck's figures: nothing studied, nothing hard, unless given. */
const progressOf = (deck: Deck, extra: Partial<DeckProgress> = {}): DeckProgress => ({
  deck,
  progress: { new: 0, relearning: 0, young: 0, mature: 0 },
  forecast: [],
  intervals: intervalHistogram([]),
  eases: easeHistogram([]),
  overdue: 0,
  daysToClear: 0,
  newCardsPerDay: 5,
  introducedToday: 0,
  hardest: { reviews: 0, cards: [] },
  courseAnswers: 0,
  confusions: [],
  ...extra,
});
const reportOf = (...decks: DeckProgress[]): CardProgressReport => ({
  today: "2026-09-21",
  decks,
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

const paris = cardOf(capitals, "c-1", "France");
const rome = cardOf(capitals, "c-2", "Italy");
const nile = cardOf(rivers, "r-1", "Egypt");

describe("HardestCardsContainer", () => {
  it("lists every deck's leeches, the most forgotten first, from the cards' progress read once", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(
          progressOf(capitals, {
            hardest: { reviews: 20, cards: [hard(paris, 4, 8), hard(rome, 1, 2)] },
          }),
          progressOf(rivers, { hardest: { reviews: 9, cards: [hard(nile, 4, 5)] } }),
        ),
      ),
    });
    withQueries(
      <>
        <CardProgressContainer useCases={useCases} instance={INSTANCE} />
        <HardestCardsContainer useCases={useCases} instance={INSTANCE} />
      </>,
    );
    const list = await screen.findByRole("list", { name: "Leeches across your decks" });
    expect(screen.getByRole("heading", { name: "What is hard" })).toBeInTheDocument();
    expect(
      screen.getByText(/Cards forgotten 4 times or more in their reviews over the last 12 months/),
    ).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Egypt forgotten 4 times: 80% of 5 reviews · a leech, in Rivers",
      "France forgotten 4 times: 50% of 8 reviews · a leech, in Capitals",
    ]);
    expect(within(items[0]!).getByRole("link", { name: "Egypt" })).toHaveAttribute(
      "href",
      `#/card?instance=${encodeURIComponent(INSTANCE.url)}&deck=${encodeURIComponent(rivers.url)}&card=${encodeURIComponent(nile.url)}`,
    );
    expect(useCases.getCardProgress).toHaveBeenCalledTimes(1);
  });

  it("says when no card is a leech, but nothing before the first review", async () => {
    const none = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(progressOf(capitals, { hardest: { reviews: 3, cards: [hard(rome, 1, 3)] } })),
      ),
    });
    withQueries(<HardestCardsContainer useCases={none} instance={INSTANCE} />);
    expect(
      await screen.findByText("No leeches: no card was forgotten that often."),
    ).toBeInTheDocument();
    const fresh = makeUseCasesFake({
      getCardProgress: vi.fn(async () => reportOf(progressOf(capitals), progressOf(rivers))),
    });
    const { container } = withQueries(
      <HardestCardsContainer useCases={fresh} instance={INSTANCE} />,
    );
    await vi.waitFor(() => expect(fresh.getCardProgress).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it("lists a deck's ten hardest cards, a leech marked, and the wrong options chosen most", async () => {
    const many = Array.from({ length: 12 }, (_, n) =>
      hard(cardOf(capitals, `c-${n}`, `Country ${n}`), 12 - n, 12),
    );
    const asked = cardOf(capitals, "q-1", "**Capital** of Spain", {
      textFormat: SM.markdown,
      distractors: [{ id: "q-1-d1", text: { en: "*Barcelona*" } }],
    });
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(
          progressOf(capitals, {
            hardest: { reviews: 40, cards: many },
            courseAnswers: 3,
            confusions: [{ card: asked, distractor: asked.distractors![0]!, picks: 2 }],
          }),
        ),
      ),
    });
    withQueries(<HardestCardsContainer useCases={useCases} instance={INSTANCE} deck={capitals} />);
    const hardest = await screen.findByRole("list", { name: "Hardest cards" });
    const items = within(hardest).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveTextContent(
      "Country 0 forgotten 12 times: 100% of 12 reviews · a leech",
    );
    expect(items[9]).toHaveTextContent("Country 9 forgotten 3 times: 25% of 12 reviews");
    expect(items[9]).not.toHaveTextContent("leech");
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      deck: capitals,
    });
    const confused = screen.getByRole("list", { name: "Most-confused options" });
    expect(within(confused).getByRole("listitem")).toHaveTextContent(
      "Capital of Spain confused with Barcelona 2 times",
    );
    expect(within(confused).getByText("Barcelona").tagName).toBe("EM");
  });

  it("says when a deck has no hard card yet, and leaves out wrong options without course answers", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(progressOf(capitals, { hardest: { reviews: 2, cards: [] } })),
      ),
    });
    withQueries(<HardestCardsContainer useCases={useCases} instance={INSTANCE} deck={capitals} />);
    expect(
      await screen.findByText("No card was forgotten in a review over the last 12 months."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Most-confused options" })).toBeNull();
  });

  it("shows a course's deck only its wrong options, and nothing of a deck without answers", async () => {
    const course = makeUseCasesFake({
      getCardProgress: vi.fn(async () => reportOf(progressOf(capitals, { courseAnswers: 1 }))),
    });
    withQueries(<HardestCardsContainer useCases={course} instance={INSTANCE} deck={capitals} />);
    expect(
      await screen.findByRole("heading", { name: "Most-confused options" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hardest cards" })).toBeNull();
    expect(
      screen.getByText("No wrong option was chosen over the last 12 months."),
    ).toBeInTheDocument();
    const fresh = makeUseCasesFake({
      getCardProgress: vi.fn(async () => reportOf(progressOf(rivers))),
    });
    const { container } = withQueries(
      <HardestCardsContainer useCases={fresh} instance={INSTANCE} deck={rivers} />,
    );
    await vi.waitFor(() => expect(fresh.getCardProgress).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing while the progress loads or when it cannot be read", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { container } = withQueries(
      <HardestCardsContainer useCases={useCases} instance={INSTANCE} />,
    );
    expect(container).toBeEmptyDOMElement();
    await vi.waitFor(() => expect(useCases.getCardProgress).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
