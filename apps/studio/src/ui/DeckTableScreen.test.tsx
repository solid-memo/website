import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { I18nProvider } from "@solid-memo/ui/i18n";
import { DeckTableScreen, type DeckFigures } from "./DeckTableScreen";
import { instanceA, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs", sv: "Verb" });

function renderScreen(figures: (title: string) => DeckFigures, decks = [kanji, verbs]) {
  return render(
    <DeckTableScreen
      instance={instanceA}
      decks={decks}
      figures={(deck) => figures(deck.title.en!)}
      appHref="../#/decks"
    />,
  );
}

describe("DeckTableScreen", () => {
  it("has a row per deck, named by the deck, with its figures", () => {
    renderScreen((title) => (title === "Kanji N5" ? { cards: 12, due: 3 } : { cards: 0, due: 0 }));
    const table = screen.getByRole("table", { name: "The decks of Deck set A" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Deck", "Cards", "Due today"]);
    const row = within(table).getByRole("row", { name: /Kanji N5/ });
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Kanji N5");
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["12", "3"]);
  });

  it("says a figure is being counted, or could not be read", () => {
    renderScreen(() => ({ cards: "loading", due: "unreadable" }), [kanji]);
    const [cards, due] = screen.getAllByRole("cell");
    expect(cards).toHaveTextContent("Counting…");
    expect(due).toHaveTextContent("Could not be read");
  });

  it("sends the user to Solid Memo for decks when there are none", () => {
    renderScreen(() => ({ cards: 0, due: 0 }), []);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "../#/decks");
  });

  it("names a deck in the reader's language, in Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckTableScreen instance={instanceA} decks={[kanji, verbs]} figures={() => ({ cards: 1, due: 0 })} appHref="../" />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Kortlekar" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Verb" })).toBeInTheDocument();
    // An English-only deck is marked as English on a Swedish page.
    expect(screen.getByText("Kanji N5")).toHaveAttribute("lang", "en");
  });
});
