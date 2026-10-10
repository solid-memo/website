import { describe, expect, it } from "vitest";
import { chunksOf, inspectChunks, splitAtRules } from "./chunks";
import { MAX_CHARS, parseMarkdown, type MdBlock } from "./parse";

const blocks = (text: string): MdBlock[] => parseMarkdown(text)!;
const paragraph = (value: string): MdBlock => ({ type: "paragraph", children: [{ type: "text", value }] });

describe("splitAtRules", () => {
  it("splits at top-level rules, leaving them out and keeping empty pieces", () => {
    expect(splitAtRules(blocks("a\n\n---\n\nb\n\n***\n\n___\n\nc"))).toEqual([
      [paragraph("a")],
      [paragraph("b")],
      [],
      [paragraph("c")],
    ]);
    expect(splitAtRules(blocks("---\n\na\n\n---"))).toEqual([[], [paragraph("a")], []]);
    expect(splitAtRules([])).toEqual([[]]);
  });

  it("does not split at a rule inside a list or a quote", () => {
    const nested = blocks("- a\n\n  ---\n\n> b\n>\n> ***");
    expect(splitAtRules(nested)).toEqual([nested]);
  });
});

describe("chunksOf", () => {
  it("drops empty pieces", () => {
    expect(chunksOf(blocks("---\n\na\n\n---\n\n---\n\nb\n\n---"))).toEqual([[paragraph("a")], [paragraph("b")]]);
  });

  it("is one chunk of a text without top-level rules, and one empty chunk of one that shows nothing", () => {
    expect(chunksOf(blocks("a\n\nb"))).toEqual([[paragraph("a"), paragraph("b")]]);
    expect(chunksOf(blocks("---\n\n***"))).toEqual([[]]);
    expect(chunksOf([])).toEqual([[]]);
  });

  it("resolves a reference link by a definition in another chunk", () => {
    const [first] = chunksOf(blocks("See [the spec][s].\n\n---\n\n[s]: https://solidproject.org/TR/protocol\n\nMore."));
    expect(first).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "See " },
          { type: "link", url: "https://solidproject.org/TR/protocol", children: [{ type: "text", value: "the spec" }] },
          { type: "text", value: "." },
        ],
      },
    ]);
  });
});

describe("inspectChunks", () => {
  it("counts the chunks shown and the empty pieces dropped", () => {
    expect(inspectChunks("a\n\n---\n\nb")).toEqual({ chunks: 2, empty: 0 });
    expect(inspectChunks("---\n\na\n\n---\n\n---\n\nb\n\n---")).toEqual({ chunks: 2, empty: 3 });
    expect(inspectChunks("---")).toEqual({ chunks: 1, empty: 2 });
  });

  it("finds no empty piece in a text without rules, even one that shows nothing", () => {
    expect(inspectChunks("a\n\n- b\n\n  ---")).toEqual({ chunks: 1, empty: 0 });
    expect(inspectChunks("")).toEqual({ chunks: 1, empty: 0 });
    expect(inspectChunks("[a]: https://a.example")).toEqual({ chunks: 1, empty: 0 });
  });

  it("counts a definition alone between rules as an empty piece, since it shows nothing", () => {
    expect(inspectChunks("a\n\n---\n\n[a]: https://a.example")).toEqual({ chunks: 1, empty: 1 });
  });

  it("is one chunk of a text past the parser's limits, shown as plain text", () => {
    expect(inspectChunks(`a\n\n---\n\n${"b".repeat(MAX_CHARS)}`)).toEqual({ chunks: 1, empty: 0 });
  });
});
