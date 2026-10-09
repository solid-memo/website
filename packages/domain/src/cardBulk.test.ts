import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { changedTexts, planCardEdit, planUndo, sameCardEditPlan, type CardEdit } from "./cardBulk";
import { UNSTATED } from "./cardQuery";
import type { Card } from "./deck";
import type { ReviewState } from "./review";

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    url: `https://pod.example/a/decks/d.ttl#${id}`,
    front: { en: id },
    back: { sv: id },
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 4,
    ...extra,
  };
}

function state(cardId: string, direction: ReviewState["direction"] = "front-to-back"): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    due: "2026-10-12",
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-06T10:00:00.000Z",
    formatVersion: 2,
  };
}

const replace = (find: string, replace: string, extra: Partial<Extract<CardEdit, { kind: "replaceText" }>> = {}): CardEdit => ({
  kind: "replaceText",
  find,
  replace,
  fields: ["front", "back", "note", "label", "distractor"],
  caseSensitive: false,
  wholeWord: false,
  ...extra,
});

const live = card("live");
const retired = card("retired", { retired: true });

describe("planCardEdit", () => {
  it("retires the live cards, saved in this app's format with their review state left alone, the retired ones skipped", () => {
    const plan = planCardEdit([live, retired], ["live", "retired", "gone"], { kind: "retire" });
    expect(plan.save).toEqual([{ ...live, formatVersion: 5, retired: true }]);
    expect(plan.remove).toEqual([]);
    expect(plan.reviewRemovals).toEqual([]);
    expect(plan.skipped).toEqual([
      { id: "retired", reason: "unchanged" },
      { id: "gone", reason: "missing" },
    ]);
    expect(plan.inverse).toEqual({ save: [live], remove: [], reviewRemovals: [], reviewSaves: [] });
  });

  it("restores the retired cards, the live ones skipped", () => {
    const plan = planCardEdit([live, retired], ["live", "retired"], { kind: "restore" });
    expect(plan.save).toEqual([{ ...card("retired"), formatVersion: 5 }]);
    expect(plan.save[0]).not.toHaveProperty("retired");
    expect(plan.skipped).toEqual([{ id: "live", reason: "unchanged" }]);
    expect(plan.inverse.save).toEqual([retired]);
  });

  it("plans each card once, in the order the ids give", () => {
    const plan = planCardEdit([live, card("other")], ["other", "live", "other"], { kind: "retire" });
    expect(plan.save.map((saved) => saved.id)).toEqual(["other", "live"]);
  });

  it("removes cards with their review states in both directions, the inverse writing both back", () => {
    const states = [state("live"), state("live", "back-to-front"), state("other")];
    const plan = planCardEdit([live, retired], ["live", "retired"], { kind: "remove" }, states);
    expect(plan.save).toEqual([]);
    expect(plan.remove).toEqual(["live", "retired"]);
    expect(plan.reviewRemovals).toEqual([
      { cardId: "live", direction: "front-to-back" },
      { cardId: "live", direction: "back-to-front" },
      { cardId: "retired", direction: "front-to-back" },
      { cardId: "retired", direction: "back-to-front" },
    ]);
    expect(plan.inverse).toEqual({ save: [live, retired], remove: [], reviewRemovals: [], reviewSaves: states.slice(0, 2) });
  });

  it("removes cards without review states, none to write back", () => {
    expect(planCardEdit([live], ["live"], { kind: "remove" }).inverse.reviewSaves).toEqual([]);
  });

  it("writes cards in Markdown, and as plain text again (sm:plainText, a choice of its own), keeping them retired or not", () => {
    const markdown = card("md", { textFormat: SM.markdown });
    const on = planCardEdit([live, markdown, retired], ["live", "md", "retired"], { kind: "setTextFormat", markdown: true });
    expect(on.save).toEqual([
      { ...live, formatVersion: 5, textFormat: SM.markdown },
      { ...retired, formatVersion: 5, textFormat: SM.markdown },
    ]);
    expect(on.skipped).toEqual([{ id: "md", reason: "unchanged" }]);
    const off = planCardEdit([live, markdown], ["live", "md"], { kind: "setTextFormat", markdown: false });
    expect(off.save).toEqual([{ ...markdown, formatVersion: 5, textFormat: SM.plainText }]);
    expect(off.skipped).toEqual([{ id: "live", reason: "unchanged" }]);
  });

  it("states the language of untagged sides, both or the one asked for, a side that states one left alone", () => {
    const untagged = card("u", { front: { "": "水" }, back: { "": "water" } });
    const both = planCardEdit([untagged, live, retired], ["u", "live"], { kind: "stateLanguage", tag: "JA" });
    expect(both.save).toEqual([{ ...untagged, formatVersion: 5, front: { ja: "水" }, back: { ja: "water" } }]);
    expect(both.skipped).toEqual([{ id: "live", reason: "unchanged" }]);
    const front = planCardEdit([untagged], ["u"], { kind: "stateLanguage", tag: "ja", side: "front" });
    // The back keeps its untagged text, as it was saved.
    expect(front.save).toEqual([{ ...untagged, formatVersion: 5, front: { ja: "水" } }]);
    const old = card("old", { retired: true, back: { "": "eld" } });
    expect(planCardEdit([old], ["old"], { kind: "stateLanguage", tag: "sv", side: "back" }).save).toEqual([
      { ...old, formatVersion: 5, back: { sv: "eld" } },
    ]);
  });

  it("refuses a stated language that is no language code", () => {
    expect(() => planCardEdit([live], ["live"], { kind: "stateLanguage", tag: "Swedish" })).toThrow(
      expect.objectContaining({ code: "textLanguageInvalid" }),
    );
  });

  it("skips a card whose content does not pass the card validation", () => {
    const ftp = card("ftp", { frontImageUrl: "ftp://pod.example/a.png" });
    const unstatedNote = card("note", { frontNote: { "": "old" } });
    const mixed = card("mixed", { front: { "": "old", en: "new" } });
    const empty = card("empty", { front: {} });
    const plan = planCardEdit([ftp, unstatedNote, mixed, empty], ["ftp", "note", "mixed", "empty"], { kind: "retire" });
    expect(plan.skipped).toEqual([
      { id: "ftp", reason: "invalid" },
      { id: "note", reason: "unstatedLanguage" },
      { id: "mixed", reason: "unstatedLanguage" },
      { id: "empty", reason: "invalid" },
    ]);
  });
});

describe("planCardEdit, replacing text", () => {
  const word = card("word", {
    front: { en: "The cat sat", sv: "Katten satt" },
    back: { sv: "Katt" },
    frontNote: { en: "a cat" },
    backNote: { en: "cats" },
    backLabel: { en: "Cat noun" },
    frontImageUrl: "https://pod.example/cat.png",
    frontImageDescription: { en: "A cat" },
    distractors: [
      { id: "d1", text: { sv: "Hund" }, note: { en: "Not a cat" } },
      { id: "d2", text: { sv: "Kattunge" } },
    ],
  });

  it("replaces every match in every field, case aside, the pictures' descriptions left alone", () => {
    const plan = planCardEdit([word], ["word"], replace("cat", "dog"));
    expect(plan.save).toEqual([
      {
        ...word,
        formatVersion: 5,
        front: { en: "The dog sat", sv: "Katten satt" },
        frontNote: { en: "a dog" },
        backNote: { en: "dogs" },
        backLabel: { en: "dog noun" },
        distractors: [
          { id: "d1", text: { sv: "Hund" }, note: { en: "Not a dog" } },
          { id: "d2", text: { sv: "Kattunge" } },
        ],
      },
    ]);
    expect(plan.inverse.save).toEqual([word]);
  });

  it("matches case and whole words when asked, only in the fields and the language asked for", () => {
    const [cased] = planCardEdit([word], ["word"], replace("Kat", "Hun", { caseSensitive: true, fields: ["front", "back"] })).save;
    expect(cased).toMatchObject({ front: { en: "The cat sat", sv: "Hunten satt" }, back: { sv: "Hunt" }, frontNote: { en: "a cat" } });
    const [whole] = planCardEdit([word], ["word"], replace("cat", "dog", { wholeWord: true })).save;
    expect(whole).toMatchObject({ front: { en: "The dog sat", sv: "Katten satt" }, backNote: { en: "cats" }, backLabel: { en: "dog noun" } });
    const [swedish] = planCardEdit([word], ["word"], replace("katt", "hund", { language: "sv", fields: ["front"] })).save;
    expect(swedish).toMatchObject({ front: { en: "The cat sat", sv: "hunden satt" }, back: { sv: "Katt" } });
  });

  it("reads what it finds and writes what it replaces with as written, not as a pattern", () => {
    const sums = card("sums", { front: { en: "1+1 = $2 (a.b)" } });
    const [saved] = planCardEdit([sums], ["sums"], replace("1+1", "$&$1", { wholeWord: true })).save;
    expect(saved?.front).toEqual({ en: "$&$1 = $2 (a.b)" });
    expect(planCardEdit([sums], ["sums"], replace("(a.b)", "[x]")).save[0]?.front).toEqual({ en: "1+1 = $2 [x]" });
  });

  it("finds untagged text with UNSTATED, which is skipped as it cannot be saved untagged once changed", () => {
    const untagged = card("u", { front: { "": "cat" } });
    const plan = planCardEdit([untagged, word], ["u", "word"], replace("cat", "dog", { language: UNSTATED }));
    expect(plan.skipped).toEqual([
      { id: "u", reason: "unstatedLanguage" },
      { id: "word", reason: "unchanged" },
    ]);
  });

  it("skips a card it would leave with an empty side or wrong option, and drops an emptied note", () => {
    const plan = planCardEdit(
      [card("side", { back: { sv: "cat" } }), card("option", { distractors: [{ id: "d", text: { sv: "cat" } }] })],
      ["side", "option"],
      replace("cat", ""),
    );
    expect(plan.skipped).toEqual([
      { id: "side", reason: "wouldEmpty" },
      { id: "option", reason: "wouldEmpty" },
    ]);
    const [noted] = planCardEdit([word], ["word"], replace("a cat", "", { fields: ["note"] })).save;
    expect(noted).not.toHaveProperty("frontNote");
    const [optionNote] = planCardEdit([word], ["word"], replace("Not a cat", "", { fields: ["distractor"] })).save;
    expect(optionNote?.distractors?.[0]).toEqual({ id: "d1", text: { sv: "Hund" } });
  });

  it("skips a card whose side would be left with white space only", () => {
    expect(planCardEdit([card("p", { front: { en: "cat" } })], ["p"], replace("cat", " ")).skipped).toEqual([
      { id: "p", reason: "wouldEmpty" },
    ]);
  });

  it("changes nothing with nothing to find, or nothing found", () => {
    expect(planCardEdit([word], ["word"], replace("", "x")).skipped).toEqual([{ id: "word", reason: "unchanged" }]);
    expect(planCardEdit([word], ["word"], replace("zebra", "x")).skipped).toEqual([{ id: "word", reason: "unchanged" }]);
    const bare = card("bare");
    expect(planCardEdit([bare], ["bare"], replace("zebra", "x")).skipped).toEqual([{ id: "bare", reason: "unchanged" }]);
  });

});

describe("sameCardEditPlan", () => {
  const cards = [live, retired, card("third")];
  const plan = planCardEdit(cards, ["live", "retired"], { kind: "retire" });

  it("holds for the same edit of the same cards", () => {
    expect(sameCardEditPlan(plan, planCardEdit(cards, ["live", "retired"], { kind: "retire" }))).toBe(true);
  });

  it("fails when a card saved, removed or skipped differs", () => {
    expect(sameCardEditPlan(plan, planCardEdit([card("live", { front: { en: "edited" } }), retired], ["live", "retired"], { kind: "retire" }))).toBe(false);
    expect(sameCardEditPlan(plan, planCardEdit(cards, ["live", "third"], { kind: "retire" }))).toBe(false);
    expect(sameCardEditPlan(plan, planCardEdit([live, card("retired")], ["live", "retired"], { kind: "retire" }))).toBe(false);
    expect(sameCardEditPlan(plan, planCardEdit([live], ["live", "retired"], { kind: "retire" }))).toBe(false);
    const removal = planCardEdit(cards, ["live"], { kind: "remove" });
    expect(sameCardEditPlan(removal, planCardEdit(cards, ["live"], { kind: "remove" }, [state("live")]))).toBe(true);
    expect(sameCardEditPlan(removal, planCardEdit(cards, ["third"], { kind: "remove" }))).toBe(false);
    const keys = { ...removal, reviewRemovals: [removal.reviewRemovals[1]!, removal.reviewRemovals[0]!] };
    expect(sameCardEditPlan(removal, keys)).toBe(false);
  });
});

describe("planUndo", () => {
  it("is the inverse while the cards are as the plan left them", () => {
    const plan = planCardEdit([live, card("other")], ["live", "other"], { kind: "retire" });
    expect(planUndo([...plan.save, card("new")], plan)).toBe(plan.inverse);
    const removal = planCardEdit([live, card("other")], ["live"], { kind: "remove" });
    expect(planUndo([card("other")], removal)).toBe(removal.inverse);
  });

  it("is null once a card changed since, or came back", () => {
    const plan = planCardEdit([live], ["live"], { kind: "retire" });
    expect(planUndo([live], plan)).toBeNull();
    expect(planUndo([], plan)).toBeNull();
    const removal = planCardEdit([live], ["live"], { kind: "remove" });
    expect(planUndo([live], removal)).toBeNull();
  });
});

describe("changedTexts", () => {
  it("lists each text that differs, by part and language", () => {
    const before = card("c", {
      front: { en: "cat", sv: "katt" },
      backNote: { en: "a cat" },
      distractors: [{ id: "d", text: { sv: "Katt?" }, note: { en: "cat" } }, { id: "gone", text: { sv: "x" } }],
    });
    const after = card("c", {
      front: { en: "dog", sv: "katt" },
      backLabel: { en: "dog" },
      distractors: [{ id: "d", text: { sv: "Hund?" } }],
    });
    expect(changedTexts(before, after)).toEqual([
      { part: "front", tag: "en", before: "cat", after: "dog" },
      { part: "backLabel", tag: "en", after: "dog" },
      { part: "backNote", tag: "en", before: "a cat" },
      { part: "distractor", tag: "sv", before: "Katt?", after: "Hund?" },
      { part: "distractorNote", tag: "en", before: "cat" },
      { part: "distractor", tag: "sv", before: "x" },
    ]);
    expect(changedTexts(before, before)).toEqual([]);
    expect(changedTexts(card("p"), card("p"))).toEqual([]);
  });
});
