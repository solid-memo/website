import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, type DraftChange, type DraftRefusal, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { DraftOutline } from "./DraftOutline";
import { courseDraft } from "../test/fixtures";

type Edit = (changes: DraftChange[]) => DraftRefusal | null;

function renderOutline(draft: ReleaseDraft = courseDraft(), { readOnly = false, onEdit = vi.fn<Edit>(() => null) } = {}) {
  const props = {
    readOnly,
    chapterHref: (id: string) => `#/chapter/${id}`,
    stepHref: (id: string) => `#/step/${id}`,
    questionHref: (id: string) => `#/question/${id}`,
    onEdit,
  };
  const view = render(<DraftOutline draft={draft} {...props} />);
  return { onEdit, rerender: (next: ReleaseDraft) => view.rerender(<DraftOutline draft={next} {...props} />) };
}

const status = () => document.querySelector(".draft-outline [role=status]")!;
const openMenu = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

describe("DraftOutline", () => {
  it("shows the chapters, their steps and the questions that check each, linked to their editors", () => {
    const draft = courseDraft();
    renderOutline({ ...draft, steps: draft.steps.map((node) => (node.id === "ch-pods-2" ? { ...node, data: { ...node.data, checkedBy: [`${draft.url}#gone`] } } : node)) });
    expect(screen.getByRole("link", { name: "Pods" })).toHaveAttribute("href", "#/chapter/ch-pods");
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Step 1.1" })).toHaveAttribute("href", "#/step/ch-pods-1");
    expect(screen.getByText("A pod holds data.")).toBeInTheDocument();
    // Markdown's theory as its plain text.
    expect(screen.getByText(/^Two/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What holds data?" })).toHaveAttribute("href", "#/question/q-pods-1a");
    // A question the draft has no card for, by its id.
    expect(screen.getByRole("link", { name: "gone" })).toHaveAttribute("href", "#/question/gone");
    expect(screen.getByText("No steps yet.")).toBeInTheDocument();
  });

  it("names a chapter of no title by its id", () => {
    const draft = courseDraft();
    renderOutline({ ...draft, chapters: draft.chapters.map((node) => (node.id === "ch-apps" ? { ...node, data: { ...node.data, title: undefined } } : node)) });
    expect(screen.getByRole("link", { name: "ch-apps" })).toHaveAttribute("href", "#/chapter/ch-apps");
  });

  it("says when there is no chapter, nor theory", () => {
    const draft = courseDraft();
    renderOutline({ ...draft, chapters: [], steps: [] });
    expect(screen.getByText("No chapters yet.")).toBeInTheDocument();
    const theoryless = applyDraftChanges(draft, [{ kind: "editStep", id: "ch-pods-1", text: {} }]) as ReleaseDraft;
    render(<DraftOutline draft={theoryless} readOnly={false} chapterHref={String} stepHref={String} questionHref={String} onEdit={vi.fn()} />);
    expect(screen.getByText("No theory yet.")).toBeInTheDocument();
  });

  it("moves chapters and steps from their menus", () => {
    const { onEdit } = renderOutline();
    openMenu("Pods");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveChapter", id: "ch-pods", to: 1 }]);
    expect(status()).toHaveTextContent("Moved.");
    openMenu("Step 1.1");
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: /Move out of/ })).toBeNull();
    fireEvent.click(within(within(menu).getByRole("group", { name: "Move to chapter" })).getByRole("menuitem", { name: "Apps" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveStep", id: "ch-pods-1", chapter: "ch-apps", to: 0 }]);
  });

  it("retires a chapter or step, and deletes one never published once the user confirms", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onEdit = vi.fn<Edit>().mockReturnValueOnce(null).mockReturnValueOnce({ refused: "missing", id: "ch-apps" }).mockReturnValue(null);
    renderOutline(courseDraft(), { onEdit });
    openMenu("Apps");
    fireEvent.click(screen.getByRole("menuitem", { name: "Retire" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "retire", of: "chapter", id: "ch-apps" }]);
    expect(status()).toHaveTextContent("Retired Apps.");
    // Refused: nothing is said here (the status line says why).
    openMenu("Step 1.2");
    fireEvent.click(screen.getByRole("menuitem", { name: "Retire" }));
    expect(status()).toHaveTextContent("Retired Apps.");
    openMenu("Step 1.2");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith("Delete Step 1.2? Its questions stay, asked nowhere.");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "delete", of: "step", id: "ch-pods-2" }]);
    expect(status()).toHaveTextContent("Deleted Step 1.2.");
    // A delete refused says nothing.
    onEdit.mockReturnValueOnce({ refused: "missing", id: "ch-pods-1" });
    openMenu("Step 1.1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(status()).toHaveTextContent("Deleted Step 1.2.");
    vi.unstubAllGlobals();
  });

  it("deletes nothing the user does not confirm, nor what an earlier release published", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const draft = { ...courseDraft(), published: { ids: { "ch-apps": "chapter" as const }, activities: [] } };
    const onEdit = vi.fn<Edit>(() => ({ refused: "missing", id: "x" }));
    renderOutline(draft, { onEdit });
    openMenu("Apps");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    openMenu("Pods");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onEdit).not.toHaveBeenCalled();
    // A move the draft refuses says nothing.
    openMenu("Pods");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(status()).toHaveTextContent("");
    vi.unstubAllGlobals();
  });

  it("changes nothing while the draft is held", () => {
    renderOutline(courseDraft(), { readOnly: true });
    openMenu("Pods");
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Retire" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("DraftOutline dragging", () => {
  const listTop = 100;
  /** The page's y of row `index` (in the order shown), `offset` pixels into it. */
  const yOf = (index: number, offset = 20) => listTop + index * 48 + offset;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("deck-tree")) return new DOMRect(0, listTop, 600, 1000);
      const placed = /translate3d\((.+)px, (.+)px, 0\)/.exec(this.style.transform);
      if (placed !== null) return new DOMRect(Number(placed[1]), Number(placed[2]), 500, 40);
      const index = [...document.querySelectorAll("[data-row-key]")].indexOf(this);
      return index === -1 ? new DOMRect() : new DOMRect(10, yOf(index, 0), 500, 40);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const at = (y: number) => ({ pointerId: 1, pointerType: "mouse", clientX: 50, clientY: y, button: 0, isPrimary: true });
  const handle = (name: string) => screen.getByRole("link", { name });
  const row = (key: string) => document.querySelector(`[data-row-key="${key}"]`)!;
  const line = () => document.querySelector<HTMLElement>(".drop-line")!;

  /** Presses the row's link and moves the mouse far enough to lift it. */
  function lift(name: string, index: number) {
    fireEvent.pointerDown(handle(name), at(yOf(index)));
    fireEvent.pointerMove(window, at(yOf(index, 26)));
  }

  it("marks a row a finger holds, before it lifts", () => {
    renderOutline();
    fireEvent.pointerDown(handle("Step 1.1"), { ...at(yOf(1)), pointerType: "touch" });
    expect(row("ch-pods-1")).toHaveClass("press-pending");
    fireEvent.pointerUp(window, { ...at(yOf(1)), pointerType: "touch" });
    expect(row("ch-pods-1")).not.toHaveClass("press-pending");
  });

  it("drops a step into another chapter by its header", () => {
    const { onEdit } = renderOutline();
    lift("Step 1.2", 2);
    expect(row("ch-pods-2")).toHaveClass("drag-source");
    expect(document.querySelector(".drag-ghost")).toHaveTextContent("Step 1.2");
    // Rows: Pods 0; 1.1 1; (1.2 lifted) 2; Apps 3; its slot 4. Apps' header, in its middle.
    fireEvent.pointerMove(window, at(yOf(3)));
    expect(row("ch-apps")).toHaveClass("drop-into");
    fireEvent.pointerUp(window, at(yOf(3)));
    expect(onEdit).toHaveBeenCalledWith([{ kind: "moveStep", id: "ch-pods-2", chapter: "ch-apps", to: 0 }]);
    expect(status()).toHaveTextContent("Moved.");
  });

  it("marks where a drop goes, and moves a chapter among the chapters", () => {
    const { onEdit } = renderOutline();
    lift("Step 1.1", 1);
    // Under 1.2, above Apps: the end of Pods.
    fireEvent.pointerMove(window, at(yOf(2, 44)));
    expect(line().hidden).toBe(false);
    expect(line().dataset.label).toBe("in Pods");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(status()).toHaveTextContent("Move cancelled.");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    lift("Apps", 3);
    // Above the first chapter's header.
    fireEvent.pointerMove(window, at(yOf(0, 2)));
    fireEvent.pointerUp(window, at(yOf(0, 2)));
    expect(onEdit).toHaveBeenCalledWith([{ kind: "moveChapter", id: "ch-apps", to: 0 }]);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    lift("Pods", 0);
    // Under the last step: after Apps, a level up.
    fireEvent.pointerMove(window, at(yOf(4, 60)));
    expect(line().dataset.label).toBe("after Apps");
  });

  it("comes to nothing when the draft no longer has the place a drop is aimed at", () => {
    const { onEdit, rerender } = renderOutline();
    lift("Step 1.2", 2);
    rerender(applyDraftChanges(courseDraft(), [{ kind: "delete", of: "chapter", id: "ch-apps" }]) as ReleaseDraft);
    fireEvent.pointerMove(window, at(yOf(3)));
    fireEvent.pointerUp(window, at(yOf(3)));
    expect(onEdit).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("Move cancelled.");
  });
});
