import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { Distractor } from "@solid-memo/domain/deck";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { alertTexts } from "../test/liveRegions";
import { DistractorFields } from "./DistractorFields";
import { I18nProvider } from "./i18n";

afterEach(() => vi.unstubAllGlobals());

const d1: Distractor = { id: "q-d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } };
const d2: Distractor = { id: "q-d2", text: { en: "Only people" }, retired: true };

function renderFields(overrides: Partial<Parameters<typeof DistractorFields>[0]> = {}) {
  const props = {
    cardId: "q",
    distractors: [d1, d2],
    back: { en: "Any thing at all" },
    busy: false,
    suggestions: ["en"],
    onChange: vi.fn(),
    ...overrides,
  };
  const view = render(<DistractorFields {...props} />);
  return { ...view, props };
}

const fields = () => screen.getByRole("group", { name: "Wrong options" });

describe("DistractorFields", () => {
  it("lists the wrong options, each with its note and id, a retired one marked so", () => {
    renderFields();
    const items = within(fields()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Only web pages");
    expect(items[0]).toHaveTextContent("A URL is one kind of IRI.");
    expect(items[0]).toHaveTextContent("q-d1");
    expect(items[0]).not.toHaveTextContent("Retired");
    expect(items[1]).toHaveTextContent(/^Only people Retired/);
    expect(screen.getByRole("button", { name: "Restore the wrong option “Only people”" })).toBeInTheDocument();
  });

  it("says how often each option was chosen, when told", () => {
    renderFields({ picks: new Map([["q-d1", 3]]) });
    const items = within(fields()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Chosen 3 times");
    expect(items[1]).toHaveTextContent("Chosen 0 times");
    cleanup();
    renderFields();
    expect(fields()).not.toHaveTextContent("Chosen");
  });

  it("says when the card has none", () => {
    renderFields({ distractors: [] });
    expect(screen.getByText("This card has no wrong options.")).toBeInTheDocument();
  });

  it("adds a wrong option once it has text, under the next id, starting in the back's language", () => {
    const { props, rerender } = renderFields({ published: new Set(["q-d1", "q-d2", "q-d3"]) });
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(alertTexts()).toContain("A wrong option needs text.");
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: " Only files " } });
    expect(alertTexts()).not.toContain("A wrong option needs text.");
    fireEvent.input(screen.getByLabelText("Why it is wrong (optional)"), { target: { value: "Files are things too." } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const added = { id: "q-d4", text: { en: "Only files" }, note: { en: "Files are things too." } };
    expect(props.onChange).toHaveBeenCalledWith([d1, d2, added]);
    rerender(<DistractorFields {...props} distractors={[d1, d2, added]} />);
    expect(screen.getByRole("button", { name: "Add a wrong option" })).toHaveFocus();
  });

  it("asks the language of a new option when the back says none, and takes Enter for Add", () => {
    const { props } = renderFields({ back: {}, distractors: [] });
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    const text = screen.getByLabelText("Wrong option");
    fireEvent.input(text, { target: { value: "Paris" } });
    // fireEvent says false when the event's default was prevented: no submit of the form around.
    expect(fireEvent.keyDown(text, { key: "Enter" })).toBe(false);
    expect(alertTexts()).toContain("Choose the language of the wrong option.");
    expect(document.getElementById("distractor-text-language-0")).toHaveFocus();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("asks the language of a note in none", () => {
    renderFields({ back: { "": "42" }, distractors: [] });
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "41" } });
    fireEvent.input(screen.getByLabelText("Why it is wrong (optional)"), { target: { value: "One short." } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(alertTexts()).toContain("Choose the language of the note on the wrong option.");
    expect(document.getElementById("distractor-note-language-0")).toHaveFocus();
  });

  it("leaves Enter alone where it is not a line of the option", () => {
    const { props } = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Add" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Wrong option"), { key: "a" });
    expect(alertTexts()).not.toContain("A wrong option needs text.");
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("keeps an option open, as written, until a caller that saves at once has saved it", async () => {
    let saved = false;
    const onChange = vi.fn(async () => saved);
    renderFields({ onChange });
    fireEvent.click(screen.getByRole("button", { name: "Edit the wrong option “Only web pages”" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "Only pages" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Wrong option")).toHaveValue("Only pages");
    saved = true;
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await vi.waitFor(() => expect(screen.queryByLabelText("Wrong option")).toBeNull());
    expect(screen.getByRole("button", { name: "Edit the wrong option “Only web pages”" })).toHaveFocus();
  });

  it("edits an option, keeping its id, and cancels an edit", () => {
    const { props } = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Edit the wrong option “Only web pages”" }));
    expect(screen.getByLabelText("Wrong option")).toHaveValue("Only web pages");
    expect(screen.getByLabelText("Why it is wrong (optional)")).toHaveValue("A URL is one kind of IRI.");
    expect(screen.getByRole("button", { name: "Add a wrong option" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Edit the wrong option “Only web pages”" })).toHaveFocus();
    expect(props.onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit the wrong option “Only people”" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "Only persons" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(props.onChange).toHaveBeenCalledWith([d1, { id: "q-d2", text: { en: "Only persons" }, retired: true }]);
  });

  it("refuses to empty an option", () => {
    const { props } = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Edit the wrong option “Only web pages”" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(alertTexts()).toContain("A wrong option needs text.");
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("retires an option and restores a retired one", () => {
    const { props } = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Retire the wrong option “Only web pages”" }));
    expect(props.onChange).toHaveBeenLastCalledWith([{ ...d1, retired: true }, d2]);
    fireEvent.click(screen.getByRole("button", { name: "Restore the wrong option “Only people”" }));
    expect(props.onChange).toHaveBeenLastCalledWith([d1, { id: "q-d2", text: { en: "Only people" } }]);
  });

  it("deletes an option never published, once the user confirms, and refuses a published one at once, to be retired", () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderFields({ published: new Set(["q-d1"]) });
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “Only web pages”" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(alertTexts()).toContain("This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.");
    const remove = screen.getByRole("button", { name: "Delete the wrong option “Only people”" });
    fireEvent.click(remove);
    expect(props.onChange).not.toHaveBeenCalled();
    fireEvent.click(remove);
    expect(confirm).toHaveBeenLastCalledWith("Delete the wrong option “Only people”?");
    expect(props.onChange).toHaveBeenCalledWith([d1]);
    expect(alertTexts()).not.toContain("This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.");
  });

  it("does nothing while busy", () => {
    const confirm = vi.fn();
    vi.stubGlobal("confirm", confirm);
    const { props } = renderFields({ busy: true });
    for (const name of ["Edit the wrong option “Only web pages”", "Retire the wrong option “Only web pages”", "Delete the wrong option “Only web pages”", "Add a wrong option"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Wrong option")).toBeNull();
  });

  it("takes no Add while busy", () => {
    const { props, rerender } = renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "x" } });
    rerender(<DistractorFields {...props} busy={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("warns of options not in the back's languages, and of too few in use", () => {
    renderFields({
      back: { en: "Water", sv: "Vatten" },
      distractors: [
        { id: "q-d1", text: { en: "Fire", de: "Feuer" } },
        { id: "q-d2", text: { "": "H2O2" } },
      ],
    });
    const issues = within(screen.getByRole("list", { name: "Worth a look" })).getAllByRole("listitem");
    expect(issues.map((issue) => issue.textContent)).toEqual([
      "“Fire” has no text in Swedish — svenska (sv), which the back is in.",
      "“Fire” is in German — Deutsch (de), which the back is not.",
      "“H2O2” has no text in English (en), Swedish — svenska (sv), which the back is in.",
      "“H2O2” is in no stated language, which the back is not.",
    ]);
    cleanup();
    renderFields({
      back: { en: "Water" },
      distractors: [
        { id: "q-d1", text: { en: "Fire", sv: "Eld" } },
        { id: "q-d2", text: { en: "Earth" } },
      ],
    });
    expect(within(screen.getByRole("list", { name: "Worth a look" })).getByRole("listitem")).toHaveTextContent(
      "“Fire” is in Swedish — svenska (sv), which the back is not.",
    );
    cleanup();
    renderFields({ back: { en: "Water", sv: "Vatten" }, distractors: [{ id: "q-d1", text: { en: "Fire" } }, { id: "q-d2", text: { en: "Earth", sv: "Jord" } }] });
    expect(within(screen.getByRole("list", { name: "Worth a look" })).getByRole("listitem")).toHaveTextContent(
      "“Fire” has no text in Swedish — svenska (sv), which the back is in.",
    );
    cleanup();
    renderFields({ distractors: [d1] });
    expect(screen.getByText("1 wrong option is in use; a course asks a question with at least 2.")).toBeInTheDocument();
  });

  it("writes and shows options in Markdown as such, hinting where one would not show as meant", () => {
    renderFields({ textFormat: SM.markdown, distractors: [{ id: "q-d1", text: { en: "`a`" } }] });
    expect(fields().querySelector("code")).toHaveTextContent("a");
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "[a](https://example.org)" } });
    expect(fields()).toHaveTextContent(/link/i);
    expect(screen.getByLabelText("Why it is wrong (optional)").tagName).toBe("TEXTAREA");
  });

  it("trims plain text, a card in sm:plainText's too, and keeps the spaces Markdown starts with", () => {
    const add = (textFormat: string | undefined) => {
      cleanup();
      const onChange = vi.fn();
      renderFields({ textFormat, distractors: [], onChange });
      fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
      fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "    x " } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      return onChange.mock.calls[0]![0][0].text;
    };
    expect(add(SM.plainText)).toEqual({ en: "x" });
    expect(add(SM.markdown)).toEqual({ en: "    x" });
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DistractorFields cardId="q" distractors={[]} back={{ sv: "Vatten" }} busy={false} suggestions={[]} onChange={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("group", { name: "Felaktiga alternativ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till ett felaktigt alternativ" })).toBeInTheDocument();
  });
});
