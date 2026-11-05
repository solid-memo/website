// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import {
  at,
  card,
  chapter,
  distractor,
  iri,
  model,
  RELEASE,
  step,
  text,
} from "../testing/releaseModel";
import { continuityProblems, ownSeriesProblems, seriesAbove } from "./continuityRules";

const NEXT = "https://solid-memo.com/decks/solid/v2.ttl";
const before = model({
  version: [text("1", "")],
  cards: [card("se"), card("no"), card("fi")],
  chapters: [chapter("ch-1", 0), chapter("ch-2", 1)],
  steps: [step("s-1", "ch-1", 0, ["se"])],
  distractors: [distractor("se-a"), distractor("named", { typed: false })],
});
const after = (extra: Partial<typeof before>) => ({
  ...before,
  url: NEXT,
  version: [text("2", "")],
  ...extra,
});

it("accepts a version that keeps or retires what the one before it has, and adds to it", () => {
  const kept = after({
    cards: [card("se", { retired: true }), card("no"), card("fi"), card("dk")],
    distractors: [distractor("se-a")],
  });
  expect(continuityProblems(before, kept)).toEqual([]);
});

it("names the cards, then the chapters, steps and distractors, a version drops", () => {
  const dropped = after({
    cards: [card("no")],
    chapters: [chapter("ch-1", 0)],
    steps: [],
    distractors: [],
  });
  expect(continuityProblems(before, dropped)).toEqual([
    {
      severity: "error",
      subject: NEXT,
      related: [RELEASE],
      code: "cardsDropped",
      params: { ids: ["se", "fi"], previous: RELEASE },
    },
    {
      severity: "error",
      subject: NEXT,
      related: [RELEASE],
      code: "outlineDropped",
      params: { ids: ["ch-2", "s-1", "se-a"], previous: RELEASE },
    },
  ]);
});

it("names an id given to another kind of subject than before", () => {
  const reused = after({
    cards: [card("se"), card("no"), card("ch-2")],
    chapters: [chapter("ch-1", 0), chapter("fi", 1), chapter("ch-2", 2)],
  });
  expect(continuityProblems(before, reused).map(({ code, params }) => ({ code, params }))).toEqual([
    { code: "cardsDropped", params: { ids: ["fi"], previous: RELEASE } },
    { code: "idReused", params: { id: "fi", was: "card", now: "chapter", previous: RELEASE } },
  ]);
});

it("names a version that is not the one before it plus one, when both state one", () => {
  expect(
    continuityProblems(before, after({ version: [text("3", "")] })).map((p) => p.params),
  ).toEqual([{ version: 3, previousVersion: 1, previous: RELEASE }]);
  expect(continuityProblems(before, after({ version: [] }))).toEqual([]);
  expect(continuityProblems({ ...before, version: [] }, after({}))).toEqual([]);
});

it("names a series not its own of a release that follows none (GHSA-38m7-8r5j-q79f)", () => {
  const OTHER = "https://creator.example/memo/releases/capitals/v1.ttl#series";
  expect(ownSeriesProblems(model({ inSeries: [iri(OTHER)] }))).toEqual([
    {
      severity: "error",
      subject: RELEASE,
      field: "http://www.w3.org/ns/dcat#inSeries",
      related: [OTHER],
      code: "seriesNotOwn",
      params: { series: OTHER },
    },
  ]);
  // Its own; one that follows a release, whose series is that one's; none, or one no IRI.
  expect(ownSeriesProblems(model({ inSeries: [iri(at("series"))] }))).toEqual([]);
  expect(ownSeriesProblems(model({ inSeries: [iri(OTHER)], prev: [iri(OTHER)] }))).toEqual([]);
  expect(ownSeriesProblems(model({ inSeries: [] }))).toEqual([]);
  expect(ownSeriesProblems(model({ inSeries: [text("series", "")] }))).toEqual([]);
});

it.each([
  ["off its origin", "https://other.example/memo/releases/capitals/v998.ttl"],
  ["in another pod on its origin", "https://creator.example/mallory/releases/capitals/v998.ttl"],
])(
  "names a series %s that a next version's release follows (GHSA-38m7-8r5j-q79f)",
  (_, PREVIOUS) => {
    const SERIES = "https://creator.example/memo/releases/capitals/v1.ttl#series";
    expect(ownSeriesProblems(model({ inSeries: [iri(SERIES)], prev: [iri(PREVIOUS)] }))).toEqual([
      {
        severity: "error",
        subject: RELEASE,
        field: "http://www.w3.org/ns/dcat#inSeries",
        related: [SERIES, PREVIOUS],
        code: "seriesNotPrevious",
        params: { series: SERIES, previous: PREVIOUS },
      },
    ]);
  },
);

it("takes a next version's series beside or above the release it follows", () => {
  const SERIES = "https://creator.example/memo/releases/capitals/v1.ttl#series";
  // A pod's v1#series or a library's index; a prev no IRI is none.
  const v1 = "https://creator.example/memo/releases/capitals/v1.ttl";
  expect(ownSeriesProblems(model({ inSeries: [iri(SERIES)], prev: [iri(v1)] }))).toEqual([]);
  expect(
    ownSeriesProblems(
      model({
        inSeries: [iri("https://solid-memo.com/decks/index.ttl#solid")],
        prev: [iri("https://solid-memo.com/decks/solid/v1.ttl")],
      }),
    ),
  ).toEqual([]);
  expect(
    ownSeriesProblems(model({ inSeries: [iri(SERIES)], prev: [text(v1, "")] })).map((p) => p.code),
  ).toEqual(["seriesNotOwn"]);
});

it("finds a series in the container of a release or one above it, on its origin", () => {
  const release = "https://a.example/pod/releases/x/v2.ttl";
  expect(seriesAbove(release, "https://a.example/pod/releases/x/v1.ttl#series")).toBe(true);
  expect(seriesAbove(release, "https://a.example/pod/index.ttl#x")).toBe(true);
  expect(seriesAbove(release, "https://a.example/other/releases/x/v1.ttl#series")).toBe(false);
  expect(seriesAbove(release, "https://a.example/pod/releases/x/y/v1.ttl#series")).toBe(false);
  expect(seriesAbove(release, "https://a.example/pod/releases/xy/v1.ttl#series")).toBe(false);
  expect(seriesAbove(release, "https://a.example:8443/pod/releases/x/v1.ttl#series")).toBe(false);
  expect(
    seriesAbove("https://a.example/pod/../other/x/v2.ttl", "https://a.example/pod/x/v1.ttl#s"),
  ).toBe(false);
  for (const separator of ["%2f", "%2F", "%5c", "%5C"]) {
    const encoded = `https://a.example/pod/releases/x/..${separator}..${separator}mallory/v2.ttl`;
    expect(seriesAbove(encoded, "https://a.example/pod/releases/x/v1.ttl#series")).toBe(false);
    expect(seriesAbove(release, `https://a.example/pod/releases/x${separator}v1.ttl#s`)).toBe(
      false,
    );
  }
  expect(seriesAbove("urn:x:1", "urn:x:2")).toBe(false);
  expect(seriesAbove("not a URL", "not a URL")).toBe(false);
});
