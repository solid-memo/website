import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { I18nProvider } from "./i18n";
import {
  draftOf,
  LangTextField,
  languageButtonId,
  rememberLanguages,
  textOfDraft,
  useMissingLanguage,
  type LangTextDraft,
} from "./LangTextField";
import { recentLanguages } from "./remembered";

beforeEach(() => localStorage.clear());

describe("draftOf", () => {
  it("starts new text in the language there is evidence of, else in none", () => {
    expect(draftOf(undefined, ["en"])).toEqual([{ id: 0, value: "", tag: null }]);
    expect(draftOf({}, ["en"], { tag: "fi" })).toEqual([{ id: 0, value: "", tag: "fi" }]);
  });

  it("puts the text the reader sees first, each other language after it", () => {
    expect(draftOf({ en: "Capitals", sv: "Huvudstäder", de: "Hauptstädte" }, ["sv"])).toEqual([
      { id: 0, value: "Huvudstäder", tag: "sv" },
      { id: 1, value: "Capitals", tag: "en" },
      { id: 2, value: "Hauptstädte", tag: "de" },
    ]);
  });

  it("gives the same words in several languages an entry per language, English among them or not", () => {
    expect(draftOf({ en: "Glosor", sv: "Glosor", fi: "Sanasto" }, ["fi"])).toEqual([
      { id: 0, value: "Sanasto", tag: "fi" },
      { id: 1, value: "Glosor", tag: "en" },
      { id: 2, value: "Glosor", tag: "sv" },
    ]);
    expect(draftOf({ sv: "Glosor", en: "Glosor" }, ["en"])).toEqual([
      { id: 0, value: "Glosor", tag: "en" },
      { id: 1, value: "Glosor", tag: "sv" },
    ]);
    expect(draftOf({ sv: "1969", it: "1969" }, ["sv"])).toEqual([
      { id: 0, value: "1969", tag: "sv" },
      { id: 1, value: "1969", tag: "it" },
    ]);
  });
});

describe("textOfDraft", () => {
  it("says the draft's text, trimmed, an empty translation left out", () => {
    expect(
      textOfDraft([
        { id: 0, value: " Glosor ", tag: "sv" },
        { id: 1, value: " ", tag: null },
        { id: 2, value: "Glosor", tag: "en" },
        { id: 3, value: "Sanasto", tag: "fi" },
      ]),
    ).toEqual({ text: { sv: "Glosor", en: "Glosor", fi: "Sanasto" } });
  });

  it("clears the text in every language with its main text", () => {
    expect(textOfDraft([{ id: 0, value: " ", tag: "sv" }, { id: 1, value: "Capitals", tag: "en" }])).toEqual({ text: {} });
  });

  it("names the text whose language is still to choose", () => {
    const missing = { id: 1, value: "Sanasto", tag: null };
    expect(textOfDraft([{ id: 0, value: "Glosor", tag: "sv" }, missing])).toEqual({ missing });
  });
});

describe("rememberLanguages", () => {
  it("notes the languages saved, the main one as the latest", () => {
    const draft: LangTextDraft = [
      { id: 0, value: "Glosor", tag: "sv" },
      { id: 1, value: "Sanasto", tag: "fi" },
      { id: 2, value: "", tag: "de" },
    ];
    rememberLanguages("deck", { sv: "Glosor", fi: "Sanasto" }, draft);
    expect(recentLanguages("deck")).toEqual(["sv", "fi"]);
  });
});

/** A field that keeps its draft, as a form would, and says the text it holds. */
function Field({
  initial,
  translationsOpen,
  multiline,
  invalid,
  missingId,
  disabled,
  onText = () => undefined,
}: {
  initial: LangTextDraft;
  translationsOpen?: boolean;
  multiline?: boolean;
  invalid?: boolean;
  missingId?: number;
  disabled?: boolean;
  onText?: (draft: LangTextDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <LangTextField
      id="name"
      label="Name"
      role="deckName"
      draft={draft}
      suggestions={[]}
      translationsOpen={translationsOpen}
      multiline={multiline}
      describedBy="name-hint"
      invalid={invalid}
      disabled={disabled}
      missing={draft.find((entry) => entry.id === missingId)}
      errorId="form-error"
      onChange={(next) => {
        setDraft(next);
        onText(next);
      }}
    />
  );
}

function renderField(props: Parameters<typeof Field>[0], locale: "en" | "sv" = "en") {
  const onText = vi.fn();
  render(
    <I18nProvider locale={locale} onChoose={() => undefined}>
      <Field onText={onText} {...props} />
      <p id="name-hint">A hint</p>
    </I18nProvider>,
  );
  /** The text the draft says now. */
  const text = (): LangText | undefined => {
    const result = textOfDraft(onText.mock.lastCall![0]);
    return "text" in result ? result.text : undefined;
  };
  return { onText, text };
}

/** Chooses a language with an entry's picker. */
function choose(buttonName: string | RegExp, radioName: string, index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: buttonName })[index]!);
  fireEvent.click(screen.getByRole("radio", { name: radioName }));
}

describe("LangTextField", () => {
  it("marks each text with its language, and describes the main one by it", () => {
    renderField(
      {
        initial: draftOf({ sv: "Huvudstäder", en: "Capitals", zxx: "HTTP 404" }, ["sv"]),
        translationsOpen: true,
      },
      "en",
    );
    const main = screen.getByLabelText("Name");
    expect(main).toHaveValue("Huvudstäder");
    expect(main).toHaveAttribute("lang", "sv");
    expect(main).toHaveAccessibleDescription("Language: Swedish A hint");
    // English on an English page, and text in no language, are marked with none.
    expect(screen.getByLabelText("Text in English")).not.toHaveAttribute("lang");
    expect(screen.getByLabelText(/^Text in No language/)).not.toHaveAttribute("lang");
    expect(screen.getByLabelText("Text in English")).toHaveAccessibleDescription("Language: English");
  });

  it("shows its hint right under the main text, ahead of the main text's language", () => {
    render(
      <I18nProvider locale="en" onChoose={() => undefined}>
        <LangTextField
          id="note"
          label="Note"
          role="frontNote"
          draft={draftOf({ en: "Out of use" }, ["en"])}
          suggestions={[]}
          describedBy="note-hint"
          hint={<p id="note-hint">Shown under the front</p>}
          onChange={() => undefined}
        />
      </I18nProvider>,
    );
    const note = screen.getByLabelText("Note");
    const hint = screen.getByText("Shown under the front");
    expect(note.nextElementSibling).toBe(hint);
    expect(hint.compareDocumentPosition(screen.getByRole("button", { name: "Language: English" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(note).toHaveAccessibleDescription("Language: English Shown under the front");
  });

  it("edits a text in a textarea when it runs long", () => {
    renderField({ initial: draftOf({ en: "Every capital." }, ["en"]), multiline: true });
    expect(screen.getByLabelText("Name").tagName).toBe("TEXTAREA");
  });

  it("submits a textarea's form on Ctrl+Enter or ⌘+Enter, Enter itself starting a new line", () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <I18nProvider locale="en" onChoose={() => undefined}>
        <form onSubmit={onSubmit}>
          <Field initial={draftOf({ en: "Line one" }, ["en"])} multiline />
        </form>
      </I18nProvider>,
    );
    const text = screen.getByLabelText("Name");
    expect(text).toHaveAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    expect(fireEvent.keyDown(text, { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(text, { key: "a", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(text, { key: "Enter", ctrlKey: true, isComposing: true })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(text, { key: "Enter", ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(text, { key: "Enter", metaKey: true })).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("does nothing on Ctrl+Enter in a textarea outside a form", () => {
    renderField({ initial: draftOf({ en: "Alone" }, ["en"]), multiline: true });
    expect(fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter", ctrlKey: true })).toBe(false);
  });

  it("retags the text without retyping it", () => {
    const { text } = renderField({ initial: draftOf({ en: "Huvudstäder" }, ["en"]) });
    choose("Language: English", "Swedish — svenska (sv)");
    expect(text()).toEqual({ sv: "Huvudstäder" });
    expect(screen.getByLabelText("Name")).toHaveAttribute("lang", "sv");
  });

  it("refuses a language another text has, at the picker that chose it", () => {
    const { onText } = renderField({ initial: draftOf({ en: "Capitals", sv: "Huvudstäder" }, ["en"]), translationsOpen: true });
    choose("Language: English", "Swedish — svenska (sv)");
    expect(onText).not.toHaveBeenCalled();
    const error = document.getElementById("name-taken")!;
    expect(error).toHaveTextContent("There is already text in Swedish. Edit or remove it first.");
    const picker = document.getElementById(languageButtonId("name", { id: 0, value: "", tag: null }))!;
    expect(picker).toHaveAttribute("aria-invalid", "true");
    expect(picker).toHaveAccessibleDescription("There is already text in Swedish. Edit or remove it first.");
    // Changing the text clears it.
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Capital cities" } });
    expect(error).toHaveTextContent("");
  });

  it("adds a translation, its language chosen at its picker, which takes the focus", () => {
    const { text } = renderField({ initial: draftOf({ en: "Capitals" }, ["en"]), translationsOpen: true });
    const toggle = screen.getByRole("button", { name: "Translations (0)" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    expect(screen.getByRole("button", { name: "Translations (1)" })).toBeInTheDocument();
    const picker = document.getElementById(languageButtonId("name", { id: 1, value: "", tag: null }))!;
    expect(picker).toHaveFocus();
    expect(picker).toHaveTextContent("Language: not stated");
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "Huvudstäder" } });
    choose("Language: not stated", "Swedish — svenska (sv)");
    expect(text()).toEqual({ en: "Capitals", sv: "Huvudstäder" });
    expect(screen.getByLabelText("Text in Swedish")).toHaveAttribute("lang", "sv");
  });

  it("removes a translation, focus going back to Add", () => {
    const { text } = renderField({ initial: draftOf({ en: "Capitals", sv: "Huvudstäder" }, ["en"]), translationsOpen: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove the Swedish text" }));
    expect(text()).toEqual({ en: "Capitals" });
    expect(screen.getByRole("button", { name: "Add a translation" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove this translation" }));
    expect(screen.queryByLabelText("Translation, its language not chosen")).toBeNull();
  });

  it("keeps translations folded away unless asked, or one needs its language", () => {
    renderField({ initial: [{ id: 0, value: "Capitals", tag: "en" }, { id: 1, value: "Huvudstäder", tag: null }], missingId: 1 });
    // Shown, its picker marked, for the language it needs.
    const toggle = screen.getByRole("button", { name: "Translations (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const picker = document.getElementById(languageButtonId("name", { id: 1, value: "", tag: null }))!;
    expect(picker).toHaveAttribute("aria-invalid", "true");
    expect(picker).toHaveAttribute("aria-describedby", "form-error");
  });

  it("folds and unfolds the translations", () => {
    renderField({ initial: draftOf({ en: "Capitals", sv: "Huvudstäder" }, ["en"]) });
    const toggle = screen.getByRole("button", { name: "Translations (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Text in Swedish")).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the same words in English and another language as a translation, edited on its own", () => {
    const { text } = renderField({ initial: draftOf({ en: "Glosor", sv: "Glosor" }, ["sv"]), translationsOpen: true });
    expect(screen.getByLabelText("Name")).toHaveValue("Glosor");
    expect(screen.getByLabelText("Text in English")).toHaveValue("Glosor");
    expect(screen.queryByRole("listitem")).toBeNull();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Japanska glosor" } });
    expect(text()).toEqual({ sv: "Japanska glosor", en: "Glosor" });
  });

  it("changes no language while its form saves", () => {
    const { onText } = renderField({ initial: draftOf({ en: "Glosor", sv: "Glosor" }, ["sv"]), disabled: true });
    const picker = screen.getByRole("button", { name: "Language: Swedish" });
    expect(picker).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(picker);
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(onText).not.toHaveBeenCalled();
  });

  it("marks the main text invalid when the form says so, and only then", () => {
    renderField({ initial: draftOf({ en: "Capitals", sv: "Huvudstäder" }, ["en"]), translationsOpen: true, invalid: true });
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Text in Swedish")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps text saved with no language unstated, asking for it, until a language is chosen", () => {
    const { text } = renderField({ initial: draftOf({ "": "水" }, ["en"]) });
    const main = screen.getByLabelText("Name");
    expect(main).toHaveValue("水");
    expect(main).not.toHaveAttribute("lang");
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveAccessibleDescription("State which language this text is in.");
    fireEvent.input(main, { target: { value: "火" } });
    expect(text()).toEqual({ "": "火" });
    choose("Language: not stated", "English (en)");
    expect(text()).toEqual({ en: "火" });
    expect(screen.queryByText("State which language this text is in.")).toBeNull();
  });
});

/** A form asking for the language its text needs, as the deck forms do. */
function MissingForm() {
  const { missing, ask, clear } = useMissingLanguage("name");
  const [draft, setDraft] = useState<LangTextDraft>([{ id: 0, value: "Capitals", tag: null }]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = textOfDraft(draft);
        if ("missing" in result) ask(result.missing);
      }}
    >
      <LangTextField
        id="name"
        label="Name"
        role="deckName"
        draft={draft}
        suggestions={[]}
        missing={missing}
        errorId="form-error"
        onChange={(next) => {
          clear();
          setDraft(next);
        }}
      />
      <button type="submit">Save</button>
      <p id="form-error">{missing === undefined ? "" : "Choose it."}</p>
    </form>
  );
}

describe("useMissingLanguage", () => {
  it("moves focus to the picker of the text that needs its language, each time it is asked", () => {
    render(<MissingForm />);
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    expect(picker).toHaveFocus();
    expect(picker).toHaveAccessibleDescription("Choose it.");
    screen.getByRole("button", { name: "Save" }).focus();
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    expect(picker).toHaveFocus();
    choose("Language: not stated", "English (en)");
    expect(picker).not.toHaveAttribute("aria-invalid");
  });
});
