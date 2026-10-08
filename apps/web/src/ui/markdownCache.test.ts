import { describe, expect, it } from "vitest";
import { CACHE_SIZE, markdownBlocks, markdownPhrases } from "./markdownCache";

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
