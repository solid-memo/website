import { describe, expect, it } from "vitest";
import { courseDraft, deckDraft, of } from "../testing/releaseDraft.ts";
import {
  chapterIdFor,
  idBetween,
  idProblem,
  isPublished,
  questionIdFor,
  questionsOfStep,
  reviewQuestionsOf,
  stepIdFor,
  takenIds,
} from "./courseIds.ts";
import { DRAFT_ID, NOTHING_PUBLISHED, type ReleaseDraft } from "./releaseDraft.ts";

const published = { ids: { "ch-gone": "chapter" as const, "q-a-1b": "card" as const }, activities: ["compilation"] };

describe("takenIds and idProblem", () => {
  it("takes every id the draft has and every one a release before it published", () => {
    const taken = takenIds(courseDraft(published));
    for (const id of ["ch-a", "q-a-1a-d1", "turtle", "series", "compilation", "ch-gone", "q-a-1b"]) expect(taken.has(id)).toBe(true);
    expect(taken.has("ch-c")).toBe(false);
  });

  it("says why an id cannot be a new subject's", () => {
    const draft = courseDraft(published);
    expect(idProblem(draft, "ch-c")).toBeNull();
    expect(idProblem(draft, "ch-gone")).toBe("taken");
    expect(idProblem(draft, "-c")).toBe("invalid");
    expect(idProblem(draft, "a b")).toBe("invalid");
  });

  it("knows what an earlier release published", () => {
    expect(isPublished(courseDraft(published), "q-a-1b")).toBe(true);
    expect(isPublished(courseDraft(published), "q-a-1a")).toBe(false);
  });
});

describe("chapterIdFor and stepIdFor", () => {
  it("names a chapter after its title, else by number, unlike any taken", () => {
    const draft = courseDraft(published);
    expect(chapterIdFor(draft, { en: "Why Solid?" })).toBe("ch-why-solid");
    // ch-a is a chapter's, ch-a-2 a step's.
    expect(chapterIdFor(draft, { sv: "Ä", en: "A" })).toBe("ch-a-3");
    expect(chapterIdFor(draft, { en: "Gone" })).toBe("ch-gone-2");
    expect(chapterIdFor(draft, { en: "?" })).toBe("ch-1");
    expect(chapterIdFor({ ...draft, published: { ids: { "ch-7": "chapter" }, activities: [] } }, {})).toBe("ch-8");
  });

  it("numbers a chapter's steps after the highest taken", () => {
    expect(stepIdFor(courseDraft(), "ch-a")).toBe("ch-a-3");
    expect(stepIdFor(courseDraft(), "ch-b")).toBe("ch-b-1");
    expect(stepIdFor(courseDraft({ ids: { "ch-b-4": "step" }, activities: [] }), "ch-b")).toBe("ch-b-5");
  });
});

describe("questions and their ids", () => {
  it("lists a step's questions and a chapter's review questions by id", () => {
    const draft = courseDraft();
    const asked: ReleaseDraft = {
      ...draft,
      steps: draft.steps.map((node) => (node.id === "ch-a-1" ? { ...node, data: { ...node.data, checkedBy: [of("q-a-1c"), of("q-a-1a"), "https://elsewhere.example/#q"] } } : node)),
    };
    expect(questionsOfStep(asked, "ch-a-1")).toEqual(["q-a-1a", "q-a-1c"]);
    expect(questionsOfStep(asked, "nowhere")).toEqual([]);
    expect(reviewQuestionsOf(draft, "ch-a")).toEqual(["q-a-r01"]);
    expect(reviewQuestionsOf(draft, "nowhere")).toEqual([]);
  });

  it("names a step's next question after its last, by letter", () => {
    expect(questionIdFor(courseDraft(), { kind: "step", step: "ch-a-1" })).toBe("q-a-1b");
    // b was published, and is not asked now: never used again.
    expect(questionIdFor(courseDraft(published), { kind: "step", step: "ch-a-1" })).toBe("q-a-1c");
  });

  it("names a question after the step's own id when it is not named the course's way", () => {
    const draft = courseDraft();
    const loose: ReleaseDraft = {
      ...draft,
      steps: [
        ...draft.steps,
        { id: "intro", data: { chapter: of("ch-b"), position: 0, checkedBy: [] } },
        { id: "ch-b-x", data: { chapter: of("ch-b"), position: 1, checkedBy: [] } },
        { id: "free", data: { checkedBy: [] } },
      ],
    };
    expect(questionIdFor(loose, { kind: "step", step: "free" })).toBe("q-freea");
    expect(questionIdFor(loose, { kind: "step", step: "intro" })).toBe("q-introa");
    expect(questionIdFor(loose, { kind: "step", step: "ch-b-x" })).toBe("q-ch-b-xa");
  });

  it("goes past z with a number after the last", () => {
    const draft = courseDraft();
    const full: ReleaseDraft = {
      ...draft,
      steps: draft.steps.map((node) => (node.id === "ch-a-2" ? { ...node, data: { ...node.data, checkedBy: [of("q-a-2z")] } } : node)),
    };
    expect(questionIdFor(full, { kind: "step", step: "ch-a-2" })).toBe("q-a-2z1");
    expect(questionIdFor({ ...full, published: { ids: { "q-a-2z1": "card" }, activities: [] } }, { kind: "step", step: "ch-a-2" })).toBe("q-a-2z2");
    // Every letter taken, none asked by the step: a number after its name.
    const letters = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz"].map((letter) => [`q-b-1${letter}`, "card" as const]));
    const empty = courseDraft({ ids: letters, activities: [] });
    const withStep: ReleaseDraft = { ...empty, steps: [...empty.steps, { id: "ch-b-1", data: { chapter: of("ch-b"), position: 0, checkedBy: [] } }] };
    expect(questionIdFor(withStep, { kind: "step", step: "ch-b-1" })).toBe("q-b-11");
  });

  it("numbers review questions, and cards asked nowhere", () => {
    expect(questionIdFor(courseDraft(), { kind: "review", chapter: "ch-a" })).toBe("q-a-r02");
    expect(questionIdFor(courseDraft(), { kind: "review", chapter: "ch-b" })).toBe("q-b-r01");
    expect(questionIdFor(courseDraft(), { kind: "review", chapter: "intro" })).toBe("q-intro-r01");
    expect(questionIdFor(courseDraft(), null)).toBe("q-1");
    expect(questionIdFor(deckDraft(), null)).toBe("card-1");
    expect(questionIdFor({ ...deckDraft(), published: NOTHING_PUBLISHED }, null)).toBe("card-1");
  });
});

describe("idBetween", () => {
  it("puts a number after the first id when one fits, else builds one code unit by code unit", () => {
    expect(idBetween("q-a-1a", null, new Set())).toBe("q-a-1a1");
    expect(idBetween("q-a-1a", null, new Set(["q-a-1a1"]))).toBe("q-a-1a2");
    expect(idBetween("q-a-1a", "q-a-1b", new Set())).toBe("q-a-1a1");
    // No number fits before 1a0: the start of what follows, or a lower character.
    expect(idBetween("q-a-1a", "q-a-1a0", new Set())).toBe("q-a-1a-");
    expect(idBetween("q-a-1a", "q-a-1a0", new Set(["q-a-1a-"]))).toBe("q-a-1a-1");
    expect(idBetween("q-a-1a", "q-a-1a-0", new Set())).toBe("q-a-1a-");
  });

  it("finds none when only dashes follow the first id in the second, and the shorter are taken", () => {
    expect(idBetween("q", "q-", new Set())).toBeNull();
    expect(idBetween("q", "q--", new Set(["q-"]))).toBeNull();
  });

  it("keeps the sort order, whatever the ids and the ones taken", () => {
    // A seeded random source, so a failure can be run again.
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const chars = [..."-.019AZ_az"];
    const tail = () => Array.from({ length: Math.floor(random() * 4) }, () => chars[Math.floor(random() * chars.length)]!).join("");
    for (let run = 0; run < 2000; run++) {
      const before = `q${tail()}`;
      // Often the second begins with the first, where numbers may not fit.
      const after = random() < 0.2 ? null : random() < 0.6 ? `${before}${tail()}` : `q${tail()}`;
      if (after !== null && after <= before) continue;
      const taken = new Set(Array.from({ length: 6 }, () => `${before}${tail()}`));
      const between = idBetween(before, after, taken);
      if (between === null) {
        expect(after!.slice(before.length)).toMatch(/^-+$/);
        continue;
      }
      expect(before < between && (after === null || between < after)).toBe(true);
      expect(taken.has(between)).toBe(false);
      expect(DRAFT_ID.test(between)).toBe(true);
    }
  });
});
