import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { BrowserScreen, CARDS_PER_PAGE } from "./BrowserScreen";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { I18nProvider } from "./i18n";
import { statusTexts } from "../test/liveRegions";
import { recentLanguages, rememberLanguage } from "./remembered";

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

const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};

function renderProps(overrides: Partial<Parameters<typeof BrowserScreen>[0]> = {}) {
  return {
    deck,
    deckHref: "#/deck?deck=d",
    cards: [card],
    page: 1,
    busy: false,
    error: null,
    onDescribeDeck: vi.fn(),
    onChangeDirection: vi.fn(),
    addCardHref: "#/new-card?deck=d",
    cardHref: (c: Card) => `#/card?card=${c.id}`,
    onRemoveCard: vi.fn(),
    onPageChange: vi.fn(),
    onLanguageFilterChange: vi.fn(),
    ...overrides,
    // Every card listed is the user's to settle, unless a test says otherwise.
    toSettle: overrides.toSettle ?? overrides.cards ?? [card],
  };
}

function renderScreen(
  overrides: Partial<Parameters<typeof BrowserScreen>[0]> = {},
) {
  const props = renderProps(overrides);
  const view = render(<BrowserScreen {...props} />);
  return { ...view, props };
}

describe("BrowserScreen deck editing", () => {
  it("shows what the deck says about itself, and describes it anew", () => {
    const { props } = renderScreen({
      deck: {
        ...deck,
        description: { en: "Kanji of the N5 level." },
        themes: ["https://pod.solid-memo.com/vocab/topics#languages"],
        keywords: { en: ["kanji", "JLPT"] },
      },
    });
    const about = screen.getByRole("region", { name: "About this deck" });
    expect(about).toHaveTextContent("Kanji of the N5 level.");
    expect(about).toHaveTextContent("Topics: Languages · Keywords: kanji, JLPT");

    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Description")).toHaveValue("Kanji of the N5 level.");
    expect(screen.getByLabelText("Description")).not.toHaveAttribute("lang");
    expect(screen.getByLabelText("Description")).toHaveAccessibleDescription("Language: English");
    expect(screen.getByLabelText("Keywords (optional)")).toHaveValue("kanji, JLPT");
    expect(screen.getByLabelText("Keywords (optional)")).toHaveAccessibleDescription(
      "Language: English Separate keywords with commas; add keywords in another language as a translation.",
    );
    expect(screen.getByRole("checkbox", { name: "Languages" })).toBeChecked();
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "The N5 kanji." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Languages" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Science" }));
    fireEvent.input(screen.getByLabelText("Keywords (optional)"), { target: { value: "kanji, , N5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));

    expect(props.onDescribeDeck).toHaveBeenCalledWith({
      description: { en: "The N5 kanji." },
      topics: ["https://pod.solid-memo.com/vocab/topics#science"],
      keywords: { en: ["kanji", "N5"] },
    });
    expect(screen.getByRole("button", { name: "Describe deck" })).toBeInTheDocument();
  });

  it("shows only what a deck states, and cancels describing", () => {
    renderScreen({ deck: { ...deck, keywords: { en: ["kanji"] } } });
    const about = screen.getByRole("region", { name: "About this deck" });
    expect(about).toHaveTextContent(/^Keywords: kanjiDescribe deck$/);
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Description")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel describing" }));
    expect(screen.queryByLabelText("Description")).toBeNull();
  });

  it("asks for the language of a translation of the description before saving it", () => {
    const { props } = renderScreen({ deck: { ...deck, description: { en: "Kanji of the N5 level." } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "Kanji på nivå N5." } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).not.toHaveBeenCalled();
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveFocus();
    expect(picker).toHaveAccessibleDescription("Choose the language of the description.");
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenCalledWith({
      description: { en: "Kanji of the N5 level.", sv: "Kanji på nivå N5." },
      topics: [],
      keywords: {},
    });
  });

  it("starts a description in the language of the deck's name, and forgets a question on Cancel", () => {
    renderScreen({ deck: { ...deck, title: { ja: "漢字" } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Description")).toHaveAttribute("lang", "ja");
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "N5" } });
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "N5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(document.getElementById("deck-description-error")).toHaveTextContent("Choose the language of the description.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel describing" }));
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(document.getElementById("deck-description-error")).toHaveTextContent("");
  });

  it("starts a description and keywords for a deck with no name in the language last chosen on this device, else none", () => {
    localStorage.clear();
    renderScreen({ deck: { ...deck, title: {} } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getAllByRole("button", { name: "Language: not stated" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancel describing" }));
    rememberLanguage("deck", "fi");
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Description")).toHaveAttribute("lang", "fi");
    expect(screen.getByLabelText("Keywords (optional)")).toHaveAttribute("lang", "fi");
    localStorage.clear();
  });

  it("shows only the keywords in the reader's language, and those in none", () => {
    const keywords = { en: ["kanji", "JLPT"], sv: ["kanji-tecken"], "": ["N5"] };
    renderScreen({ deck: { ...deck, keywords } });
    expect(screen.getByRole("region", { name: "About this deck" })).toHaveTextContent(/^Keywords: kanji, JLPT, N5Describe deck$/);
    cleanup();
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <BrowserScreen {...renderProps({ deck: { ...deck, keywords } })} />
      </I18nProvider>,
    );
    expect(screen.getByRole("region", { name: "Om den här kortleken" })).toHaveTextContent(/^Nyckelord: kanji-tecken, N5Beskriv kortleken$/);
  });

  it("shows no keyword line when no keyword is in the reader's language", () => {
    renderScreen({ deck: { ...deck, themes: ["https://pod.solid-memo.com/vocab/topics#geography"], keywords: { sv: ["kanji-tecken"] } } });
    expect(screen.getByRole("region", { name: "About this deck" })).toHaveTextContent(/^Topics: GeographyDescribe deck$/);
  });

  it("edits the keywords per language, clearing one language leaving the others", () => {
    const { props } = renderScreen({
      deck: { ...deck, description: { en: "Kanji." }, keywords: { sv: ["tecken"], en: ["kanji"] } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Keywords (optional)")).toHaveValue("kanji");
    expect(screen.getByLabelText("Keywords (optional)")).not.toHaveAttribute("lang");
    expect(screen.getByLabelText("Text in Swedish")).toHaveValue("tecken");
    expect(screen.getByLabelText("Text in Swedish")).toHaveAttribute("lang", "sv");
    fireEvent.input(screen.getByLabelText("Keywords (optional)"), { target: { value: " , " } });
    fireEvent.input(screen.getByLabelText("Text in Swedish"), { target: { value: "tecken, skrivtecken, tecken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenCalledWith({
      description: { en: "Kanji." },
      topics: [],
      keywords: { sv: ["tecken", "skrivtecken"] },
    });
  });

  it("asks for the language of keywords before saving them, and forgets the question on Cancel", () => {
    localStorage.clear();
    const { props } = renderScreen({ deck: { ...deck, description: { en: "Kanji." }, keywords: { en: ["kanji"] } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    // The description's translations are open from the start; the keywords' behind their toggle.
    fireEvent.click(screen.getAllByRole("button", { name: "Translations (0)" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a translation" })[1]!);
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "tecken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).not.toHaveBeenCalled();
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveFocus();
    expect(picker).toHaveAccessibleDescription("Choose the language of the keywords.");
    expect(document.getElementById("deck-keywords-error")).toHaveTextContent("Choose the language of the keywords.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel describing" }));
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(document.getElementById("deck-keywords-error")).toHaveTextContent("");

    fireEvent.click(screen.getAllByRole("button", { name: "Translations (0)" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a translation" })[1]!);
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "tecken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    fireEvent.click(screen.getByRole("button", { name: "Language: not stated" }));
    expect(screen.getByRole("group", { name: "Language of the keywords" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    expect(document.getElementById("deck-keywords-error")).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenCalledWith({
      description: { en: "Kanji." },
      topics: [],
      keywords: { en: ["kanji"], sv: ["tecken"] },
    });
    expect(recentLanguages("deck")).toEqual(["en", "sv"]);
    localStorage.clear();
  });

  it("keeps keywords saved with no language as they are, or some removed, and asks their language for any added", () => {
    const { props } = renderScreen({ deck: { ...deck, description: { en: "Kanji." }, keywords: { "": ["kanji", "N5"] } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Keywords (optional)")).toHaveValue("kanji, N5");
    expect(screen.getByLabelText("Keywords (optional)")).toHaveAccessibleDescription(
      "Language: not stated Separate keywords with commas; add keywords in another language as a translation.",
    );
    fireEvent.input(screen.getByLabelText("Keywords (optional)"), { target: { value: "N5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenLastCalledWith({ description: { en: "Kanji." }, topics: [], keywords: { "": ["N5"] } });

    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    fireEvent.input(screen.getByLabelText("Keywords (optional)"), { target: { value: "kanji, JLPT" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenCalledTimes(1);
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveFocus();
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(props.onDescribeDeck).toHaveBeenLastCalledWith({ description: { en: "Kanji." }, topics: [], keywords: { en: ["kanji", "JLPT"] } });
  });

  it("starts keywords in the language of the description, not one it does not state", () => {
    renderScreen({ deck: { ...deck, title: { ja: "漢字" }, description: { "": "Kanji." } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Keywords (optional)")).toHaveAttribute("lang", "ja");
    fireEvent.click(screen.getByRole("button", { name: "Cancel describing" }));
    cleanup();
    renderScreen({ deck: { ...deck, description: { sv: "Kanji." } } });
    fireEvent.click(screen.getByRole("button", { name: "Describe deck" }));
    expect(screen.getByLabelText("Keywords (optional)")).toHaveAttribute("lang", "sv");
  });

  it("shows topics alone, and nothing more for a deck that says nothing", () => {
    renderScreen({ deck: { ...deck, themes: ["https://pod.solid-memo.com/vocab/topics#geography"] } });
    expect(screen.getByRole("region", { name: "About this deck" })).toHaveTextContent(/^Topics: GeographyDescribe deck$/);
  });

  it("offers the three study directions, showing the deck's own", () => {
    const { props } = renderScreen();
    expect(
      screen.getByRole("group", { name: "Study direction" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Study direction" }))
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["front-to-back", "back-to-front", "bidirectional"]);
    expect(screen.getByRole("radio", { name: "Front → back" })).toBeChecked();
    expect(screen.getByRole("group", { name: "Study direction" })).toHaveAccessibleDescription(
      "Change it any time; what you have learnt each way is kept.",
    );

    fireEvent.click(screen.getByLabelText("Both ways"));
    expect(props.onChangeDirection).toHaveBeenCalledWith("bidirectional");
  });

  it("explains a bidirectional deck, and locks the choice while busy", () => {
    renderScreen({ deck: { ...deck, direction: "bidirectional" }, busy: true });
    const both = screen.getByRole("radio", { name: "Both ways" });
    expect(both).toBeChecked();
    expect(both).toBeDisabled();
    expect(
      screen.getByText("Every card is asked both ways, each way scheduled on its own."),
    ).toBeInTheDocument();
  });

});

describe("BrowserScreen", () => {
  it("names the actions column for screen readers", () => {
    renderScreen();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Front", "Back", "Actions"]);
  });

  it("marks the title with a decorative icon", () => {
    const { container } = renderScreen();
    expect(container.querySelector("h2 svg.icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("links the deck's name to the deck's page", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      "#/deck?deck=d",
    );
  });

  it("lists the deck's cards under a Browser heading", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Browser: Kanji N5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Browser lists every card in this deck/),
    ).toBeInTheDocument();
    expect(screen.getByText("水")).toBeInTheDocument();
    expect(screen.getByText("water")).toBeInTheDocument();
  });

  it("shows an empty state without cards", () => {
    renderScreen({ cards: [] });
    expect(
      screen.getByText("No cards in this deck yet."),
    ).toBeInTheDocument();
  });

  it("hides retired cards until asked, then lists them marked", () => {
    const retired: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { "": "火" }, retired: true };
    const { container } = renderScreen({ cards: [card, retired] });
    expect(screen.queryByText("火")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Show retired cards" })).toHaveAccessibleDescription(
      "1 card is retired: kept, with its review history, but no longer studied.",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Show retired cards" }));
    expect(screen.getByText("火")).toBeInTheDocument();
    expect(container.querySelector("tr.retired")).toHaveTextContent("火Retired");
  });

  it("marks a card with a side that does not say its language, outside its link", () => {
    const tagged: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { ja: "火" }, back: { en: "fire" } };
    const backOnly: Card = { ...tagged, id: "card-3", url: `${deck.cardsDocumentUrl}#card-3`, front: { ja: "木" }, back: { "": "tree" } };
    renderScreen({ cards: [card, tagged, backOnly] });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).queryByText("No language stated") !== null)).toEqual([true, false, true]);
    expect(within(rows[0]!).getByRole("link", { name: "水" })).toBeInTheDocument();
  });

  it("marks no card for notes or a label saved the same in English and another language", () => {
    const same: Card = {
      ...card,
      id: "card-2",
      url: `${deck.cardsDocumentUrl}#card-2`,
      front: { ja: "火" },
      back: { en: "fire" },
      frontNote: { en: "Kanji", sv: "Kanji" },
    };
    renderScreen({ cards: [same], toSettle: [same] });
    expect(screen.queryByText("No language stated")).toBeNull();
    expect(screen.queryByRole("group", { name: "Cards to list" })).toBeNull();
  });

  it("neither marks nor offers to list a card still as its library release has it", () => {
    const released: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { "": "火" } };
    const { props, rerender } = renderScreen({ cards: [card, released], toSettle: [card] });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).queryByText("No language stated") !== null)).toEqual([true, false]);
    rerender(<BrowserScreen {...props} languageFilter="unstated" />);
    expect(screen.getAllByRole("row").slice(1).map((row) => row.querySelector("a")!.textContent)).toEqual(["水"]);
    // With none the user's to settle, there is nothing to mark or narrow down to.
    rerender(<BrowserScreen {...props} languageFilter="unstated" toSettle={[]} />);
    expect(screen.queryByText("No language stated")).toBeNull();
    expect(screen.queryByRole("group", { name: "Cards to list" })).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("lists the cards of the route's language filter, and asks for another", () => {
    const tagged = Array.from({ length: CARDS_PER_PAGE }, (_, i): Card => ({
      ...card,
      id: `tagged-${i}`,
      url: `${deck.cardsDocumentUrl}#tagged-${i}`,
      front: { ja: `${i}` },
      back: { en: `Tagged ${i}` },
    }));
    const same: Card = { ...tagged[0]!, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { ja: "火" }, backLabel: { en: "x", sv: "x" } };
    const cards = [...tagged, card, same];
    const { props, rerender } = renderScreen({ cards });
    const filter = screen.getByRole("group", { name: "Cards to list" });
    expect(within(filter).getByRole("radio", { name: "All cards" })).toBeChecked();
    expect(screen.getByText("Cards 1–10 of 12. Open a card to edit it.")).toBeInTheDocument();
    fireEvent.click(within(filter).getByRole("radio", { name: "No language stated" }));
    expect(props.onLanguageFilterChange).toHaveBeenCalledWith("unstated");

    rerender(<BrowserScreen {...props} languageFilter="unstated" />);
    expect(screen.getByRole("radio", { name: "No language stated" })).toBeChecked();
    expect(screen.getAllByRole("row").slice(1).map((row) => row.querySelector("a")!.textContent)).toEqual(["水"]);
    expect(screen.getByText("Open a card to edit it.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "All cards" }));
    expect(props.onLanguageFilterChange).toHaveBeenLastCalledWith(undefined);
  });

  it("offers no language filter when every card's language is settled, listing all of them", () => {
    const tagged: Card = { ...card, front: { ja: "水" }, back: { en: "water" } };
    const { rerender, props } = renderScreen({ cards: [card], languageFilter: "unstated" });
    // Once the last such card says its language, the list is whole again.
    rerender(<BrowserScreen {...props} cards={[tagged]} toSettle={[tagged]} />);
    expect(screen.queryByRole("group", { name: "Cards to list" })).toBeNull();
    expect(screen.getByRole("link", { name: "水" })).toBeInTheDocument();
    expect(screen.queryByText("No language stated")).toBeNull();
  });

  it("offers no retired cards to show when there are none, and says so when every card is retired", () => {
    renderScreen();
    expect(screen.queryByRole("checkbox", { name: "Show retired cards" })).toBeNull();
    renderScreen({ cards: [{ ...card, retired: true }, { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, retired: true }] });
    expect(screen.getByText("Every card in this deck is retired.")).toBeInTheDocument();
    expect(screen.getByText(/2 cards are retired: kept, with their review history/)).toBeInTheDocument();
  });

  it("removes a card after confirmation", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remove card 水" }));
    expect(confirm).toHaveBeenCalledWith(
      'Remove the card "水"? This cannot be undone.',
    );
    expect(props.onRemoveCard).toHaveBeenCalledWith(card);
  });

  it("does not remove a card when the confirmation is declined", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remove card 水" }));
    expect(props.onRemoveCard).not.toHaveBeenCalled();
  });

  it("links each row to the card's own page", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "水" })).toHaveAttribute(
      "href",
      "#/card?card=card-1",
    );
    const cell = screen.getByText("water").closest("td")!;
    expect(cell.closest('[aria-hidden="true"]')).toBeNull();
    const overlay = cell.querySelector("a")!;
    expect(overlay).toHaveAttribute("href", "#/card?card=card-1");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getAllByRole("link").map((link) => link.textContent?.trim()),
    ).toEqual(["Kanji N5", "Add card", "水"]);
  });

  it("reads a picture-only back by its description, outside the row's link", () => {
    const { container } = renderScreen({
      cards: [{ ...card, back: {}, backImageUrl: "https://example.org/map.png", backImageDescription: { en: "A map" } }],
    });
    const picture = screen.getByRole("img", { name: "A map" });
    expect(container.querySelector(".back-cell")).toContainElement(picture);
    expect(picture.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("shows a card's pictures beside its text, and names a picture card by its back", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const flag = "https://flagcdn.com/af.svg";
    const { props, container } = renderScreen({
      cards: [{ ...card, front: {}, frontImageUrl: flag, back: { "": "Afghanistan" } }],
    });
    const thumbnail = container.querySelector("td a img.card-thumbnail")!;
    expect(thumbnail).toHaveAttribute("src", flag);
    expect(screen.getByText("Afghanistan")).toBeInTheDocument();
    // The back cell's link is hidden from screen readers, so the picture
    // names the row's link after the back.
    expect(
      screen.getByRole("link", { name: "Picture for: Afghanistan" }),
    ).toHaveAttribute("href", `#/card?card=${card.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Remove card Afghanistan" }));
    expect(confirm).toHaveBeenCalledWith(
      'Remove the card "Afghanistan"? This cannot be undone.',
    );
    expect(props.onRemoveCard).not.toHaveBeenCalled();
  });

  it("no longer edits cards in place", () => {
    renderScreen();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByLabelText("Front")).toBeNull();
  });

  it("shows errors", () => {
    renderScreen({ error: "card failure" });
    expect(screen.getByRole("alert")).toHaveTextContent("card failure");
  });

  it("links to the card creator, even while busy", () => {
    renderScreen({ busy: true });
    expect(screen.getByRole("link", { name: "Add card" })).toHaveAttribute("href", "#/new-card?deck=d");
  });
});

describe("BrowserScreen pagination", () => {
  /** `count` cards named "Card 1" … "Card N". */
  function manyCards(count: number): Card[] {
    return Array.from({ length: count }, (_, i) => ({
      ...card,
      id: `card-${i + 1}`,
      url: `${deck.cardsDocumentUrl}#card-${i + 1}`,
      front: { "": `Card ${i + 1}` },
      back: { "": `Back ${i + 1}` },
    }));
  }

  it("keeps the remove button focused while it removes, and ignores it meanwhile", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props, rerender } = renderScreen({ cards: manyCards(3) });
    const remove = screen.getByRole("button", { name: "Remove card Card 2" });
    remove.focus();
    fireEvent.click(remove);
    rerender(<BrowserScreen {...props} busy />);
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveFocus();
    fireEvent.click(remove);
    expect(confirm).toHaveBeenCalledOnce();
    expect(props.onRemoveCard).toHaveBeenCalledOnce();
  });

  it("once a card is removed, focuses the card now in its row and says it is gone", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const cards = manyCards(3);
    const { props, rerender } = renderScreen({ cards });
    fireEvent.click(screen.getByRole("button", { name: "Remove card Card 2" }));
    rerender(<BrowserScreen {...props} busy />);
    // Gone from the list before the mutation settles: the focus waits for it.
    rerender(<BrowserScreen {...props} cards={[cards[0], cards[2]]} busy />);
    expect(statusTexts()).toEqual([]);
    rerender(<BrowserScreen {...props} cards={[cards[0], cards[2]]} />);
    expect(screen.getByRole("link", { name: "Card 3" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Removed the card "Card 2".']);

    // The next removal clears what was said.
    fireEvent.click(screen.getByRole("button", { name: "Remove card Card 3" }));
    expect(statusTexts()).toEqual([]);
  });

  it("focuses the last row when the last card goes, the page before's once a page empties, and Add card at the end", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const cards = manyCards(CARDS_PER_PAGE + 1);
    const { props, rerender } = renderScreen({ cards, page: 2 });
    fireEvent.click(screen.getByRole("button", { name: `Remove card Card ${CARDS_PER_PAGE + 1}` }));
    rerender(<BrowserScreen {...props} cards={cards.slice(0, CARDS_PER_PAGE)} />);
    expect(screen.getByRole("link", { name: `Card ${CARDS_PER_PAGE}` })).toHaveFocus();

    rerender(<BrowserScreen {...props} cards={[cards[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove card Card 1" }));
    rerender(<BrowserScreen {...props} cards={[]} />);
    expect(screen.getByRole("link", { name: "Add card" })).toHaveFocus();
  });

  it("leaves the focus be when a removal fails", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { props, rerender } = renderScreen({ cards: manyCards(2) });
    const remove = screen.getByRole("button", { name: "Remove card Card 1" });
    remove.focus();
    fireEvent.click(remove);
    rerender(<BrowserScreen {...props} busy />);
    rerender(<BrowserScreen {...props} error="refused" />);
    expect(remove).toHaveFocus();
    expect(statusTexts()).toEqual([]);
  });

  it("shows no pager when everything fits on one page", () => {
    renderScreen({ cards: manyCards(CARDS_PER_PAGE) });
    expect(screen.queryByRole("navigation", { name: "Card pages" })).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(CARDS_PER_PAGE + 1);
    expect(screen.getByText("Open a card to edit it.")).toBeInTheDocument();
  });

  it("shows only the current page and where it sits in the deck", () => {
    const cards = manyCards(CARDS_PER_PAGE * 2 + 3);
    renderScreen({ cards, page: 2 });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(CARDS_PER_PAGE);
    expect(rows[0]).toHaveTextContent(`Card ${CARDS_PER_PAGE + 1}`);
    expect(rows[rows.length - 1]).toHaveTextContent(`Card ${CARDS_PER_PAGE * 2}`);
    expect(
      screen.getByText(
        `Cards ${CARDS_PER_PAGE + 1}–${CARDS_PER_PAGE * 2} of ${cards.length}. Open a card to edit it.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("moves to the previous and next page", () => {
    const { props } = renderScreen({ cards: manyCards(CARDS_PER_PAGE * 3), page: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const cards = manyCards(CARDS_PER_PAGE + 1);
    const first = renderScreen({ cards, page: 1 });
    expect(screen.getByRole("button", { name: "Previous" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("aria-disabled", "false");
    first.unmount();

    renderScreen({ cards, page: 2 });
    expect(screen.getByRole("button", { name: "Previous" })).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });

  it("clamps an out-of-range page to the nearest one", () => {
    const cards = manyCards(CARDS_PER_PAGE + 1);
    const high = renderScreen({ cards, page: 99 });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    high.unmount();

    renderScreen({ cards, page: 0 });
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });
});

describe("BrowserScreen in Swedish", () => {
  it("speaks Swedish, the retired cards and their toggle too", () => {
    const retired: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, retired: true };
    const same: Card = { ...card, id: "card-3", url: `${deck.cardsDocumentUrl}#card-3`, front: { ja: "火" }, back: { en: "fire" }, frontNote: { en: "Kanji", sv: "Kanji" } };
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <BrowserScreen
          deck={deck}
          deckHref="#/deck?deck=d"
          cards={[card, retired, same]}
          toSettle={[card, retired, same]}
          page={1}
          busy={false}
          error={null}
          onDescribeDeck={vi.fn()}
          onChangeDirection={vi.fn()}
          addCardHref="#/new-card?deck=d"
          cardHref={(c) => `#/card?card=${c.id}`}
          onRemoveCard={vi.fn()}
          onPageChange={vi.fn()}
          onLanguageFilterChange={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Bläddra: Kanji N5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lägg till kort" })).toBeInTheDocument();
    expect(screen.getByText("Framsida → baksida")).toBeInTheDocument();
    expect(screen.getByText(/1 kort är ur bruk: det sparas/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Framsida" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Kort som visas" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alla kort" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Inget språk angivet" })).not.toBeChecked();
    expect(screen.getByRole("row", { name: /水/ })).toHaveTextContent("Inget språk angivet");
    expect(screen.getByRole("row", { name: /火/ })).not.toHaveTextContent("Inget språk angivet");
  });

  it("marks deck and card text in another language than Swedish with its language", () => {
    const translated = { ...deck, description: { en: "Kanji of the N5 level.", sv: "Kanji på nivå N5." } };
    const english: Card = { ...card, front: { ja: "水" }, back: { en: "water", sv: "vatten" } };
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <BrowserScreen
          deck={translated}
          deckHref="#/deck?deck=d"
          cards={[english]}
          page={1}
          busy={false}
          error={null}
          onDescribeDeck={vi.fn()}
          onChangeDirection={vi.fn()}
          addCardHref="#/new-card?deck=d"
          cardHref={(c) => `#/card?card=${c.id}`}
          onRemoveCard={vi.fn()}
          onPageChange={vi.fn()}
          onLanguageFilterChange={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Kanji N5")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Kanji på nivå N5.")).not.toHaveAttribute("lang");
    expect(screen.getByText("水")).toHaveAttribute("lang", "ja");
    expect(container.querySelector(".back-cell")).toHaveTextContent("vatten");
    expect(container.querySelector(".back-cell [lang]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Beskriv kortleken" }));
    const description = screen.getByLabelText("Beskrivning");
    // The text the reader sees is the one edited first; the others are its translations.
    expect(description).toHaveValue("Kanji på nivå N5.");
    expect(description).not.toHaveAttribute("lang");
    expect(description).toHaveAccessibleDescription("Språk: svenska");
    expect(screen.getByLabelText("Text på engelska")).toHaveValue("Kanji of the N5 level.");
    expect(screen.getByLabelText("Text på engelska")).toHaveAttribute("lang", "en");
  });

  it("edits first the description the reader sees, marked with its language", () => {
    // A reader who prefers German sees the German, and edits it first.
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["de"]);
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <BrowserScreen
          deck={{ ...deck, description: { en: "Kanji of the N5 level.", de: "Kanji der Stufe N5." } }}
          deckHref="#/deck?deck=d"
          cards={[]}
          page={1}
          busy={false}
          error={null}
          onDescribeDeck={vi.fn()}
          onChangeDirection={vi.fn()}
          addCardHref="#/new-card?deck=d"
          cardHref={(c) => `#/card?card=${c.id}`}
          onRemoveCard={vi.fn()}
          onPageChange={vi.fn()}
          onLanguageFilterChange={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Beskriv kortleken" }));
    const description = screen.getByLabelText("Beskrivning");
    expect(description).toHaveValue("Kanji der Stufe N5.");
    expect(description).toHaveAttribute("lang", "de");
    expect(description).toHaveAccessibleDescription("Språk: tyska");
    expect(screen.getByLabelText("Text på engelska")).toHaveValue("Kanji of the N5 level.");
    languages.mockRestore();
  });
});
