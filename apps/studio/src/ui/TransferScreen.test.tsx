import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DeckFile } from "@solid-memo/domain/deckFile";
import { TransferScreen } from "./TransferScreen";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });

const file: DeckFile = {
  name: "capitals.ttl",
  format: "turtle",
  content: {
    deck: { ...makeDeck("deck-x", { en: "Capitals" }), completedChapters: ["https://lib.example/c.ttl#ch1"] },
    cards: [makeCard(kanji, "a"), makeCard(kanji, "b")],
    reviews: [
      {
        cardId: "a",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-10-01",
        firstReviewedAt: "2026-09-30T10:00:00.000Z",
        lastReviewedAt: "2026-09-30T10:00:00.000Z",
        formatVersion: 2,
      },
    ],
    upgraded: [{ kind: "card", subject: "x", from: 1, to: 5 }],
    dropped: ["y", "z"],
  },
};

type Props = Parameters<typeof TransferScreen>[0];

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    instance: instanceA,
    decks: [kanji, verbs],
    chosen: [],
    onChoose: vi.fn(),
    exporting: null,
    exported: null,
    exportError: null,
    onExport: vi.fn(),
    file: null,
    opening: false,
    openError: null,
    onOpen: vi.fn(),
    importing: false,
    imported: null,
    importError: null,
    onImport: vi.fn(),
    importReadOnly: null,
    healthHref: "#/health",
    cardsHref: (deck) => `#/cards?deck=${deck.id}`,
    ...overrides,
  };
  render(<TransferScreen {...props} />);
  return props;
}

describe("TransferScreen", () => {
  it("ticks the decks to export, and exports them in the format chosen, with progress when asked", () => {
    const props = renderScreen({ chosen: [verbs.url] });
    expect(screen.getByRole("heading", { name: "Import and export decks of Deck set A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Kanji N5" }));
    expect(props.onChoose).toHaveBeenCalledWith([verbs.url, kanji.url]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Verbs" }));
    expect(props.onChoose).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole("radio", { name: "JSON-LD (.jsonld)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Include my progress/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export 1 deck" }));
    expect(props.onExport).toHaveBeenCalledWith([verbs], { format: "jsonld", withProgress: true });
  });

  it("exports nothing until a deck is ticked", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Export 0 decks" })).toBeDisabled();
  });

  it("says which deck it is exporting, then how many it exported", () => {
    renderScreen({ chosen: [kanji.url, verbs.url], exporting: { deck: verbs, index: 1, total: 2 } });
    expect(screen.getByText("Exporting Verbs (2 of 2)…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 2 decks" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Kanji N5" })).toBeDisabled();
  });

  it("says how many decks it handed the browser, and that it may ask to allow several downloads", () => {
    renderScreen({ exported: 2 });
    expect(
      screen.getByText(
        "Handed 2 decks to your browser, each to save as a download of its own. It may ask you to allow several downloads: those it blocks are not saved.",
      ),
    ).toBeInTheDocument();
  });

  it("says when there is nothing to export, and still imports", () => {
    const props = renderScreen({ decks: [] });
    expect(screen.getByText("This instance has no decks to export yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose a file…" }));
    expect(props.onOpen).toHaveBeenCalled();
  });

  it("says what a file holds, and imports it with its progress, or without", () => {
    const props = renderScreen({ file });
    expect(screen.getByRole("heading", { name: "capitals.ttl: Capitals" })).toBeInTheDocument();
    for (const line of [
      "2 cards",
      "Progress: 1 review state",
      "1 completed chapter",
      "1 part of it is in an older format, and is brought up to date.",
      "2 parts of it cannot be read, and are left out.",
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Import into Deck set A" }));
    expect(props.onImport).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Import the progress too" }));
    fireEvent.click(screen.getByRole("button", { name: "Import into Deck set A" }));
    expect(props.onImport).toHaveBeenLastCalledWith(false);
  });

  it("holds the import while the catalogue may not be changed, a file still read", () => {
    const props = renderScreen({ file, importReadOnly: "setAside" });
    expect(screen.getByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import into Deck set A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose a file…" })).toBeEnabled();
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it("offers no progress to import when the file has none", () => {
    const bare: DeckFile = { ...file, content: { ...file.content, deck: makeDeck("deck-x", { en: "Capitals" }), reviews: undefined, upgraded: [], dropped: [] } };
    const props = renderScreen({ file: bare });
    expect(screen.queryByRole("checkbox", { name: "Import the progress too" })).toBeNull();
    expect(screen.queryByText(/Progress/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import into Deck set A" }));
    expect(props.onImport).toHaveBeenCalledWith(false);
  });

  it("says while it reads a file", () => {
    renderScreen({ opening: true });
    expect(screen.getByText("Reading the file…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a file…" })).toBeDisabled();
  });

  it("says while it imports", () => {
    renderScreen({ file, importing: true });
    expect(screen.getByText("Importing the deck…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import into Deck set A" })).toBeDisabled();
  });

  it("links to the deck it imported", () => {
    renderScreen({ imported: kanji });
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/cards?deck=deck-1");
    expect(screen.getByText(/Imported/)).toBeInTheDocument();
  });
});
