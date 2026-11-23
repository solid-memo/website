// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { MAX_CHARS, parseMarkdown } from "@solid-memo/markdown/parse";
import { plainText } from "@solid-memo/markdown/plainText";
import { PROSE, SIDE } from "@solid-memo/markdown/problems";
import { growth } from "@solid-memo/domain/testing/growth";
import {
  CACHE_SIZE,
  CACHE_WEIGHT,
  COURSES_KEPT,
  courseDescriptionBlocks,
  deckTextCheck,
  markdownBlocks,
  markdownChunks,
  markdownFieldProblems,
  markdownPhrases,
  markdownPlainText,
  plainTexts,
  releaseMarkdownCheck,
} from "./markdownCache";
import { textHash } from "./textHash";

vi.mock("@solid-memo/markdown/parse", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/markdown/parse")>();
  return { ...original, parseMarkdown: vi.fn(original.parseMarkdown) };
});

vi.mock("@solid-memo/markdown/plainText", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/markdown/plainText")>();
  return { plainText: vi.fn(original.plainText) };
});

vi.mock("./textHash", async (importOriginal) => {
  const original = await importOriginal<typeof import("./textHash")>();
  return { textHash: vi.fn(original.textHash) };
});

/** How many objects and arrays a value is made of. */
function nodesOf(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  return 1 + Object.values(value).reduce<number>((sum, part) => sum + nodesOf(part), 0);
}

/** A card side of short Markdown lines, each a heading with emphasis: its tree is many times the size of its text. */
const dense = (index: number) => `${index} ${"# *a*\n".repeat(2731)}`.slice(0, 16_383);

/**
 * How many of `texts`, the newest first, `read` gives back as it gave
 * them before (`values`) without calling `compute` again; it stops at the
 * first it reads anew.
 */
function keptOf<T>(texts: string[], values: T[], read: (text: string) => T, compute: unknown) {
  let kept = 0;
  for (let index = texts.length - 1; index >= 0; index--) {
    vi.mocked(compute as () => unknown).mockClear();
    if (read(texts[index]!) !== values[index]) break;
    expect(compute).not.toHaveBeenCalled();
    kept++;
  }
  return kept;
}

describe("markdownBlocks and markdownPhrases", () => {
  it("parse a text once, giving back what they gave before", () => {
    const blocks = markdownBlocks("*cached*");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "emphasis", children: [{ type: "text", value: "cached" }] }],
      },
    ]);
    expect(markdownBlocks("*cached*")).toBe(blocks);
    const phrases = markdownPhrases("- a\n- b");
    expect(phrases).toEqual([
      { type: "text", value: "a" },
      { type: "text", value: "; " },
      { type: "text", value: "b" },
    ]);
    expect(markdownPhrases("- a\n- b")).toBe(phrases);
  });

  it("remember the last CACHE_SIZE texts, forgetting the oldest first", () => {
    const first = markdownBlocks("first");
    for (let index = 0; index < CACHE_SIZE - 1; index++) markdownBlocks(`text ${index}`);
    const newest = markdownBlocks(`text ${CACHE_SIZE - 2}`);
    expect(markdownBlocks(`text ${CACHE_SIZE - 2}`)).toBe(newest);
    markdownBlocks("one more");
    expect(markdownBlocks("first")).not.toBe(first);
    expect(markdownBlocks("first")).toEqual(first);
  });

  it("remember CACHE_SIZE texts of an ordinary card's length, all of them", () => {
    const texts = Array.from(
      { length: CACHE_SIZE },
      (_, index) => `${index} ${"The *quick* brown fox jumps over the lazy dog. ".repeat(20)}`,
    );
    const blocks = texts.map(markdownBlocks);
    expect(keptOf(texts, blocks, markdownBlocks, parseMarkdown)).toBe(CACHE_SIZE);
  });

  it("keep dense texts' trees only as far as CACHE_WEIGHT goes, however few texts that is", () => {
    const texts = Array.from({ length: 60 }, (_, index) => dense(index));
    const blocks = texts.map(markdownBlocks);
    const kept = keptOf(texts, blocks, markdownBlocks, parseMarkdown);
    const weight = (from: number) =>
      blocks.slice(from).reduce((sum, tree, index) => {
        return sum + texts[from + index]!.length * 32 + nodesOf(tree) * 96;
      }, 0);
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(texts.length);
    expect(weight(texts.length - kept)).toBeLessThanOrEqual(CACHE_WEIGHT);
    expect(weight(texts.length - kept - 1)).toBeGreaterThan(CACHE_WEIGHT);
    const phrases = texts.map(markdownPhrases);
    expect(markdownPhrases(texts[0]!)).not.toBe(phrases[0]);
    expect(markdownPhrases(texts.at(-1)!)).toBe(phrases.at(-1));
  });
});

describe("courseDescriptionBlocks", () => {
  it("remembers the text at every position, more than CACHE_SIZE, each its own", () => {
    const blocksOf = courseDescriptionBlocks("https://r.example/positions");
    const texts = Array.from({ length: CACHE_SIZE + 1 }, (_, index) => `*text* ${index}`);
    const first = texts.map((text, index) => blocksOf(index, text));
    expect(first[0]).toEqual(markdownBlocks(texts[0]!));
    expect(texts.every((text, index) => blocksOf(index, text) === first[index])).toBe(true);
    expect(courseDescriptionBlocks("https://r.example/other")(0, texts[0]!)).not.toBe(first[0]);
  });

  it("reads long texts of one length again without parsing, and a changed one anew", () => {
    const blocksOf = courseDescriptionBlocks("https://r.example/long");
    const long = "a".repeat(17_000);
    const texts = Array.from(
      { length: 12 },
      (_, index) => `${long}${String(index).padStart(3, "0")}`,
    );
    const first = texts.map((text, index) => blocksOf(index, text));
    vi.mocked(parseMarkdown).mockClear();
    const copies = texts.map((text) => `${text} `.slice(0, -1));
    expect(copies.every((text, index) => blocksOf(index, text) === first[index])).toBe(true);
    expect(parseMarkdown).not.toHaveBeenCalled();
    expect(blocksOf(0, texts[1]!)).not.toBe(first[0]);
    expect(blocksOf(0, texts[1]!)).toEqual(first[1]);
    expect(parseMarkdown).toHaveBeenCalledTimes(1);
  });

  it("keeps a course's dense descriptions only as far as its share of CACHE_WEIGHT goes", () => {
    const blocksOf = courseDescriptionBlocks("https://r.example/dense");
    const texts = Array.from({ length: 12 }, (_, index) => dense(index));
    const first = texts.map((text, index) => blocksOf(index, text));
    const weights = texts.map((text, index) => text.length * 32 + nodesOf(first[index]) * 96);
    let kept = 0;
    for (let total = weights[0]!; total <= CACHE_WEIGHT / COURSES_KEPT; total += weights[kept]!)
      kept++;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(texts.length);
    vi.mocked(parseMarkdown).mockClear();
    const again = texts.map((text, index) => blocksOf(index, text));
    expect(again.slice(0, kept).every((blocks, index) => blocks === first[index])).toBe(true);
    expect(again.slice(kept).some((blocks, index) => blocks === first[kept + index])).toBe(false);
    expect(parseMarkdown).toHaveBeenCalledTimes(texts.length - kept);
    expect(blocksOf(0, "*short*")).toEqual(markdownBlocks("*short*"));
    expect(blocksOf(kept, texts[kept]!)).toBe(blocksOf(kept, texts[kept]!));
  });

  it("keeps a release's descriptions for the last COURSES_KEPT courses, the one used longest ago going first", () => {
    const url = (index: number) => `https://r.example/kept/${index}`;
    const kept = Array.from({ length: COURSES_KEPT }, (_, index) =>
      courseDescriptionBlocks(url(index)),
    );
    expect(courseDescriptionBlocks(url(0))).toBe(kept[0]);
    courseDescriptionBlocks(url(COURSES_KEPT));
    expect(courseDescriptionBlocks(url(0))).toBe(kept[0]);
    expect(courseDescriptionBlocks(url(2))).toBe(kept[2]);
    expect(courseDescriptionBlocks(url(1))).not.toBe(kept[1]);
  });
});

describe("markdownChunks", () => {
  it("splits the text's blocks at its top-level rules, once, giving back what it gave before", () => {
    const chunks = markdownChunks("a\n\n---\n\nb");
    expect(chunks).toEqual([
      [{ type: "paragraph", children: [{ type: "text", value: "a" }] }],
      [{ type: "paragraph", children: [{ type: "text", value: "b" }] }],
    ]);
    expect(markdownChunks("a\n\n---\n\nb")).toBe(chunks);
  });

  it("is null for a text to be shown as plain text", () => {
    expect(markdownChunks("a".repeat(MAX_CHARS + 1))).toBeNull();
  });
});

describe("plainTexts", () => {
  it("gives Markdown as plain text, read once however many texts it is given", () => {
    vi.mocked(plainText).mockClear();
    const plain = plainTexts();
    expect(plain("**Coffee** shop")).toBe("Coffee shop");
    for (let index = 0; index <= CACHE_SIZE; index++) plain(`*text* ${index}`);
    expect(plain("**Coffee** shop")).toBe("Coffee shop");
    expect(plain("*text* 0")).toBe("text 0");
    expect(plainText).toHaveBeenCalledTimes(CACHE_SIZE + 2);
    expect(
      vi.mocked(plainText).mock.calls.filter(([text]) => text === "**Coffee** shop"),
    ).toHaveLength(1);
  });
});

describe("markdownPlainText", () => {
  it("gives Markdown as plain text, read once for a text given again", () => {
    vi.mocked(plainText).mockClear();
    expect(markdownPlainText("**Tea** room")).toBe("Tea room");
    expect(markdownPlainText("**Tea** room")).toBe("Tea room");
    expect(plainText).toHaveBeenCalledTimes(1);
  });

  it("does not keep a text that weighs more than CACHE_WEIGHT by itself", () => {
    vi.mocked(plainText).mockClear();
    const long = "a".repeat(CACHE_WEIGHT / 32 + 1);
    expect(markdownPlainText(long)).toBe(long);
    expect(markdownPlainText(long)).toBe(long);
    expect(plainText).toHaveBeenCalledTimes(2);
  });
});

describe("markdownFieldProblems", () => {
  it("checks a text once by each rule, giving back what it gave before", () => {
    const link = "[a](https://example.org)";
    const found = markdownFieldProblems(link, SIDE);
    expect(found).toEqual([{ code: "link", source: link, autolink: false }]);
    expect(markdownFieldProblems(link, SIDE)).toBe(found);
    const prose = markdownFieldProblems(link, PROSE);
    expect(prose).toEqual([]);
    expect(markdownFieldProblems(link, PROSE)).toBe(prose);
  });
});

describe("deckTextCheck", () => {
  it("reads plain text and checks each field by the markdown package's rule", () => {
    const text = deckTextCheck();
    expect(text.plain("**Coffee**")).toBe("Coffee");
    expect(text.check("[a](https://example.org)", "side")).toEqual([
      { code: "link", source: "[a](https://example.org)", autolink: false },
    ]);
    expect(text.check("[example.org](https://example.org)", "prose")).toEqual([]);
    expect(text.check("a\n\nb", "option")).toEqual([{ code: "notOneParagraph" }]);
  });

  it("checks each text once by each rule, however many cards say it", () => {
    const text = deckTextCheck();
    const found = text.check("[a](https://example.org)", "side");
    for (let card = 0; card < 100; card++)
      expect(text.check("[a](https://example.org)", "side")).toBe(found);
    expect(text.check("[a](https://example.org)", "prose")).toEqual([]);
  });
});

describe("releaseMarkdownCheck", () => {
  it("checks each field by the markdown package's rule, each text once by each rule", () => {
    const check = releaseMarkdownCheck();
    const found = check.problems("[a](https://example.org)", "side");
    expect(found).toEqual([{ code: "link", source: "[a](https://example.org)", autolink: false }]);
    expect(check.problems("[a](https://example.org)", "side")).toBe(found);
    expect(check.problems("[a](https://example.org)", "prose")).toEqual([]);
    expect(check.problems("a\n\nb", "option")).toEqual([{ code: "notOneParagraph" }]);
  });

  it("remembers every text of each rule, however many, so a long list checked again in order is read once", () => {
    const check = releaseMarkdownCheck();
    const texts = Array.from({ length: CACHE_SIZE * 2 }, (_, index) => `*text* ${index}`);
    const first = texts.map((text) => check.problems(text, "option"));
    texts.forEach((text, index) => expect(check.problems(text, "option")).toBe(first[index]));
  });

  it("remembers its texts only as far as CACHE_WEIGHT goes, however few that is", () => {
    const check = releaseMarkdownCheck();
    const texts = Array.from(
      { length: 20 },
      (_, index) => `${String(index).padStart(2, "0")} ${"a".repeat(200_000)}`,
    );
    const first = texts.map((text) => check.problems(text, "side"));
    const kept = Math.floor(CACHE_WEIGHT / (texts[0]!.length * 32 + nodesOf(first[0]) * 96));
    expect(kept).toBeLessThan(texts.length);
    expect(check.problems(texts.at(-kept)!, "side")).toBe(first.at(-kept));
    expect(check.problems(texts.at(-kept - 1)!, "side")).not.toBe(first.at(-kept - 1));
  });

  it("checks a course's 1400 options ten times over in less time than reading them once", () => {
    // Timed against the first read on the same machine, not the clock: CI
    // runs the tests, coverage on, many times slower than a laptop.
    const check = releaseMarkdownCheck();
    const texts = Array.from(
      { length: 1400 },
      (_, index) => `**Option** ${index} with [a link](https://example.org/${index}) and \`code\``,
    );
    let started = performance.now();
    for (const text of texts) check.problems(text, "option");
    const read = performance.now() - started;
    started = performance.now();
    for (let pass = 0; pass < 10; pass++) for (const text of texts) check.problems(text, "option");
    const again = performance.now() - started;
    expect(again, `${Math.round(again)} ms against ${Math.round(read)} ms`).toBeLessThan(read);
  });

  it("keeps one text under a hash two texts share, and gives each its own", () => {
    vi.mocked(textHash).mockReturnValue(0);
    try {
      const check = releaseMarkdownCheck();
      const link = check.problems("[a](https://example.org)", "side");
      expect(check.problems("a\n\nb", "side")).toEqual([]);
      const again = check.problems("[a](https://example.org)", "side");
      expect(again).toEqual(link);
      expect(again).not.toBe(link);
      expect(check.problems("[a](https://example.org)", "side")).toBe(again);
    } finally {
      vi.mocked(textHash).mockRestore();
    }
    expect(textHash("a")).not.toBe(textHash("b"));
  });

  it("looks long texts of one length up in time linear in how many there are", () => {
    // Over 16,383 characters, a string is hashed by its length alone: a
    // Map keyed by such texts compares each lookup with all of them.
    const ratio = growth(
      (count) => {
        const check = releaseMarkdownCheck();
        const texts = Array.from(
          { length: count },
          (_, index) => `${"a".repeat(MAX_CHARS)}${String(index).padStart(6, "0")}`,
        );
        for (const text of texts) check.problems(text, "side");
        return () => {
          for (const text of texts) check.problems(text, "side");
        };
      },
      50,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("chunks a step's theory, each text once", () => {
    const check = releaseMarkdownCheck();
    const chunks = check.chunks("---\n\na\n\n---\n\nb");
    expect(chunks).toEqual({ chunks: 2, empty: 1 });
    expect(check.chunks("---\n\na\n\n---\n\nb")).toBe(chunks);
  });
});
