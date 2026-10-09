import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { I18nProvider } from "./i18n";
import { LanguagePicker, languageTextId, type LanguageRole } from "./LanguagePicker";
import { rememberLanguage } from "./remembered";

/** A picker that keeps what is chosen, as a form would. */
function Picker({
  initial = null,
  onChange = () => undefined,
  ...props
}: {
  initial?: string | null;
  role?: LanguageRole;
  suggestions?: string[];
  unstated?: boolean;
  errorId?: string;
  disabled?: boolean;
  onChange?: (tag: string) => void;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <LanguagePicker
      id="front-language"
      value={value}
      role={props.role ?? "front"}
      suggestions={props.suggestions ?? []}
      unstated={props.unstated}
      errorId={props.errorId}
      disabled={props.disabled}
      onChange={(tag) => {
        setValue(tag);
        onChange(tag);
      }}
    />
  );
}

/** Opens the picker as a keyboard would: focus on its button, then press it. */
function open() {
  const button = document.getElementById("front-language")!;
  button.focus();
  fireEvent.click(button);
  return button;
}

function radioNames() {
  return within(screen.getByRole("group")).getAllByRole("radio").map((radio) => radio.parentElement!.textContent);
}

beforeEach(() => localStorage.clear());

describe("LanguagePicker", () => {
  it("lets nothing be chosen while its form saves, an open group's radios disabled", () => {
    const { rerender } = render(<Picker initial="sv" />);
    open();
    rerender(<Picker initial="sv" disabled />);
    expect(screen.getByRole("group")).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^Swedish/ })).toBeDisabled();
    const button = document.getElementById("front-language")!;
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("says the language on a closed button, its text there for the field to be described by", () => {
    render(<Picker initial="sv" />);
    const button = screen.getByRole("button", { name: "Language: Swedish" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("id", "front-language");
    expect(document.getElementById(languageTextId("front-language"))).toHaveTextContent("Language: Swedish");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("says a language not yet chosen is not stated, and checks no radio for the user", () => {
    render(<Picker suggestions={["sv"]} />);
    expect(open()).toHaveTextContent("Language: not stated");
    expect(within(screen.getByRole("group")).getAllByRole("radio").filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
  });

  it("asks for the language of text saved with none, and offers what the deck uses", () => {
    render(<Picker unstated suggestions={["fi"]} />);
    const button = screen.getByRole("button", { name: "Language: not stated" });
    expect(button).toHaveAccessibleDescription("State which language this text is in.");
    open();
    expect(radioNames()[0]).toBe("Finnish — suomi (fi)");
    expect(screen.getByRole("radio", { name: "Finnish — suomi (fi)" })).not.toBeChecked();
  });

  it("asks no more once a language is chosen", () => {
    render(<Picker unstated />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    expect(screen.getByRole("button", { name: "Language: Swedish" })).not.toHaveAccessibleDescription();
  });

  it("opens in place onto a group named for its text, which takes focus", () => {
    render(<Picker initial="sv" />);
    const button = open();
    expect(button).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("group", { name: "Language of the front" });
    expect(button).toHaveAttribute("aria-controls", group.id);
    expect(group).toHaveFocus();
  });

  it.each<[LanguageRole, string]>([
    ["front", "Language of the front"],
    ["back", "Language of the back"],
    ["deckName", "Language of the deck's name"],
    ["description", "Language of the description"],
    ["keywords", "Language of the keywords"],
    ["frontNote", "Language of the note under the front"],
    ["backLabel", "Language of the label"],
    ["backNote", "Language of the note under the back"],
    ["pictureDescription", "Language of the picture's description"],
  ])("names the group for the %s", (role, legend) => {
    render(<Picker role={role} />);
    open();
    expect(screen.getByRole("group", { name: legend })).toBeInTheDocument();
  });

  it("offers the value, the deck's languages, recent ones, the page's and browser's, no language and any other, each once", () => {
    rememberLanguage("own", "ja");
    rememberLanguage("deck", "de");
    render(<Picker initial="fi" suggestions={["sv", "FI", "x-private", "pt-br"]} />);
    open();
    expect(radioNames()).toEqual([
      "Finnish — suomi (fi)",
      "Swedish — svenska (sv)",
      "Brazilian Portuguese — português (Brasil) (pt-BR)",
      "Japanese — 日本語 (ja)",
      "German — Deutsch (de)",
      "English (en)",
      "American English (en-US)",
      "No language (codes, numbers, symbols)",
      "Other language…",
    ]);
    expect(screen.getByRole("radio", { name: "Finnish — suomi (fi)" })).toBeChecked();
    expect(screen.getByText("suomi")).toHaveAttribute("lang", "fi");
  });

  it("keeps a value another app wrote first and checked, as it is, though it names no language the app would store", () => {
    const onChange = vi.fn();
    render(<Picker initial="x-klingon" suggestions={["sv"]} onChange={onChange} />);
    const button = open();
    expect(button).toHaveTextContent("Language: x-klingon");
    expect(radioNames().slice(0, 2)).toEqual(["x-klingon", "Swedish — svenska (sv)"]);
    expect(screen.getByRole("radio", { name: "x-klingon" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    expect(onChange).toHaveBeenCalledWith("sv");
  });

  it("shows a value in another case once, as it is", () => {
    render(<Picker initial="SV" suggestions={["sv"]} />);
    open();
    expect(radioNames().filter((name) => name!.startsWith("Swedish"))).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^Swedish/ })).toBeChecked();
  });

  it.each<LanguageRole>(["deckName", "description", "keywords"])(
    "offers a deck's own text (%s) the languages recently used for decks first, five at most",
    (role) => {
      for (const tag of ["fr", "it", "es", "nl", "da"]) rememberLanguage("deck", tag);
      rememberLanguage("own", "ja");
      render(<Picker role={role} />);
      open();
      expect(radioNames().slice(0, 6)).toEqual([
        "Danish — dansk (da)",
        "Dutch — Nederlands (nl)",
        "Spanish — español (es)",
        "Italian — italiano (it)",
        "French — français (fr)",
        "English (en)",
      ]);
    },
  );

  it("chooses a radio as the language, and closes on Done, focus back on the button", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    const button = open();
    fireEvent.click(screen.getByRole("radio", { name: "Swedish — svenska (sv)" }));
    expect(onChange).toHaveBeenCalledWith("sv");
    expect(button).toHaveTextContent("Language: Swedish");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes on Escape, keeping the choice, and on its button again", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Picker initial="sv" />
      </div>,
    );
    const button = open();
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    // An input method's Escape is its own.
    expect(fireEvent.keyDown(screen.getByRole("radio", { name: "English (en)" }), { key: "Escape", isComposing: true })).toBe(true);
    expect(screen.getByRole("group")).toBeInTheDocument();
    outer.mockClear();
    fireEvent.keyDown(screen.getByRole("radio", { name: "English (en)" }), { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent("Language: English");
    // The dialog or screen around it stays.
    expect(outer).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("closes on Enter on a radio instead of sending the form it is in", () => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <Picker />
      </form>,
    );
    const button = open();
    const radio = screen.getByRole("radio", { name: "Swedish — svenska (sv)" });
    fireEvent.keyDown(radio, { key: "Tab" });
    expect(screen.getByRole("group")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Done" }), { key: "Enter" });
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(fireEvent.keyDown(radio, { key: "Enter" })).toBe(false);
    expect(screen.queryByRole("group")).toBeNull();
    expect(button).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it("offers no language for codes, numbers and symbols", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "No language (codes, numbers, symbols)" }));
    expect(onChange).toHaveBeenCalledWith("zxx");
    expect(screen.getByRole("button", { name: "Language: No language (codes, numbers, symbols)" })).toBeInTheDocument();
  });

  it("takes any other language by its code, naming it as it is typed", () => {
    const onChange = vi.fn();
    render(<Picker initial="sv" onChange={onChange} />);
    const button = open();
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    expect(screen.getByRole("radio", { name: "Swedish — svenska (sv)" })).not.toBeChecked();
    const code = screen.getByRole("textbox", { name: "Language code, e.g. fi, pt-BR" });
    expect(code).toHaveFocus();
    fireEvent.input(code, { target: { value: "PT-br" } });
    expect(screen.getByRole("status")).toHaveTextContent("Brazilian Portuguese — português (Brasil) (pt-BR)");
    expect(code).toHaveAccessibleDescription("Brazilian Portuguese — português (Brasil) (pt-BR)");
    // The Enter that ends an input method's composition does not take the code yet.
    expect(fireEvent.keyDown(code, { key: "Enter", isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(code, { key: "Enter", keyCode: 229 })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(code, { key: "Enter" })).toBe(false);
    expect(onChange).toHaveBeenCalledWith("pt-br");
    expect(screen.queryByRole("group")).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent("Language: Brazilian Portuguese");
  });

  it("refuses a code that names no language, saying so with the code's field", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    const code = screen.getByRole("textbox", { name: "Language code, e.g. fi, pt-BR" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("");
    fireEvent.input(code, { target: { value: " Swedish " } });
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(alert).toHaveTextContent("“Swedish” is not a language code.");
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code.getAttribute("aria-describedby")!.split(" ")).toContain(alert.id);
    expect(code).toHaveFocus();
    fireEvent.input(code, { target: { value: "fi" } });
    expect(alert.textContent).toBe("");
    expect(code).not.toHaveAttribute("aria-invalid");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("fi");
  });

  it("clears a refused code's error when a radio is chosen", () => {
    render(<Picker />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    const code = screen.getByRole("textbox", { name: "Language code, e.g. fi, pt-BR" });
    fireEvent.input(code, { target: { value: "x-klingon" } });
    fireEvent.keyDown(code, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("“x-klingon” is not a language code.");
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("closes on Done with no code typed, the language as it was", () => {
    const onChange = vi.fn();
    render(<Picker initial="sv" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Language: Swedish" })).toHaveFocus();
  });

  it("is marked invalid, described by the error, while the form has one about it", () => {
    render(
      <>
        <p id="front-error">Choose the language of the front.</p>
        <Picker errorId="front-error" />
      </>,
    );
    const button = screen.getByRole("button", { name: "Language: not stated" });
    expect(button).toHaveAttribute("aria-invalid", "true");
    expect(button).toHaveAccessibleDescription("Choose the language of the front.");
  });

  it("speaks Swedish on a Swedish page", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Picker initial="en" role="deckName" />
      </I18nProvider>,
    );
    open();
    expect(screen.getByRole("button", { name: "Språk: engelska" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Språk för kortlekens namn" })).toBeInTheDocument();
    expect(radioNames().slice(0, 2)).toEqual(["engelska — English (en)", "svenska (sv)"]);
    expect(screen.getByRole("radio", { name: "Inget språk (koder, siffror, symboler)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klar" })).toBeInTheDocument();
  });
});
