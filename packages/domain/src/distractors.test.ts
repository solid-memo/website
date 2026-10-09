import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import type { CardContent, Distractor } from "./deck";
import {
  addDistractor,
  deleteDistractor,
  distractorIssues,
  editDistractor,
  nextDistractorId,
  restoreDistractor,
  retireDistractor,
  tidiedDistractor,
} from "./distractors";

const d1: Distractor = { id: "q-d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } };
const d2: Distractor = { id: "q-d2", text: { en: "Only people" } };

describe("nextDistractorId", () => {
  it("is <card>-d<n>, n one more than the highest such id ever used", () => {
    expect(nextDistractorId("q", [])).toBe("q-d1");
    expect(nextDistractorId("q", ["q-d1", "q-d7", "q-d3"])).toBe("q-d8");
  });

  it("counts only ids of this card's form", () => {
    expect(nextDistractorId("q", ["q-d", "q-dx", "q-d02", "q-d2b", "qq-d9", "other"])).toBe("q-d1");
    expect(nextDistractorId("q-1", ["q-1-d4", "q-d9"])).toBe("q-1-d5");
  });
});

describe("tidiedDistractor", () => {
  it("trims the text and drops an empty note", () => {
    expect(tidiedDistractor({ text: { en: " a " }, note: { en: " " } })).toEqual({ ok: true, text: { en: "a" } });
    expect(tidiedDistractor({ text: { "": "404" }, note: { sv: " Fel. " } })).toEqual({ ok: true, text: { "": "404" }, note: { sv: "Fel." } });
  });

  it("keeps the spaces formatted text starts with", () => {
    expect(tidiedDistractor({ text: { en: "\n    code  " } }, true)).toEqual({ ok: true, text: { en: "    code" } });
  });

  it("refuses an empty text, untagged text with translations, and a note in no language", () => {
    expect(tidiedDistractor({ text: { en: " " } })).toEqual({ ok: false, error: new AppError("distractorEmpty") });
    expect(tidiedDistractor({ text: { "": "a", en: "a" } })).toEqual({ ok: false, error: new AppError("textMixesUnstated") });
    expect(tidiedDistractor({ text: { en: "a" }, note: { "": "why" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the note on a wrong option" }),
    });
  });
});

describe("addDistractor", () => {
  it("adds a distractor at the end, under an id neither the card nor its release has used", () => {
    expect(addDistractor([d1], "q", { text: { en: " Only files " } }, { published: ["q-d1", "q-d2", "q-d3"] })).toEqual({
      ok: true,
      distractors: [d1, { id: "q-d4", text: { en: "Only files" } }],
    });
    expect(addDistractor([], "q", { text: { en: "x" }, note: { en: "why" } })).toEqual({
      ok: true,
      distractors: [{ id: "q-d1", text: { en: "x" }, note: { en: "why" } }],
    });
  });

  it("creates none until it has text", () => {
    expect(addDistractor([d1], "q", { text: {} })).toEqual({ ok: false, error: new AppError("distractorEmpty") });
  });

  it("tidies formatted text as the card's", () => {
    expect(addDistractor([], "q", { text: { en: "    code" } }, { formatted: true })).toMatchObject({
      distractors: [{ text: { en: "    code" } }],
    });
  });
});

describe("editDistractor", () => {
  it("replaces one's text and note, keeping its id and retirement", () => {
    expect(editDistractor([d1, d2], "q-d1", { text: { en: "Pages" } })).toEqual({ ok: true, distractors: [{ id: "q-d1", text: { en: "Pages" } }, d2] });
    const retired = { ...d2, retired: true as const };
    expect(editDistractor([retired], "q-d2", { text: { en: "People" }, note: { en: "No." } })).toEqual({
      ok: true,
      distractors: [{ id: "q-d2", text: { en: "People" }, note: { en: "No." }, retired: true }],
    });
  });

  it("refuses to empty one", () => {
    expect(editDistractor([d1], "q-d1", { text: { en: "" } }, true)).toEqual({ ok: false, error: new AppError("distractorEmpty") });
  });
});

describe("retiring and restoring", () => {
  it("marks one retired, and in use again", () => {
    const retired = retireDistractor([d1, d2], "q-d2");
    expect(retired).toEqual([d1, { ...d2, retired: true }]);
    expect(restoreDistractor(retired, "q-d2")).toEqual([d1, d2]);
    expect(restoreDistractor([{ ...d1, retired: true }, { ...d2, retired: true }], "q-d1")).toEqual([d1, { ...d2, retired: true }]);
  });
});

describe("deleteDistractor", () => {
  it("deletes one its release never published", () => {
    expect(deleteDistractor([d1, d2], "q-d2", new Set(["q-d1"]))).toEqual({ ok: true, distractors: [d1] });
  });

  it("refuses one its release published, to be retired instead", () => {
    expect(deleteDistractor([d1, d2], "q-d1", new Set(["q-d1"]))).toEqual({ ok: false, error: new AppError("distractorPublished") });
  });

  it("frees the id of the highest one, never published, for the next one added", () => {
    const d3: Distractor = { id: "q-d3", text: { en: "Only files" } };
    const deleted = deleteDistractor([d1, d2, d3], "q-d3", new Set(["q-d1"]));
    expect(deleted).toEqual({ ok: true, distractors: [d1, d2] });
    const added = addDistractor([d1, d2], "q", { text: { en: "Only names" } }, { published: ["q-d1"] });
    expect(added).toEqual({ ok: true, distractors: [d1, d2, { id: "q-d3", text: { en: "Only names" } }] });
  });
});

describe("distractorIssues", () => {
  it("finds none in a card without distractors, or with enough in the back's languages", () => {
    expect(distractorIssues({ back: { en: "b" } }, "pod")).toEqual([]);
    expect(distractorIssues({ back: { en: "b" }, distractors: [d1, d2] }, "pod")).toEqual([]);
  });

  it("warns of a distractor in use not in exactly the back's languages, in a pod's deck", () => {
    const card: Pick<CardContent, "back" | "distractors"> = {
      back: { en: "b", sv: "b" },
      distractors: [
        { id: "q-d1", text: { en: "x", de: "x" } },
        { id: "q-d2", text: { en: "y", sv: "y" } },
        { id: "q-d3", text: { fr: "z" }, retired: true as const },
      ],
    };
    expect(distractorIssues(card, "pod")).toEqual([{ code: "distractorLanguages", severity: "warning", id: "q-d1", missing: ["sv"], extra: ["de"] }]);
    expect(distractorIssues(card, "release")).toEqual([{ code: "distractorLanguages", severity: "error", id: "q-d1", missing: ["sv"], extra: ["de"] }]);
  });

  it("finds too few distractors in use", () => {
    expect(distractorIssues({ back: { en: "b" }, distractors: [d1, { ...d2, retired: true }] }, "pod")).toEqual([
      { code: "fewDistractors", severity: "warning", count: 1, least: 2 },
    ]);
  });
});
