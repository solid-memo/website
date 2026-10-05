import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { LibraryScreen } from "./LibraryScreen";
import { I18nProvider } from "./i18n";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { statusTexts } from "../test/liveRegions";

const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals.ttl"),
  title: { en: "Capitals of the world" },
  cardCount: 243,
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  description: { en: "Every country and its capital, from Wikipedia." },
  direction: "front-to-back",
  sources: [],
};
const rivers: LibraryDeck = {
  url: "https://solid-memo.com/decks/rivers.ttl",
  ...firstRelease("https://solid-memo.com/decks/rivers.ttl"),
  title: { en: "Rivers" },
  cardCount: 1,
  authors: [],
  direction: "front-to-back",
  sources: [],
};

/** A fresh memory key per render, so no test sees another's ticks. */
let renders = 0;

function renderScreen(
  overrides: Partial<Parameters<typeof LibraryScreen>[0]> = {},
  locale: "en" | "sv" = "en",
) {
  const props = {
    decks: [capitals, rivers],
    memoryKey: `library-test-${++renders}`,
    deckHref: (deck: LibraryDeck) => `#/library-deck?deck=${deck.url}`,
    previewHref: (deck: LibraryDeck) => `#/library-preview?deck=${deck.url}`,
    isImported: () => false,
    busy: false,
    error: null,
    onImport: vi.fn(),
    ...overrides,
  };
  const view = render(
    <I18nProvider locale={locale} onChoose={() => undefined}>
      <LibraryScreen {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
}

function importButton() {
  return screen.getByRole("button", { name: /Import/ });
}

describe("LibraryScreen", () => {
  it("lists every deck with its card count under a heading that is no link to this page", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Deck library" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deck library" })).toBeNull();
    expect(screen.getByText("2 decks")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Capitals of the world" }),
    ).toBeInTheDocument();
    expect(screen.getByText("243 cards")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Rivers" })).toBeInTheDocument();
    expect(screen.getByText("1 card")).toBeInTheDocument();
  });

  it("links each deck's name to its own page and says nothing more about it", () => {
    renderScreen();
    expect(
      screen.getByRole("link", { name: "Capitals of the world" }),
    ).toHaveAttribute("href", `#/library-deck?deck=${capitals.url}`);
    expect(screen.getByRole("link", { name: "Rivers" })).toHaveAttribute(
      "href",
      `#/library-deck?deck=${rivers.url}`,
    );
    expect(screen.queryByText(/Anton Wiklund/)).toBeNull();
    expect(screen.queryByText(/from Wikipedia/)).toBeNull();
    expect(screen.queryByRole("link", { name: "CC0 1.0" })).toBeNull();
  });

  it("links each deck's Preview button to its preview", () => {
    renderScreen();
    expect(
      screen.getByRole("link", { name: "Preview Capitals of the world" }),
    ).toHaveAttribute("href", `#/library-preview?deck=${capitals.url}`);
    expect(screen.getByRole("link", { name: "Preview Rivers" })).toHaveTextContent(
      "Preview",
    );
  });

  it("narrows the list to the chosen topics, broader ones included, and says how many are shown", () => {
    const geography = { ...capitals, themes: ["https://pod.solid-memo.com/vocab/topics#geography"] };
    const swedish = { ...rivers, title: { en: "Swedish nouns" }, themes: ["https://pod.solid-memo.com/vocab/topics#swedish"] };
    renderScreen({ decks: [geography, swedish] });
    const topics = screen.getByRole("group", { name: "Topics" });
    expect([...topics.querySelectorAll("label")].map((l) => l.textContent)).toEqual([
      "Languages",
      "Swedish",
      "Geography",
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Languages" }));
    expect(screen.queryByRole("checkbox", { name: "Capitals of the world" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Swedish nouns" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2 decks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Languages" }));
    expect(screen.getByText("2 decks")).toBeInTheDocument();
  });

  it("names the topics in the language the user reads", () => {
    const swedish = { ...rivers, title: { en: "Swedish nouns" }, themes: ["https://pod.solid-memo.com/vocab/topics#swedish"] };
    renderScreen({ decks: [swedish] }, "sv");
    const topics = screen.getByRole("group", { name: "Ämnen" });
    expect([...topics.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Språk", "Svenska"]);
  });

  it("offers no topics when no deck names one", () => {
    renderScreen();
    expect(screen.queryByRole("group", { name: "Topics" })).toBeNull();
  });

  it("searches names, descriptions and keywords, in every language, and says when nothing matches", () => {
    renderScreen({ decks: [capitals, { ...rivers, keywords: { en: ["water"], sv: ["vattendrag"] } }] });
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "WATER" } });
    expect(screen.getByRole("checkbox", { name: "Rivers" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Capitals of the world" })).toBeNull();
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "vattendrag" } });
    expect(screen.getByRole("checkbox", { name: "Rivers" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Capitals of the world" })).toBeNull();
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "volcano" } });
    expect(screen.getByText("No deck matches.")).toBeInTheDocument();
  });

  it("uses the singular for one deck", () => {
    renderScreen({ decks: [capitals] });
    expect(screen.getByText("1 deck")).toBeInTheDocument();
  });

  it("shows an empty state without decks", () => {
    renderScreen({ decks: [] });
    expect(screen.getByText("The library has no decks yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks decks the instance already holds", () => {
    renderScreen({ isImported: (deck) => deck === rivers });
    expect(screen.getAllByText("Already imported")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Rivers" })).toBeEnabled();
  });

  it("imports the ticked decks, counting them on the button", () => {
    const { props } = renderScreen();
    expect(importButton()).toHaveTextContent("Import selected");
    expect(importButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    expect(importButton()).toHaveTextContent("Import 1 deck");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Capitals of the world" }),
    );
    expect(importButton()).toHaveTextContent("Import 2 decks");
    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    expect(importButton()).toHaveTextContent("Import 1 deck");

    fireEvent.submit(importButton().closest("form")!);
    expect(props.onImport).toHaveBeenCalledWith([capitals]);
  });

  it("locks the form while importing", () => {
    const { props } = renderScreen({ busy: true });
    expect(importButton()).toHaveTextContent("Importing…");
    // Only aria-disabled, so it keeps the focus; what it does is said too.
    expect(importButton()).toHaveAttribute("aria-disabled", "true");
    expect(importButton()).toBeEnabled();
    expect(statusTexts()).toEqual(["Importing…"]);
    fireEvent.submit(importButton().closest("form")!);
    expect(screen.getByRole("checkbox", { name: "Rivers" })).toBeDisabled();
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it("keeps the filters out of the import form, so Enter in the search never imports", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(search.closest("form")).toBeNull();
    expect(screen.getByRole("search")).toContainElement(search);
    expect(importButton().closest("form")).not.toContainElement(search);
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it("imports only the ticked decks the filters still show, and keeps the hidden ones ticked", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Capitals of the world" }));
    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "rivers" } });
    expect(importButton()).toHaveTextContent("Import 1 deck");
    fireEvent.submit(importButton().closest("form")!);
    expect(props.onImport).toHaveBeenCalledWith([rivers]);

    fireEvent.input(screen.getByLabelText("Search"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Capitals of the world" })).toBeChecked();
    expect(importButton()).toHaveTextContent("Import 2 decks");
  });

  it("gives each deck's checkbox a label of its own, above the row's link", () => {
    renderScreen();
    const box = screen.getByRole("checkbox", { name: "Rivers" });
    expect(box.parentElement).toHaveClass("library-pick");
    expect(box.parentElement!.tagName).toBe("LABEL");
  });

  describe("the result count", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("says nothing until the user filters", () => {
      vi.useFakeTimers();
      renderScreen();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(statusTexts()).toEqual([]);
    });

    it("says how many are shown, or that none match, once the typing settles", () => {
      vi.useFakeTimers();
      renderScreen();
      fireEvent.input(screen.getByLabelText("Search"), { target: { value: "riv" } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      fireEvent.input(screen.getByLabelText("Search"), { target: { value: "rivers" } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      // The first keystroke's count was dropped; the second's is not due yet.
      expect(statusTexts()).toEqual([]);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(statusTexts()).toEqual(["1 of 2 decks"]);

      fireEvent.input(screen.getByLabelText("Search"), { target: { value: "volcano" } });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(statusTexts()).toEqual(["No deck matches."]);
    });

    it("says the count after a topic is ticked, and the whole library once it is cleared", () => {
      vi.useFakeTimers();
      const geography = { ...capitals, themes: ["https://pod.solid-memo.com/vocab/topics#geography"] };
      renderScreen({ decks: [geography, rivers] });
      fireEvent.click(screen.getByRole("checkbox", { name: "Geography" }));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(statusTexts()).toEqual(["1 of 2 decks"]);
      fireEvent.click(screen.getByRole("checkbox", { name: "Geography" }));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(statusTexts()).toEqual(["2 decks"]);
    });
  });

  it("shows an import error", () => {
    renderScreen({ error: "pod refused" });
    expect(screen.getByText("pod refused")).toHaveClass("error");
  });
});
