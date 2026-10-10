import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterEditorScreen, proseFormat } from "./ChapterEditorScreen";
import type { DraftEditor } from "./draftEditor";
import { courseDraft, draftLinks } from "../test/fixtures";

function renderScreen(chapter: string, draft: ReleaseDraft = courseDraft(), onEdit = vi.fn<DraftEditor["edit"]>(() => null)) {
  const onDeleted = vi.fn();
  render(
    <ChapterEditorScreen draft={draft} chapter={chapter} readOnly={null} status={{ saving: false, failure: null }} links={draftLinks} onEdit={onEdit} onDeleted={onDeleted} />,
  );
  return { onEdit, onDeleted };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("proseFormat", () => {
  it("is Markdown when on; off, none, but a format this app does not know is kept", () => {
    expect(proseFormat(true, undefined)).toBe(SM.markdown);
    expect(proseFormat(false, SM.markdown)).toBeUndefined();
    expect(proseFormat(false, undefined)).toBeUndefined();
    expect(proseFormat(false, "https://other.example/format")).toBe("https://other.example/format");
  });
});

describe("ChapterEditorScreen", () => {
  it("saves the title and the description, in Markdown when switched on, as they are typed", () => {
    const { onEdit } = renderScreen("ch-pods");
    expect(screen.getByRole("heading", { level: 2, name: "Pods" })).toBeInTheDocument();
    expect(screen.getByText("Chapter 1 of 2")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Pods!" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editChapter", id: "ch-pods", text: { title: { en: "Pods!" }, description: undefined, textFormat: undefined } }], {
      debounce: true,
    });
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editChapter", id: "ch-pods", text: { title: undefined, description: undefined, textFormat: undefined } }], {
      debounce: true,
    });
    const description = screen.getByRole("textbox", { name: "Description" });
    fireEvent.input(description, { target: { value: "*All* of it" } });
    const group = description.closest<HTMLElement>(".lang-text-field")!;
    fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
    fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Format with Markdown" }));
    expect(onEdit).toHaveBeenLastCalledWith(
      [{ kind: "editChapter", id: "ch-pods", text: { title: { en: "Pods" }, description: { en: "*All* of it" }, textFormat: SM.markdown } }],
      { debounce: true },
    );
    // Shown as the course's screen shows it.
    expect(screen.getByRole("region", { name: "Preview of Description" }).querySelector("em")).toHaveTextContent("All");
    fireEvent.input(description, { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editChapter", id: "ch-pods", text: { title: { en: "Pods" }, description: undefined, textFormat: SM.markdown } }], {
      debounce: true,
    });
  });

  it("orders its steps, and adds one under the id the assistant suggests", () => {
    const onEdit = vi.fn<DraftEditor["edit"]>().mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce({ refused: "idTaken", id: "x" }).mockReturnValue(null);
    renderScreen("ch-pods", courseDraft(), onEdit);
    const steps = screen.getByRole("heading", { name: "Steps" }).parentElement!;
    expect(within(steps).getByRole("link", { name: "Step 1" })).toHaveAttribute("href", "#/step/ch-pods-1");
    expect(within(steps).getByRole("button", { name: "Move Step 1 up" })).toBeDisabled();
    expect(within(steps).getByRole("button", { name: "Move Step 2 down" })).toBeDisabled();
    fireEvent.click(within(steps).getByRole("button", { name: "Move Step 1 down" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveStep", id: "ch-pods-1", chapter: "ch-pods", to: 1 }]);
    fireEvent.click(within(steps).getByRole("button", { name: "Move Step 2 up" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveStep", id: "ch-pods-2", chapter: "ch-pods", to: 0 }]);
    const id = within(steps).getByRole("textbox", { name: "Id" });
    expect(id).toHaveValue("ch-pods-3");
    fireEvent.input(id, { target: { value: "ch-pods-9" } });
    fireEvent.click(within(steps).getByRole("button", { name: "Add the step" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "addStep", id: "ch-pods-9", chapter: "ch-pods" }]);
    // Refused: the id stays as typed.
    expect(id).toHaveValue("ch-pods-9");
    fireEvent.click(within(steps).getByRole("button", { name: "Add the step" }));
    expect(id).toHaveValue("ch-pods-3");
    fireEvent.input(id, { target: { value: "ch-pods-1" } });
    fireEvent.click(within(steps).getByRole("button", { name: "Add the step" }));
    expect(onEdit).toHaveBeenCalledTimes(4);
  });

  it("lists its review questions and its retired steps, and adds a review question", () => {
    const draft = applyDraftChanges(courseDraft(), [{ kind: "retire", of: "step", id: "ch-pods-2" }]) as ReleaseDraft;
    const { onEdit } = renderScreen("ch-pods", { ...draft, chapters: draft.chapters.map((node) => (node.id === "ch-pods" ? { ...node, data: { ...node.data, reviewQuestion: [...node.data.reviewQuestion, `${draft.url}#gone`] } } : node)) });
    expect(screen.getByRole("link", { name: "Who owns a pod?" })).toHaveAttribute("href", "#/question/q-pods-r01");
    expect(screen.getByRole("link", { name: "gone" })).toHaveAttribute("href", "#/question/gone");
    const retired = screen.getByRole("heading", { name: "Retired steps" }).nextElementSibling as HTMLElement;
    expect(within(retired).getByRole("link", { name: "ch-pods-2" })).toHaveAttribute("href", "#/step/ch-pods-2");
    fireEvent.click(within(retired).getByRole("button", { name: "Restore" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "restore", of: "step", id: "ch-pods-2" }]);
    const form = screen.getByRole("group", { name: "New review question" });
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("q-pods-r02");
    for (const side of ["Front", "Back"]) {
      const field = within(form).getByRole("textbox", { name: side });
      fireEvent.input(field, { target: { value: side } });
      const group = field.closest<HTMLElement>(".lang-text-field")!;
      fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
      fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add the question" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      expect.objectContaining({ kind: "addCard", id: "q-pods-r02" }),
      { kind: "addQuestion", card: "q-pods-r02", place: { kind: "review", chapter: "ch-pods" } },
    ]);
  });

  it("retires, restores and deletes the chapter, once the user confirms", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { onEdit, onDeleted } = renderScreen("ch-apps");
    expect(screen.getByText("No steps yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "retire", of: "chapter", id: "ch-apps" }]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Delete the chapter Apps, with its steps? Its questions stay, asked nowhere.");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "delete", of: "chapter", id: "ch-apps" }]);
    expect(onDeleted).toHaveBeenCalled();
  });

  it("names a chapter retired, or of no title, and only retires one published", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const draft = applyDraftChanges(courseDraft(), [{ kind: "addChapter", id: "ch-x" }, { kind: "retire", of: "chapter", id: "ch-x" }]) as ReleaseDraft;
    const { onEdit, onDeleted } = renderScreen("ch-x", { ...draft, published: { ids: { "ch-x": "chapter" }, activities: [] } });
    expect(screen.getByRole("heading", { level: 2, name: "Chapter ch-x" })).toBeInTheDocument();
    expect(screen.getByText("Retired chapter")).toBeInTheDocument();
    expect(screen.getByText(/An earlier release published this/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "restore", of: "chapter", id: "ch-x" }]);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("stays when the user does not confirm, or the delete is refused", () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    const { onDeleted } = renderScreen("ch-apps", courseDraft(), vi.fn<DraftEditor["edit"]>(() => ({ refused: "missing", id: "ch-apps" })));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
