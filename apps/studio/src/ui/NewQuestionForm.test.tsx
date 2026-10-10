import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { NewQuestionForm } from "./NewQuestionForm";
import { courseDraft } from "../test/fixtures";

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

const NOW = "2026-10-10T12:00:00.000Z";

function renderForm(onAdd = vi.fn(() => true), place: Parameters<typeof NewQuestionForm>[0]["place"] = { kind: "step", step: "ch-pods-1" }) {
  vi.setSystemTime(NOW);
  render(<NewQuestionForm id="nq" draft={courseDraft()} place={place} legend="New question" onAdd={onAdd} />);
  return onAdd;
}

/** Types a side's text, in English. */
function write(side: "Front" | "Back", text: string) {
  const field = screen.getByRole("textbox", { name: side });
  fireEvent.input(field, { target: { value: text } });
  const group = field.closest<HTMLElement>(".lang-text-field")!;
  const picker = within(group).queryByRole("button", { name: "Language: not stated" });
  if (picker === null) return;
  fireEvent.click(picker);
  fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
}

const error = () => document.getElementById("nq-error")!;
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add the question" }));

describe("NewQuestionForm", () => {
  it("adds a card asked where it says, under the id the assistant suggests, then starts again", () => {
    const onAdd = renderForm();
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-1b");
    write("Front", "What is a pod?");
    write("Back", "A store of data");
    add();
    expect(onAdd).toHaveBeenCalledWith(
      [
        { kind: "addCard", id: "q-pods-1b", card: { front: { en: "What is a pod?" }, back: { en: "A store of data" }, created: NOW } },
        { kind: "addQuestion", card: "q-pods-1b", place: { kind: "step", step: "ch-pods-1" } },
      ],
      "q-pods-1b",
    );
    expect(screen.getByRole("textbox", { name: "Front" })).toHaveValue("");
    // Its languages are the next one's.
    expect(screen.queryByRole("button", { name: "Language: not stated" })).toBeNull();
  });

  it("asks for the languages, then both sides, and keeps what it could not add", () => {
    const onAdd = renderForm(vi.fn(() => false));
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), { target: { value: "Front" } });
    add();
    expect(error()).toHaveTextContent("Choose the language of the front to save it.");
    write("Front", "Front");
    fireEvent.input(screen.getByRole("textbox", { name: "Back" }), { target: { value: "Back" } });
    add();
    expect(error()).toHaveTextContent("Choose the language of the back to save it.");
    fireEvent.input(screen.getByRole("textbox", { name: "Back" }), { target: { value: "" } });
    add();
    expect(error()).toHaveTextContent("Write the front and the back.");
    write("Back", "Back");
    fireEvent.input(screen.getByRole("textbox", { name: "Id" }), { target: { value: "q-pods-1a" } });
    add();
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.input(screen.getByRole("textbox", { name: "Id" }), { target: { value: "q-new" } });
    add();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(error()).toHaveTextContent("");
    expect(screen.getByRole("textbox", { name: "Front" })).toHaveValue("Front");
  });

  it("asks it before another card of the place, under an id that sorts there", () => {
    const onAdd = renderForm();
    const where = screen.getByRole("combobox", { name: "Ask it" });
    fireEvent.change(where, { target: { value: "q-pods-1a" } });
    expect(screen.getByRole("option", { name: "Before “What holds data?”" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-11");
    fireEvent.change(where, { target: { value: "" } });
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-1b");
    fireEvent.change(where, { target: { value: "q-pods-1a" } });
    write("Front", "F");
    write("Back", "B");
    add();
    expect(onAdd).toHaveBeenCalledWith(expect.arrayContaining([{ kind: "addQuestion", card: "q-pods-11", place: { kind: "step", step: "ch-pods-1" } }]), "q-pods-11");
    // The next is asked after the last again.
    expect(where).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-1b");
  });

  it("says when the assistant finds no id that sorts there", () => {
    const draft = courseDraft();
    const early: typeof draft = {
      ...draft,
      steps: draft.steps.map((node) => (node.id === "ch-pods-1" ? { ...node, data: { ...node.data, checkedBy: [`${draft.url}#a`] } } : node)),
    };
    const { rerender } = render(<NewQuestionForm id="nq" draft={early} place={{ kind: "step", step: "ch-pods-1" }} legend="New question" onAdd={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Ask it" }), { target: { value: "a" } });
    expect(screen.getByRole("option", { name: "Before “a”" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("");
    expect(screen.getByText("The assistant finds no id that sorts there: write one that does.")).toBeInTheDocument();
    // The card it was to be asked before is asked there no more: after the last, then.
    const moved = { ...early, steps: early.steps.map((node) => (node.id === "ch-pods-1" ? { ...node, data: { ...node.data, checkedBy: [`${draft.url}#q-pods-1a`] } } : node)) };
    rerender(<NewQuestionForm id="nq" draft={moved} place={{ kind: "step", step: "ch-pods-1" }} legend="New question" onAdd={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-1b");
    rerender(<NewQuestionForm id="nq" draft={early} place={{ kind: "step", step: "ch-pods-1" }} legend="New question" onAdd={vi.fn()} />);
    fireEvent.input(screen.getByRole("textbox", { name: "Id" }), { target: { value: "0" } });
    expect(screen.queryByText("The assistant finds no id that sorts there: write one that does.")).toBeNull();
  });

  it("says when an id the user writes does not sort where the question is to be asked", () => {
    renderForm();
    const id = screen.getByRole("textbox", { name: "Id" });
    const notThere = "This id does not sort there, so the question would not be asked where “Ask it” says: write one that does.";
    fireEvent.change(screen.getByRole("combobox", { name: "Ask it" }), { target: { value: "q-pods-1a" } });
    fireEvent.input(id, { target: { value: "q-pods-1z" } });
    expect(id).toHaveAccessibleDescription(expect.stringContaining(notThere));
    fireEvent.input(id, { target: { value: "q-pods-10" } });
    expect(screen.queryByText(notThere)).toBeNull();
    expect(id).not.toHaveAccessibleDescription(expect.stringContaining(notThere));
    // After the last: one that sorts before it is not asked there either.
    fireEvent.change(screen.getByRole("combobox", { name: "Ask it" }), { target: { value: "" } });
    fireEvent.input(id, { target: { value: "q-pods-10" } });
    expect(screen.getByText(notThere)).toBeInTheDocument();
    // An id that cannot be one is told of once, as such.
    fireEvent.input(id, { target: { value: "" } });
    expect(screen.queryByText(notThere)).toBeNull();
  });

  it("adds a card asked nowhere yet", () => {
    const onAdd = renderForm(vi.fn(() => true), null);
    expect(screen.queryByRole("combobox", { name: "Ask it" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-1");
    write("Front", "F");
    write("Back", "B");
    add();
    expect(onAdd).toHaveBeenCalledWith([{ kind: "addCard", id: "q-1", card: { front: { en: "F" }, back: { en: "B" }, created: NOW } }], "q-1");
  });
});
