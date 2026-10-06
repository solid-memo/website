import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { DeckPreferencesContainer } from "./DeckPreferencesContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "A",
};

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "",
  formatVersion: 3,
  authors: [],
};

function renderContainer(useCases: UseCases, shown: Deck = deck, section?: "languages") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onDone = vi.fn();
  const onDeckRemoved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeckPreferencesContainer
        useCases={useCases}
        instance={instance}
        deck={shown}
        section={section}
        onDeckRemoved={onDeckRemoved}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { onDone, onDeckRemoved, queryClient };
}

describe("DeckPreferencesContainer", () => {
  it("shows a loading state, then the form against the instance's preferences", async () => {
    const useCases = makeUseCasesFake({
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, newCardsPerDay: 7 })),
    });
    renderContainer(useCases);
    expect(screen.getByText("Loading preferences…")).toBeInTheDocument();
    expect(await screen.findByLabelText("New cards per day")).toHaveAttribute(
      "placeholder",
      "7",
    );
    expect(useCases.getPreferences).toHaveBeenCalledWith(instance.url);
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      `#/deck?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(deck.url)}`,
    );
    expect(screen.getByRole("link", { name: "study preferences" })).toHaveAttribute(
      "href",
      `#/preferences?instance=${encodeURIComponent(instance.url)}`,
    );
  });

  it("saves the deck's limits, drops its study queue and returns", async () => {
    const useCases = makeUseCasesFake();
    const { onDone, queryClient } = renderContainer(useCases);
    const remove = vi.spyOn(queryClient, "removeQueries");

    fireEvent.input(await screen.findByLabelText("New cards per day"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(useCases.setDeckPace).toHaveBeenCalledWith(deck, { newCardsPerDay: 3 });
    expect(remove).toHaveBeenCalledWith({ queryKey: ["studyQueue", deck.url] });
  });

  it("shows a save error and stays", async () => {
    const { onDone } = renderContainer(
      makeUseCasesFake({
        setDeckPace: vi.fn(async () => {
          throw new Error("A daily limit is a whole number, 0 or more.");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save preferences" }));
    expect((await screen.findByText("A daily limit is a whole number, 0 or more.")).closest(".error")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("renames the deck and refreshes every deck list, staying on the page", async () => {
    const useCases = makeUseCasesFake();
    const { onDone, queryClient } = renderContainer(useCases);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: "Rename deck" }));
    fireEvent.input(screen.getByLabelText("Deck name"), { target: { value: "Kanji N4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(useCases.renameDeck).toHaveBeenCalledWith(deck, { en: "Kanji N4" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] }));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("renames a deck whose name is the same in English and another language in each language on its own", async () => {
    const same = { ...deck, title: { en: "Kanji N5", sv: "Kanji N5" } };
    renderContainer(makeUseCasesFake(), same);
    fireEvent.click(await screen.findByRole("button", { name: "Rename deck" }));
    expect(screen.queryByRole("button", { name: /from this text/ })).toBeNull();
    expect(screen.getByLabelText("Text in Swedish")).toHaveValue("Kanji N5");
  });

  it("shows a rename error", async () => {
    renderContainer(
      makeUseCasesFake({
        renameDeck: vi.fn(async () => {
          throw new Error("rename refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Rename deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect((await screen.findByText("rename refused")).closest(".error")).toBeInTheDocument();
  });

  it("removes the deck, refreshes the deck lists, then leaves", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake();
    const { onDeckRemoved, queryClient } = renderContainer(useCases);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: "Remove deck" }));
    await waitFor(() => expect(onDeckRemoved).toHaveBeenCalledOnce());
    expect(useCases.removeDeck).toHaveBeenCalledWith(deck);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    vi.unstubAllGlobals();
  });

  it("shows a deck-remove error and stays", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { onDeckRemoved } = renderContainer(
      makeUseCasesFake({
        removeDeck: vi.fn(async () => {
          throw new Error("deck remove refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove deck" }));
    expect((await screen.findByText("deck remove refused")).closest(".error")).toBeInTheDocument();
    expect(onDeckRemoved).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows an error when the preferences cannot be read", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("preferences unreachable");
        }),
      }),
    );
    expect((await screen.findByText("preferences unreachable")).closest(".error")).toBeInTheDocument();
  });

  describe("the deck's languages", () => {
    const cardOf = (id: string, front: Card["front"], back: Card["back"]): Card => ({
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      front,
      back,
      createdAt: "",
      formatVersion: 5,
    });

    it("counts the cards' untagged sides, leaving out those still as the library release has them", async () => {
      const released = cardOf("fe", { "": "Fe" }, { en: "iron" });
      const imported = { ...deck, sourceUrl: "https://solid-memo.com/decks/elements/v1.ttl" };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [released, cardOf("cu", { "": "Cu" }, { "": "copper" })]),
        deckRelease: vi.fn(async () => ({ cards: [{ ...released, formatVersion: 4 }] }) as unknown as LibraryDeckContent),
      });
      renderContainer(useCases, imported);
      expect(await screen.findByText("1 card front and 1 back do not say their language.")).toBeInTheDocument();
      expect(useCases.listCards).toHaveBeenCalledWith(imported);
    });

    it("states the languages chosen, reads the cards again and says how many changed", async () => {
      vi.stubGlobal("confirm", () => true);
      let cards = [cardOf("a", { "": "水" }, { en: "water" }), cardOf("b", { "": "火" }, { en: "fire" })];
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => cards),
        stateCardLanguages: vi.fn(async () => {
          cards = cards.map((card) => ({ ...card, front: { sv: card.front[""]! } }));
          return 2;
        }),
      });
      renderContainer(useCases);
      expect(await screen.findByText("2 card fronts and 0 backs do not say their language.")).toBeInTheDocument();
      fireEvent.click(document.getElementById("deck-fronts-language")!);
      fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
      fireEvent.click(screen.getByRole("button", { name: "State the language" }));
      expect(await screen.findByText("Saved the language of 2 cards.")).toBeInTheDocument();
      expect(useCases.stateCardLanguages).toHaveBeenCalledWith(deck, { front: "sv" });
      expect(screen.getByText("Every card says which language its text is in.")).toBeInTheDocument();
      expect(useCases.listCards).toHaveBeenCalledTimes(2);
      vi.unstubAllGlobals();
    });

    it("shows why the languages could not be stated, or the cards read", async () => {
      vi.stubGlobal("confirm", () => true);
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [cardOf("a", { "": "水" }, { en: "water" })]),
        stateCardLanguages: vi.fn(async () => {
          throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
        }),
      });
      renderContainer(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Language: not stated" }));
      fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
      fireEvent.click(screen.getByRole("button", { name: "State the language" }));
      expect(await screen.findByText(/This was changed elsewhere/)).toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("finds nothing to settle in a name or a note saved the same in English and another language", async () => {
      const same = { ...deck, title: { en: "Kanji N5", sv: "Kanji N5" } };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [{ ...cardOf("a", { ja: "水" }, { en: "water" }), frontNote: { en: "Kanji", sv: "Kanji" } }]),
      });
      renderContainer(useCases, same, "languages");
      expect(await screen.findByText("Every card says which language its text is in.")).toBeInTheDocument();
      expect(screen.queryByText(/saved the same/)).toBeNull();
      expect(screen.getByRole("heading", { name: "Languages" })).toHaveAttribute("data-arrival");
    });

    it("shows a failure to read the cards", async () => {
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => {
          throw new Error("cards unreadable");
        }),
      });
      renderContainer(useCases);
      expect(await screen.findByText(/cards unreadable/)).toBeInTheDocument();
      expect(screen.getByText("The languages of the cards could not be checked.")).toBeInTheDocument();
      expect(screen.getAllByText(/cards unreadable/)).toHaveLength(1);
    });

    it("says the languages could not be checked when the library release cannot be read", async () => {
      const copy = { ...deck, sourceUrl: "https://library.example/kanji/1" };
      const useCases = makeUseCasesFake({
        listCards: vi.fn(async () => [cardOf("a", { "": "水" }, { en: "water" })]),
        deckRelease: vi.fn(async () => {
          throw new Error("library unreachable");
        }),
      });
      renderContainer(useCases, copy);
      expect(await screen.findByText("The languages of the cards could not be checked.")).toBeInTheDocument();
      expect(screen.getByText(/library unreachable/)).toBeInTheDocument();
      expect(screen.queryByText("Checking the languages of the cards…")).toBeNull();
      expect(screen.queryByRole("button", { name: "State the language" })).toBeNull();
    });
  });
});
