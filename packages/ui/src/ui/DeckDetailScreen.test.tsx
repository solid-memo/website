import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DeckDetailScreen } from "./DeckDetailScreen";
import { I18nProvider } from "./i18n";
import type { Deck } from "@solid-memo/domain/deck";

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

function renderScreen(
  overrides: Partial<Parameters<typeof DeckDetailScreen>[0]> = {},
) {
  const props = {
    deck,
    preferencesHref: "#/deck-preferences?deck=d",
    browseHref: "#/browser?deck=d",
    studioHref: "#/studio?instance=a",
    cardCount: 3,
    dueCount: 2,
    newCount: 1,
    studiedToday: 0,
    busy: false,
    error: null,
    onStudy: vi.fn(),
    onResetDay: vi.fn(),
    ...overrides,
  };
  const view = render(<DeckDetailScreen {...props} />);
  return { ...view, props };
}

describe("DeckDetailScreen", () => {
  it("credits an imported deck's author and licence", () => {
    renderScreen({
      deck: {
        ...deck,
        authors: ["Anton Wiklund"],
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    });
    expect(screen.getByText(/By Anton Wiklund/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC0 1.0 (opens in a new tab)" })).toBeInTheDocument();
  });

  it("shows a notice, when given one, under the provenance", () => {
    renderScreen({ notice: <p role="note">Newer version available</p> });
    expect(screen.getByRole("note")).toHaveTextContent("Newer version available");
  });

  it("says nothing about provenance for a home-made deck", () => {
    renderScreen();
    expect(screen.queryByText(/^By /)).toBeNull();
  });

  it("marks the title with a decorative icon", () => {
    const { container } = renderScreen();
    expect(container.querySelector("h2 svg.icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("names the deck without linking to the page it is on", () => {
    renderScreen();
    expect(screen.queryByRole("link", { name: "Kanji N5" })).toBeNull();
  });

  it("shows the deck name and card count", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Kanji N5" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 cards in this deck/)).toBeInTheDocument();
  });

  it("uses the singular for one card", () => {
    renderScreen({ cardCount: 1 });
    expect(screen.getByText(/1 card in this deck/)).toBeInTheDocument();
  });

  it("presents Study as the primary, and only, session action", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Study" })).toHaveClass(
      "primary",
    );
    expect(screen.queryByRole("button", { name: "Practice" })).toBeNull();
  });

  it("says so, without offering a session, when everything is studied", () => {
    renderScreen({ dueCount: 0, newCount: 0 });
    expect(
      screen.getByText(
        "All cards have been studied — nothing more to study today.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Study" }),
    ).not.toBeInTheDocument();
  });

  it("does not claim an empty deck has been studied", () => {
    renderScreen({ cardCount: 0, dueCount: 0, newCount: 0 });
    expect(
      screen.getByText("This deck has no cards yet. Add some in the Browser."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All cards have been studied/)).toBeNull();
  });

  it("offers Study when nothing is due but new cards remain", () => {
    renderScreen({ dueCount: 0, newCount: 2 });
    expect(screen.getByRole("button", { name: "Study" })).toHaveClass(
      "primary",
    );
    expect(
      screen.getByText("No cards are due today; 2 new to introduce."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All cards have been studied/)).toBeNull();
  });

  it("says how many cards are due and new while cards are due", () => {
    renderScreen({ dueCount: 2, newCount: 1 });
    expect(
      screen.getByText("2 cards due today, and 1 new to introduce."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All cards have been studied/)).toBeNull();
    expect(screen.queryByText(/No cards are due today/)).toBeNull();
  });

  it("says how many cards are due when none are new", () => {
    renderScreen({ dueCount: 1, newCount: 0 });
    expect(screen.getByText("1 card due today.")).toBeInTheDocument();
  });

  describe("resetting the day", () => {
    it("is not offered when nothing was studied today", () => {
      renderScreen();
      expect(
        screen.queryByRole("button", { name: "Reset today's study" }),
      ).toBeNull();
    });

    it("shows how much was studied and resets after confirmation", () => {
      const confirm = vi.fn(() => true);
      vi.stubGlobal("confirm", confirm);
      const { props } = renderScreen({ studiedToday: 12 });
      expect(screen.getByText("12 cards studied today.")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Reset today's study" }),
      );
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('Reset today\'s study of "Kanji N5"? The 12 cards'),
      );
      expect(props.onResetDay).toHaveBeenCalledOnce();
    });

    it("uses the singular for one card", () => {
      renderScreen({ studiedToday: 1 });
      expect(screen.getByText("1 card studied today.")).toBeInTheDocument();
    });

    it("keeps the day when the confirmation is declined", () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      const { props } = renderScreen({ studiedToday: 3 });
      fireEvent.click(
        screen.getByRole("button", { name: "Reset today's study" }),
      );
      expect(props.onResetDay).not.toHaveBeenCalled();
    });

    it("is offered on the 'all studied' screen — where it is wanted most", () => {
      renderScreen({ dueCount: 0, newCount: 0, studiedToday: 5 });
      expect(screen.getByText(/All cards have been studied/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reset today's study" }),
      ).toBeEnabled();
    });

    it("locks the screen while resetting, and shows a failure", () => {
      renderScreen({ studiedToday: 3, busy: true, error: "reset refused" });
      expect(screen.getByRole("button", { name: "Resetting…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Study" })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent("reset refused");
    });
  });

  it("starts a study session", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Study" }));
    expect(props.onStudy).toHaveBeenCalledOnce();
  });

  it("links to the browser", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Browser" })).toHaveAttribute(
      "href",
      "#/browser?deck=d",
    );
  });

  it("links to the deck's instance in the Studio", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Open in Studio" })).toHaveAttribute("href", "#/studio?instance=a");
  });

  it("links to the deck's preferences above the Browser's link", () => {
    renderScreen();
    const preferences = screen.getByRole("link", { name: "Deck preferences" });
    expect(preferences).toHaveTextContent("Preferences");
    expect(preferences).toHaveAttribute("href", "#/deck-preferences?deck=d");
    expect(preferences.nextElementSibling).toBe(screen.getByRole("link", { name: "Browser" }));
  });

  it("offers no editing: cards are added and edited in the Browser", () => {
    renderScreen();
    expect(screen.queryByRole("link", { name: "Add card" })).toBeNull();
    expect(
      screen.getByText(/Add, edit or remove cards in the Browser/),
    ).toBeInTheDocument();
  });

  it("shows the deck's description when it has one", () => {
    renderScreen({ deck: { ...deck, description: { en: "The kanji of JLPT N5." } } });
    expect(screen.getByText("The kanji of JLPT N5.")).toBeInTheDocument();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckDetailScreen
          deck={deck}
          preferencesHref="#/deck-preferences?deck=d"
          browseHref="#/browser?deck=d"
          studioHref="#/studio?instance=a"
          cardCount={3}
          dueCount={2}
          newCount={1}
          studiedToday={0}
          busy={false}
          error={null}
          onStudy={vi.fn()}
          onResetDay={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("2 kort att repetera idag, och 1 nytt att introducera.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studera" })).toBeInTheDocument();
    // An English-only deck's name is marked English on a Swedish page.
    expect(screen.getByText("Kanji N5")).toHaveAttribute("lang", "en");
  });
});
