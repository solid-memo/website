// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { cpuTime } from "../testing/growth.ts";
import { courseDraft, deckDraft, of } from "../testing/releaseDraft.ts";
import {
  chapterIdFor,
  idBetween,
  idProblem,
  questionIdBefore,
  isPublished,
  publishedIdSet,
  questionIdFor,
  questionsOfStep,
  reviewQuestionsOf,
  stepQuestions,
  stepIdFor,
  takenIds,
} from "./courseIds.ts";
import {
  applyDraftChanges,
  DRAFT_ID,
  idsInUse,
  isRefusal,
  NOTHING_PUBLISHED,
  type DraftRefusal,
  type ReleaseDraft,
} from "./releaseDraft.ts";

const published = {
  ids: { "ch-gone": "chapter" as const, "q-a-1b": "card" as const },
  activities: ["compilation"],
};

describe("takenIds and idProblem", () => {
  it("takes every id the draft has and every one a release before it published", () => {
    const taken = takenIds(courseDraft(published));
    for (const id of ["ch-a", "q-a-1a-d1", "turtle", "series", "compilation", "ch-gone", "q-a-1b"])
      expect(taken.has(id)).toBe(true);
    expect(taken.has("ch-c")).toBe(false);
  });

  it("takes every id a record names, though nothing has it", () => {
    const draft = courseDraft();
    const pointing: ReleaseDraft = {
      ...draft,
      chapters: draft.chapters.map((chapter) =>
        chapter.id === "ch-a"
          ? { ...chapter, data: { ...chapter.data, reviewQuestion: [of("q-review")] } }
          : chapter,
      ),
      steps: draft.steps.map((step) =>
        step.id === "ch-a-1"
          ? { ...step, data: { ...step.data, checkedBy: [of("q-asked")], chapter: of("ch-held") } }
          : step,
      ),
      cards: draft.cards.map((card) =>
        card.id === "q-loose"
          ? { ...card, data: { ...card.data, distractor: [of("q-wrong")], subject: [of("about")] } }
          : card,
      ),
    };
    for (const id of ["q-review", "q-asked", "ch-held", "q-wrong", "about"]) {
      expect(idsInUse(pointing).has(id)).toBe(true);
      expect(idProblem(pointing, id)).toBe("taken");
    }
    expect(idsInUse(pointing).has("https://source.example/")).toBe(false);
  });

  it("says why an id cannot be a new subject's", () => {
    const draft = courseDraft(published);
    expect(idProblem(draft, "ch-c")).toBeNull();
    expect(idProblem(draft, "ch-gone")).toBe("taken");
    expect(idProblem(draft, "-c")).toBe("invalid");
    expect(idProblem(draft, "a b")).toBe("invalid");
  });

  it("gathers a draft's taken ids once, and an edited draft's afresh", () => {
    const draft = courseDraft(published);
    expect(takenIds(draft)).toBe(takenIds(draft));
    const edited: ReleaseDraft = {
      ...draft,
      chapters: [...draft.chapters, { id: "ch-new", data: draft.chapters[0]!.data }],
    };
    expect(takenIds(edited)).not.toBe(takenIds(draft));
    expect(takenIds(edited).has("ch-new")).toBe(true);
    expect(takenIds(draft).has("ch-new")).toBe(false);
  });

  it("keeps the taken ids over an edit of text, and gathers them again when an id changes", () => {
    const draft = courseDraft(published);
    const text = (edited: ReleaseDraft | DraftRefusal) => {
      if (isRefusal(edited)) throw new Error(edited.refused);
      return edited;
    };
    const chapter = text(
      applyDraftChanges(draft, [{ kind: "editChapter", id: "ch-a", text: { title: { en: "A" } } }]),
    );
    const step = text(
      applyDraftChanges(chapter, [
        { kind: "editStep", id: "ch-a-1", text: { theory: { en: "T" } } },
      ]),
    );
    const meta = text(
      applyDraftChanges(step, [{ kind: "setMeta", meta: { title: { en: "Course" } } }]),
    );
    expect(takenIds(chapter)).toBe(takenIds(draft));
    expect(takenIds(step)).toBe(takenIds(draft));
    expect(takenIds(meta)).toBe(takenIds(draft));
    const added = text(applyDraftChanges(meta, [{ kind: "addChapter", id: "ch-new" }]));
    expect(takenIds(added).has("ch-new")).toBe(true);
    // The same statements and records, another root naming another subject of the draft.
    const named: ReleaseDraft = {
      ...added,
      root: { ...added.root, wasDerivedFrom: [of("elsewhere")] },
    };
    expect(takenIds(named).has("elsewhere")).toBe(true);
    const other: ReleaseDraft = {
      ...named,
      root: { ...named.root, wasDerivedFrom: [of("other")] },
    };
    expect(takenIds(other).has("other")).toBe(true);
    expect(takenIds(other).has("elsewhere")).toBe(false);
    const renamed: ReleaseDraft = {
      ...other,
      cards: other.cards.map((card, i) => (i === 0 ? { ...card, id: "q-renamed" } : card)),
    };
    expect(takenIds(renamed).has("q-renamed")).toBe(true);
    const back: ReleaseDraft = { ...renamed, cards: other.cards };
    expect(takenIds(back).has("q-renamed")).toBe(false);
    expect(takenIds({ ...back, cards: [...back.cards] })).toBe(takenIds(back));
    const moved: ReleaseDraft = { ...named, url: "https://example.org/other.ttl" };
    expect(takenIds(moved).has("ch-a")).toBe(true);
    expect(takenIds(moved).has("elsewhere")).toBe(false);
    // The same ids and statements, a record naming another subject of the draft.
    expect(takenIds(named).has("ch-held")).toBe(false);
    const pointed: ReleaseDraft = {
      ...named,
      steps: named.steps.map((step, i) =>
        i === 0 ? { ...step, data: { ...step.data, chapter: of("ch-held") } } : step,
      ),
    };
    expect(takenIds(pointed).has("ch-held")).toBe(true);
    expect(takenIds({ ...pointed, steps: [...pointed.steps] })).toBe(takenIds(pointed));
    // A record's field that named no subject of the draft now names one.
    const unasked: ReleaseDraft = {
      ...named,
      steps: named.steps.map((step, i) =>
        i === 0 ? { ...step, data: { ...step.data, checkedBy: [] } } : step,
      ),
    };
    expect(takenIds(unasked).has("q-held")).toBe(false);
    const asked: ReleaseDraft = {
      ...unasked,
      steps: unasked.steps.map((step, i) =>
        i === 0 ? { ...step, data: { ...step.data, checkedBy: [of("q-held")] } } : step,
      ),
    };
    expect(takenIds(asked).has("q-held")).toBe(true);
    // A name or a text is no IRI, whatever it starts with: the ids gathered stay.
    const worded: ReleaseDraft = {
      ...asked,
      root: { ...asked.root, versionNotes: of("notes") },
      agents: [...asked.agents, { id: "jane", data: { name: of("Jane Doe") } }],
    };
    expect(takenIds(worded).has("Jane Doe")).toBe(false);
    const reworded: ReleaseDraft = {
      ...worded,
      root: { ...worded.root, versionNotes: of("other notes") },
      agents: worded.agents.map((agent) =>
        agent.id === "jane" ? { ...agent, data: { name: of("Jane") } } : agent,
      ),
    };
    expect(takenIds(reworded)).toBe(takenIds(worded));
    // An IRI that names no subject of the draft, for another such.
    const licensed: ReleaseDraft = {
      ...reworded,
      root: { ...reworded.root, license: "https://licenses.example/b" },
    };
    expect(
      takenIds({ ...licensed, root: { ...licensed.root, license: "https://licenses.example/c" } }),
    ).toBe(takenIds(licensed));
    const republished: ReleaseDraft = { ...named, published: NOTHING_PUBLISHED };
    expect(takenIds(republished).has("ch-gone")).toBe(false);
    expect(takenIds({ ...republished, root: { ...republished.root } })).toBe(takenIds(republished));
  });

  it("suggests and checks ids on each keystroke in about one pass over the draft's statements", () => {
    // The New question and New chapter forms suggest and check an id on
    // each keystroke, and typing in a chapter's, a step's or the
    // course's text beside them makes a new draft each time. Gathering
    // the taken ids for each, or going again over the many ids a
    // suggestion steps past (q-a-1a1, q-a-1a2, … after q-a-1b to
    // q-a-1z), would go over every statement of the draft each time,
    // many times one pass; a ratio, not a budget in milliseconds, holds
    // on any machine (testing.md).
    const base = courseDraft(published);
    const statement = (subject: string, object: string) => ({
      subject: of(subject),
      predicate: "https://example.org/p",
      object: { kind: "iri" as const, value: of(object) },
    });
    const draft: ReleaseDraft = {
      ...base,
      triples: [
        ...base.triples,
        ...[..."cdefghijklmnopqrstuvwxyz"].map((letter) => statement(`q-a-1${letter}`, "o")),
        ...Array.from({ length: 10_000 }, (_, n) => statement(`q-a-1a${n + 1}`, `o${n}`)),
      ],
    };
    expect(questionIdFor(draft, { kind: "step", step: "ch-a-1" })).toBe("q-a-1a10001");
    const reference = Math.min(...Array.from({ length: 5 }, () => cpuTime(() => idsInUse(draft))));
    const keystrokes = 40;
    const rounds = Array.from({ length: 5 }, () => {
      // New statements, as a draft loaded again has: none of its ids gathered yet.
      let typed: ReleaseDraft = { ...draft, triples: [...draft.triples] };
      const drafts = Array.from({ length: keystrokes }, (_, key) => {
        const edited = applyDraftChanges(typed, [
          { kind: "editChapter", id: "ch-a", text: { title: { en: `Chapter ${key}` } } },
        ]);
        if (isRefusal(edited)) throw new Error(edited.refused);
        typed = edited;
        return edited;
      });
      return cpuTime(() => {
        for (const [key, one] of drafts.entries()) {
          questionIdFor(one, { kind: "step", step: "ch-a-1" });
          questionIdBefore(one, { kind: "step", step: "ch-a-1" }, "q-a-1a");
          questionIdFor(one, null);
          questionIdFor(one, { kind: "review", chapter: "ch-a" });
          chapterIdFor(one, { en: "A" });
          chapterIdFor(one, {});
          stepIdFor(one, "ch-a");
          idProblem(one, `q-${key}`);
        }
      });
    });
    expect(Math.min(...rounds) / reference).toBeLessThan(4);
  });

  it("knows what an earlier release published", () => {
    expect(isPublished(courseDraft(published), "q-a-1b")).toBe(true);
    expect(isPublished(courseDraft(published), "q-a-1a")).toBe(false);
    expect(isPublished(courseDraft(published), "constructor")).toBe(false);
  });

  it("gathers a release's published ids once, however many edits the draft makes", () => {
    const draft = courseDraft(published);
    const ids = publishedIdSet(draft);
    expect([...ids].sort()).toEqual(["ch-gone", "q-a-1b"]);
    const edited = applyDraftChanges(draft, [
      { kind: "editChapter", id: "ch-a", text: { title: { en: "A" } } },
    ]) as ReleaseDraft;
    expect(edited.published).toBe(draft.published);
    expect(publishedIdSet(edited)).toBe(ids);
    expect(publishedIdSet(courseDraft()).size).toBe(0);
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
    expect(
      chapterIdFor({ ...draft, published: { ids: { "ch-7": "chapter" }, activities: [] } }, {}),
    ).toBe("ch-8");
  });

  it("numbers a chapter's steps after the highest taken", () => {
    expect(stepIdFor(courseDraft(), "ch-a")).toBe("ch-a-3");
    expect(stepIdFor(courseDraft(), "ch-b")).toBe("ch-b-1");
    expect(stepIdFor(courseDraft({ ids: { "ch-b-4": "step" }, activities: [] }), "ch-b")).toBe(
      "ch-b-5",
    );
  });

  it("ignores a number too long to count on, and skips one taken", () => {
    for (const huge of ["9".repeat(16), "9".repeat(25), "9".repeat(400), "9007199254740992"]) {
      const draft = {
        ...deckDraft(),
        published: { ids: { [`card-${huge}`]: "card" as const }, activities: [] },
      };
      const suggested = questionIdFor(draft, null);
      expect(suggested).toBe("card-1");
      expect(idProblem(draft, suggested)).toBeNull();
    }
    const longest = {
      ...deckDraft(),
      published: {
        ids: {
          "card-999999999999999": "card" as const,
          "card-1000000000000000": "card" as const,
        },
        activities: [],
      },
    };
    expect(questionIdFor(longest, null)).toBe("card-1000000000000001");
  });

  it("writes a skipped-to number at the width asked for", () => {
    const draft = {
      ...courseDraft(),
      published: {
        ids: {
          "q-b-r999999999999999": "card" as const,
          "q-b-r1000000000000000": "card" as const,
        },
        activities: [],
      },
    };
    expect(questionIdFor(draft, { kind: "review", chapter: "ch-b" })).toBe("q-b-r1000000000000001");
    expect(
      questionIdFor(
        { ...courseDraft(), published: { ids: { "q-b-r07": "card" }, activities: [] } },
        { kind: "review", chapter: "ch-b" },
      ),
    ).toBe("q-b-r08");
  });
});

describe("questions and their ids", () => {
  it("lists a step's questions and a chapter's review questions by id", () => {
    const draft = courseDraft();
    const asked: ReleaseDraft = {
      ...draft,
      steps: draft.steps.map((node) =>
        node.id === "ch-a-1"
          ? {
              ...node,
              data: {
                ...node.data,
                checkedBy: [of("q-a-1c"), of("q-a-1a"), "https://elsewhere.example/#q"],
              },
            }
          : node,
      ),
    };
    expect(questionsOfStep(asked, "ch-a-1")).toEqual(["q-a-1a", "q-a-1c"]);
    expect(questionsOfStep(asked, "nowhere")).toEqual([]);
    expect(stepQuestions(asked, asked.steps.find((node) => node.id === "ch-a-1")!)).toEqual([
      "q-a-1a",
      "q-a-1c",
    ]);
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
      steps: draft.steps.map((node) =>
        node.id === "ch-a-2"
          ? { ...node, data: { ...node.data, checkedBy: [of("q-a-2z")] } }
          : node,
      ),
    };
    expect(questionIdFor(full, { kind: "step", step: "ch-a-2" })).toBe("q-a-2z1");
    expect(
      questionIdFor(
        { ...full, published: { ids: { "q-a-2z1": "card" }, activities: [] } },
        { kind: "step", step: "ch-a-2" },
      ),
    ).toBe("q-a-2z2");
    // Every letter taken, none asked by the step: a number after its name.
    const letters = Object.fromEntries(
      [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => [`q-b-1${letter}`, "card" as const]),
    );
    const empty = courseDraft({ ids: letters, activities: [] });
    const withStep: ReleaseDraft = {
      ...empty,
      steps: [
        ...empty.steps,
        { id: "ch-b-1", data: { chapter: of("ch-b"), position: 0, checkedBy: [] } },
      ],
    };
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

describe("questionIdBefore", () => {
  const asking = (checkedBy: string[], published = NOTHING_PUBLISHED): ReleaseDraft => {
    const draft = courseDraft(published);
    return {
      ...draft,
      steps: draft.steps.map((node) =>
        node.id === "ch-a-1"
          ? { ...node, data: { ...node.data, checkedBy: checkedBy.map(of) } }
          : node,
      ),
    };
  };
  const step = { kind: "step" as const, step: "ch-a-1" };

  it("names a question asked before another between it and the one before, by letter when one is free", () => {
    expect(questionIdBefore(asking(["q-a-1a", "q-a-1c"]), step, "q-a-1c")).toBe("q-a-1b");
    // b was published: an id between the two.
    expect(
      questionIdBefore(
        asking(["q-a-1a", "q-a-1c"], { ids: { "q-a-1b": "card" }, activities: [] }),
        step,
        "q-a-1c",
      ),
    ).toBe("q-a-1a1");
  });

  it("puts one before the first after the place's own name", () => {
    expect(questionIdBefore(asking(["q-a-1a"]), step, "q-a-1a")).toBe("q-a-11");
    expect(questionIdBefore(courseDraft(), { kind: "review", chapter: "ch-a" }, "q-a-r01")).toBe(
      "q-a-r001",
    );
  });

  it("finds none when the first sorts before the place's name, or no id lies between", () => {
    expect(questionIdBefore(asking(["a-1"]), step, "a-1")).toBeNull();
    expect(questionIdBefore(asking(["q-a-1a", "q-a-1a-"]), step, "q-a-1a-")).toBeNull();
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
    const tail = () =>
      Array.from(
        { length: Math.floor(random() * 4) },
        () => chars[Math.floor(random() * chars.length)]!,
      ).join("");
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

describe("ids a record points at", () => {
  const made = (edited: ReleaseDraft | DraftRefusal) => {
    if (isRefusal(edited)) throw new Error(edited.refused);
    return edited;
  };
  const withStep = (draft: ReleaseDraft, data: Partial<ReleaseDraft["steps"][number]["data"]>) => ({
    ...draft,
    steps: draft.steps.map((step) =>
      step.id === "ch-a-1" ? { ...step, data: { ...step.data, ...data } } : step,
    ),
  });

  it("are not suggested for a new question, which joins the step it is added to", () => {
    // A release read as it is: its step asks a question it does not have.
    const asking = withStep(courseDraft(), {
      checkedBy: [of("q-a-1a"), of("q-b-1a")],
    });
    const draft = made(
      applyDraftChanges(asking, [{ kind: "addStep", id: "ch-b-1", chapter: "ch-b" }]),
    );
    const place = { kind: "step", step: "ch-b-1" } as const;
    const id = questionIdFor(draft, place);
    expect(id).not.toBe("q-b-1a");
    expect(
      applyDraftChanges(draft, [{ kind: "addCard", id: "q-b-1a", card: { front: { en: "F" } } }]),
    ).toEqual({ refused: "idTaken", id: "q-b-1a" });
    const added = made(
      applyDraftChanges(draft, [
        { kind: "addCard", id, card: { front: { en: "F" }, back: { en: "B" } } },
        { kind: "addQuestion", card: id, place },
      ]),
    );
    expect(questionsOfStep(added, "ch-b-1")).toEqual([id]);
    expect(questionsOfStep(added, "ch-a-1")).not.toContain(id);
  });

  it("are not suggested for a new chapter, which takes in no step", () => {
    // A release read as it is: its step is part of a chapter it does not have.
    const draft = withStep(courseDraft(), { chapter: of("ch-basics") });
    const id = chapterIdFor(draft, { en: "Basics" });
    expect(id).not.toBe("ch-basics");
    expect(applyDraftChanges(draft, [{ kind: "addChapter", id: "ch-basics" }])).toEqual({
      refused: "idTaken",
      id: "ch-basics",
    });
    const added = made(
      applyDraftChanges(draft, [{ kind: "addChapter", id, text: { title: { en: "Basics" } } }]),
    );
    expect(added.steps.filter((step) => step.data.chapter === of(id))).toEqual([]);
    const deleted = made(applyDraftChanges(added, [{ kind: "delete", of: "chapter", id }]));
    expect(deleted.steps.map((step) => step.id)).toEqual(draft.steps.map((step) => step.id));
  });
});
