import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { DraftEditor } from "./draftEditor";
import { StepEditorScreen } from "./StepEditorScreen";
import { courseDraft, draftLinks } from "../test/fixtures";

function renderScreen(step: string, draft: ReleaseDraft = courseDraft(), onEdit = vi.fn<DraftEditor["edit"]>(() => null)) {
  const onDeleted = vi.fn();
  render(<StepEditorScreen draft={draft} step={step} readOnly={null} status={{ saving: false, failure: null }} links={draftLinks} onEdit={onEdit} onDeleted={onDeleted} />);
  return { onEdit, onDeleted };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("StepEditorScreen", () => {
  it("saves the theory as it is typed, previewed as the course player shows it", () => {
    const { onEdit } = renderScreen("ch-pods-1");
    expect(screen.getByRole("heading", { level: 2, name: "Step 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pods" })).toHaveAttribute("href", "#/chapter/ch-pods");
    const theory = screen.getByRole("textbox", { name: "Theory" });
    fireEvent.input(theory, { target: { value: "A pod is yours.\n\nIt holds data." } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editStep", id: "ch-pods-1", text: { theory: { en: "A pod is yours.\n\nIt holds data." }, textFormat: undefined } }], {
      debounce: true,
    });
    const preview = screen.getByRole("region", { name: "Preview of Theory" });
    expect(preview.querySelectorAll(".course-theory p")).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Format with Markdown" }));
    expect(onEdit).toHaveBeenLastCalledWith(
      [{ kind: "editStep", id: "ch-pods-1", text: { theory: { en: "A pod is yours.\n\nIt holds data." }, textFormat: SM.markdown } }],
      { debounce: true },
    );
    fireEvent.input(theory, { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editStep", id: "ch-pods-1", text: { textFormat: SM.markdown } }], { debounce: true });
  });

  it("hints at Markdown that would not show as meant", () => {
    renderScreen("ch-pods-2");
    expect(screen.getByRole("heading", { level: 2, name: "Step 2" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Format with Markdown" })).toBeChecked();
    fireEvent.input(screen.getByRole("textbox", { name: "Theory" }), { target: { value: "<b>bold</b>" } });
    expect(screen.getByRole("textbox", { name: "Theory" })).toHaveAccessibleDescription(/HTML/);
  });

  it("lists the questions that check it, and adds one after them", () => {
    const draft = courseDraft();
    const { onEdit } = renderScreen("ch-pods-1", {
      ...draft,
      steps: draft.steps.map((node) => (node.id === "ch-pods-1" ? { ...node, data: { ...node.data, checkedBy: [...node.data.checkedBy, `${draft.url}#gone`] } } : node)),
    });
    expect(screen.getByRole("link", { name: "What holds data?" })).toHaveAttribute("href", "#/question/q-pods-1a");
    expect(screen.getByRole("link", { name: "gone" })).toHaveAttribute("href", "#/question/gone");
    const form = screen.getByRole("group", { name: "New question" });
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-1b");
    for (const side of ["Front", "Back"]) {
      const field = within(form).getByRole("textbox", { name: side });
      fireEvent.input(field, { target: { value: side } });
      const group = field.closest<HTMLElement>(".lang-text-field")!;
      fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
      fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add the question" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      expect.objectContaining({ kind: "addCard", id: "q-pods-1b" }),
      { kind: "addQuestion", card: "q-pods-1b", place: { kind: "step", step: "ch-pods-1" } },
    ]);
  });

  it("names a step retired, or of no chapter, by its id, and retires or deletes it", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const draft = applyDraftChanges(courseDraft(), [{ kind: "retire", of: "step", id: "ch-pods-2" }]) as ReleaseDraft;
    const { onEdit, onDeleted } = renderScreen("ch-pods-2", draft);
    expect(screen.getByRole("heading", { level: 2, name: "ch-pods-2" })).toBeInTheDocument();
    expect(screen.getByText(/Retired step/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "restore", of: "step", id: "ch-pods-2" }]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("names a step of no chapter by its id", () => {
    const draft = courseDraft();
    renderScreen("loose", { ...draft, steps: [...draft.steps, { id: "loose", data: { checkedBy: [] } }], chapters: [...draft.chapters, { id: "ch-none", data: { reviewQuestion: [] } }] });
    expect(screen.getByRole("heading", { level: 2, name: "loose" })).toBeInTheDocument();
    expect(screen.queryByText("In")).toBeNull();
  });

  it("links to a chapter of no title by its id", () => {
    const draft = courseDraft();
    renderScreen("ch-pods-1", { ...draft, chapters: draft.chapters.map((node) => (node.id === "ch-pods" ? { ...node, data: { ...node.data, title: undefined } } : node)) });
    expect(screen.getByRole("link", { name: "ch-pods" })).toHaveAttribute("href", "#/chapter/ch-pods");
  });

  it("marks the field it was opened at where the user arrives", () => {
    const at = (field: "theory" | "questions") =>
      render(
        <StepEditorScreen
          draft={courseDraft()}
          step="ch-pods-1"
          readOnly={null}
          status={{ saving: false, failure: null }}
          links={draftLinks}
          field={field}
          onEdit={vi.fn()}
          onDeleted={vi.fn()}
        />,
      );
    at("theory");
    expect(screen.getByRole("textbox", { name: "Theory" })).toHaveAttribute("data-arrival");
    cleanup();
    at("questions");
    expect(screen.getByRole("heading", { name: "Questions that check it" })).toHaveAttribute("data-arrival");
  });
});
