// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import {
  applyDraftChanges,
  blankDraft,
  type DraftChange,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import { DraftCardsScreen, type DraftCardsView } from "./DraftCardsScreen";
import { choose } from "../test/choose";
import { WithKeys } from "../test/keys";
import { courseDraft, DRAFT_URL, draftLinks } from "../test/fixtures";

function renderScreen(
  draft: ReleaseDraft = courseDraft(),
  view: DraftCardsView = {},
  readOnly: DraftReadOnly | null = null,
) {
  const onView = vi.fn();
  const onOpen = vi.fn();
  const onEdit = vi.fn<DraftEditor["edit"]>(() => null);
  render(
    <DraftCardsScreen
      draft={draft}
      view={view}
      readOnly={readOnly}
      status={{ saving: false, failure: null }}
      links={draftLinks}
      onView={onView}
      onOpen={onOpen}
      onEdit={onEdit}
    />,
    { wrapper: WithKeys },
  );
  return { onView, onOpen, onEdit };
}

const table = () => screen.getByRole("table", { name: "The draft's cards" });
const fronts = () =>
  within(table())
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent);

describe("DraftCardsScreen", () => {
  it("lists a course's cards by id: where each is asked, and its wrong options", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "addCard", id: "q-loose", card: { front: { en: "Loose" }, back: { en: "Yes" } } },
      { kind: "addCard", id: "q-old", card: { front: { en: "Old" }, back: { en: "Yes" } } },
      { kind: "retire", of: "card", id: "q-old" },
      { kind: "retire", of: "step", id: "ch-pods-2" },
    ]) as ReleaseDraft;
    const twice: ReleaseDraft = {
      ...draft,
      chapters: draft.chapters.map((node) =>
        node.id === "ch-apps"
          ? { ...node, data: { ...node.data, reviewQuestion: [`${DRAFT_URL}#q-loose`] } }
          : node,
      ),
      steps: [
        ...draft.steps.map((node) =>
          node.id === "ch-pods-2"
            ? { ...node, data: { ...node.data, checkedBy: [`${DRAFT_URL}#q-old`] } }
            : node,
        ),
        {
          id: "ch-gone-1",
          data: { chapter: `${DRAFT_URL}#ch-gone`, checkedBy: [`${DRAFT_URL}#q-loose`] },
        },
      ],
    };
    renderScreen(twice);
    expect(
      screen.getByRole("heading", { level: 2, name: "Questions of Solid" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 cards")).toBeInTheDocument();
    expect(fronts()).toEqual(["Loose", "Old (retired)", "What holds data?", "Who owns a pod?"]);
    const cells = (front: string) =>
      within(
        within(table())
          .getByRole("rowheader", { name: new RegExp(front) })
          .closest("tr")!,
      )
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent);
    expect(cells("What holds data")).toEqual(["A pod", "Pods, step 1", "1", "q-pods-1a"]);
    expect(cells("Who owns")).toEqual(["Its user", "Pods, final review", "0", "q-pods-r01"]);
    expect(cells("Loose")).toEqual(["Yes", "Asked from 2 places", "0", "q-loose"]);
    // A step retired is named by its id.
    expect(cells("Old")).toEqual(["Yes", "ch-pods-2", "0", "q-old"]);
    expect(within(table()).getByRole("link", { name: "What holds data?" })).toHaveAttribute(
      "href",
      "#/question/q-pods-1a",
    );
  });

  it("names a place in a chapter of no title, or a step of a chapter gone, by its id", () => {
    const draft = courseDraft();
    renderScreen({
      ...draft,
      root: { ...draft.root, title: undefined },
      chapters: draft.chapters.map((node) => ({
        ...node,
        data: { ...node.data, title: undefined },
      })),
      steps: [
        ...draft.steps,
        {
          id: "lost-1",
          data: { chapter: `${DRAFT_URL}#ch-lost`, checkedBy: [`${DRAFT_URL}#q-lost`] },
        },
      ],
      cards: [
        ...draft.cards,
        {
          id: "q-pic",
          data: {
            frontImage: "https://x.example/a.png",
            backImage: "https://x.example/b.png",
            distractor: [],
          },
        },
        { id: "q-lost", data: { front: { en: "Lost" }, back: { en: "Yes" }, distractor: [] } },
      ],
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "Questions of Untitled draft" }),
    ).toBeInTheDocument();
    expect(screen.getByText("lost-1")).toBeInTheDocument();
    expect(screen.getByText("ch-pods, step 1")).toBeInTheDocument();
    expect(screen.getByText("ch-pods, final review")).toBeInTheDocument();
    expect(screen.getByText("Nowhere yet")).toBeInTheDocument();
    // A card of pictures, by its id.
    expect(within(table()).getByRole("link", { name: "q-pic" })).toBeInTheDocument();
  });

  it("filters them by what the URL says, back to the first page on a change", () => {
    const { onView } = renderScreen(courseDraft(), {
      filter: "fewDistractors",
      language: "fi",
      page: 2,
    });
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Show" }).value).toBe(
      "fewDistractors",
    );
    // The URL's language is offered though no card has it.
    expect(
      [...screen.getByRole<HTMLSelectElement>("combobox", { name: "Language" }).options].map(
        (option) => option.text,
      ),
    ).toEqual(["Any language", "en", "fi"]);
    expect(screen.getByText("0 cards")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    choose("Show", "unasked");
    expect(onView).toHaveBeenLastCalledWith({ filter: "unasked", language: "fi" });
    choose("Show", "");
    expect(onView).toHaveBeenLastCalledWith({ language: "fi" });
    choose("Language", "en");
    expect(onView).toHaveBeenLastCalledWith({ filter: "fewDistractors", language: "en" });
    choose("Language", "");
    expect(onView).toHaveBeenLastCalledWith({ filter: "fewDistractors" });
  });

  it("pages a deck's cards, offers only the filters a deck has, and adds one", () => {
    const changes: DraftChange[] = Array.from({ length: 51 }, (_, n) => ({
      kind: "addCard" as const,
      id: `card-${String(n + 1).padStart(2, "0")}`,
      card: { front: { en: `Front ${n + 1}` }, back: { "": `${n + 1}` } },
    }));
    const deck = applyDraftChanges(
      blankDraft({
        url: DRAFT_URL,
        course: false,
        title: { en: "Words" },
        now: "2026-10-10T10:00:00.000Z",
      }),
      changes,
    ) as ReleaseDraft;
    const { onView, onEdit } = renderScreen(deck, { page: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onView).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: "Cards of Words" })).toBeInTheDocument();
    expect(
      [...screen.getByRole<HTMLSelectElement>("combobox", { name: "Show" }).options].map(
        (option) => option.value,
      ),
    ).toEqual(["", "fewDistractors", "retired"]);
    expect(
      [...screen.getByRole<HTMLSelectElement>("combobox", { name: "Language" }).options].map(
        (option) => option.text,
      ),
    ).toEqual(["Any language", "en", "No language stated"]);
    expect(within(table()).queryByRole("columnheader", { name: "Asked" })).toBeNull();
    expect(fronts()).toEqual(["Front 51"]);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onView).toHaveBeenCalledWith({});
    onView.mockClear();
    const form = screen.getByRole("group", { name: "New card" });
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("card-52");
    for (const side of ["Front", "Back"]) {
      const field = within(form).getByRole("textbox", { name: side });
      fireEvent.input(field, { target: { value: side } });
      const group = field.closest<HTMLElement>(".lang-text-field")!;
      fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
      fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add the question" }));
    expect(onEdit).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "addCard", id: "card-52" }),
    ]);
  });

  it("goes to the next page", () => {
    const changes: DraftChange[] = Array.from({ length: 51 }, (_, n) => ({
      kind: "addCard" as const,
      id: `c${n}`,
      card: { front: { en: "F" }, back: { en: "B" } },
    }));
    const { onView } = renderScreen(applyDraftChanges(courseDraft(), changes) as ReleaseDraft);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onView).toHaveBeenCalledWith({ page: 2 });
  });

  it("sorts by a column's header, from the first page, and shows the cards as the URL sorts them", () => {
    const { onView } = renderScreen(courseDraft(), {
      sort: { key: "distractors", descending: true },
    });
    expect(fronts()).toEqual(["What holds data?", "Who owns a pod?"]);
    expect(within(table()).getByRole("columnheader", { name: "Wrong options" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    fireEvent.click(within(table()).getByRole("button", { name: "Wrong options" }));
    expect(onView).toHaveBeenCalledWith({});
    fireEvent.click(within(table()).getByRole("button", { name: "Front" }));
    expect(onView).toHaveBeenLastCalledWith({ sort: { key: "front", descending: false } });
  });

  it.each([
    ["front", false, ["What holds data?", "Who owns a pod?"]],
    ["front", true, ["Who owns a pod?", "What holds data?"]],
    ["back", true, ["Who owns a pod?", "What holds data?"]],
    ["place", true, ["What holds data?", "Who owns a pod?"]],
    ["id", true, ["Who owns a pod?", "What holds data?"]],
  ] as const)("sorts by %s (descending: %s)", (key, descending, order) => {
    renderScreen(courseDraft(), { sort: { key, descending } });
    expect(fronts()).toEqual(order);
  });

  it("sorts a card of no front by its id, and one of no back last", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "addCard", id: "a-pic", card: { frontImage: "https://x.example/a.png" } },
    ]) as ReleaseDraft;
    renderScreen(draft, { sort: { key: "front", descending: false } });
    expect(fronts()[0]).toBe("a-pic");
    cleanup();
    renderScreen(draft, { sort: { key: "back", descending: false } });
    expect(fronts().at(-1)).toBe("a-pic");
  });

  it("retires or restores the cards selected at once, and opens one's editor with Enter", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "retire", of: "card", id: "q-pods-r01" },
    ]) as ReleaseDraft;
    const { onEdit, onOpen } = renderScreen(draft);
    expect(screen.getByText("0 cards selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every card on this page" }));
    expect(screen.getByRole("group", { name: "Selected cards" })).toHaveTextContent(
      "2 cards selected",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire 1 card" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "retire", of: "card", id: "q-pods-1a" }]);
    fireEvent.click(screen.getByRole("button", { name: "Restore 1 card" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "restore", of: "card", id: "q-pods-r01" }]);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("button", { name: /^Retire/ })).toBeNull();
    const box = screen.getByRole("checkbox", { name: "Select Who owns a pod?" });
    act(() => box.focus());
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("q-pods-r01");
  });

  it("selects nothing while the draft may not be changed", () => {
    renderScreen(courseDraft(), {}, "released");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("0 cards selected")).toBeNull();
  });

  it("shows or hides its columns from the Columns menu", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Show or hide columns" }));
    expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      "Back",
      "Asked",
      "Wrong options",
      "Id",
    ]);
  });
});
