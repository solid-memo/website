import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeckDetailContainer } from "./DeckDetailContainer";
import { routeToHash } from "./router";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck, Prompt } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { Instance } from "@solid-memo/domain/instance";
import type { StudyQueue } from "@solid-memo/domain/scheduling";
import { makeUseCasesFake } from "../test/useCasesFake";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "A",
};

const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
const prompt: Prompt = { card, direction: "front-to-back" };

function renderContainer(useCases: UseCases, shown: Deck = deck) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onStudy = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeckDetailContainer
        useCases={useCases}
        instance={instance}
        deck={shown}
        onStudy={onStudy}
      />
    </QueryClientProvider>,
  );
  return { onStudy };
}

describe("DeckDetailContainer", () => {
  it("shows a loading state, then the card count", async () => {
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [card]) }));
    expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    expect(
      await screen.findByText(/1 card in this deck/),
    ).toBeInTheDocument();
  });

  it("keeps loading until today's study queue is known", async () => {
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => [card]),
        getStudyQueue: vi.fn(() => new Promise<StudyQueue>(() => { })),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    });
    expect(screen.queryByText(/1 card in this deck/)).toBeNull();
  });

  it("says all cards are studied when today's queue is empty", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [card]),
      getStudyQueue: vi.fn(async () => ({ due: [], newPrompts: [], studiedToday: 0 })),
    });
    renderContainer(useCases);
    expect(
      await screen.findByText(
        "All cards have been studied — nothing more to study today.",
      ),
    ).toBeInTheDocument();
    expect(useCases.getStudyQueue).toHaveBeenCalledWith(
      instance.url,
      deck,
      expect.any(Date),
    );
  });

  it("resets the day, then shows the refreshed queue", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let reset = false;
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [card]),
      getStudyQueue: vi.fn(async () =>
        reset
          ? { due: [prompt], newPrompts: [], studiedToday: 0 }
          : { due: [], newPrompts: [], studiedToday: 1 },
      ),
      resetStudyDay: vi.fn(async () => {
        reset = true;
        return 1;
      }),
    });
    renderContainer(useCases);

    expect(
      await screen.findByText(/All cards have been studied/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset today's study" }),
    );

    expect(
      await screen.findByRole("button", { name: "Study" }),
    ).toBeEnabled();
    expect(useCases.resetStudyDay).toHaveBeenCalledWith(
      instance.url,
      deck,
      expect.any(Date),
    );
    expect(
      screen.queryByRole("button", { name: "Reset today's study" }),
    ).toBeNull();
  });

  it("shows an error when the reset fails, and keeps the day", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => [card]),
        getStudyQueue: vi.fn(async () => ({
          due: [],
          newPrompts: [],
          studiedToday: 2,
        })),
        resetStudyDay: vi.fn(async () => {
          throw new Error("reset refused");
        }),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reset today's study" }),
    );
    expect(await screen.findByText("reset refused")).toBeInTheDocument();
    expect(screen.getByText("2 cards studied today.")).toBeInTheDocument();
  });

  it("shows an error when the study queue fails", async () => {
    renderContainer(
      makeUseCasesFake({
        getStudyQueue: vi.fn(async () => {
          throw new Error("reviews unreachable");
        }),
      }),
    );
    expect(await screen.findByText("reviews unreachable")).toBeInTheDocument();
  });

  it("shows an error when listing cards fails", async () => {
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => {
          throw new Error("cards unreachable");
        }),
      }),
    );
    expect(await screen.findByText("cards unreachable")).toBeInTheDocument();
  });

  it("starts the study, and links to the deck's Browser and preferences", async () => {
    const { onStudy } =
      renderContainer(
        makeUseCasesFake({
          listCards: vi.fn(async () => [card]),
          getStudyQueue: vi.fn(async () => ({ due: [prompt], newPrompts: [], studiedToday: 0 })),
        }),
      );
    fireEvent.click(await screen.findByRole("button", { name: "Study" }));
    expect(onStudy).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Browser" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "browser", instanceUrl: instance.url, deckUrl: deck.url }),
    );
    expect(screen.getByRole("link", { name: "Deck preferences" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url }),
    );
  });

  describe("the notice of text that does not say its language", () => {
    const tagged: Card = { ...card, id: "card-2", front: { ja: "火" }, back: { en: "fire" } };
    const notice = () => screen.queryByRole("region", { name: "Languages of the deck's text" });

    it("counts the untagged sides, linking to the Languages section of the deck's preferences", async () => {
      renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [card, tagged]) }));
      await screen.findByText(/2 cards in this deck/);
      expect(notice()).toHaveTextContent("2 card sides state no language.");
      expect(screen.getByRole("link", { name: "Set the languages" })).toHaveAttribute(
        "href",
        routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url, section: "languages" }),
      );
    });

    it("finds nothing to settle in text saved the same in English and another language", async () => {
      const same = { ...tagged, backNote: { en: "Kun", sv: "Kun" } };
      renderContainer(
        makeUseCasesFake({ listCards: vi.fn(async () => [same]) }),
        { ...deck, title: { en: "Kanji N5", sv: "Kanji N5" } },
      );
      await screen.findByText(/1 card in this deck/);
      expect(notice()).toBeNull();
    });

    it("is not there once everything is settled", async () => {
      renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [tagged]) }));
      await screen.findByText(/1 card in this deck/);
      expect(notice()).toBeNull();
    });

    it("leaves out what is still as the library release has it, saying nothing until the release is read", async () => {
      const copy = { ...deck, sourceUrl: "https://library.example/kanji/1", title: { en: "Kanji N5", sv: "Kanji N5" } };
      let read: (release: LibraryDeckContent) => void = () => undefined;
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [card, tagged]),
        deckRelease: vi.fn(() => new Promise<LibraryDeckContent | null>((resolve) => (read = resolve))),
      });
      renderContainer(useCases, copy);
      await screen.findByText(/2 cards in this deck/);
      expect(notice()).toBeNull();
      read({ title: copy.title, cards: [{ ...card, formatVersion: 4 }] } as unknown as LibraryDeckContent);
      await waitFor(() => expect(useCases.deckRelease).toHaveBeenCalledWith(copy));
      // Only the untouched card and name would be left: nothing is to settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(notice()).toBeNull();
    });

    it("says the check could not be made when the library release cannot be read", async () => {
      const copy = { ...deck, sourceUrl: "https://library.example/kanji/1" };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [card, tagged]),
        deckRelease: vi.fn(async () => {
          throw new Error("library unreachable");
        }),
      });
      renderContainer(useCases, copy);
      await waitFor(() =>
        expect(notice()).toHaveTextContent(
          "The library release it was copied from could not be read, so how much of it is yours to settle is not known.",
        ),
      );
      expect(notice()).not.toHaveTextContent(/card side/);
      expect(screen.getByRole("link", { name: "Set the languages" })).toHaveAttribute(
        "href",
        routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: copy.url, section: "languages" }),
      );
    });

    it("says nothing when the library release cannot be read but nothing would be to settle anyway", async () => {
      const copy = { ...deck, sourceUrl: "https://library.example/kanji/1" };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [tagged]),
        deckRelease: vi.fn(async () => {
          throw new Error("library unreachable");
        }),
      });
      renderContainer(useCases, copy);
      await screen.findByText(/1 card in this deck/);
      await waitFor(() => expect(useCases.deckRelease).toHaveBeenCalledWith(copy));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(notice()).toBeNull();
    });

    it("still counts what the user changed since the release", async () => {
      const copy = { ...deck, sourceUrl: "https://library.example/kanji/1" };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [card]),
        deckRelease: vi.fn(async () => ({ title: copy.title, cards: [{ ...card, back: { "": "a lake" } }] }) as never),
      });
      renderContainer(useCases, copy);
      await waitFor(() => expect(notice()).toHaveTextContent("2 card sides state no language."));
    });
  });
});
