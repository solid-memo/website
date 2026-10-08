import { describe, expect, it } from "vitest";
import {
  MAX_CHARS,
  MAX_DELIMITERS,
  MAX_DEPTH,
  MAX_LINE_NESTING,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  MAX_UNDERLINES,
  hiddenControls,
  inspectMarkdown,
  parseMarkdown,
  visibleControls,
  type MdBlock,
} from "./parse";

const text = (value: string) => ({ type: "text", value }) as const;
const paragraph = (...children: object[]) => ({ type: "paragraph", children }) as MdBlock;

describe("parseMarkdown", () => {
  it("reads paragraphs, emphasis, strong, code spans and hard breaks", () => {
    expect(parseMarkdown("One *two* **three** `four`  \nfive\n\nsix")).toEqual([
      paragraph(
        text("One "),
        { type: "emphasis", children: [text("two")] },
        text(" "),
        { type: "strong", children: [text("three")] },
        text(" "),
        { type: "inlineCode", value: "four" },
        { type: "break" },
        text("five"),
      ),
      paragraph(text("six")),
    ]);
  });

  it("reads nothing from empty text", () => {
    expect(parseMarkdown("")).toEqual([]);
  });

  it("folds a heading into a bold paragraph, so data never adds to the page's outline", () => {
    expect(parseMarkdown("## A *b*")).toEqual([
      paragraph({ type: "strong", children: [text("A "), { type: "emphasis", children: [text("b")] }] }),
    ]);
  });

  it("reads fenced code with its language, normalised, and indented code without one", () => {
    expect(parseMarkdown("```HTTP extra words\nGET / HTTP/1.1\n\nHost: x\n```")).toEqual([
      { type: "code", lang: "http", value: "GET / HTTP/1.1\n\nHost: x" },
    ]);
    expect(parseMarkdown("    let x = 1;\n")).toEqual([{ type: "code", value: "let x = 1;" }]);
  });

  it("drops an info string that is not a language name", () => {
    expect(parseMarkdown('```{.class onclick="x"}\ny\n```')).toEqual([{ type: "code", value: "y" }]);
    expect(parseMarkdown(`\`\`\`${"a".repeat(21)}\ny\n\`\`\``)).toEqual([{ type: "code", value: "y" }]);
  });

  it("reads lists, ordered with their start, tight or loose, and nested", () => {
    expect(parseMarkdown("3. a\n4. b\n   - c")).toEqual([
      {
        type: "list",
        ordered: true,
        start: 3,
        tight: true,
        items: [
          [paragraph(text("a"))],
          [
            paragraph(text("b")),
            { type: "list", ordered: false, start: 1, tight: true, items: [[paragraph(text("c"))]] },
          ],
        ],
      },
    ]);
    expect(parseMarkdown("- a\n\n- b")).toMatchObject([{ type: "list", tight: false }]);
  });

  it("reads block quotes and thematic breaks", () => {
    expect(parseMarkdown("> quoted\n\n---")).toEqual([
      { type: "quote", children: [paragraph(text("quoted"))] },
      { type: "rule" },
    ]);
  });

  it("reads pipe tables with their alignment, a short row unpadded", () => {
    expect(parseMarkdown("| a | b | c |\n|:-|-:|:-:|\n| 1 |\n| `x` | y | z |")).toEqual([
      {
        type: "table",
        align: ["left", "right", "center"],
        rows: [
          [[text("a")], [text("b")], [text("c")]],
          [[text("1")]],
          [[{ type: "inlineCode", value: "x" }], [text("y")], [text("z")]],
        ],
      },
    ]);
    expect(parseMarkdown("| a |\n|---|")).toEqual([{ type: "table", align: [null], rows: [[[text("a")]]] }]);
  });

  it("drops a body row's cells past the header's, as GFM does", () => {
    expect(parseMarkdown("|a|\n|-|\n|b|c|d|")).toEqual([
      { type: "table", align: [null], rows: [[[text("a")]], [[text("b")]]] },
    ]);
    const long = `| a |\n|-|\n|${" b |".repeat(MAX_TABLE_CELLS)}`;
    expect(parseMarkdown(long)).toEqual([{ type: "table", align: [null], rows: [[[text("a")]], [[text("b")]]] }]);
  });

  it("shows a table over the column or cell cap as its source", () => {
    const wide = `|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(parseMarkdown(wide)).toEqual([paragraph(text(wide.split("\n")[0]!), { type: "break" }, text(wide.split("\n")[1]!))]);
    const atCap = `|${" a |".repeat(MAX_TABLE_COLUMNS)}\n|${"-|".repeat(MAX_TABLE_COLUMNS)}`;
    expect(parseMarkdown(atCap)![0]!.type).toBe("table");

    const rows = MAX_TABLE_CELLS / 2;
    const tall = `| a | b |\n|-|-|\n${"| 1 | 2 |\n".repeat(rows - 1)}`;
    expect(parseMarkdown(tall)![0]!.type).toBe("table");
    expect(parseMarkdown(`${tall}| 1 | 2 |\n`)![0]!.type).toBe("paragraph");
  });

  it("shows raw HTML as its source text, block and inline", () => {
    expect(parseMarkdown("<div>\n<script>alert(1)</script>\n</div>")).toEqual([
      paragraph(text("<div>"), { type: "break" }, text("<script>alert(1)</script>"), { type: "break" }, text("</div>")),
    ]);
    expect(parseMarkdown('a <img src=x onerror="alert(1)"> b')).toEqual([
      paragraph(text("a "), text('<img src=x onerror="alert(1)">'), text(" b")),
    ]);
  });

  it("shows a picture as its alt text, never loading it", () => {
    expect(parseMarkdown("![a *cat*](https://tracker.example/p.png) and ![][i]\n\n[i]: https://x/i.png")).toEqual([
      paragraph(text("a cat"), text(" and "), text("")),
    ]);
  });

  it("keeps a link's URL as written, for the renderer to judge", () => {
    expect(parseMarkdown("[see](https://example.org/a) <https://b.example> [js](javascript:alert(1))")).toEqual([
      paragraph(
        { type: "link", url: "https://example.org/a", children: [text("see")] },
        text(" "),
        { type: "link", url: "https://b.example", children: [text("https://b.example")] },
        text(" "),
        { type: "link", url: "javascript:alert(1)", children: [text("js")] },
      ),
    ]);
  });

  it("keeps only the text of a link in a link's text", () => {
    expect(parseMarkdown("[a <https://evil.example/> *b*](https://good.example/)")).toEqual([
      paragraph({
        type: "link",
        url: "https://good.example/",
        children: [text("a "), text("https://evil.example/"), text(" "), { type: "emphasis", children: [text("b")] }],
      }),
    ]);
  });

  it("resolves reference links against their definition, the first one winning, and drops definitions", () => {
    expect(
      parseMarkdown("[x][r] and [R]\n\n> [r]: javascript:alert(1)\n\n[r]: https://later.example"),
    ).toEqual([
      paragraph(
        { type: "link", url: "javascript:alert(1)", children: [text("x")] },
        text(" and "),
        { type: "link", url: "javascript:alert(1)", children: [text("R")] },
      ),
      { type: "quote", children: [] },
    ]);
    expect(parseMarkdown("[r]: https://alone.example")).toEqual([]);
  });

  it("reads the corpus's look-alikes as CommonMark has them", () => {
    expect(parseMarkdown("M87* ln|x| `&aring;` &aring; \\&aring;")).toEqual([
      paragraph(text("M87* ln|x| "), { type: "inlineCode", value: "&aring;" }, text(" å &aring;")),
    ]);
    expect(parseMarkdown("git clone <url>")).toEqual([paragraph(text("git clone "), text("<url>"))]);
    expect(parseMarkdown("<ex:title>")).toEqual([
      paragraph({ type: "link", url: "ex:title", children: [text("ex:title")] }),
    ]);
  });

  it("shows bidi and zero-width controls in code and link text as markers, not in prose", () => {
    expect(parseMarkdown("a‮b `c‮d`\n\n```\ne​f\n```\n\n[g⁦h](https://x.example)")).toEqual([
      paragraph(text("a‮b "), { type: "inlineCode", value: "c⟨U+202E⟩d" }),
      { type: "code", value: "e⟨U+200B⟩f" },
      paragraph({ type: "link", url: "https://x.example", children: [text("g⟨U+2066⟩h")] }),
    ]);
    expect(parseMarkdown("![a‮b](x) [![c‮d](x)](https://e.example)")).toEqual([
      paragraph(text("a‮b"), text(" "), { type: "link", url: "https://e.example", children: [text("c⟨U+202E⟩d")] }),
    ]);
  });

  it("reads nothing past MAX_LINE_NESTING containers opened on one line, a thematic break aside", () => {
    expect(parseMarkdown(`${"- ".repeat(MAX_LINE_NESTING)}a`)).not.toBeNull();
    expect(parseMarkdown(`ok\n${"> ".repeat(MAX_LINE_NESTING / 2)}${"1) ".repeat(MAX_LINE_NESTING / 2)}a`)).not.toBeNull();
    expect(parseMarkdown(`ok\n${"- ".repeat(MAX_LINE_NESTING + 1)}a`)).toBeNull();
    expect(parseMarkdown(`${">".repeat(MAX_LINE_NESTING + 1)}a`)).toBeNull();
    expect(parseMarkdown("* ".repeat(MAX_LINE_NESTING + 1))).toEqual([{ type: "rule" }]);
    expect(parseMarkdown(`${"-".repeat(MAX_LINE_NESTING + 1)}a`)).not.toBeNull();
  });

  it("reads nothing past MAX_DELIMITERS asterisks and underscores", () => {
    expect(parseMarkdown("*_".repeat(MAX_DELIMITERS / 2))).not.toBeNull();
    expect(parseMarkdown(`${"*_".repeat(MAX_DELIMITERS / 2)}*`)).toBeNull();
  });

  it("reads nothing past MAX_UNDERLINES lines that could underline a heading", () => {
    expect(parseMarkdown("a\n=\n".repeat(MAX_UNDERLINES / 2) + "b\n---\n".repeat(MAX_UNDERLINES / 2))).not.toBeNull();
    expect(parseMarkdown(`${"a\n=\n".repeat(MAX_UNDERLINES)}   ---  `)).toBeNull();
    expect(parseMarkdown("a\n- b\n".repeat(MAX_UNDERLINES + 1))).not.toBeNull();
  });

  it("reads nothing above MAX_CHARS", () => {
    expect(parseMarkdown("a".repeat(MAX_CHARS))).toHaveLength(1);
    expect(parseMarkdown("a".repeat(MAX_CHARS + 1))).toBeNull();
  });

  it("shows what nests deeper than MAX_DEPTH as its source", () => {
    const quotes = `${"> ".repeat(MAX_DEPTH + 2)}deep`;
    let block = parseMarkdown(quotes)![0]!;
    for (let depth = 1; depth < MAX_DEPTH; depth++) {
      expect(block.type).toBe("quote");
      block = (block as Extract<MdBlock, { type: "quote" }>).children[0]!;
    }
    expect(block).toEqual({ type: "quote", children: [paragraph(text("> > deep"))] });

    let open = "";
    let close = "";
    for (let level = 0; level < MAX_DEPTH + 2; level++) {
      const mark = level % 2 === 0 ? "_" : "*";
      open += `${mark}w `;
      close = ` w${mark}${close}`;
    }
    const deepest = JSON.stringify(parseMarkdown(`${open}x${close}`));
    expect(deepest.match(/"emphasis"/g)).toHaveLength(MAX_DEPTH - 1);
    expect(deepest).toContain('{"type":"text","value":"*w _w *w x w* w_ w*"}');
  });
});

describe("inspectMarkdown", () => {
  const notesOf = (markdown: string) => inspectMarkdown(markdown)!.notes;

  it("tells one paragraph as written, and gives nothing past parseMarkdown's limits", () => {
    expect(inspectMarkdown("a *b*\n\n[r]: https://r.example")!.oneParagraph).toBe(true);
    for (const markdown of ["# A", "A\n-", "a\n\nb", "- a", ""]) expect(inspectMarkdown(markdown)!.oneParagraph).toBe(false);
    expect(inspectMarkdown("a".repeat(MAX_CHARS + 1))).toBeNull();
  });

  it("notes nothing in text that is all prose", () => {
    expect(notesOf("Plain *words*, **strong** ones,\n\n> quoted\n\n---\n\n1. listed")).toEqual([]);
  });

  it("notes raw HTML, pictures and code, as written", () => {
    expect(notesOf("<div>\nx\n</div>\n\ngit clone <url> ![a](p.png) ![b][r] `c`\n\n    d\n\n[r]: q.png")).toEqual([
      { type: "html", source: "<div>\nx\n</div>" },
      { type: "html", source: "<url>" },
      { type: "image", source: "![a](p.png)" },
      { type: "image", source: "![b][r]" },
      { type: "code", value: "c" },
      { type: "code", value: "d" },
    ]);
  });

  it("notes links with their URL, a reference's resolved, their text as plain text, code in it not apart, and autolinks", () => {
    expect(notesOf("[*a* `b` ![c](x)](https://a.example) [d][r] <ex:title>\n\n[r]: https://r.example")).toEqual([
      { type: "link", url: "https://a.example", text: "a b c", source: "[*a* `b` ![c](x)](https://a.example)", autolink: false },
      { type: "image", source: "![c](x)" },
      { type: "link", url: "https://r.example", text: "d", source: "[d][r]", autolink: false },
      { type: "link", url: "ex:title", text: "ex:title", source: "<ex:title>", autolink: true },
    ]);
    expect(notesOf("[a  \n<b>c</b>](https://a.example)")[0]).toMatchObject({ type: "link", text: "a <b>c</b>" });
  });

  it("notes the character references CommonMark decodes outside code, not escaped ones, unknown names or an autolink's", () => {
    expect(notesOf("&aring; &#229; &#xE5; &amp;aring; \\&ouml; \\\\&nbsp; &nosuchname; `&copy;` <https://x.example/?a&amp;b>")).toEqual([
      { type: "characterReference", source: "&aring;" },
      { type: "characterReference", source: "&#229;" },
      { type: "characterReference", source: "&#xE5;" },
      { type: "characterReference", source: "&amp;" },
      { type: "characterReference", source: "&nbsp;" },
      { type: "code", value: "&copy;" },
      { type: "link", url: "https://x.example/?a&amp;b", text: "https://x.example/?a&amp;b", source: "<https://x.example/?a&amp;b>", autolink: true },
    ]);
    expect(notesOf("| &aring; |\n|---|\n\n## &aring; again")).toEqual([
      { type: "characterReference", source: "&aring;" },
      { type: "characterReference", source: "&aring;" },
    ]);
  });

  it("notes a table past its caps, and what nests past MAX_DEPTH, once each, as their source", () => {
    const wide = `|${" &aring; |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(notesOf(wide)).toEqual([{ type: "largeTable", source: wide }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH)}<b>`)).toEqual([{ type: "tooDeep", source: "<b>" }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}<b>`)).toEqual([{ type: "html", source: "<b>" }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}a`)).toEqual([]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}&amp;`)).toEqual([{ type: "tooDeep", source: "&amp;" }]);
  });
});

describe("hiddenControls", () => {
  it("names each bidi and zero-width control once, in the order they first come", () => {
    expect(hiddenControls("a‮b​c‮")).toEqual(["⟨U+202E⟩", "⟨U+200B⟩"]);
    expect(hiddenControls("plain")).toEqual([]);
  });
});

describe("visibleControls", () => {
  it("marks every bidi and zero-width control and leaves other text alone", () => {
    expect(visibleControls("؜​‏‪‮⁠⁦⁩﻿")).toBe(
      "⟨U+061C⟩⟨U+200B⟩⟨U+200F⟩⟨U+202A⟩⟨U+202E⟩⟨U+2060⟩⟨U+2066⟩⟨U+2069⟩⟨U+FEFF⟩",
    );
    expect(visibleControls("plain — ü 😀")).toBe("plain — ü 😀");
  });

  it("marks characters that show nothing or look blank yet count, astral ones by their code point", () => {
    const hidden = ["\u3164", "\u115F", "\u2062", "\u00AD", "\u034F", "\u180E", "\uFE0F", "\u{E0041}", "\u{E0100}"];
    expect(hidden.map((character) => visibleControls(`a${character}b`))).toEqual([
      "a⟨U+3164⟩b",
      "a⟨U+115F⟩b",
      "a⟨U+2062⟩b",
      "a⟨U+00AD⟩b",
      "a⟨U+034F⟩b",
      "a⟨U+180E⟩b",
      "a⟨U+FE0F⟩b",
      "a⟨U+E0041⟩b",
      "a⟨U+E0100⟩b",
    ]);
    expect(hiddenControls("x\u3164 = 1")).toEqual(["⟨U+3164⟩"]);
  });
});

/**
 * Inputs known to make Markdown parsers slow (the cmark and
 * commonmark.js pathological tests), each at the length cap, read
 * within a budget generous enough for a slow CI machine.
 */
describe("pathological input", () => {
  const budget = 2_000;
  const fill = (unit: string, head = "", tail = "") =>
    head + unit.repeat(Math.floor((MAX_CHARS - head.length - tail.length) / unit.length)) + tail;
  it.each([
    ["nested block quotes", fill("> ", "", "a")],
    ["nested lists", fill("- ", "", "a")],
    ["nested ordered lists", fill("1. ", "", "a")],
    ["block quotes and lists nested at the cap, line after line", fill(`${"> - ".repeat(MAX_LINE_NESTING / 2)}a\n`)],
    ["lists nested by indentation", Array.from({ length: 139 }, (_, level) => `${"  ".repeat(level)}- a`).join("\n")],
    ["sibling list items", fill("- a\n")],
    ["emphasis delimiters at the cap", fill("a", "*_".repeat(MAX_DELIMITERS / 2))],
    ["unclosed links", fill("[")],
    ["unclosed images", fill("![")],
    ["link openers and closers", fill("[a](")],
    ["emphasis openers", fill("*a ")],
    ["mixed delimiters", fill("*_")],
    ["strong closers", fill("a**")],
    ["underscores in words", fill("snake_case ")],
    ["backtick runs", fill("`a``")],
    ["entities", fill("&aaaaaaaa; ")],
    ["unclosed HTML comments", fill("<!--")],
    ["table rows", fill("| 1 | 2 |\n", "| a | b |\n|-|-|\n")],
    ["table cells", fill("|", "| a | b |\n|-|-|\n")],
    ["reference definitions", fill("[a]: b\n")],
    ["setext headings at the cap", fill("a\n", "a\n=\n".repeat(MAX_UNDERLINES))],
    ["setext underlines", fill("=\n")],
    ["setext headings", fill("a\n-\n")],
    ["long setext underlines", fill("a\n==\n")],
    ["setext headings at the cap among long lines", fill(`${"a".repeat(80)}\n`, `${"a".repeat(80)}\n=\n`.repeat(MAX_UNDERLINES))],
  ])("reads %s in time", (_, input) => {
    expect(input.length).toBeLessThanOrEqual(MAX_CHARS);
    const started = performance.now();
    parseMarkdown(input);
    expect(performance.now() - started).toBeLessThan(budget);
  });
});
