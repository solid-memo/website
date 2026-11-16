// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import {
  applyDraftChanges,
  type DraftChange,
  type DraftRefusal,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import {
  DraftOutline,
  OUTLINE_LIMIT,
  OUTLINE_QUESTION_LIMIT,
  OUTLINE_ROW_LIMIT,
} from "./DraftOutline";
import { courseDraft, LONGEST_COURSE, longCourseDraft, wideCourseDraft } from "../test/fixtures";
import { answer, dialog } from "../test/dialogs";

type Edit = (changes: DraftChange[]) => DraftRefusal | null;

function renderOutline(
  draft: ReleaseDraft = courseDraft(),
  {
    readOnly = false,
    onEdit = vi.fn<Edit>(() => null),
    problems = new Map<string, ReleaseProblem[]>(),
    badgeHref,
    currentKey,
  }: {
    readOnly?: boolean;
    onEdit?: Edit;
    problems?: ReadonlyMap<string, ReleaseProblem[]>;
    badgeHref?: (problem: ReleaseProblem) => string;
    currentKey?: string;
  } = {},
) {
  const props = {
    readOnly,
    chapterHref: (id: string) => `#/chapter/${id}`,
    stepHref: (id: string) => `#/step/${id}`,
    questionHref: (id: string) => `#/question/${id}`,
    checkHref: "#/check",
    problems,
    ...(badgeHref === undefined ? {} : { badgeHref }),
    ...(currentKey === undefined ? {} : { currentKey }),
    onEdit,
  };
  const view = render(<DraftOutline draft={draft} {...props} />);
  return {
    onEdit,
    rerender: (next: ReleaseDraft) => view.rerender(<DraftOutline draft={next} {...props} />),
  };
}

/** So many problems of a subject, by its id. */
const problemsOf = (id: string, count: number) =>
  Array.from({ length: count }, (_, at) =>
    problem(`${courseDraft().url}#${id}`, { code: at === 0 ? "noBack" : "unshaped", params: {} }),
  );

const status = () => document.querySelector(".draft-outline [role=status]")!;
const openMenu = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));

describe("DraftOutline", () => {
  it("shows the chapters, their steps and the questions that check each, linked to their editors", () => {
    const draft = courseDraft();
    renderOutline({
      ...draft,
      steps: draft.steps.map((node) =>
        node.id === "ch-pods-2"
          ? { ...node, data: { ...node.data, checkedBy: [`${draft.url}#gone`] } }
          : node,
      ),
    });
    const outline = screen.getByRole("list", { name: "Outline" });
    expect(within(outline).getByRole("link", { name: "Pods" })).toHaveAttribute(
      "href",
      "#/chapter/ch-pods",
    );
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Step 1.1" })).toHaveAttribute(
      "href",
      "#/step/ch-pods-1",
    );
    expect(screen.getByText("A pod holds data.")).toBeInTheDocument();
    // Markdown's theory as its plain text.
    expect(screen.getByText(/^Two/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What holds data?" })).toHaveAttribute(
      "href",
      "#/question/q-pods-1a",
    );
    // A question the draft has no card for, by its id.
    expect(screen.getByRole("link", { name: "gone" })).toHaveAttribute("href", "#/question/gone");
    expect(screen.getByText("No steps yet.")).toBeInTheDocument();
  });

  it("counts the problems the release check finds in a chapter, step or question, linking to the check", () => {
    renderOutline(courseDraft(), {
      problems: new Map([
        ["ch-apps", problemsOf("ch-apps", 1)],
        ["ch-pods-2", problemsOf("ch-pods-2", 2)],
        ["q-pods-1a", problemsOf("q-pods-1a", 3)],
      ]),
    });
    expect(screen.getByRole("link", { name: "1 problem in Apps" })).toHaveAttribute(
      "href",
      "#/check",
    );
    expect(screen.getByRole("link", { name: "2 problems in Step 1.2" })).toHaveAttribute(
      "href",
      "#/check",
    );
    expect(screen.getByRole("link", { name: "3 problems in What holds data?" })).toHaveAttribute(
      "href",
      "#/check",
    );
    expect(screen.queryByRole("link", { name: /problems? in Pods/ })).toBeNull();
  });

  it("links a badge to where its first problem is fixed, when it can", () => {
    renderOutline(courseDraft(), {
      problems: new Map([["q-pods-1a", problemsOf("q-pods-1a", 2)]]),
      badgeHref: (found) => `#/fix/${found.code}`,
    });
    expect(screen.getByRole("link", { name: "2 problems in What holds data?" })).toHaveAttribute(
      "href",
      "#/fix/noBack",
    );
  });

  it("marks the chapter, step or question the page shown edits", () => {
    renderOutline(courseDraft(), { currentKey: "ch-pods-1" });
    expect(screen.getByRole("link", { name: "Step 1.1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pods" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "What holds data?" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("names a chapter of no title by its id", () => {
    const draft = courseDraft();
    renderOutline({
      ...draft,
      chapters: draft.chapters.map((node) =>
        node.id === "ch-apps" ? { ...node, data: { ...node.data, title: undefined } } : node,
      ),
    });
    expect(screen.getByRole("link", { name: "ch-apps" })).toHaveAttribute(
      "href",
      "#/chapter/ch-apps",
    );
  });

  it("says when there is no chapter, nor theory", () => {
    const draft = courseDraft();
    renderOutline({ ...draft, chapters: [], steps: [] });
    expect(screen.getByText("No chapters yet.")).toBeInTheDocument();
    const theoryless = applyDraftChanges(draft, [
      { kind: "editStep", id: "ch-pods-1", text: {} },
    ]) as ReleaseDraft;
    render(
      <DraftOutline
        draft={theoryless}
        readOnly={false}
        chapterHref={String}
        stepHref={String}
        questionHref={String}
        checkHref="#"
        problems={new Map()}
        onEdit={vi.fn()}
      />,
    );
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
    fireEvent.click(
      within(within(menu).getByRole("group", { name: "Move to chapter" })).getByRole("menuitem", {
        name: "Apps",
      }),
    );
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "ch-pods-1", chapter: "ch-apps", to: 0 },
    ]);
  });

  it("names the chapters a step can move to cut short, as the question editor does", () => {
    const title = "ж".repeat(16_000);
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "editChapter", id: "ch-apps", text: { title: { en: title } } },
    ]) as ReleaseDraft;
    renderOutline(draft);
    openMenu("Step 1.1");
    const group = within(screen.getByRole("menu")).getByRole("group", { name: "Move to chapter" });
    expect(within(group).getByRole("menuitem")).toHaveTextContent(`${"ж".repeat(59)}…`);
    expect(group.outerHTML).not.toContain("ж".repeat(60));
  });

  it("retires a chapter or step, and deletes one never published once the user confirms", () => {
    const onEdit = vi
      .fn<Edit>()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ refused: "missing", id: "ch-apps" })
      .mockReturnValue(null);
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
    expect(dialog("Delete the step")).toHaveTextContent(
      "Delete Step 1.2? Its questions stay, asked nowhere.",
    );
    answer("Delete the step", "Delete");
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "delete", of: "step", id: "ch-pods-2" }]);
    expect(status()).toHaveTextContent("Deleted Step 1.2.");
    // A delete refused says nothing.
    onEdit.mockReturnValueOnce({ refused: "missing", id: "ch-pods-1" });
    openMenu("Step 1.1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    answer("Delete the step", "Delete");
    expect(status()).toHaveTextContent("Deleted Step 1.2.");
  });

  it("deletes nothing the user does not confirm, nor what an earlier release published", () => {
    const draft = {
      ...courseDraft(),
      published: { ids: { "ch-apps": "chapter" as const }, activities: [] },
    };
    const onEdit = vi.fn<Edit>(() => ({ refused: "missing", id: "x" }));
    renderOutline(draft, { onEdit });
    openMenu("Apps");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    openMenu("Pods");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    answer("Delete the chapter", "Cancel");
    expect(onEdit).not.toHaveBeenCalled();
    // A move the draft refuses says nothing.
    openMenu("Pods");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(status()).toHaveTextContent("");
  });

  it("changes nothing while the draft is held", () => {
    renderOutline(courseDraft(), { readOnly: true });
    openMenu("Pods");
    expect(screen.getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Retire" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("DraftOutline of a long course", () => {
  it("shows at most OUTLINE_LIMIT steps of a chapter and OUTLINE_QUESTION_LIMIT questions of a step, the rest a link to their screen", () => {
    renderOutline(longCourseDraft({ steps: 3000, questions: 3000 }));
    expect(document.querySelectorAll(".outline-step")).toHaveLength(OUTLINE_LIMIT);
    expect(screen.getByText("3,000 steps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2,950 more steps" })).toHaveAttribute(
      "href",
      "#/chapter/ch-0",
    );
    expect(document.querySelectorAll(".outline-questions > li")).toHaveLength(
      OUTLINE_QUESTION_LIMIT + 1,
    );
    expect(screen.getByRole("link", { name: "2,990 more questions" })).toHaveAttribute(
      "href",
      "#/step/st-0",
    );
  });

  it("shows OUTLINE_LIMIT chapters at first, and as many more each time the user asks", () => {
    renderOutline(longCourseDraft({ chapters: 120 }));
    const chapters = () => document.querySelectorAll(".deck-group").length;
    expect(chapters()).toBe(OUTLINE_LIMIT);
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(chapters()).toBe(2 * OUTLINE_LIMIT);
    fireEvent.click(screen.getByRole("button", { name: "Show 20 more" }));
    expect(chapters()).toBe(120);
    expect(screen.queryByRole("button", { name: /^Show/ })).toBeNull();
  });
});

describe("DraftOutline of a wide and deep course", () => {
  const count = (selector: string) => document.querySelectorAll(selector).length;

  it("shows OUTLINE_ROW_LIMIT steps and questions in all for each page of chapters, however long they are", () => {
    renderOutline(wideCourseDraft({ chapters: 300, steps: 60, questions: 20 }));
    // The first chapters share the steps; the others link to their screens.
    const full = OUTLINE_ROW_LIMIT / OUTLINE_LIMIT;
    expect(count(".outline-step")).toBe(OUTLINE_ROW_LIMIT);
    expect(count(".outline-questions a[href^='#/question/']")).toBe(OUTLINE_ROW_LIMIT);
    expect(screen.getAllByRole("link", { name: "10 more steps" })).toHaveLength(full);
    expect(screen.getAllByRole("link", { name: "60 more steps" })).toHaveLength(
      OUTLINE_LIMIT - full,
    );
    expect(screen.getAllByRole("link", { name: "10 more questions" })).toHaveLength(
      OUTLINE_ROW_LIMIT / OUTLINE_QUESTION_LIMIT,
    );
    expect(screen.getAllByRole("link", { name: "20 more questions" })).toHaveLength(
      OUTLINE_ROW_LIMIT - OUTLINE_ROW_LIMIT / OUTLINE_QUESTION_LIMIT,
    );
    // A chapter, a step, a question and a step's "more questions": no more rows than that.
    const rows = OUTLINE_LIMIT + 3 * OUTLINE_ROW_LIMIT;
    expect(count("li")).toBe(rows);
    expect(count("a")).toBeLessThanOrEqual(2 * rows);
    expect(count("button")).toBeLessThanOrEqual(rows);
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(count(".deck-group")).toBe(2 * OUTLINE_LIMIT);
    expect(count(".outline-step")).toBe(2 * OUTLINE_ROW_LIMIT);
    expect(count("li")).toBe(2 * rows);
  });

  it("shows every step and question of a course as long as the project's longest", () => {
    renderOutline(
      wideCourseDraft({ chapters: LONGEST_COURSE.length, steps: LONGEST_COURSE, questions: 2 }),
    );
    const steps = LONGEST_COURSE.reduce((all, one) => all + one, 0);
    expect(count(".deck-group")).toBe(LONGEST_COURSE.length);
    expect(count(".outline-step")).toBe(steps);
    expect(count(".outline-questions a[href^='#/question/']")).toBe(2 * steps);
    expect(screen.queryByRole("link", { name: /more (steps|questions)$/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Step 17.9" })).toBeInTheDocument();
  });

  it("shows and marks the chapter, step or question the page edits, however far down", () => {
    const draft = wideCourseDraft({ chapters: 120, steps: 60, questions: 20 });
    renderOutline(draft, { currentKey: "st-110-59" });
    expect(screen.getByRole("link", { name: "Chapter 110" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Step 111.60" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "59 more steps" })).toHaveAttribute(
      "href",
      "#/chapter/ch-110",
    );
    expect(count(".deck-group")).toBe(OUTLINE_LIMIT + 1);
    cleanup();
    renderOutline(draft, { currentKey: "ch-80" });
    expect(screen.getByRole("link", { name: "Chapter 80" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    cleanup();
    // Ids sort as text: q-0-0-9 is the last of its step's.
    renderOutline(draft, { currentKey: "q-0-0-9" });
    expect(screen.getByRole("link", { name: "q-0-0-9" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "9 more questions" })).toHaveLength(1);
  });

  it("shows and marks a question the page edits by the step that asks it, however far down", () => {
    const draft = wideCourseDraft({ chapters: 120, steps: 60, questions: 20 });
    // In a chapter past those shown, and in a step past those shown of the first.
    for (const [card, step] of [
      ["q-110-59-0", "Step 111.60"],
      ["q-0-55-3", "Step 1.56"],
    ] as const) {
      renderOutline(draft, { currentKey: card });
      expect(screen.getByRole("link", { name: step })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: card })).toHaveAttribute("aria-current", "page");
      cleanup();
    }
  });

  it("shows the chapter that asks a question in its final review only, however far down", () => {
    const draft = wideCourseDraft({ chapters: 120, steps: 1, questions: 0 });
    const reviewed = {
      ...draft,
      chapters: draft.chapters.map((node) =>
        node.id === "ch-110"
          ? { ...node, data: { ...node.data, reviewQuestion: [`${draft.url}#q-110-r01`] } }
          : node,
      ),
    };
    renderOutline(reviewed, { currentKey: "q-110-r01" });
    expect(screen.getByRole("link", { name: "Chapter 110" })).toBeInTheDocument();
    expect(count(".deck-group")).toBe(OUTLINE_LIMIT + 1);
    cleanup();
    // A question nothing asks: the outline's first chapters only.
    renderOutline(reviewed, { currentKey: "q-unasked" });
    expect(count(".deck-group")).toBe(OUTLINE_LIMIT);
  });

  it("moves a step or chapter cut short among all of them, from its menu", () => {
    const { onEdit } = renderOutline(wideCourseDraft({ chapters: 60, steps: 60, questions: 0 }));
    // Step 1.50, the last shown of its chapter: its next is the 51st.
    openMenu("Step 1.50");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-0-49", chapter: "ch-0", to: 50 },
    ]);
    // To another chapter: at its end, after the steps it doesn't show.
    openMenu("Step 2.1");
    const into = within(screen.getByRole("menu")).getByRole("group", { name: "Move to chapter" });
    // The chapters shown, and no others.
    expect(within(into).getAllByRole("menuitem")).toHaveLength(OUTLINE_LIMIT - 1);
    fireEvent.click(within(into).getByRole("menuitem", { name: "Chapter 0" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-1-0", chapter: "ch-0", to: 60 },
    ]);
    // Chapter 50, the last shown: its next is the 51st.
    openMenu("Chapter 49");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveChapter", id: "ch-49", to: 50 }]);
    openMenu("Chapter 49");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "moveChapter", id: "ch-49", to: 48 }]);
  });
});

describe("DraftOutline dragging", () => {
  const listTop = 100;
  /** The page's y of row `index` (in the order shown), `offset` pixels into it. */
  const yOf = (index: number, offset = 20) => listTop + index * 48 + offset;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
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

  const at = (y: number) => ({
    pointerId: 1,
    pointerType: "mouse",
    clientX: 50,
    clientY: y,
    button: 0,
    isPrimary: true,
  });
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
    expect(onEdit).toHaveBeenCalledWith([
      { kind: "moveStep", id: "ch-pods-2", chapter: "ch-apps", to: 0 },
    ]);
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
    expect(status()).toHaveTextContent("Move canceled.");
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

  it("drops a step at the end of a chapter cut short, or into its header, at the chapter's end", () => {
    const { onEdit } = renderOutline(longCourseDraft({ chapters: 2, steps: 60 }));
    // Rows: Chapter 0 0; its steps 1 to 50, 1.2 lifted; Chapter 1 51.
    lift("Step 1.2", 2);
    fireEvent.pointerMove(window, at(yOf(50, 44)));
    expect(line().dataset.label).toBe("in Chapter 0");
    fireEvent.pointerUp(window, at(yOf(50, 44)));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-1", chapter: "ch-0", to: 59 },
    ]);
  });

  it("drops a step right after the step the page edits, shown past those of its chapter shown", () => {
    const { onEdit } = renderOutline(longCourseDraft({ chapters: 2, steps: 60 }), {
      currentKey: "st-55",
    });
    // Rows: Chapter 0 0; its steps 1 to 50, 1.2 lifted; 1.56 51; Chapter 1 52.
    lift("Step 1.2", 2);
    fireEvent.pointerMove(window, at(yOf(51, 44)));
    fireEvent.pointerUp(window, at(yOf(51, 44)));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-1", chapter: "ch-0", to: 55 },
    ]);
    lift("Step 1.2", 2);
    fireEvent.pointerMove(window, at(yOf(50, 44)));
    fireEvent.pointerUp(window, at(yOf(50, 44)));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-1", chapter: "ch-0", to: 49 },
    ]);
  });

  it("drops a step into a chapter none of whose steps are shown, at its end", () => {
    const shown = OUTLINE_ROW_LIMIT / OUTLINE_LIMIT;
    const { onEdit } = renderOutline(
      wideCourseDraft({ chapters: shown + 2, steps: OUTLINE_LIMIT + 10, questions: 0 }),
    );
    // Rows: each chapter shown in full is its header and OUTLINE_LIMIT
    // steps; then Chapter `shown`, none of its steps shown, and its slot.
    const header = shown * (OUTLINE_LIMIT + 1);
    lift("Step 1.2", 2);
    fireEvent.pointerMove(window, at(yOf(header)));
    expect(row(`ch-${shown}`)).toHaveClass("drop-into");
    fireEvent.pointerUp(window, at(yOf(header)));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveStep", id: "st-0-1", chapter: `ch-${shown}`, to: OUTLINE_LIMIT + 10 },
    ]);
  });

  it("keeps drawing a lifted outline when the draft retires one of its steps", () => {
    const { rerender } = renderOutline();
    lift("Step 1.2", 2);
    rerender(
      applyDraftChanges(courseDraft(), [
        { kind: "retire", of: "step", id: "ch-pods-1" },
      ]) as ReleaseDraft,
    );
    expect(row("ch-pods-1")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(row("ch-pods-1")).toBeNull();
  });

  it("comes to nothing when the draft no longer has the place a drop is aimed at", () => {
    const { onEdit, rerender } = renderOutline();
    lift("Step 1.2", 2);
    rerender(
      applyDraftChanges(courseDraft(), [
        { kind: "delete", of: "chapter", id: "ch-apps" },
      ]) as ReleaseDraft,
    );
    fireEvent.pointerMove(window, at(yOf(3)));
    fireEvent.pointerUp(window, at(yOf(3)));
    expect(onEdit).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("Move canceled.");
  });
});
