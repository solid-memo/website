import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { MultipleChoice, type ChoiceOption } from "./MultipleChoice";

const choices: ChoiceOption[] = [
  { key: "back", text: { en: "An IRI" } },
  { key: "distractor:d1", text: { sv: "En sträng" } },
  { key: "distractor:d2", text: { "": "<#x>" } },
];

function renderChoice(props: Partial<Parameters<typeof MultipleChoice>[0]> = {}) {
  const onCheck = vi.fn();
  const view = render(
    <>
      <p id="q">What names a thing?</p>
      <MultipleChoice labelledBy="q" choices={choices} busy={false} onCheck={onCheck} {...props} />
    </>,
  );
  return { ...view, onCheck };
}

describe("MultipleChoice", () => {
  it("offers the options as radios of a group named by the question, each numbered for its key", () => {
    renderChoice();
    const group = screen.getByRole("radiogroup", { name: "What names a thing?" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-keyshortcuts"))).toEqual(["1", "2", "3"]);
    expect(within(group).getByRole("radio", { name: "An IRI" })).not.toBeChecked();
    // An option in another language than the page's says which.
    expect(screen.getByText("En sträng")).toHaveAttribute("lang", "sv");
    expect(screen.getByText("Press 1 to 3 to choose, then Enter to check.")).toBeInTheDocument();
  });

  it("checks nothing until an option is chosen, then the one chosen", () => {
    const { onCheck } = renderChoice();
    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(check).toBeEnabled();
    fireEvent.click(check);
    expect(onCheck).toHaveBeenCalledWith("distractor:d1");
  });

  it("chooses by number key, taking the focus there, and checks by Enter", () => {
    const { onCheck } = renderChoice();
    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();
    // Enter with nothing chosen does nothing.
    fireEvent.keyDown(radios[0]!, { key: "Enter" });
    expect(onCheck).not.toHaveBeenCalled();
    fireEvent.keyDown(radios[0]!, { key: "3" });
    expect(radios[2]).toBeChecked();
    expect(radios[2]).toHaveFocus();
    fireEvent.keyDown(radios[2]!, { key: "Enter" });
    expect(onCheck).toHaveBeenCalledWith("distractor:d2");
  });

  it("leaves other keys, keys with a modifier, numbers past the options, and Enter on Check to themselves", () => {
    const { onCheck } = renderChoice();
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[0]!, { key: "4" });
    fireEvent.keyDown(radios[0]!, { key: "0" });
    fireEvent.keyDown(radios[0]!, { key: "x" });
    fireEvent.keyDown(radios[0]!, { key: "2", ctrlKey: true });
    fireEvent.keyDown(radios[0]!, { key: "2", altKey: true });
    fireEvent.keyDown(radios[0]!, { key: "2", metaKey: true });
    expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    fireEvent.keyDown(radios[0]!, { key: "1" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Check" }), { key: "Enter" });
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("is only aria-disabled while the answer saves, so Check keeps the focus, and checks nothing then", () => {
    const { onCheck } = renderChoice({ busy: true });
    const check = screen.getByRole("button", { name: "Checking…" });
    expect(check).toBeEnabled();
    expect(check).toHaveAttribute("aria-disabled", "true");
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!);
    fireEvent.click(check);
    fireEvent.keyDown(radios[0]!, { key: "2" });
    expect(onCheck).not.toHaveBeenCalled();
    expect(radios[1]).not.toBeChecked();
  });

  it("marks the right option and a wrong one chosen in words, fixed, once checked", () => {
    renderChoice({ answered: { chosen: "distractor:d1", correct: "back" } });
    const radios = screen.getAllByRole("radio");
    expect(radios.every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect(radios[1]).toBeChecked();
    expect(screen.getByText("Right answer").closest("label")).toHaveClass("choice-right");
    expect(screen.getByText("Your answer").closest("label")).toHaveClass("choice-wrong");
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
    fireEvent.keyDown(radios[0]!, { key: "3" });
    expect(radios[2]).not.toBeChecked();
  });

  it("marks only the right answer when it was chosen", () => {
    renderChoice({ answered: { chosen: "back", correct: "back" } });
    expect(screen.getByText("Right answer").closest("label")).toHaveClass("choice-right");
    expect(screen.queryByText("Your answer")).toBeNull();
  });
});
