import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { QuestionField } from "@solid-memo/domain/release/releaseCheck";
import { applyDraftChanges, blankDraft, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { DraftEditor } from "./draftEditor";
import { QuestionEditorScreen } from "./QuestionEditorScreen";
import { choose } from "../test/choose";
import { courseDraft, DRAFT_URL, draftLinks } from "../test/fixtures";

function renderScreen(card: string, draft: ReleaseDraft = courseDraft(), onEdit = vi.fn<DraftEditor["edit"]>(() => null)) {
  const onDeleted = vi.fn();
  render(<QuestionEditorScreen draft={draft} card={card} readOnly={null} status={{ saving: false, failure: null }} links={draftLinks} onEdit={onEdit} onDeleted={onDeleted} />);
  return { onEdit, onDeleted };
}

const preview = () => screen.getByRole("heading", { name: "As the course asks it" }).parentElement!;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("QuestionEditorScreen", () => {
  it("says where the card is asked, and moves it", () => {
    const { onEdit } = renderScreen("q-pods-1a");
    expect(screen.getByRole("heading", { level: 2, name: "What holds data?" })).toBeInTheDocument();
    const place = screen.getByRole<HTMLSelectElement>("combobox", { name: "Asked" });
    expect(place.value).toBe("step ch-pods-1");
    expect([...place.options].map((option) => option.text)).toEqual(["Nowhere yet", "Pods, step 1", "Pods, step 2", "Pods, final review", "Apps, final review"]);
    choose("Asked", "review ch-apps");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveQuestion", card: "q-pods-1a", place: { kind: "review", chapter: "ch-apps" } }]);
    choose("Asked", "step ch-pods-2");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveQuestion", card: "q-pods-1a", place: { kind: "step", step: "ch-pods-2" } }]);
    choose("Asked", "");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveQuestion", card: "q-pods-1a", place: null }]);
  });

  it("says when a course's card is asked nowhere yet", () => {
    const draft = applyDraftChanges(courseDraft(), [{ kind: "addCard", id: "q-1", card: { front: { en: "Loose" }, back: { en: "Yes" } } }]) as ReleaseDraft;
    renderScreen("q-1", draft);
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Asked" }).value).toBe("");
  });

  it("names a chapter of no title by its id, and a review question's place", () => {
    const draft = courseDraft();
    renderScreen("q-pods-r01", { ...draft, chapters: draft.chapters.map((node) => (node.id === "ch-apps" ? { ...node, data: { ...node.data, title: undefined } } : node)) });
    const place = screen.getByRole<HTMLSelectElement>("combobox", { name: "Asked" });
    expect(place.value).toBe("review ch-pods");
    expect([...place.options].map((option) => option.text)).toContain("ch-apps, final review");
  });

  it("saves the card's content by Save, keeping when it was made and how it is written", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "editCard", id: "q-pods-1a", card: { front: { en: "What *holds* data?" }, back: { en: "A pod" }, created: "2026-10-10T10:00:00.000Z", textFormat: SM.markdown } },
    ]) as ReleaseDraft;
    const { onEdit } = renderScreen("q-pods-1a", draft);
    const front = screen.getByRole("textbox", { name: "Front" });
    fireEvent.input(front, { target: { value: "What *keeps* data?" } });
    // The preview asks it as typed.
    expect(preview().querySelector("em")).toHaveTextContent("keeps");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "editCard", id: "q-pods-1a", card: { front: { en: "What *keeps* data?" }, back: { en: "A pod" }, created: "2026-10-10T10:00:00.000Z", textFormat: SM.markdown } },
    ]);
  });

  it("refuses a card with an empty side, and previews it as saved meanwhile", () => {
    const { onEdit } = renderScreen("q-pods-1a");
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), { target: { value: "" } });
    expect(within(preview()).getByText("What holds data?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent !== "")).toBe(true);
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), { target: { value: "Again" } });
  });

  it("asks for a language before it saves, and lets the user change it", () => {
    const { onEdit } = renderScreen("q-pods-1a");
    const label = screen.getByRole("textbox", { name: "Label (optional)" });
    fireEvent.input(label, { target: { value: "Where" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(label, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("saves each change of its wrong options as it is made, and the preview offers them", async () => {
    const { onEdit } = renderScreen("q-pods-1a");
    const options = screen.getByRole("group", { name: "Wrong options" });
    fireEvent.click(within(options).getByRole("button", { name: "Retire the wrong option “An app”" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "retire", of: "distractor", id: "q-pods-1a-d1" }]);
    expect(within(preview()).getByRole("radio", { name: "An app" })).toBeInTheDocument();
    fireEvent.click(within(preview()).getByRole("radio", { name: "An app" }));
    fireEvent.click(within(preview()).getByRole("button", { name: "Check" }));
    expect(within(preview()).getByText("Not quite.")).toBeInTheDocument();
    expect(preview()).toHaveTextContent("Apps use data.");
    fireEvent.click(within(preview()).getByRole("button", { name: "Ask again" }));
    expect(within(preview()).queryByText("Not quite.")).toBeNull();
  });

  it("asks a deck's card from nowhere, and only retires one published", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const deck = applyDraftChanges(blankDraft({ url: DRAFT_URL, course: false, title: { en: "Words" }, now: "2026-10-10T10:00:00.000Z" }), [
      { kind: "addCard", id: "w1", card: { front: { en: "Hej" }, back: { en: "Hi" } } },
      { kind: "retire", of: "card", id: "w1" },
    ]) as ReleaseDraft;
    const { onEdit, onDeleted } = renderScreen("w1", { ...deck, published: { ids: { w1: "card" }, activities: [] } });
    expect(screen.queryByRole("combobox", { name: "Asked" })).toBeNull();
    expect(screen.getByText(/Retired ·/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "restore", of: "card", id: "w1" }]);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("marks the field it was opened at where the user arrives: a text, the wrong options, or one of them", () => {
    const at = (field: QuestionField) =>
      render(
        <QuestionEditorScreen
          draft={courseDraft()}
          card="q-pods-1a"
          readOnly={null}
          status={{ saving: false, failure: null }}
          links={draftLinks}
          field={field}
          onEdit={vi.fn()}
          onDeleted={vi.fn()}
        />,
      );
    at("back");
    expect(screen.getByRole("textbox", { name: "Back" })).toHaveAttribute("data-arrival");
    cleanup();
    at("distractors");
    expect(document.getElementById("question-distractors")).toHaveAttribute("data-arrival");
    cleanup();
    at("distractor:q-pods-1a-d1");
    expect(screen.getByRole("button", { name: "Edit the wrong option “An app”" })).toHaveAttribute("data-arrival");
    expect(document.getElementById("question-distractors")).not.toHaveAttribute("data-arrival");
  });
});
