import { describe, expect, it } from "vitest";
import { card, chapter, distractor, iri, model, RELEASE, step, text } from "../testing/releaseModel";
import { emptyReleaseModel, languagesOf, publishedIds, subjectsOf, versionOf } from "./releaseModel";

describe("subjectsOf and publishedIds", () => {
  const release = model({
    cards: [card("se"), card("no", { retired: true })],
    chapters: [chapter("ch-1", 0)],
    steps: [step("s-1", "ch-1", 0, ["se"])],
    distractors: [distractor("se-a"), distractor("named", { typed: false })],
  });

  it("names the subjects of each kind, retired ones included, and only typed distractors", () => {
    expect(subjectsOf(release, "card").map((s) => s.iri)).toEqual([`${RELEASE}#se`, `${RELEASE}#no`]);
    expect(subjectsOf(release, "chapter").map((s) => s.iri)).toEqual([`${RELEASE}#ch-1`]);
    expect(subjectsOf(release, "step").map((s) => s.iri)).toEqual([`${RELEASE}#s-1`]);
    expect(subjectsOf(release, "distractor").map((s) => s.iri)).toEqual([`${RELEASE}#se-a`]);
  });

  it("gives their fragment ids", () => {
    expect(publishedIds(release, "card")).toEqual(["se", "no"]);
    expect(publishedIds(release, "distractor")).toEqual(["se-a"]);
  });
});

describe("versionOf", () => {
  it("reads the one version a release states, a whole number from 1", () => {
    expect(versionOf(model({ version: [text("3", "")] }))).toBe(3);
  });

  it("reads none from no version, several, an IRI, or what is no such number", () => {
    for (const version of [[], [text("1", ""), text("2", "")], [iri("https://example.com/1")], [text("01", "")], [text("0", "")]]) {
      expect(versionOf(model({ version }))).toBeUndefined();
    }
  });
});

it("gives the languages of texts once each, untagged as the empty tag", () => {
  expect(languagesOf([text("a"), text("b", "sv"), text("c"), text("d", "")])).toEqual(["en", "sv", ""]);
});

it("starts an empty model at an address", () => {
  const empty = emptyReleaseModel(RELEASE);
  expect(empty.url).toBe(RELEASE);
  expect(empty.cards).toEqual([]);
  expect(empty.textFormats).toEqual([]);
});
