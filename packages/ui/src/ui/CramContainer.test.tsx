// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CardProgressReport, DeckProgress, UseCases } from "@solid-memo/application/useCases";
import type { HardCard } from "@solid-memo/domain/cardHistory";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { deckProgressOf, makeUseCasesFake } from "../test/useCasesFake";
import { CramContainer } from "./CramContainer";
import { RepoUrl } from "./ReportMistake";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "A" };
const capitals: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
};
const cardOf = (id: string, front: string): Card => ({
  id,
  url: `${capitals.cardsDocumentUrl}#${id}`,
  front: { en: front },
  back: { en: `Capital of ${front}` },
  createdAt: "",
  formatVersion: 5,
});
const france = cardOf("c-1", "France");
const italy = cardOf("c-2", "Italy");
const spain = cardOf("c-3", "Spain");
const hard = (card: Card, lapses: number, reviews: number): HardCard<Card> => ({
  card,
  lapses,
  reviews,
});
/** A deck's figures, its hardest cards as given. */
const progressOf = (deck: Deck, cards: HardCard<Card>[]): DeckProgress =>
  deckProgressOf(deck, { hardest: { reviews: 20, cards } });
const reportOf = (...decks: DeckProgress[]): CardProgressReport => ({ today: "2026-09-21", decks });
/** Two leeches, France the more forgotten, and Spain, hard but no leech. */
const leeches = (deck: Deck) =>
  reportOf(progressOf(deck, [hard(france, 5, 8), hard(italy, 4, 6), hard(spain, 2, 6)]));

/** Keeps the order the leeches are in, and puts a card back last. */
const inOrder = () => 0.99;

/** A cram of the deck's leeches, or, for null, of every deck's. */
function renderCram(
  useCases: UseCases,
  deck: Deck | null = capitals,
  random: () => number = inOrder,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onExit = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RepoUrl.Provider value="https://github.com/solid-memo/website">
        <CramContainer
          useCases={useCases}
          instance={instance}
          deck={deck ?? undefined}
          onExit={onExit}
          random={random}
        />
      </RepoUrl.Provider>
    </QueryClientProvider>,
  );
  return { onExit, queryClient, ...view };
}

/** Reveal the card up and grade it. */
function answer(grade: string) {
  fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
  fireEvent.click(screen.getByRole("button", { name: grade }));
}

/** The use cases a fake was asked, by name. */
function called(useCases: UseCases): string[] {
  return Object.entries(useCases)
    .filter(([, use]) => vi.isMockFunction(use) && use.mock.calls.length > 0)
    .map(([name]) => name)
    .sort();
}

describe("CramContainer", () => {
  it("crams the deck's leeches, a card answered badly coming round again, as often as the learner likes", async () => {
    const useCases = makeUseCasesFake({ getCardProgress: vi.fn(async () => leeches(capitals)) });
    const { onExit } = renderCram(useCases);
    expect(screen.getByText("Preparing the leeches…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cram: Capitals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Capitals" })).toHaveAttribute(
      "href",
      `#/deck?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(capitals.url)}`,
    );
    // Only the leeches, the most forgotten first: Spain is hard, but no leech.
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    // No interval: nothing a grade gives is kept.
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByRole("button", { name: "1 — Wrong" })).not.toHaveAccessibleDescription();
    fireEvent.click(screen.getByRole("button", { name: "1 — Wrong" }));
    expect(
      screen.getByText("Card 2 of 3. You'll see the last card again later in this session."),
    ).toBeInTheDocument();
    expect(screen.getByText("Italy")).toBeInTheDocument();
    // Nothing recorded, nothing to undo.
    expect(screen.queryByRole("button", { name: "Undo last answer" })).toBeNull();
    answer("4 — Good");
    expect(screen.getByText("Card 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    answer("5 — Easy");
    expect(screen.getByText("Cram finished — nothing was recorded.")).toHaveFocus();
    // Again: the same two leeches, from the start.
    fireEvent.click(screen.getByRole("button", { name: "Cram again" }));
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("records nothing: it only reads, and leaves the cached reviews, queue and progress as they were", async () => {
    const RELEASE = "https://solid-memo.com/decks/capitals/v1.ttl";
    const copied = { ...capitals, sourceUrl: RELEASE };
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => leeches(copied)),
      reportPlace: vi.fn(async () => ({ library: true as const })),
      deckRelease: vi.fn(
        async () => ({ url: RELEASE, cards: [{ id: france.id }] }) as unknown as LibraryDeckContent,
      ),
    });
    const { queryClient, onExit } = renderCram(useCases, copied);
    const reviewsKey = ["reviews", copied.reviewsDocumentUrl, france.id, "front-to-back"];
    const queueKey = ["studyQueue", copied.url];
    queryClient.setQueryData(reviewsKey, { due: "kept" });
    queryClient.setQueryData(queueKey, { due: [] });
    const before = (key: unknown[]) => queryClient.getQueryState(key)!.dataUpdatedAt;
    const reviewsAt = before(reviewsKey);
    const queueAt = before(queueKey);
    const progressKey = ["cardProgress", instance.url, copied.url];

    // The release's card says where a mistake in it is reported.
    expect(await screen.findByRole("link", { name: /Report a mistake/ })).toBeInTheDocument();
    const progressAt = before(progressKey);
    answer("0 — Blackout");
    answer("1 — Wrong");
    answer("3 — Hard");
    answer("4 — Good");
    fireEvent.click(await screen.findByRole("button", { name: "Cram again" }));
    answer("2 — Almost");
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(onExit).toHaveBeenCalledOnce();

    expect(called(useCases)).toEqual([
      "deckRelease",
      "getCardProgress",
      "getPreferences",
      "reportPlace",
    ]);
    expect(useCases.recordReview).not.toHaveBeenCalled();
    expect(useCases.undoReview).not.toHaveBeenCalled();
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
    for (const [key, at] of [
      [reviewsKey, reviewsAt],
      [queueKey, queueAt],
      [progressKey, progressAt],
    ] as const) {
      const state = queryClient.getQueryState([...key])!;
      expect(state.dataUpdatedAt).toBe(at);
      expect(state.isInvalidated).toBe(false);
    }
    expect(queryClient.getQueryData(reviewsKey)).toEqual({ due: "kept" });
    expect(queryClient.getQueryData(queueKey)).toEqual({ due: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useCases.getCardProgress).toHaveBeenCalledOnce();
  });

  it("asks each leech each way the deck is studied, shuffled, on the answer buttons the preferences ask for", async () => {
    const both: Deck = { ...capitals, direction: "bidirectional" };
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => leeches(both)),
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const })),
    });
    renderCram(useCases, both, () => 0);
    expect(await screen.findByText("Card 1 of 4")).toBeInTheDocument();
    // Shuffled with 0 every time, France's back→front comes first.
    expect(screen.getByText("Capital of France")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByRole("button", { name: "Again" })).toBeInTheDocument();
  });

  it("keeps its cards when the progress is read again", async () => {
    const useCases = makeUseCasesFake({ getCardProgress: vi.fn(async () => leeches(capitals)) });
    const { queryClient } = renderCram(useCases);
    expect(await screen.findByText("Card 1 of 2")).toBeInTheDocument();
    queryClient.setQueryData(
      ["cardProgress", instance.url, capitals.url],
      reportOf(progressOf(capitals, [hard(spain, 6, 6)])),
    );
    await waitFor(() => expect(screen.getByText("Card 1 of 2")).toBeInTheDocument());
    expect(screen.getByText("France")).toBeInTheDocument();
  });

  it("reads nothing again once the cram has begun, so a failing read cannot end it", async () => {
    const getCardProgress = vi.fn(async () => leeches(capitals));
    const getPreferences = vi.fn(async () => DEFAULT_PREFERENCES);
    const useCases = makeUseCasesFake({ getCardProgress, getPreferences });
    const { queryClient } = renderCram(useCases);
    expect(await screen.findByText("Card 1 of 2")).toBeInTheDocument();
    answer("1 — Wrong");
    getCardProgress.mockRejectedValue(new Error("pod unreachable"));
    getPreferences.mockRejectedValue(new Error("pod unreachable"));
    // A change elsewhere, and the learner coming back to the tab.
    await queryClient.invalidateQueries();
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    focusManager.setFocused(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getCardProgress).toHaveBeenCalledOnce();
    expect(getPreferences).toHaveBeenCalledOnce();
    expect(screen.queryByText(/pod unreachable/)).toBeNull();
    expect(screen.getByText(/^Card 2 of 3/)).toBeInTheDocument();
  });

  it("says when the deck has no leech to cram", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => reportOf(progressOf(capitals, [hard(spain, 3, 3)]))),
    });
    renderCram(useCases);
    expect(await screen.findByText("This deck has no leeches to cram.")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Cram again" })).toBeNull();
  });

  it("says why when the progress or the preferences cannot be read", async () => {
    const { unmount } = renderCram(
      makeUseCasesFake({
        getCardProgress: vi.fn(async () => {
          throw new Error("log unreadable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("log unreadable");
    unmount();
    renderCram(
      makeUseCasesFake({
        getCardProgress: vi.fn(async () => leeches(capitals)),
        getPreferences: vi.fn(async () => {
          throw new Error("preferences unreadable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("preferences unreadable");
  });

  it("crams every deck's leeches, given no deck, naming the deck of the card up", async () => {
    const RELEASE = "https://solid-memo.com/decks/rivers/v1.ttl";
    const rivers: Deck = {
      ...capitals,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      title: { sv: "Floder" },
      cardsDocumentUrl: `${instance.url}decks/deck-2.ttl`,
      reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`,
      sourceUrl: RELEASE,
    };
    const nile = { ...cardOf("r-1", "Egypt"), url: `${rivers.cardsDocumentUrl}#r-1` };
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(
          progressOf(capitals, [hard(france, 4, 8), hard(spain, 1, 2)]),
          progressOf(rivers, [hard(nile, 6, 6)]),
        ),
      ),
      reportPlace: vi.fn(async () => ({ library: true as const })),
      deckRelease: vi.fn(
        async () => ({ url: RELEASE, cards: [{ id: nile.id }] }) as unknown as LibraryDeckContent,
      ),
    });
    const { onExit } = renderCram(useCases, null);
    // The most forgotten first, whichever deck it is in: Egypt, in Rivers.
    expect(await screen.findByRole("heading", { name: "Cram: Floder" })).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(instance.url, expect.any(Date), {});
    expect(screen.getByRole("link", { name: "Floder" })).toHaveAttribute("lang", "sv");
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Egypt")).toBeInTheDocument();
    // Its card is the release's, whose mistakes are reported where it says.
    expect(await screen.findByRole("link", { name: /Report a mistake/ })).toBeInTheDocument();
    answer("4 — Good");
    expect(screen.getByRole("heading", { name: "Cram: Capitals" })).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Report a mistake/ })).toBeNull();
    answer("4 — Good");
    // With no card up, the heading names the leeches.
    expect(screen.getByRole("heading", { name: "Cram the leeches" })).toBeInTheDocument();
    expect(screen.getByText("Cram finished — nothing was recorded.")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cram again" }));
    expect(screen.getByRole("heading", { name: "Cram: Floder" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(called(useCases)).toEqual([
      "deckRelease",
      "getCardProgress",
      "getPreferences",
      "reportPlace",
    ]);
  });

  it("shows the card up in its deck's card language first, each deck's own", async () => {
    const swedish: Deck = { ...capitals, cardLanguage: "sv" };
    const rivers: Deck = {
      ...capitals,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      title: { en: "Rivers" },
      cardsDocumentUrl: `${instance.url}decks/deck-2.ttl`,
      reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`,
    };
    const both = (card: Card) => ({
      ...card,
      front: { en: card.front.en, sv: `${card.front.en} (sv)` },
    });
    const nile = { ...both(cardOf("r-1", "Nile")), url: `${rivers.cardsDocumentUrl}#r-1` };
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () =>
        reportOf(
          progressOf(rivers, [hard(nile, 6, 6)]),
          progressOf(swedish, [hard(both(france), 4, 8)]),
        ),
      ),
    });
    renderCram(useCases, null);
    // Rivers states no card language: its card is in the app's.
    expect(await screen.findByRole("heading", { name: "Cram: Rivers" })).toBeInTheDocument();
    expect(screen.getByText("Nile")).toBeInTheDocument();
    answer("4 — Good");
    expect(screen.getByRole("heading", { name: "Cram: Capitals" })).toBeInTheDocument();
    expect(screen.getByText("France (sv)")).toHaveAttribute("lang", "sv");
  });

  it("says when no deck has a leech to cram", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => reportOf(progressOf(capitals, [hard(spain, 3, 3)]))),
    });
    renderCram(useCases, null);
    expect(await screen.findByText("None of your decks has a leech to cram.")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Cram the leeches" })).toBeInTheDocument();
  });
});
