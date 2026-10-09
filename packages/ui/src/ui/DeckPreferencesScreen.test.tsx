import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Deck } from "@solid-memo/domain/deck";
import { DeckPreferencesScreen } from "./DeckPreferencesScreen";
import { I18nProvider } from "./i18n";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: [],
};

const SETTLED = { unstatedCounts: { front: 0, back: 0 } };

function renderScreen(overrides: Partial<Parameters<typeof DeckPreferencesScreen>[0]> = {}) {
  const props = {
    deck,
    deckHref: "#/deck?deck=d",
    preferences: { newCardsPerDay: 20, maxReviewsPerDay: 200 },
    preferencesHref: "#/preferences?instance=a",
    busy: false,
    error: null,
    onSave: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    languages: SETTLED,
    onStateLanguages: vi.fn(),
    ...overrides,
  };
  render(<DeckPreferencesScreen {...props} />);
  return props;
}

describe("DeckPreferencesScreen", () => {
  it("links the deck in its heading", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Preferences: Kanji N5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/deck?deck=d");
  });

  it("says an empty field uses the default, and links to where it is set", () => {
    renderScreen();
    expect(screen.getByText(/An empty field defaults to your/)).toHaveTextContent(
      "An empty field defaults to your study preferences.",
    );
    expect(screen.getByRole("link", { name: "study preferences" })).toHaveAttribute(
      "href",
      "#/preferences?instance=a",
    );
  });

  it("shows the deck's own limits, and the preferences' where it sets none", () => {
    renderScreen({ deck: { ...deck, newCardsPerDay: 5 } });
    expect(screen.getByLabelText("New cards per day")).toHaveValue(5);
    const maxReviews = screen.getByLabelText("Max reviews per day");
    expect(maxReviews).toHaveValue(null);
    expect(maxReviews).toHaveAttribute("placeholder", "200");
    expect(maxReviews.nextElementSibling).toHaveTextContent("max reviews per day");
    expect(screen.getByLabelText("New cards per day").nextElementSibling).toHaveTextContent(
      "new cards per day",
    );
  });

  it("advises a small, steady number of new cards", () => {
    renderScreen();
    expect(screen.getByLabelText("New cards per day")).toHaveAccessibleDescription(/Better to start small and be consistent/);
    expect(screen.getByLabelText("Max reviews per day")).not.toHaveAccessibleDescription(/start small/);
  });

  it("describes each limit by what it counts and by what an empty field does", () => {
    renderScreen();
    const newCards = screen.getByLabelText("New cards per day");
    expect(newCards).toHaveAccessibleDescription(/^new cards per day .*An empty field defaults to your study preferences ?\.$/);
    expect(screen.getByLabelText("Max reviews per day")).toHaveAccessibleDescription(
      /^max reviews per day An empty field defaults to your study preferences ?\.$/,
    );
  });

  it("says what each number counts, in the singular for one", () => {
    renderScreen({ preferences: { newCardsPerDay: 1, maxReviewsPerDay: 20 } });
    const newCards = screen.getByLabelText("New cards per day");
    const maxReviews = screen.getByLabelText("Max reviews per day");
    expect(newCards.nextElementSibling).toHaveTextContent("new card per day");
    fireEvent.input(newCards, { target: { value: "3" } });
    expect(newCards.nextElementSibling).toHaveTextContent("new cards per day");
    fireEvent.input(maxReviews, { target: { value: "1" } });
    expect(maxReviews.nextElementSibling).toHaveTextContent("max review per day");
  });

  it("saves the limits, an empty field following the preferences", () => {
    const { onSave } = renderScreen({ deck: { ...deck, newCardsPerDay: 5 } });
    fireEvent.input(screen.getByLabelText("New cards per day"), { target: { value: "" } });
    fireEvent.input(screen.getByLabelText("Max reviews per day"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(onSave).toHaveBeenCalledWith({ maxReviewsPerDay: 0 });
  });

  it("is disabled while busy and shows an error", () => {
    renderScreen({ busy: true, error: "pod unreachable" });
    // The buttons only aria-disabled, so the one pressed keeps the focus.
    expect(screen.getByRole("button", { name: "Save preferences" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("New cards per day")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename deck" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Remove deck" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("pod unreachable")).toHaveClass("error");
  });

  it("ignores its buttons while it saves", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const props = renderScreen({ busy: true });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove deck" }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Deck name")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("focuses the name's field on Rename, and Rename again on Save or Cancel", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    const field = screen.getByLabelText("Deck name");
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe("Kanji N5".length);
    fireEvent.click(screen.getByRole("button", { name: "Cancel renaming" }));
    expect(screen.getByRole("button", { name: "Rename deck" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByRole("button", { name: "Rename deck" })).toHaveFocus();
  });

  it("ignores the rename form's buttons while something else saves", () => {
    const props = {
      deck,
      deckHref: "#/deck?deck=d",
      preferences: { newCardsPerDay: 20, maxReviewsPerDay: 200 },
      preferencesHref: "#/preferences?instance=a",
      busy: false,
      error: null,
      onSave: vi.fn(),
      onRename: vi.fn(),
      onRemove: vi.fn(),
      languages: SETTLED,
      onStateLanguages: vi.fn(),
    };
    const { rerender } = render(<DeckPreferencesScreen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    rerender(<DeckPreferencesScreen {...props} busy />);
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel renaming" }));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Deck name")).toBeInTheDocument();
  });

  it("renames the deck, trimmed, and closes the form", () => {
    const props = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    const field = screen.getByLabelText("Deck name");
    expect(field).toHaveValue("Kanji N5");
    fireEvent.input(field, { target: { value: "  Kanji N4 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(props.onRename).toHaveBeenCalledWith({ en: "Kanji N4" });
    expect(screen.queryByLabelText("Deck name")).toBeNull();
  });

  it("asks for the language of a translation of the name before renaming", () => {
    const props = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "Kanji N5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(props.onRename).not.toHaveBeenCalled();
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveFocus();
    expect(picker).toHaveAccessibleDescription("Choose the language of the deck's name.");
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(props.onRename).toHaveBeenCalledWith({ en: "Kanji N5", sv: "Kanji N5" });
  });

  it("cancels renaming without saving", () => {
    const props = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rename deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel renaming" }));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rename deck" })).toBeInTheDocument();
  });

  it("removes the deck after confirmation, and keeps it when declined", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const props = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remove deck" }));
    expect(confirm).toHaveBeenCalledWith(
      'Remove the deck "Kanji N5" and all its cards? This cannot be undone.',
    );
    expect(props.onRemove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove deck" }));
    expect(props.onRemove).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckPreferencesScreen
          deck={deck}
          deckHref="#/deck?deck=d"
          preferences={{ newCardsPerDay: 1, maxReviewsPerDay: 200 }}
          preferencesHref="#/preferences?instance=a"
          busy={false}
          error={null}
          onSave={vi.fn()}
          onRename={vi.fn()}
          onRemove={vi.fn()}
          languages={SETTLED}
          onStateLanguages={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Inställningar: Kanji N5" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nya kort per dag").nextElementSibling).toHaveTextContent("nytt kort per dag");
    expect(screen.getByRole("link", { name: "studieinställningar" })).toBeInTheDocument();
    expect(screen.getByText("Kanji N5")).toHaveAttribute("lang", "en");
  });

  it("renames the deck in every language, the name the reader sees first", () => {
    const onRename = vi.fn();
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckPreferencesScreen
          deck={{ ...deck, title: { en: "Capitals", sv: "Huvudstäder" } }}
          deckHref="#/deck?deck=d"
          preferences={{ newCardsPerDay: 1, maxReviewsPerDay: 200 }}
          preferencesHref="#/preferences?instance=a"
          busy={false}
          error={null}
          onSave={vi.fn()}
          onRename={onRename}
          onRemove={vi.fn()}
          languages={SETTLED}
          onStateLanguages={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Byt namn på kortleken" }));
    const name = screen.getByLabelText("Kortlekens namn");
    expect(name).toHaveValue("Huvudstäder");
    expect(name).not.toHaveAttribute("lang");
    expect(name).toHaveAccessibleDescription("Språk: svenska");
    fireEvent.input(screen.getByLabelText("Text på engelska"), { target: { value: "Capital cities" } });
    fireEvent.click(screen.getByRole("button", { name: "Spara namn" }));
    expect(onRename).toHaveBeenCalledWith({ sv: "Huvudstäder", en: "Capital cities" });
  });

  it("edits first the name the reader sees, marked with its language", () => {
    // A reader who prefers German sees the German, and edits it first.
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["de"]);
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckPreferencesScreen
          deck={{ ...deck, title: { en: "Capitals", de: "Hauptstädte" } }}
          deckHref="#/deck?deck=d"
          preferences={{ newCardsPerDay: 1, maxReviewsPerDay: 200 }}
          preferencesHref="#/preferences?instance=a"
          busy={false}
          error={null}
          onSave={vi.fn()}
          onRename={vi.fn()}
          onRemove={vi.fn()}
          languages={SETTLED}
          onStateLanguages={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Byt namn på kortleken" }));
    const name = screen.getByLabelText("Kortlekens namn");
    expect(name).toHaveValue("Hauptstädte");
    expect(name).toHaveAttribute("lang", "de");
    expect(name).toHaveAccessibleDescription("Språk: tyska");
    languages.mockRestore();
  });
});
