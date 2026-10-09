import { expect, it } from "vitest";
import { card, chapter, distractor, model, RELEASE, step, text } from "../testing/releaseModel";
import { continuityProblems } from "./continuityRules";

const NEXT = "https://solid-memo.com/decks/solid/v2.ttl";
const before = model({
  version: [text("1", "")],
  cards: [card("se"), card("no"), card("fi")],
  chapters: [chapter("ch-1", 0), chapter("ch-2", 1)],
  steps: [step("s-1", "ch-1", 0, ["se"])],
  distractors: [distractor("se-a"), distractor("named", { typed: false })],
});
const after = (extra: Partial<typeof before>) => ({ ...before, url: NEXT, version: [text("2", "")], ...extra });

it("accepts a version that keeps or retires what the one before it has, and adds to it", () => {
  const kept = after({ cards: [card("se", { retired: true }), card("no"), card("fi"), card("dk")], distractors: [distractor("se-a")] });
  expect(continuityProblems(before, kept)).toEqual([]);
});

it("names the cards, then the chapters, steps and distractors, a version drops", () => {
  const dropped = after({ cards: [card("no")], chapters: [chapter("ch-1", 0)], steps: [], distractors: [] });
  expect(continuityProblems(before, dropped)).toEqual([
    { severity: "error", subject: NEXT, related: [RELEASE], code: "cardsDropped", params: { ids: ["se", "fi"], previous: RELEASE } },
    { severity: "error", subject: NEXT, related: [RELEASE], code: "outlineDropped", params: { ids: ["ch-2", "s-1", "se-a"], previous: RELEASE } },
  ]);
});

it("names an id given to another kind of subject than before", () => {
  const reused = after({ cards: [card("se"), card("no"), card("ch-2")], chapters: [chapter("ch-1", 0), chapter("fi", 1), chapter("ch-2", 2)] });
  expect(continuityProblems(before, reused).map(({ code, params }) => ({ code, params }))).toEqual([
    { code: "cardsDropped", params: { ids: ["fi"], previous: RELEASE } },
    { code: "idReused", params: { id: "fi", was: "card", now: "chapter", previous: RELEASE } },
  ]);
});

it("names a version that is not the one before it plus one, when both state one", () => {
  expect(continuityProblems(before, after({ version: [text("3", "")] })).map((p) => p.params)).toEqual([
    { version: 3, previousVersion: 1, previous: RELEASE },
  ]);
  expect(continuityProblems(before, after({ version: [] }))).toEqual([]);
  expect(continuityProblems({ ...before, version: [] }, after({}))).toEqual([]);
});
