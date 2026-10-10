import { describe, expect, it, vi } from "vitest";
import { MAX_CHARS } from "@solid-memo/markdown/parse";
import { plainText } from "@solid-memo/markdown/plainText";
import { CACHE_SIZE, deckTextCheck, markdownBlocks, markdownChunks, markdownPhrases, plainTexts, releaseMarkdownCheck } from "./markdownCache";

vi.mock("@solid-memo/markdown/plainText", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/markdown/plainText")>();
  return { plainText: vi.fn(original.plainText) };
});

describe("markdownBlocks and markdownPhrases", () => {
  it("parse a text once, giving back what they gave before", () => {
    const blocks = markdownBlocks("*cached*");
    expect(blocks).toEqual([{ type: "paragraph", children: [{ type: "emphasis", children: [{ type: "text", value: "cached" }] }] }]);
    expect(markdownBlocks("*cached*")).toBe(blocks);
    const phrases = markdownPhrases("- a\n- b");
    expect(phrases).toEqual([{ type: "text", value: "a" }, { type: "text", value: "; " }, { type: "text", value: "b" }]);
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
    expect(vi.mocked(plainText).mock.calls.filter(([text]) => text === "**Coffee** shop")).toHaveLength(1);
  });
});

describe("deckTextCheck", () => {
  it("reads plain text and checks each field by the markdown package's rule", () => {
    const text = deckTextCheck();
    expect(text.plain("**Coffee**")).toBe("Coffee");
    expect(text.check("[a](https://example.org)", "side")).toEqual([{ code: "link", source: "[a](https://example.org)", autolink: false }]);
    expect(text.check("[example.org](https://example.org)", "prose")).toEqual([]);
    expect(text.check("a\n\nb", "option")).toEqual([{ code: "notOneParagraph" }]);
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

  it("chunks a step's theory, each text once", () => {
    const check = releaseMarkdownCheck();
    const chunks = check.chunks("---\n\na\n\n---\n\nb");
    expect(chunks).toEqual({ chunks: 2, empty: 1 });
    expect(check.chunks("---\n\na\n\n---\n\nb")).toBe(chunks);
  });
});
