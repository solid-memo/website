import { describe, expect, it } from "vitest";
import { parseInlineMarkdown } from "./inline";
import { MAX_CHARS } from "./parse";

const text = (value: string) => ({ type: "text", value }) as const;

describe("parseInlineMarkdown", () => {
  it("keeps text, code spans, emphasis and strong", () => {
    expect(parseInlineMarkdown("`git diff` with *staged* **changes**")).toEqual([
      { type: "inlineCode", value: "git diff" },
      text(" with "),
      { type: "emphasis", children: [text("staged")] },
      text(" "),
      { type: "strong", children: [text("changes")] },
    ]);
  });

  it("shows a link as its text, and a hard break as a space", () => {
    expect(parseInlineMarkdown("[*see*](https://x.example)  \nmore")).toEqual([
      { type: "emphasis", children: [text("see")] },
      text(" "),
      text("more"),
    ]);
  });

  it("joins paragraphs, list items, quotes and table cells into one run", () => {
    expect(parseInlineMarkdown("one\n\n- a\n- b\n  > c\n\n---\n\n| h | i |\n|-|-|\n| 1 |")).toEqual([
      text("one"),
      text(" "),
      text("a"),
      text("; "),
      text("b"),
      text(" "),
      text("c"),
      text(" "),
      text("h"),
      text(" · "),
      text("i"),
      text(" · "),
      text("1"),
    ]);
  });

  it("makes a code block one code span, its white space collapsed", () => {
    expect(parseInlineMarkdown("```\n  a\n\n    b  \n```")).toEqual([{ type: "inlineCode", value: "a b" }]);
  });

  it("leaves out what shows nothing", () => {
    expect(parseInlineMarkdown("---\n\n- \n\na")).toEqual([text("a")]);
  });

  it("reads nothing above MAX_CHARS", () => {
    expect(parseInlineMarkdown("a".repeat(MAX_CHARS + 1))).toBeNull();
  });
});
