import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { card, courseDraft, deckDraft, NOW, of } from "../testing/releaseDraft.ts";
import {
  cardTextOf,
  chapterOfStep,
  distractorChanges,
  draftCardLanguages,
  draftCardOf,
  draftCardRows,
  draftOutline,
  outlineMove,
  retiredChapters,
  retiredSteps,
} from "./draftOutline.ts";
import { applyDraftChanges, type ReleaseDraft } from "./releaseDraft.ts";

const course = courseDraft();
const changed = (draft: ReleaseDraft, ...changes: Parameters<typeof applyDraftChanges>[1]) => applyDraftChanges(draft, changes) as ReleaseDraft;

describe("the outline", () => {
  it("lists the chapters in use, each with its steps in use, in their order", () => {
    const outline = draftOutline(changed(course, { kind: "retire", of: "step", id: "ch-a-1" }));
    expect(outline.map(({ chapter, steps }) => [chapter.id, steps.map((step) => step.id)])).toEqual([
      ["ch-a", ["ch-a-2"]],
      ["ch-b", []],
    ]);
  });

  it("lists what is retired apart, by id", () => {
    const draft = changed(course, { kind: "retire", of: "chapter", id: "ch-b" }, { kind: "retire", of: "chapter", id: "ch-a" }, { kind: "retire", of: "step", id: "ch-a-2" }, { kind: "retire", of: "step", id: "ch-a-1" });
    expect(retiredChapters(draft).map((node) => node.id)).toEqual(["ch-a", "ch-b"]);
    expect(retiredSteps(draft, "ch-a").map((node) => node.id)).toEqual(["ch-a-1", "ch-a-2"]);
    expect(retiredSteps(draft, "ch-b")).toEqual([]);
  });

  it("knows a step's chapter", () => {
    expect(chapterOfStep(course, "ch-a-2")).toBe("ch-a");
    expect(chapterOfStep(course, "nowhere")).toBeNull();
    const orphan = { ...course, steps: [...course.steps, { id: "lost", data: { chapter: of("ch-gone"), checkedBy: [] } }, { id: "free", data: { checkedBy: [] } }] };
    expect(chapterOfStep(orphan, "lost")).toBeNull();
    expect(chapterOfStep(orphan, "free")).toBeNull();
  });
});

describe("outlineMove", () => {
  it("moves a chapter among the chapters", () => {
    expect(outlineMove(course, "ch-b", { parent: null, after: null })).toEqual({ kind: "moveChapter", id: "ch-b", to: 0 });
    expect(outlineMove(course, "ch-a", { parent: null, after: "ch-b" })).toEqual({ kind: "moveChapter", id: "ch-a", to: 1 });
    expect(outlineMove(course, "ch-a", { parent: "ch-b", after: null })).toBeNull();
  });

  it("moves a step in its chapter or to another", () => {
    expect(outlineMove(course, "ch-a-2", { parent: "ch-a", after: null })).toEqual({ kind: "moveStep", id: "ch-a-2", chapter: "ch-a", to: 0 });
    expect(outlineMove(course, "ch-a-1", { parent: "ch-b", after: null })).toEqual({ kind: "moveStep", id: "ch-a-1", chapter: "ch-b", to: 0 });
    expect(outlineMove(course, "ch-a-1", { parent: "ch-a", after: "ch-a-2" })).toEqual({ kind: "moveStep", id: "ch-a-1", chapter: "ch-a", to: 1 });
    expect(outlineMove(course, "ch-a-1", { parent: null, after: "ch-a" })).toBeNull();
    expect(outlineMove(course, "q-a-1a", { parent: "ch-a", after: null })).toBeNull();
  });
});

describe("a card of the draft", () => {
  it("has its content and its wrong options, retired ones marked", () => {
    const draft = changed(course, { kind: "retire", of: "distractor", id: "q-a-1a-d2" });
    expect(draftCardOf(draft, "q-a-1a")).toEqual({
      id: "q-a-1a",
      content: {
        front: { en: "1a" },
        back: { en: "1a!" },
        distractors: [
          { id: "q-a-1a-d1", text: { en: "No 1" } },
          { id: "q-a-1a-d2", text: { en: "No 2" }, note: { en: "Why" }, retired: true },
        ],
      },
      retired: false,
      created: NOW,
    });
    expect(draftCardOf(draft, "q-a-2a")).toMatchObject({ retired: false, created: "" });
    expect(draftCardOf(draft, "nowhere")).toBeNull();
  });

  it("leaves out a wrong option it names but the draft has not, and is none with an empty side", () => {
    const draft: ReleaseDraft = {
      ...course,
      cards: [
        { id: "odd", data: card("odd", { distractor: [of("gone")], deprecated: true }) },
        { id: "empty", data: { back: { en: "b" }, distractor: [] } },
      ],
      distractors: [...course.distractors, { id: "blank", data: { text: {} } }],
    };
    expect(draftCardOf(draft, "odd")).toMatchObject({ retired: true, content: { front: { en: "odd" } } });
    expect(draftCardOf(draft, "odd")!.content.distractors).toBeUndefined();
    expect(draftCardOf(draft, "empty")).toBeNull();
    expect(draftCardOf({ ...draft, cards: [{ id: "c", data: card("c", { distractor: [of("blank")] }) }] }, "c")!.content.distractors).toBeUndefined();
  });

  it("states its content for a change, without its wrong options or retirement", () => {
    expect(cardTextOf({ front: { en: "F" }, back: { en: "B" }, textFormat: SM.markdown, distractors: [{ id: "x", text: { en: "x" } }] }, NOW)).toEqual({
      front: { en: "F" },
      back: { en: "B" },
      created: NOW,
      textFormat: SM.markdown,
    });
  });
});

describe("distractorChanges", () => {
  it("adds, edits, retires, restores and deletes as the options say", () => {
    const draft = changed(course, { kind: "retire", of: "distractor", id: "q-a-1a-d2" });
    expect(
      distractorChanges(draft, "q-a-1a", [
        { id: "q-a-1a-d2", text: { en: "No 2" }, note: { en: "Because" } },
        { id: "q-a-1a-d3", text: { en: "No 3" }, retired: true },
        { id: "q-a-1a-d4", text: { en: "No 4" }, note: { en: "Four" } },
      ]),
    ).toEqual([
      { kind: "editDistractor", id: "q-a-1a-d2", distractor: { text: { en: "No 2" }, note: { en: "Because" } } },
      { kind: "restore", of: "distractor", id: "q-a-1a-d2" },
      { kind: "addDistractor", card: "q-a-1a", id: "q-a-1a-d3", distractor: { text: { en: "No 3" } } },
      { kind: "retire", of: "distractor", id: "q-a-1a-d3" },
      { kind: "addDistractor", card: "q-a-1a", id: "q-a-1a-d4", distractor: { text: { en: "No 4" }, note: { en: "Four" } } },
      { kind: "delete", of: "distractor", id: "q-a-1a-d1" },
    ]);
  });

  it("changes nothing for options as they are, and starts from none for a card the draft has not", () => {
    expect(distractorChanges(course, "q-a-1a", draftCardOf(course, "q-a-1a")!.content.distractors!)).toEqual([]);
    expect(distractorChanges(course, "nowhere", [{ id: "n-d1", text: { en: "n" } }])).toEqual([
      { kind: "addDistractor", card: "nowhere", id: "n-d1", distractor: { text: { en: "n" } } },
    ]);
  });
});

describe("the table of a draft's cards", () => {
  /** q-a-2a asked twice; q-a-r01 retired; q-sv in Swedish, its back untagged. */
  const draft: ReleaseDraft = changed(
    {
      ...course,
      cards: [...course.cards, { id: "q-sv", data: { front: { "sv-fi": "Hej" }, back: { "": "42" }, distractor: [] } }],
      chapters: course.chapters.map((node) => (node.id === "ch-b" ? { ...node, data: { ...node.data, reviewQuestion: [of("q-a-2a")] } } : node)),
    },
    { kind: "retire", of: "card", id: "q-a-r01" },
  );
  const ids = (filter?: Parameters<typeof draftCardRows>[1]) => draftCardRows(draft, filter).map((row) => row.id);

  it("lists every card by id, where it is asked, from how many places, and its wrong options in use", () => {
    expect(draftCardRows(draft)).toEqual([
      { id: "q-a-1a", card: draft.cards[0]!.data, place: { kind: "step", step: "ch-a-1" }, asked: 1, distractors: 2, retired: false },
      { id: "q-a-2a", card: draft.cards[1]!.data, place: { kind: "step", step: "ch-a-2" }, asked: 2, distractors: 0, retired: false },
      { id: "q-a-r01", card: draft.cards[2]!.data, place: { kind: "review", chapter: "ch-a" }, asked: 1, distractors: 0, retired: true },
      { id: "q-loose", card: draft.cards[3]!.data, place: null, asked: 0, distractors: 0, retired: false },
      { id: "q-sv", card: draft.cards[4]!.data, place: null, asked: 0, distractors: 0, retired: false },
    ]);
  });

  it("sorts them by id, however the draft has them", () => {
    expect(draftCardRows({ ...course, cards: [...course.cards].reverse() }).map((row) => row.id)).toEqual(["q-a-1a", "q-a-2a", "q-a-r01", "q-loose"]);
  });

  it("filters them", () => {
    expect(ids({ filter: "unasked" })).toEqual(["q-loose", "q-sv"]);
    expect(ids({ filter: "askedTwice" })).toEqual(["q-a-2a"]);
    expect(ids({ filter: "fewDistractors" })).toEqual(["q-a-2a", "q-loose", "q-sv"]);
    expect(ids({ filter: "retired" })).toEqual(["q-a-r01"]);
    expect(ids({ language: "sv" })).toEqual(["q-sv"]);
    expect(ids({ language: "unstated" })).toEqual(["q-sv"]);
    expect(ids({ filter: "unasked", language: "en" })).toEqual(["q-loose"]);
    expect(draftCardRows({ ...course, cards: [{ id: "pic", data: { frontImage: "https://x.example/a.png", back: { en: "b" }, distractor: [] } }] }, { language: "sv" })).toEqual([]);
    // A deck asks no question: none is unasked.
    expect(draftCardRows(deckDraft(), { filter: "unasked" })).toEqual([]);
  });

  it("offers the languages of the fronts and backs, unstated last", () => {
    expect(draftCardLanguages(draft)).toEqual(["en", "sv-fi", "unstated"]);
    expect(draftCardLanguages(deckDraft())).toEqual(["en"]);
    expect(draftCardLanguages({ ...course, cards: [{ id: "x", data: { frontImage: "https://x.example/a.png", backImage: "https://x.example/b.png", distractor: [] } }] })).toEqual([]);
  });
});
