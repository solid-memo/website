// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { growth } from "../testing/growth";
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
import {
  markdownFields,
  markedSubjects,
  markdownProblems,
  theoryChunkProblems,
  type MarkdownCheck,
} from "./markdownFields";

const DESCRIPTION = "http://purl.org/dc/terms/description";
const marker = (id: string) => ({
  subject: id === "" ? RELEASE : at(id),
  object: iri(SM.markdown),
});

/** A release with a marked card and its two distractors, one only named, a marked step and chapter, and what is not marked. */
const release = model({
  cards: [
    card("q-1", {
      front: [text("Front")],
      back: [text("Back")],
      frontLabel: [text("Kind", "")],
      backLabel: [text("Label", "")],
      frontNote: [text("Note")],
      backNote: [text("Back note")],
      distractors: [iri(at("q-1-a")), iri(at("q-1-b")), iri(at("gone"))],
    }),
    card("q-2", { front: [text("Plain")] }),
    card("q-3", { front: [text("Side")], back: [text("Back")] }),
  ],
  steps: [
    step("s-1", "ch-1", 0, [], { theory: [text("Theory")] }),
    step("s-2", "ch-1", 1, [], { theory: [text("Plain")] }),
  ],
  chapters: [
    chapter("ch-1", 0, { title: [text("Title")], description: [text("About")] }),
    chapter("ch-2", 1, { description: [text("Plain")] }),
  ],
  distractors: [
    distractor("q-1-a", { text: [text("Wrong")], note: [text("Why")] }),
    distractor("q-1-b", { typed: false, text: [text("Named")] }),
  ],
  textFormats: [
    marker("q-1"),
    marker("q-3"),
    marker("s-1"),
    marker("ch-1"),
    { subject: at("q-2"), object: iri(SM.plainText) },
  ],
});

/** Chunks a text at each "---" in it, as the markdown package does at each top-level thematic break. */
const chunking: MarkdownCheck = {
  problems: () => [],
  chunks: (value) => {
    const pieces = value.split("---");
    const chunks = pieces.filter((piece) => piece !== "").length;
    return { chunks: Math.max(chunks, 1), empty: pieces.length - chunks };
  },
};

describe("markdownFields", () => {
  it("names each text of each marked card, its distractors, step and chapter, with its rule, in order", () => {
    expect(
      markdownFields(release).map(({ subject, field, text, rule }) => [
        subject,
        field,
        text.value,
        rule,
      ]),
    ).toEqual([
      [at("q-1"), SM.front, "Front", "side"],
      [at("q-1"), SM.back, "Back", "option"],
      [at("q-1"), SM.frontLabel, "Kind", "side"],
      [at("q-1"), SM.backLabel, "Label", "side"],
      [at("q-1"), SM.frontNote, "Note", "prose"],
      [at("q-1"), SM.backNote, "Back note", "prose"],
      [at("q-1-a"), SM.distractorText, "Wrong", "option"],
      [at("q-1-a"), SM.distractorNote, "Why", "prose"],
      [at("q-1-b"), SM.distractorText, "Named", "option"],
      [at("q-3"), SM.front, "Side", "side"],
      [at("q-3"), SM.back, "Back", "side"],
      [at("s-1"), SM.theory, "Theory", "prose"],
      [at("ch-1"), DESCRIPTION, "About", "prose"],
    ]);
  });

  it("tells the subjects marked Markdown", () => {
    const marked = markedSubjects(release);
    expect([...marked]).toEqual([at("q-1"), at("q-3"), at("s-1"), at("ch-1")]);
    expect(marked.has(at("q-2"))).toBe(false);
  });
});

describe("markdownProblems", () => {
  const check: MarkdownCheck = {
    problems: (value, rule) =>
      value === "Back" || value === "Theory" ? [{ code: `bad-${rule}` }] : [],
    chunks: () => ({ chunks: 1, empty: 0 }),
  };

  it("names each finding of the check, in its subject, field and language", () => {
    expect(markdownProblems(release, check)).toEqual([
      {
        severity: "error",
        subject: at("q-1"),
        field: SM.back,
        code: "markdown",
        params: { language: "en", finding: { code: "bad-option" } },
      },
      {
        severity: "error",
        subject: at("q-3"),
        field: SM.back,
        code: "markdown",
        params: { language: "en", finding: { code: "bad-side" } },
      },
      {
        severity: "error",
        subject: at("s-1"),
        field: SM.theory,
        code: "markdown",
        params: { language: "en", finding: { code: "bad-prose" } },
      },
    ]);
  });

  it("names a text format on what has none of its own, and one that is no concept of solid-memo:TextFormats", () => {
    const formats = model({
      cards: [card("q-1")],
      steps: [step("s-1", "ch-1", 0, [])],
      distractors: [distractor("q-1-a")],
      textFormats: [
        { subject: at("s-1"), object: iri("https://example.org/rst") },
        { subject: at("q-1-a"), object: iri(SM.markdown) },
        { subject: RELEASE, object: iri(SM.markdown) },
        { subject: at("q-1"), object: iri(SM.markdown) },
      ],
    });
    expect(
      markdownProblems(formats, check).map(({ code, subject, params }) => ({
        code,
        subject,
        params,
      })),
    ).toEqual([
      {
        code: "textFormatUnknown",
        subject: at("s-1"),
        params: { format: iri("https://example.org/rst") },
      },
      { code: "textFormatMisplaced", subject: at("q-1-a"), params: { distractor: true } },
      { code: "textFormatMisplaced", subject: RELEASE, params: { distractor: false } },
    ]);
  });

  it("names a step's theory with an empty chunk, and one in other numbers of chunks in other languages, after its findings", () => {
    const chunked = model({
      steps: [
        step("s-1", "ch-1", 0, [], { theory: [text("A---B"), text("A---B---C", "sv")] }),
        step("s-2", "ch-1", 1, [], { theory: [text("---A"), text("A", "sv")] }),
        step("s-3", "ch-1", 2, [], { theory: [text("A---B"), text("A---B", "sv")] }),
      ],
      chapters: [chapter("ch-1", 0, { description: [text("About---")] })],
      textFormats: [marker("s-1"), marker("s-2"), marker("s-3"), marker("ch-1")],
    });
    const found = markdownProblems(chunked, {
      ...chunking,
      problems: (value) => (value === "A" ? [{ code: "bad" }] : []),
    });
    expect(
      found.map(({ code, subject, field, params }) => ({ code, subject, field, params })),
    ).toEqual([
      {
        code: "theoryChunks",
        subject: at("s-1"),
        field: SM.theory,
        params: {
          counts: [
            { language: "en", chunks: 2 },
            { language: "sv", chunks: 3 },
          ],
        },
      },
      {
        code: "markdown",
        subject: at("s-2"),
        field: SM.theory,
        params: { language: "sv", finding: { code: "bad" } },
      },
      {
        code: "theoryEmptyChunk",
        subject: at("s-2"),
        field: SM.theory,
        params: { language: "en" },
      },
      // A chapter's description is not chunked.
    ]);
  });
});

describe("markdownProblems' growth", () => {
  /** Cards, steps and chapters, `count` of each, every one marked, and as many text formats again on what is none of them. */
  const many = (count: number) => {
    const ids = Array.from({ length: count }, (_, i) => i);
    return model({
      cards: ids.map((i) => card(`q-${i}`, { front: [text("Front")] })),
      steps: ids.map((i) => step(`s-${i}`, "ch-0", i, [], { theory: [text("Theory")] })),
      chapters: ids.map((i) => chapter(`ch-${i}`, i, { description: [text("About")] })),
      textFormats: [
        ...ids.flatMap((i) => [marker(`q-${i}`), marker(`s-${i}`), marker(`ch-${i}`)]),
        ...ids.map((i) => ({ subject: at(`t-${i}`), object: iri(SM.plainText) })),
      ],
    });
  };

  it("checks a release in time that grows with its records and text formats, not with their product", () => {
    // Eight times the records and text formats take about as long as an
    // eighth of them eight times over; looking through every text format
    // for each card, step and chapter would take eight times as long.
    const quiet: MarkdownCheck = { problems: () => [], chunks: () => ({ chunks: 1, empty: 0 }) };
    const ratio = growth(
      (count) => {
        const release = many(count);
        return () => markdownProblems(release, quiet);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("theoryChunkProblems", () => {
  it("finds nothing in a theory in one chunk, or in none", () => {
    expect(theoryChunkProblems(at("s-1"), [text("A"), text("B", "sv")], chunking)).toEqual([]);
    expect(theoryChunkProblems(at("s-1"), [], chunking)).toEqual([]);
  });
});
