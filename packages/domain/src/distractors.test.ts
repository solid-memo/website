// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { growth } from "./testing/growth";
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

const d1: Distractor = {
  id: "q-d1",
  text: { en: "Only web pages" },
  note: { en: "A URL is one kind of IRI." },
};
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

  it("ignores a number too long to count on, each new id still being free", () => {
    for (const digits of [16, 17, 25, 400]) {
      const huge = `q-d${"9".repeat(digits)}`;
      expect(nextDistractorId("q", [huge])).toBe("q-d1");
      expect(nextDistractorId("q", [huge, "q-d1"])).toBe("q-d2");
    }
    // 2^53 - 1, 2^53 and 2^53 + 2: past the first, adding 1 may not change a number.
    for (const id of ["q-d9007199254740991", "q-d9007199254740992", "q-d9007199254740994"]) {
      expect(nextDistractorId("q", [id])).toBe("q-d1");
    }
  });

  it("goes on past the longest number it counts, skipping those taken", () => {
    const longest = "q-d999999999999999";
    expect(nextDistractorId("q", [longest])).toBe("q-d1000000000000000");
    expect(nextDistractorId("q", [longest, "q-d1000000000000000"])).toBe("q-d1000000000000001");
  });

  it("gives each wrong option added its own id, whatever id the card has", () => {
    let distractors: Distractor[] = [{ id: `q-d${"9".repeat(25)}`, text: { en: "Planted" } }];
    for (const text of ["One", "Two", "Three"]) {
      const edit = addDistractor(distractors, "q", { text: { en: text } });
      if (!edit.ok) throw edit.error;
      distractors = edit.distractors;
    }
    expect(distractors.map((distractor) => distractor.id)).toEqual([
      `q-d${"9".repeat(25)}`,
      "q-d1",
      "q-d2",
      "q-d3",
    ]);
  });
});

describe("tidiedDistractor", () => {
  it("trims the text and drops an empty note", () => {
    expect(tidiedDistractor({ text: { en: " a " }, note: { en: " " } })).toEqual({
      ok: true,
      text: { en: "a" },
    });
    expect(tidiedDistractor({ text: { "": "404" }, note: { sv: " Fel. " } })).toEqual({
      ok: true,
      text: { "": "404" },
      note: { sv: "Fel." },
    });
  });

  it("keeps the spaces formatted text starts with", () => {
    expect(tidiedDistractor({ text: { en: "\n    code  " } }, true)).toEqual({
      ok: true,
      text: { en: "    code" },
    });
  });

  it("refuses an empty text, untagged text with translations, and a note in no language", () => {
    expect(tidiedDistractor({ text: { en: " " } })).toEqual({
      ok: false,
      error: new AppError("distractorEmpty"),
    });
    expect(tidiedDistractor({ text: { "": "a", en: "a" } })).toEqual({
      ok: false,
      error: new AppError("textMixesUnstated"),
    });
    expect(tidiedDistractor({ text: { en: "a" }, note: { "": "why" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the note on a wrong option" }),
    });
  });
});

describe("addDistractor", () => {
  it("adds a distractor at the end, under an id neither the card nor its release has used", () => {
    expect(
      addDistractor(
        [d1],
        "q",
        { text: { en: " Only files " } },
        { published: ["q-d1", "q-d2", "q-d3"] },
      ),
    ).toEqual({
      ok: true,
      distractors: [d1, { id: "q-d4", text: { en: "Only files" } }],
    });
    expect(addDistractor([], "q", { text: { en: "x" }, note: { en: "why" } })).toEqual({
      ok: true,
      distractors: [{ id: "q-d1", text: { en: "x" }, note: { en: "why" } }],
    });
  });

  it("creates none until it has text", () => {
    expect(addDistractor([d1], "q", { text: {} })).toEqual({
      ok: false,
      error: new AppError("distractorEmpty"),
    });
  });

  it("tidies formatted text as the card's", () => {
    expect(addDistractor([], "q", { text: { en: "    code" } }, { formatted: true })).toMatchObject(
      {
        distractors: [{ text: { en: "    code" } }],
      },
    );
  });
});

describe("editDistractor", () => {
  it("replaces one's text and note, keeping its id and retirement", () => {
    expect(editDistractor([d1, d2], "q-d1", { text: { en: "Pages" } })).toEqual({
      ok: true,
      distractors: [{ id: "q-d1", text: { en: "Pages" } }, d2],
    });
    const retired = { ...d2, retired: true as const };
    expect(
      editDistractor([retired], "q-d2", { text: { en: "People" }, note: { en: "No." } }),
    ).toEqual({
      ok: true,
      distractors: [{ id: "q-d2", text: { en: "People" }, note: { en: "No." }, retired: true }],
    });
  });

  it("refuses to empty one", () => {
    expect(editDistractor([d1], "q-d1", { text: { en: "" } }, true)).toEqual({
      ok: false,
      error: new AppError("distractorEmpty"),
    });
  });
});

describe("retiring and restoring", () => {
  it("marks one retired, and in use again", () => {
    const retired = retireDistractor([d1, d2], "q-d2");
    expect(retired).toEqual([d1, { ...d2, retired: true }]);
    expect(restoreDistractor(retired, "q-d2")).toEqual([d1, d2]);
    expect(
      restoreDistractor(
        [
          { ...d1, retired: true },
          { ...d2, retired: true },
        ],
        "q-d1",
      ),
    ).toEqual([d1, { ...d2, retired: true }]);
  });
});

describe("deleteDistractor", () => {
  it("deletes one its release never published", () => {
    expect(deleteDistractor([d1, d2], "q-d2", new Set(["q-d1"]))).toEqual({
      ok: true,
      distractors: [d1],
    });
  });

  it("refuses one its release published, to be retired instead", () => {
    expect(deleteDistractor([d1, d2], "q-d1", new Set(["q-d1"]))).toEqual({
      ok: false,
      error: new AppError("distractorPublished"),
    });
  });

  it("frees the id of the highest one, never published, for the next one added", () => {
    const d3: Distractor = { id: "q-d3", text: { en: "Only files" } };
    const deleted = deleteDistractor([d1, d2, d3], "q-d3", new Set(["q-d1"]));
    expect(deleted).toEqual({ ok: true, distractors: [d1, d2] });
    const added = addDistractor(
      [d1, d2],
      "q",
      { text: { en: "Only names" } },
      { published: ["q-d1"] },
    );
    expect(added).toEqual({
      ok: true,
      distractors: [d1, d2, { id: "q-d3", text: { en: "Only names" } }],
    });
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
    expect(distractorIssues(card, "pod")).toEqual([
      {
        code: "distractorLanguages",
        severity: "warning",
        id: "q-d1",
        missing: ["sv"],
        moreMissing: 0,
        extra: ["de"],
        moreExtra: 0,
      },
    ]);
    expect(distractorIssues(card, "release")).toEqual([
      {
        code: "distractorLanguages",
        severity: "error",
        id: "q-d1",
        missing: ["sv"],
        moreMissing: 0,
        extra: ["de"],
        moreExtra: 0,
      },
    ]);
  });

  it("finds too few distractors in use", () => {
    expect(
      distractorIssues({ back: { en: "b" }, distractors: [d1, { ...d2, retired: true }] }, "pod"),
    ).toEqual([{ code: "fewDistractors", severity: "warning", count: 1, least: 2 }]);
  });

  /** A card with `count` back languages and `count` distractors, each in `count` other languages. */
  function manyLanguages(count: number): Pick<CardContent, "back" | "distractors"> {
    const tags = (prefix: string) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`x-${prefix}${i}`, "t"]));
    const text = tags("d");
    return {
      back: tags("b"),
      distractors: Array.from({ length: count }, (_, i) => ({ id: `q-d${i}`, text })),
    };
  }

  it("names a few of the languages a distractor lacks or adds and counts the rest", () => {
    const issues = distractorIssues(manyLanguages(300), "pod");
    expect(issues).toHaveLength(300);
    expect(issues[0]).toEqual({
      code: "distractorLanguages",
      severity: "warning",
      id: "q-d0",
      missing: ["x-b0", "x-b1", "x-b2"],
      moreMissing: 297,
      extra: ["x-d0", "x-d1", "x-d2"],
      moreExtra: 297,
    });
  });

  it("finds them in time that grows with the back and the distractors, not with their product", () => {
    // Eight times the back languages and distractors take about as long
    // as an eighth of them eight times over; listing each back language
    // a distractor lacks would take eight times as long.
    const ratio = growth(
      (count) => {
        const back = manyLanguages(count).back;
        const card = {
          back,
          distractors: Array.from({ length: count }, (_, i) => ({
            id: `q-d${i}`,
            text: { en: "t" },
          })),
        };
        return () => distractorIssues(card, "release");
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
