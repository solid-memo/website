// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderBare, screen, within } from "@testing-library/preact";
import type { QuestionField } from "@solid-memo/domain/release/releaseCheck";
import {
  applyDraftChanges,
  blankDraft,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import { draftOutline } from "@solid-memo/domain/release/draftOutline";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { optionPhrases } from "@solid-memo/ui/markdownCache";
import { DistractorFields } from "@solid-memo/ui/DistractorFields";
import type { DraftEditor } from "./draftEditor";
import { QuestionEditorScreen } from "./QuestionEditorScreen";
import { choose } from "../test/choose";
import { OUTLINE_LIMIT } from "./DraftOutline";
import {
  courseDraft,
  DRAFT_URL,
  draftLinks,
  LONGEST_COURSE,
  wideCourseDraft,
} from "../test/fixtures";
import { deviceWrapper, makeDeviceValuesFake } from "@solid-memo/ui/test/fakes/deviceValues";
import type { ComponentChild } from "preact";

// Counts the outlines the place selector is listed from, listing them as ever.
vi.mock("@solid-memo/domain/release/draftOutline", async (actual) => {
  const outline = await actual<typeof import("@solid-memo/domain/release/draftOutline")>();
  return { ...outline, draftOutline: vi.fn(outline.draftOutline) };
});

// Counts the options the preview reads, reading them as ever.
vi.mock("@solid-memo/ui/markdownCache", async (actual) => {
  const cache = await actual<typeof import("@solid-memo/ui/markdownCache")>();
  return { ...cache, optionPhrases: vi.fn(() => vi.fn(cache.optionPhrases())) };
});

// Records what the wrong-option list is drawn with, drawing it as ever.
vi.mock("@solid-memo/ui/DistractorFields", async (actual) => {
  const fields = await actual<typeof import("@solid-memo/ui/DistractorFields")>();
  return { ...fields, DistractorFields: vi.fn(fields.DistractorFields) };
});

function renderScreen(
  card: string,
  draft: ReleaseDraft = courseDraft(),
  onEdit = vi.fn<DraftEditor["edit"]>(() => null),
) {
  const onDeleted = vi.fn();
  const screenOf = (shown: ReleaseDraft) => (
    <QuestionEditorScreen
      draft={shown}
      card={card}
      readOnly={null}
      status={{ saving: false, failure: null }}
      links={draftLinks}
      onEdit={onEdit}
      onDeleted={onDeleted}
    />
  );
  const view = render(screenOf(draft));
  return { onEdit, onDeleted, rerender: (next: ReleaseDraft) => view.rerender(screenOf(next)) };
}

/** A select's options' texts. */
const texts = (select: HTMLSelectElement) => [...select.options].map((option) => option.text);

/** The place selector, named "Asked" and the place chosen, if any. */
const asked = () => screen.getByRole<HTMLSelectElement>("combobox", { name: /^Asked/ });

/** The chapter whose places the place selector lists. */
const chapterOf = () => screen.getByRole<HTMLSelectElement>("combobox", { name: "Chapter" });

const preview = () => screen.getByRole("heading", { name: "As the course asks it" }).parentElement!;

let device = makeDeviceValuesFake();
beforeEach(() => {
  device = makeDeviceValuesFake();
});

/** Renders under the values this device keeps, `device`, fresh for each test. */
const render = (ui: ComponentChild) => renderBare(ui, { wrapper: deviceWrapper(device) });
afterEach(() => vi.unstubAllGlobals());

describe("QuestionEditorScreen", () => {
  it("says where the card is asked, and moves it", () => {
    const { onEdit } = renderScreen("q-pods-1a");
    expect(screen.getByRole("heading", { level: 2, name: "What holds data?" })).toBeInTheDocument();
    const place = asked();
    expect(place.value).toBe("step ch-pods-1");
    expect(place).toHaveAccessibleName("Asked Pods, step 1");
    expect(chapterOf().value).toBe("ch-pods");
    expect(texts(chapterOf())).toEqual(["Pods", "Apps"]);
    expect(texts(place)).toEqual(["Nowhere yet", "Step 1", "Step 2", "Final review"]);
    choose(/^Asked/, "step ch-pods-2");
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveQuestion", card: "q-pods-1a", place: { kind: "step", step: "ch-pods-2" } },
    ]);
    // Another chapter: its places, the card still where it is.
    choose("Chapter", "ch-apps");
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(texts(asked())).toEqual(["Nowhere yet", "Not in this chapter", "Final review"]);
    expect(asked().value).toBe("elsewhere");
    expect(asked()).toHaveAccessibleName("Asked Pods, step 1");
    choose(/^Asked/, "review ch-apps");
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveQuestion", card: "q-pods-1a", place: { kind: "review", chapter: "ch-apps" } },
    ]);
    choose(/^Asked/, "");
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "moveQuestion", card: "q-pods-1a", place: null },
    ]);
  });

  it("says when a course's card is asked nowhere yet", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "addCard", id: "q-1", card: { front: { en: "Loose" }, back: { en: "Yes" } } },
    ]) as ReleaseDraft;
    renderScreen("q-1", draft);
    const place = asked();
    expect(place.value).toBe("");
    expect(place).toHaveAccessibleName("Asked");
    expect(chapterOf().value).toBe("ch-pods");
    expect(texts(place)).toEqual(["Nowhere yet", "Step 1", "Step 2", "Final review"]);
  });

  it("names a chapter of no title by its id, and a review question's place", () => {
    const draft = courseDraft();
    renderScreen("q-pods-r01", {
      ...draft,
      chapters: draft.chapters.map((node) =>
        node.id === "ch-apps" ? { ...node, data: { ...node.data, title: undefined } } : node,
      ),
    });
    const place = asked();
    expect(place.value).toBe("review ch-pods");
    expect(place).toHaveAccessibleName("Asked Pods, final review");
    expect(texts(chapterOf())).toEqual(["Pods", "ch-apps"]);
  });

  it("numbers the chapters whose names would read the same once cut short", () => {
    const long = "a".repeat(70);
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "editChapter", id: "ch-pods", text: { title: { en: `${long} pods` } } },
      { kind: "editChapter", id: "ch-apps", text: { title: { en: `${long} apps` } } },
    ]) as ReleaseDraft;
    renderScreen("q-pods-1a", draft);
    expect(texts(chapterOf())).toEqual([`${"a".repeat(59)}… (1)`, `${"a".repeat(59)}… (2)`]);
    expect(asked()).toHaveAccessibleName(`Asked ${"a".repeat(59)}… (1), step 1`);
  });

  it("says no place of a chapter retired", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "retire", of: "chapter", id: "ch-pods" },
    ]) as ReleaseDraft;
    renderScreen("q-pods-1a", draft);
    expect(asked()).toHaveAccessibleName("Asked");
    expect(asked().value).toBe("elsewhere");
    expect(texts(chapterOf())).toEqual(["Apps"]);
    cleanup();
    renderScreen("q-pods-r01", draft);
    expect(asked()).toHaveAccessibleName("Asked");
    cleanup();
    // No chapter left: only nowhere.
    renderScreen(
      "q-pods-1a",
      applyDraftChanges(draft, [{ kind: "retire", of: "chapter", id: "ch-apps" }]) as ReleaseDraft,
    );
    expect(screen.queryByRole("combobox", { name: "Chapter" })).toBeNull();
    expect(texts(asked())).toEqual(["Nowhere yet", "Not in this chapter"]);
    expect(asked().value).toBe("elsewhere");
  });

  it("names a chapter once over its many steps, cut short, and lists them once while the user types", () => {
    const title = "ж".repeat(16_000);
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "editChapter", id: "ch-apps", text: { title: { en: title } } },
      ...Array.from({ length: 500 }, (_, index) => ({
        kind: "addStep" as const,
        id: `ch-apps-${index + 1}`,
        chapter: "ch-apps",
      })),
    ]) as ReleaseDraft;
    const listed = vi.mocked(draftOutline);
    listed.mockClear();
    renderScreen("q-pods-1a", draft);
    const [, label] = texts(chapterOf());
    expect(label).toBe(`${"ж".repeat(59)}…`);
    expect(chapterOf().outerHTML).not.toContain("ж".repeat(60));
    choose("Chapter", "ch-apps");
    const place = asked();
    // The first OUTLINE_LIMIT steps, and as many more each time the user asks.
    expect(place.options).toHaveLength(OUTLINE_LIMIT + 3);
    expect(texts(place).slice(-2)).toEqual(["Step 50", "Final review"]);
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more steps" }));
    expect(place.options).toHaveLength(2 * OUTLINE_LIMIT + 3);
    const option = place.options[3]!;
    expect(listed).toHaveBeenCalledTimes(1);
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), {
      target: { value: "What keeps data?" },
    });
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), {
      target: { value: "What keeps the data?" },
    });
    expect(listed).toHaveBeenCalledTimes(1);
    expect(place.options[3]).toBe(option);
  });

  it("lists a bounded part of a long course's chapters and steps, the place chosen among them, and more as asked", () => {
    const draft = applyDraftChanges(wideCourseDraft({ chapters: 300, steps: 60, questions: 0 }), [
      { kind: "addCard", id: "q-far", card: { front: { en: "Far" }, back: { en: "Away" } } },
      { kind: "addQuestion", card: "q-far", place: { kind: "step", step: "st-250-55" } },
    ]) as ReleaseDraft;
    const listed = vi.mocked(draftOutline);
    listed.mockClear();
    const view = renderScreen("q-far", draft);
    const place = asked();
    expect(place.value).toBe("step st-250-55");
    expect(place).toHaveAccessibleName("Asked Chapter 250, step 56");
    // The first OUTLINE_LIMIT chapters and the place's; its chapter's
    // first OUTLINE_LIMIT steps and the place's, nowhere and the review.
    expect(chapterOf().value).toBe("ch-250");
    expect(chapterOf().options).toHaveLength(OUTLINE_LIMIT + 1);
    expect(texts(place).slice(-3)).toEqual(["Step 50", "Step 56", "Final review"]);
    expect(place.options).toHaveLength(OUTLINE_LIMIT + 3);
    fireEvent.click(screen.getByRole("button", { name: "Show 9 more steps" }));
    expect(place.options).toHaveLength(60 + 2);
    expect(screen.queryByRole("button", { name: /more steps$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more chapters" }));
    expect(chapterOf().options).toHaveLength(2 * OUTLINE_LIMIT + 1);
    // Another chapter: its first OUTLINE_LIMIT steps again.
    choose("Chapter", "ch-99");
    expect(texts(asked())).toHaveLength(OUTLINE_LIMIT + 3);
    expect(asked().value).toBe("elsewhere");
    choose(/^Asked/, "step st-99-49");
    expect(view.onEdit).toHaveBeenLastCalledWith([
      { kind: "moveQuestion", card: "q-far", place: { kind: "step", step: "st-99-49" } },
    ]);
    // An edit to a card lists them no more.
    view.rerender(
      applyDraftChanges(draft, [
        { kind: "addCard", id: "q-near", card: { front: { en: "Near" }, back: { en: "By" } } },
      ]) as ReleaseDraft,
    );
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it("offers every step of every chapter of a course as long as the project's longest as a place", () => {
    const draft = applyDraftChanges(
      wideCourseDraft({ chapters: LONGEST_COURSE.length, steps: LONGEST_COURSE, questions: 0 }),
      [{ kind: "addCard", id: "q-any", card: { front: { en: "Any" }, back: { en: "Where" } } }],
    ) as ReleaseDraft;
    renderScreen("q-any", draft);
    expect(chapterOf().options).toHaveLength(LONGEST_COURSE.length);
    for (const [chapter, steps] of LONGEST_COURSE.entries()) {
      choose("Chapter", `ch-${chapter}`);
      expect([...asked().options].map((option) => option.value)).toEqual([
        "",
        ...Array.from({ length: steps }, (_, n) => `step st-${chapter}-${n}`),
        `review ch-${chapter}`,
      ]);
    }
    expect(screen.queryByRole("button", { name: /^Show/ })).toBeNull();
  });

  it("saves the card's content by Save, keeping when it was made and how it is written", () => {
    const draft = applyDraftChanges(courseDraft(), [
      {
        kind: "editCard",
        id: "q-pods-1a",
        card: {
          front: { en: "What *holds* data?" },
          back: { en: "A pod" },
          created: "2026-10-10T10:00:00.000Z",
          textFormat: SM.markdown,
        },
      },
    ]) as ReleaseDraft;
    const { onEdit } = renderScreen("q-pods-1a", draft);
    const front = screen.getByRole("textbox", { name: "Front" });
    fireEvent.input(front, { target: { value: "What *keeps* data?" } });
    // The preview asks it as typed.
    expect(preview().querySelector("em")).toHaveTextContent("keeps");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      {
        kind: "editCard",
        id: "q-pods-1a",
        card: {
          front: { en: "What *keeps* data?" },
          back: { en: "A pod" },
          created: "2026-10-10T10:00:00.000Z",
          textFormat: SM.markdown,
        },
      },
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
    const label = screen.getByRole("textbox", { name: "Back label (optional)" });
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
    fireEvent.click(
      within(options).getByRole("button", { name: "Retire the wrong option “An app”" }),
    );
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "retire", of: "distractor", id: "q-pods-1a-d1" },
    ]);
    expect(within(preview()).getByRole("radio", { name: "An app" })).toBeInTheDocument();
    fireEvent.click(within(preview()).getByRole("radio", { name: "An app" }));
    fireEvent.click(within(preview()).getByRole("button", { name: "Check" }));
    expect(within(preview()).getByText("Not quite.")).toBeInTheDocument();
    expect(preview()).toHaveTextContent("Apps use data.");
    fireEvent.click(within(preview()).getByRole("button", { name: "Ask again" }));
    expect(within(preview()).queryByText("Not quite.")).toBeNull();
  });

  it.each<[string, (draft: ReleaseDraft) => ReleaseDraft]>([
    [
      "a statement of the release",
      (draft) => ({
        ...draft,
        triples: [
          ...draft.triples,
          {
            subject: DRAFT_URL,
            predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
            object: { kind: "iri", value: `${DRAFT_URL}#q-pods-1a-d2` },
          },
        ],
      }),
    ],
    [
      "another card's wrong option",
      (draft) =>
        applyDraftChanges(draft, [
          {
            kind: "addDistractor",
            card: "q-pods-r01",
            id: "q-pods-1a-d2",
            distractor: { text: { en: "Nobody" } },
          },
        ]) as ReleaseDraft,
    ],
    [
      "an agent",
      (draft) =>
        applyDraftChanges(draft, [
          { kind: "setAgent", id: "q-pods-1a-d2", agent: { name: "Alice" } },
        ]) as ReleaseDraft,
    ],
  ])("adds a wrong option under an id that %s does not already name", (_, plant) => {
    const draft = plant(courseDraft());
    const onEdit = vi.fn<DraftEditor["edit"]>((changes) => {
      const applied = applyDraftChanges(draft, changes);
      return "refused" in applied ? applied : null;
    });
    renderScreen("q-pods-1a", draft, onEdit);
    const options = screen.getByRole("group", { name: "Wrong options" });
    fireEvent.click(within(options).getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(within(options).getByLabelText("Wrong option"), {
      target: { value: "A server" },
    });
    fireEvent.click(within(options).getByRole("button", { name: "Add" }));
    expect(onEdit).toHaveBeenCalledWith([
      {
        kind: "addDistractor",
        card: "q-pods-1a",
        id: "q-pods-1a-d3",
        distractor: { text: { en: "A server" } },
      },
    ]);
    expect(onEdit).toHaveLastReturnedWith(null);
  });

  it("reads the preview's options once, however often the user types or checks", () => {
    const draft = applyDraftChanges(courseDraft(), [
      {
        kind: "editCard",
        id: "q-pods-1a",
        card: {
          front: { en: "What holds data?" },
          back: { en: "A pod" },
          created: "2026-10-10T10:00:00.000Z",
          textFormat: SM.markdown,
        },
      },
      {
        kind: "addDistractor",
        card: "q-pods-1a",
        id: "q-pods-1a-d2",
        distractor: { text: { en: "A *server*" } },
      },
    ]) as ReleaseDraft;
    const made = vi.mocked(optionPhrases);
    made.mockClear();
    renderScreen("q-pods-1a", draft);
    // The option neither chosen nor right, read once by the preview's question
    // and once by the wrong-option list beside it, each with its own cache.
    const reads = () =>
      made.mock.results
        .flatMap(({ value }) => vi.mocked(value as ReturnType<typeof optionPhrases>).mock.calls)
        .filter(([text]) => text === "A *server*").length;
    expect(reads()).toBe(2);
    fireEvent.input(screen.getByRole("textbox", { name: "Front" }), {
      target: { value: "What keeps data?" },
    });
    fireEvent.click(within(preview()).getByRole("radio", { name: "An app" }));
    expect(reads()).toBe(2);
    // Checking fixes every option, each read from the question's one cache.
    fireEvent.click(within(preview()).getByRole("button", { name: "Check" }));
    expect(within(preview()).getByText("Not quite.")).toBeInTheDocument();
    expect(made).toHaveBeenCalledTimes(2);
  });

  it("hands the wrong options the published ids gathered once, not again on each keystroke", () => {
    const draft = {
      ...courseDraft(),
      published: { ids: { "q-old": "card" as const }, activities: [] },
    };
    const drawn = vi.mocked(DistractorFields);
    drawn.mockClear();
    renderScreen("q-pods-1a", draft);
    for (const value of ["W", "Wh", "Wha"])
      fireEvent.input(screen.getByRole("textbox", { name: "Front" }), { target: { value } });
    const sets = drawn.mock.calls.map(([props]) => props.published);
    expect(sets.length).toBeGreaterThan(1);
    expect(new Set(sets).size).toBe(1);
    expect([...sets[0]!]).toEqual(["q-old"]);
  });

  it("asks a deck's card from nowhere, and only retires one published", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const deck = applyDraftChanges(
      blankDraft({
        url: DRAFT_URL,
        course: false,
        title: { en: "Words" },
        now: "2026-10-10T10:00:00.000Z",
      }),
      [
        { kind: "addCard", id: "w1", card: { front: { en: "Hej" }, back: { en: "Hi" } } },
        { kind: "retire", of: "card", id: "w1" },
      ],
    ) as ReleaseDraft;
    const { onEdit, onDeleted } = renderScreen("w1", {
      ...deck,
      published: { ids: { w1: "card" }, activities: [] },
    });
    expect(screen.queryByRole("combobox", { name: /^Asked/ })).toBeNull();
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
    expect(screen.getByRole("button", { name: "Edit the wrong option “An app”" })).toHaveAttribute(
      "data-arrival",
    );
    expect(document.getElementById("question-distractors")).not.toHaveAttribute("data-arrival");
  });
});
