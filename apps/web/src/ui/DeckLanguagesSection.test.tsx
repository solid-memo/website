import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckLanguages } from "@solid-memo/domain/deckLanguages";
import { DeckLanguagesSection, DECK_LANGUAGES_ID } from "./DeckLanguagesSection";
import { I18nProvider } from "./i18n";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { fi: "Sanasto" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 5,
  direction: "front-to-back",
  authors: [],
};

const unstated: DeckLanguages = { back: "en", unstatedCounts: { front: 3, back: 1 } };

function renderSection(overrides: Partial<Parameters<typeof DeckLanguagesSection>[0]> = {}) {
  const props = {
    deck,
    languages: unstated,
    busy: false,
    stated: null,
    onStateLanguages: vi.fn(),
    ...overrides,
  };
  const view = render(<DeckLanguagesSection {...props} />);
  return { props, rerender: (more: Partial<typeof props>) => view.rerender(<DeckLanguagesSection {...props} {...more} />) };
}

/** Choose a side's language as a keyboard would: its picker, the radio, Done. */
function choose(picker: string, language: string) {
  fireEvent.click(document.getElementById(picker)!);
  fireEvent.click(screen.getByRole("radio", { name: language }));
  fireEvent.click(screen.getByRole("button", { name: /^(Done|Klar)$/ }));
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("DeckLanguagesSection", () => {
  it("is a named region that counts the fronts and backs that do not say their language", () => {
    renderSection();
    const region = screen.getByRole("region", { name: "Languages" });
    expect(within(region).getByText("3 card fronts and 1 back do not say their language.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Languages" })).toHaveAttribute("id", DECK_LANGUAGES_ID);
    expect(screen.getByRole("group", { name: "Fronts" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Backs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State the language" })).toHaveAccessibleDescription(
      "3 card fronts and 1 back do not say their language.",
    );
  });

  it("chooses nothing for the user, suggesting what the side and the deck's name use", () => {
    renderSection();
    const pickers = screen.getAllByRole("button", { name: "Language: not stated" });
    expect(pickers).toHaveLength(2);
    fireEvent.click(document.getElementById("deck-backs-language")!);
    const radios = within(screen.getByRole("group", { name: "Language of the back" })).getAllByRole("radio");
    expect(radios.slice(0, 2).map((radio) => radio.parentElement!.textContent)).toEqual([
      "English (en)",
      "Finnish — suomi (fi)",
    ]);
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
  });

  it("asks for a language before stating one, focusing the side's picker", () => {
    const { props } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    expect(props.onStateLanguages).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the language of the front.");
    const picker = document.getElementById("deck-fronts-language")!;
    expect(picker).toHaveFocus();
    expect(picker).toHaveAttribute("aria-invalid", "true");
    expect(picker).toHaveAccessibleDescription("Choose the language of the front.");
    // Choosing one clears the request.
    choose("deck-fronts-language", "Finnish — suomi (fi)");
    expect(screen.getByRole("alert")).toHaveTextContent("");
    expect(picker).not.toHaveAttribute("aria-invalid");
  });

  it("states the languages chosen once the user confirms the count of each side", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderSection();
    choose("deck-fronts-language", "Finnish — suomi (fi)");
    choose("deck-backs-language", "English (en)");
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    expect(confirm).toHaveBeenCalledWith("Save 3 fronts as Finnish?\nSave 1 back as English?");
    expect(props.onStateLanguages).toHaveBeenCalledWith({ front: "fi", back: "en" });
  });

  it("states only the side chosen, and nothing when the user declines", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderSection();
    choose("deck-backs-language", "English (en)");
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    expect(confirm).toHaveBeenCalledWith("Save 1 back as English?");
    expect(props.onStateLanguages).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    expect(props.onStateLanguages).toHaveBeenCalledWith({ back: "en" });
  });

  it("offers a picker only for a side with text to state", () => {
    renderSection({ languages: { unstatedCounts: { front: 0, back: 2 } } });
    expect(screen.getByText("0 card fronts and 2 backs do not say their language.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Fronts" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the language of the back.");
  });

  it("keeps the focus on the button while saving, and moves it to the heading once nothing is left", () => {
    vi.stubGlobal("confirm", () => true);
    const { rerender } = renderSection();
    choose("deck-fronts-language", "Finnish — suomi (fi)");
    const button = screen.getByRole("button", { name: "State the language" });
    button.focus();
    fireEvent.click(button);
    rerender({ busy: true });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(button).toHaveFocus();
    rerender({ busy: false, stated: 3, languages: { back: "en", unstatedCounts: { front: 0, back: 1 } } });
    // A side is left: the button stays, and so does the focus.
    expect(button).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Saved the language of 3 cards.");
    choose("deck-backs-language", "English (en)");
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    rerender({ busy: true, stated: 3, languages: { back: "en", unstatedCounts: { front: 0, back: 1 } } });
    rerender({ busy: false, stated: 1, languages: { back: "en", unstatedCounts: { front: 0, back: 0 } } });
    expect(screen.queryByRole("button", { name: "State the language" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Languages" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Saved the language of 1 card.");
    expect(screen.getByText("Every card says which language its text is in.")).toBeInTheDocument();
  });

  it("leaves the focus alone when busy ends with nothing being stated", () => {
    const { rerender } = renderSection();
    rerender({ busy: true });
    rerender({ busy: false, languages: { unstatedCounts: { front: 0, back: 0 } } });
    expect(screen.getByRole("heading", { name: "Languages" })).not.toHaveFocus();
  });

  it("says when everything is settled", () => {
    renderSection({ languages: { unstatedCounts: { front: 0, back: 0 } } });
    expect(screen.getByText("Every card says which language its text is in.")).toBeInTheDocument();
  });

  it("says the languages could not be checked, and why, rather than waiting on the cards", () => {
    const { rerender } = renderSection({ languages: undefined, unreadable: "The library could not be read." });
    expect(screen.getByText("The languages of the cards could not be checked.")).toBeInTheDocument();
    expect(screen.queryByText("Checking the languages of the cards…")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("The library could not be read.");
    rerender({ languages: undefined, unreadable: null });
    expect(screen.getByText("Checking the languages of the cards…")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("marks its heading as where the user arrives when a link opens the screen here", () => {
    const { rerender } = renderSection();
    expect(screen.getByRole("heading", { name: "Languages" })).not.toHaveAttribute("data-arrival");
    rerender({ arrival: true });
    expect(screen.getByRole("heading", { name: "Languages" })).toHaveAttribute("data-arrival");
  });

  it("says when the cards are still read, and that a library deck's untouched cards are left out", () => {
    renderSection({ languages: undefined, deck: { ...deck, sourceUrl: "https://solid-memo.com/decks/x/v1.ttl" } });
    expect(screen.getByText("Checking the languages of the cards…")).toBeInTheDocument();
    expect(screen.queryByText(/library release/)).toBeNull();
    renderSection({
      languages: { unstatedCounts: { front: 0, back: 0 } },
      deck: { ...deck, sourceUrl: "https://solid-memo.com/decks/x/v1.ttl" },
    });
    expect(
      screen.getByText("Cards still as their library release has them are left out: a later release updates them."),
    ).toBeInTheDocument();
  });

  it("speaks Swedish", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckLanguagesSection
          deck={deck}
          languages={{ unstatedCounts: { front: 1, back: 2 } }}
          busy={false}
          stated={null}
          onStateLanguages={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Språk" })).toBeInTheDocument();
    expect(screen.getByText("1 framsida och 2 baksidor anger inte sitt språk.")).toBeInTheDocument();
    choose("deck-backs-language", "finska — suomi (fi)");
    fireEvent.click(screen.getByRole("button", { name: "Ange språket" }));
    expect(window.confirm).toHaveBeenCalledWith("Spara 2 baksidor som finska?");
  });
});
