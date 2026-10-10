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

  it("adds a card asked nowhere yet", () => {
    const onAdd = renderForm(vi.fn(() => true), null);
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveValue("q-1");
    write("Front", "F");
    write("Back", "B");
    add();
    expect(onAdd).toHaveBeenCalledWith([{ kind: "addCard", id: "q-1", card: { front: { en: "F" }, back: { en: "B" }, created: NOW } }], "q-1");
  });
});
