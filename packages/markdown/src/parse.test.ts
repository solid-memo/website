// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  MAX_CHARS,
  MAX_DEPTH,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  DocumentError,
  hiddenControls,
  inspectMarkdown,
  parseDocument,
  parseMarkdown,
  visibleControls,
  type MdBlock,
} from "./parse";
import { cpuTime, growth } from "./testing/growth";

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

  it("reads emphasis that closes on punctuation next to Hangul, Japanese or Chinese", () => {
    expect(parseMarkdown("**스크립트(script)**라고 한다 *‘사과’*를 먹다")).toEqual([
      paragraph(
        { type: "strong", children: [text("스크립트(script)")] },
        text("라고 한다 "),
        { type: "emphasis", children: [text("‘사과’")] },
        text("를 먹다"),
      ),
    ]);
    expect(parseMarkdown("**強調。**この文")).toEqual([
      paragraph({ type: "strong", children: [text("強調。")] }, text("この文")),
    ]);
    // Underscores inside a word stay as they are, as in English.
    expect(parseMarkdown("__사람__들")).toEqual([paragraph(text("__사람__들"))]);
  });

  it("reads emphasis between Latin letters and punctuation as CommonMark does", () => {
    expect(parseMarkdown('foo*bar*baz a**"b"**c *(a)*b __foo__bar')).toEqual([
      paragraph(
        text("foo"),
        { type: "emphasis", children: [text("bar")] },
        text('baz a**"b"**c *(a)*b __foo__bar'),
      ),
    ]);
  });

  it("counts an emoji next to a delimiter as punctuation, as CommonMark does", () => {
    expect(parseMarkdown("*😀*a")).toEqual([paragraph(text("*😀*a"))]);
    expect(parseMarkdown("a**😀**b")).toEqual([paragraph(text("a**😀**b"))]);
    expect(parseMarkdown("*😀*")).toEqual([
      paragraph({ type: "emphasis", children: [text("😀")] }),
    ]);
  });

  it("reads nothing from empty text", () => {
    expect(parseMarkdown("")).toEqual([]);
  });

  it("folds a heading into a bold paragraph, so data never adds to the page's outline", () => {
    expect(parseMarkdown("## A *b*")).toEqual([
      paragraph({
        type: "strong",
        children: [text("A "), { type: "emphasis", children: [text("b")] }],
      }),
    ]);
  });

  it("reads fenced code with its language, normalized, and indented code without one", () => {
    expect(parseMarkdown("```HTTP extra words\nGET / HTTP/1.1\n\nHost: x\n```")).toEqual([
      { type: "code", lang: "http", value: "GET / HTTP/1.1\n\nHost: x" },
    ]);
    expect(parseMarkdown("    let x = 1;\n")).toEqual([{ type: "code", value: "let x = 1;" }]);
  });

  it("drops an info string that is not a language name", () => {
    expect(parseMarkdown('```{.class onclick="x"}\ny\n```')).toEqual([
      { type: "code", value: "y" },
    ]);
    expect(parseMarkdown(`\`\`\`${"a".repeat(21)}\ny\n\`\`\``)).toEqual([
      { type: "code", value: "y" },
    ]);
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
            {
              type: "list",
              ordered: false,
              start: 1,
              tight: true,
              items: [[paragraph(text("c"))]],
            },
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
    expect(parseMarkdown("| a |\n|---|")).toEqual([
      { type: "table", align: [null], rows: [[[text("a")]]] },
    ]);
  });

  it("drops a body row's cells past the header's, as GFM does", () => {
    expect(parseMarkdown("|a|\n|-|\n|b|c|d|")).toEqual([
      { type: "table", align: [null], rows: [[[text("a")]], [[text("b")]]] },
    ]);
    const long = `| a |\n|-|\n|${" b |".repeat(MAX_TABLE_CELLS)}`;
    expect(parseMarkdown(long)).toEqual([
      { type: "table", align: [null], rows: [[[text("a")]], [[text("b")]]] },
    ]);
  });

  it("shows a table over the column or cell cap as its source", () => {
    const wide = `|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(parseMarkdown(wide)).toEqual([
      paragraph(text(wide.split("\n")[0]!), { type: "break" }, text(wide.split("\n")[1]!)),
    ]);
    const atCap = `|${" a |".repeat(MAX_TABLE_COLUMNS)}\n|${"-|".repeat(MAX_TABLE_COLUMNS)}`;
    expect(parseMarkdown(atCap)![0]!.type).toBe("table");

    const rows = MAX_TABLE_CELLS / 2;
    const tall = `| a | b |\n|-|-|\n${"| 1 | 2 |\n".repeat(rows - 1)}`;
    expect(parseMarkdown(tall)![0]!.type).toBe("table");
    expect(parseMarkdown(`${tall}| 1 | 2 |\n`)![0]!.type).toBe("paragraph");
  });

  it("shows raw HTML as its source text, block and inline", () => {
    expect(parseMarkdown("<div>\n<script>alert(1)</script>\n</div>")).toEqual([
      paragraph(
        text("<div>"),
        { type: "break" },
        text("<script>alert(1)</script>"),
        { type: "break" },
        text("</div>"),
      ),
    ]);
    expect(parseMarkdown('a <img src=x onerror="alert(1)"> b')).toEqual([
      paragraph(text("a "), text('<img src=x onerror="alert(1)">'), text(" b")),
    ]);
  });

  it("shows a picture as its alt text, never loading it", () => {
    expect(
      parseMarkdown("![a *cat*](https://tracker.example/p.png) and ![][i]\n\n[i]: https://x/i.png"),
    ).toEqual([paragraph(text("a cat"), text(" and "), text(""))]);
    expect(parseMarkdown("![a\nb  \nc](p.png)")).toEqual([paragraph(text("a\nbc"))]);
  });

  it("keeps a link's URL as written, for the renderer to judge", () => {
    expect(
      parseMarkdown("[see](https://example.org/a) <https://b.example> [js](javascript:alert(1))"),
    ).toEqual([
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
        children: [
          text("a "),
          text("https://evil.example/"),
          text(" "),
          { type: "emphasis", children: [text("b")] },
        ],
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

  it("charges a link's or a picture's URL for each use, and shows a text past it as plain text", () => {
    const definition = `\n\n[r]: https://r.example/${"a".repeat(1_000)}`;
    for (const use of ["[a][r] ", "![a][r] "]) {
      expect(parseMarkdown(use.repeat(10) + definition)).not.toBeNull();
      expect(parseMarkdown(use.repeat(100) + definition)).toBeNull();
    }
    const inline = `[a](https://r.example/${"a".repeat(1_000)}) `;
    expect(parseMarkdown(inline.repeat(10))).not.toBeNull();
  });

  it("charges a URL by its bytes in UTF-8: two for é, three for €, four for an emoji", () => {
    // 1,000 UTF-16 code units of each, used `uses` times.
    const text = (unit: string, uses: number) =>
      `${"[a][r] ".repeat(uses)}\n\n[r]: https://r.example/${unit.repeat(1_000 / unit.length)}`;
    for (const unit of ["a", "é", "😀"]) expect(parseMarkdown(text(unit, 20))).not.toBeNull();
    expect(parseMarkdown(text("€", 20))).toBeNull();
    expect(parseMarkdown(text("a", 30))).not.toBeNull();
    for (const unit of ["é", "😀"]) expect(parseMarkdown(text(unit, 30))).toBeNull();
  });

  it("reads the corpus's look-alikes as CommonMark has them", () => {
    expect(parseMarkdown("M87* ln|x| `&aring;` &aring; \\&aring;")).toEqual([
      paragraph(text("M87* ln|x| "), { type: "inlineCode", value: "&aring;" }, text(" å &aring;")),
    ]);
    expect(parseMarkdown("git clone <url>")).toEqual([
      paragraph(text("git clone "), text("<url>")),
    ]);
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
      paragraph(text("a‮b"), text(" "), {
        type: "link",
        url: "https://e.example",
        children: [text("c⟨U+202E⟩d")],
      }),
    ]);
  });

  it("reads a list as loose where a blank line comes between its items or an item's blocks, as CommonMark does", () => {
    expect(parseMarkdown("- one\n\n  two")).toMatchObject([{ type: "list", tight: false }]);
    expect(parseMarkdown("- a\n  - b\n\n    c\n- d")).toMatchObject([
      { type: "list", tight: true, items: [[{}, { type: "list", tight: false }], [{}]] },
    ]);
    // A list whose items hold no paragraph shows nothing as bare text: tight.
    expect(parseMarkdown("- ```\n  x\n  ```\n- y")).toMatchObject([{ type: "list", tight: true }]);
  });

  it("reads a pipe table without its outer pipes, and an empty fenced code block", () => {
    expect(parseMarkdown("a | b\n--|--\nc | d")).toEqual([
      {
        type: "table",
        align: [null, null],
        rows: [
          [[text("a")], [text("b")]],
          [[text("c")], [text("d")]],
        ],
      },
    ]);
    expect(parseMarkdown("```\n```")).toEqual([{ type: "code", value: "" }]);
  });

  it("reads a code span's line endings as spaces, as CommonMark does", () => {
    expect(parseMarkdown("`a\nb`")).toEqual([paragraph({ type: "inlineCode", value: "a b" })]);
  });

  it("reads an email autolink as a mailto: link", () => {
    expect(parseMarkdown("<a@b.example>")).toEqual([
      paragraph({ type: "link", url: "mailto:a@b.example", children: [text("a@b.example")] }),
    ]);
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

  it("shows as plain text a text the parser would work on too long, whatever its shape", () => {
    for (const unit of ["a\n>>>>\n", "a\n>#\n", ">\na\n>>", "a\n>~~~\n", "a\n><div>\n", "[><!X"])
      expect(parseMarkdown(unit.repeat(Math.floor(MAX_CHARS / unit.length)))).toBeNull();
    expect(parseMarkdown("a\n>>>>\n".repeat(20))).not.toBeNull();
  });

  it("shows a table past its caps as its source without reading its rows, up to where markdown-it ends it", () => {
    const header = `|${"a|".repeat(128)}\n|${"-|".repeat(128)}\n`;
    // markdown-it ends a table whose short rows would take more than 65,536 cells to fill.
    const blocks = parseMarkdown(`${header}${"x\n".repeat(520)}`)!;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect((blocks[0] as Extract<MdBlock, { type: "paragraph" }>).children).toHaveLength(
      2 * (2 + 516) - 1,
    );
    // It ends where its rows do: at a line out of its list item, a quote, or indented code.
    const wide = `|${"a|".repeat(MAX_TABLE_COLUMNS + 1)}\n  |${"-|".repeat(MAX_TABLE_COLUMNS + 1)}\n`;
    expect(parseMarkdown(`- ${wide}  x\n|b\n`)).toMatchObject([
      { type: "list", items: [[{ type: "paragraph" }]] },
      { type: "paragraph", children: [{ value: "|b" }] },
    ]);
    expect(parseMarkdown(`${header}x\n> c`)).toMatchObject([
      { type: "paragraph" },
      { type: "quote" },
    ]);
    expect(parseMarkdown(`${header}x\n      y`)).toMatchObject([
      { type: "paragraph" },
      { type: "code", value: "  y" },
    ]);
  });

  it("shows quotes and lists nested past where the parser stops reading them as their source, whole", () => {
    let block = parseMarkdown(`${"> ".repeat(30)}x`)![0]!;
    for (let depth = 0; depth < MAX_DEPTH; depth++)
      block = (block as Extract<MdBlock, { type: "quote" }>).children[0]!;
    expect(block).toEqual(paragraph(text(`${"> ".repeat(30 - MAX_DEPTH)}x`)));
    block = parseMarkdown(`${"- ".repeat(30)}x`)![0]!;
    for (let depth = 0; depth < MAX_DEPTH; depth++)
      block = (block as Extract<MdBlock, { type: "list" }>).items[0]![0]!;
    expect(block).toEqual(paragraph(text(`${"- ".repeat(30 - MAX_DEPTH)}x`)));
    // A list ends where its items do, however deep it nests.
    expect(parseMarkdown(`${"- ".repeat(MAX_DEPTH + 1)}a\n\n# Next\n\nmore`)!.slice(1)).toEqual([
      paragraph({ type: "strong", children: [text("Next")] }),
      paragraph(text("more")),
    ]);
  });

  it("shows an autolink's text nested past MAX_DEPTH as its URL, without its angle brackets", () => {
    expect(
      JSON.stringify(parseMarkdown(`${"> ".repeat(MAX_DEPTH - 2)}<https://x.example>`)),
    ).toContain('"children":[{"type":"text","value":"https://x.example"}]');
  });
});

describe("parseDocument", () => {
  /** The DocumentError parseDocument throws on a text. */
  const refusal = (source: string): DocumentError => {
    try {
      parseDocument(source);
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentError);
      return error as DocumentError;
    }
    throw new Error(`parseDocument read ${JSON.stringify(source.slice(0, 40))}`);
  };

  it("keeps headings at their level and line, and reads every other block as parseMarkdown does", () => {
    const page = "# Title\n\nSome *text*.\n\n## Part\n\n- a\n- b\n\n### Detail\n\n> `code`";
    expect(parseDocument(page)).toEqual([
      { type: "heading", depth: 1, line: 1, children: [text("Title")] },
      paragraph(text("Some "), { type: "emphasis", children: [text("text")] }, text(".")),
      { type: "heading", depth: 2, line: 5, children: [text("Part")] },
      parseMarkdown("- a\n- b")![0],
      { type: "heading", depth: 3, line: 10, children: [text("Detail")] },
      { type: "quote", children: [paragraph({ type: "inlineCode", value: "code" })] },
    ]);
    expect(parseDocument("Setext\n===\n\n- ## In a list")).toEqual([
      { type: "heading", depth: 1, line: 1, children: [text("Setext")] },
      {
        type: "list",
        ordered: false,
        start: 1,
        tight: true,
        items: [[{ type: "heading", depth: 2, line: 4, children: [text("In a list")] }]],
      },
    ]);
  });

  it("reads a text however long the parser works on it, which parseMarkdown shows as plain text", () => {
    const page = "a\n>>>>\n".repeat(400);
    expect(parseMarkdown(page)).toBeNull();
    expect(parseDocument(page)[0]).toEqual(paragraph(text("a")));
  });

  it("reads a text past MAX_CHARS, which parseMarkdown shows as plain text", () => {
    const page = "A line of a long page, [linked](https://example.org/).\n\n".repeat(2_500);
    expect(page.length).toBeGreaterThan(130_000);
    expect(parseMarkdown(page)).toBeNull();
    const blocks = parseDocument(page);
    expect(blocks).toHaveLength(2_500);
    expect(blocks[2_499]).toEqual(parseMarkdown(page.slice(0, MAX_CHARS))![0]);
  });

  it("refuses raw HTML, block or inline, with its line", () => {
    expect(refusal("# Title\n\n<div>\nx\n</div>")).toMatchObject({ what: "raw HTML", line: 3 });
    const inline = refusal("a\nb <b>c</b>");
    expect(inline).toMatchObject({ what: "raw HTML", line: 2 });
    expect(inline.message).toBe("line 2: raw HTML");
    expect(inline.name).toBe("DocumentError");
  });

  it("refuses a picture, inline or by reference, and a link reference definition", () => {
    expect(refusal("![a cat](https://example.org/cat.png)")).toMatchObject({
      what: "a picture",
      line: 1,
    });
    expect(refusal("a\n\n![a cat][c]\n\n[c]: https://example.org/cat.png")).toMatchObject({
      what: "a picture",
      line: 3,
    });
    expect(refusal("[a][d]\n\n[d]: https://example.org/")).toMatchObject({
      what: "a link reference definition",
      line: 3,
    });
  });

  it("refuses what nests past MAX_DEPTH, block or inline", () => {
    expect(refusal(`${"> ".repeat(MAX_DEPTH + 2)}deep`)).toMatchObject({
      what: `nested deeper than MAX_DEPTH (${MAX_DEPTH})`,
      line: 1,
    });
    let open = "";
    let close = "";
    for (let level = 0; level < MAX_DEPTH + 2; level++) {
      const mark = level % 2 === 0 ? "_" : "*";
      open += `${mark}w `;
      close = ` w${mark}${close}`;
    }
    expect(refusal(`${open}x${close}`).what).toBe(`nested deeper than MAX_DEPTH (${MAX_DEPTH})`);
  });

  it("refuses a table past MAX_TABLE_COLUMNS or MAX_TABLE_CELLS", () => {
    const what = `a table past MAX_TABLE_COLUMNS (${MAX_TABLE_COLUMNS}) or MAX_TABLE_CELLS (${MAX_TABLE_CELLS})`;
    const wide = `|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(refusal(`# T\n\n${wide}`)).toMatchObject({ what, line: 3 });
    const tall = `| a | b |\n|-|-|\n${"| 1 | 2 |\n".repeat(MAX_TABLE_CELLS / 2)}`;
    expect(refusal(tall)).toMatchObject({ what, line: 1 });
    expect(parseDocument(tall.slice(0, -"| 1 | 2 |\n".length))[0]!.type).toBe("table");
  });
});

describe("inspectMarkdown", () => {
  const notesOf = (markdown: string) => inspectMarkdown(markdown)!.notes;

  it("tells one paragraph as written, and gives nothing past parseMarkdown's limits", () => {
    expect(inspectMarkdown("a *b*\n\n[r]: https://r.example")!.oneParagraph).toBe(true);
    for (const markdown of ["# A", "A\n-", "a\n\nb", "- a", ""])
      expect(inspectMarkdown(markdown)!.oneParagraph).toBe(false);
    expect(inspectMarkdown("a".repeat(MAX_CHARS + 1))).toBeNull();
  });

  it("notes nothing in text that is all prose", () => {
    expect(notesOf("Plain *words*, **strong** ones,\n\n> quoted\n\n---\n\n1. listed")).toEqual([]);
  });

  it("notes raw HTML, pictures and code, as written", () => {
    expect(
      notesOf("<div>\nx\n</div>\n\ngit clone <url> ![a](p.png) ![b][r] `c`\n\n    d\n\n[r]: q.png"),
    ).toEqual([
      { type: "html", source: "<div>\nx\n</div>" },
      { type: "html", source: "<url>" },
      { type: "image", source: "![a](p.png)" },
      { type: "image", source: "![b][r]" },
      { type: "code", value: "c" },
      { type: "code", value: "d" },
    ]);
  });

  it("notes links with their URL, a reference's resolved, their text as plain text, code in it not apart, and autolinks", () => {
    expect(
      notesOf("[*a* `b` ![c](x)](https://a.example) [d][r] <ex:title>\n\n[r]: https://r.example"),
    ).toEqual([
      {
        type: "link",
        url: "https://a.example",
        text: "a b c",
        source: "[*a* `b` ![c](x)](https://a.example)",
        autolink: false,
      },
      { type: "image", source: "![c](x)" },
      { type: "link", url: "https://r.example", text: "d", source: "[d][r]", autolink: false },
      { type: "link", url: "ex:title", text: "ex:title", source: "<ex:title>", autolink: true },
    ]);
    expect(notesOf("[a  \n<b>c</b>](https://a.example)")[0]).toMatchObject({
      type: "link",
      text: "a <b>c</b>",
    });
  });

  it("notes the character references CommonMark decodes outside code, not escaped ones, unknown names or an autolink's", () => {
    expect(
      notesOf(
        "&aring; &#229; &#xE5; &amp;aring; \\&ouml; \\\\&nbsp; &nosuchname; `&copy;` <https://x.example/?a&amp;b>",
      ),
    ).toEqual([
      { type: "characterReference", source: "&aring;" },
      { type: "characterReference", source: "&#229;" },
      { type: "characterReference", source: "&#xE5;" },
      { type: "characterReference", source: "&amp;" },
      { type: "characterReference", source: "&nbsp;" },
      { type: "code", value: "&copy;" },
      {
        type: "link",
        url: "https://x.example/?a&amp;b",
        text: "https://x.example/?a&amp;b",
        source: "<https://x.example/?a&amp;b>",
        autolink: true,
      },
    ]);
    expect(notesOf("| &aring; |\n|---|\n\n## &aring; again")).toEqual([
      { type: "characterReference", source: "&aring;" },
      { type: "characterReference", source: "&aring;" },
    ]);
  });

  it("notes a heading underlined with dashes, wherever it is, but no other heading, rule or table", () => {
    expect(notesOf("Intro\n---\n\nmore\n- - -")).toEqual([
      { type: "dashHeading", source: "Intro\n---" },
    ]);
    expect(notesOf("a\nb &aring;\n   -   \n\n> c\n> ---")).toEqual([
      { type: "dashHeading", source: "a\nb &aring;\n   -   " },
      { type: "characterReference", source: "&aring;" },
      { type: "dashHeading", source: "c\n> ---" },
    ]);
    expect(notesOf("a\n\n---\n\n## b\n\nc\n===\n\n| d |\n|---|\n\n```\ne\n---\n```")).toEqual([
      { type: "code", value: "e\n---" },
    ]);
  });

  it("notes raw HTML as written from its indentation", () => {
    expect(notesOf(" <div>\n  x")).toEqual([{ type: "html", source: " <div>\n  x" }]);
    expect(notesOf(">  <div>\n> x")).toEqual([{ type: "html", source: " <div>\n> x" }]);
    expect(notesOf("- <div>\n  x")).toEqual([{ type: "html", source: "<div>\n  x" }]);
    // A tab the quote or the item takes part of is theirs.
    expect(notesOf("> \t<div>")).toEqual([{ type: "html", source: "\t<div>" }]);
    expect(notesOf(">\t<div>")).toEqual([{ type: "html", source: "<div>" }]);
    expect(notesOf("- a\n\n \t<div>")).toEqual([{ type: "html", source: "<div>" }]);
  });

  it("notes what it notes as written in a table cell, after an escaped pipe, and in a heading", () => {
    expect(notesOf("| a \\| [b](https://b.example) | `c\\|d` |\n|---|---|")).toEqual([
      {
        type: "link",
        url: "https://b.example",
        text: "b",
        source: "[b](https://b.example)",
        autolink: false,
      },
      { type: "code", value: "c|d" },
    ]);
    expect(notesOf("## [a](https://a.example) &amp; ##")).toEqual([
      {
        type: "link",
        url: "https://a.example",
        text: "a",
        source: "[a](https://a.example)",
        autolink: false,
      },
      { type: "characterReference", source: "&amp;" },
    ]);
  });

  it("notes a line break nested past MAX_DEPTH with the spaces it takes, and the text before a link", () => {
    const quotes = "> ".repeat(MAX_DEPTH - 1);
    expect(notesOf(`${quotes}a  \nb`)).toEqual([{ type: "tooDeep", source: "  \n" }]);
    expect(notesOf(`${quotes}a\\\nb`)).toEqual([{ type: "tooDeep", source: "\\\n" }]);
    expect(notesOf(`${quotes}see [docs](https://d.example) now`)).toEqual([
      { type: "tooDeep", source: "[docs](https://d.example)" },
    ]);
  });

  it("notes what it notes as written, its line endings too, however its lines end", () => {
    expect(notesOf("a\r\n<b>\r\nc\r\n\r\nd\r\n---")).toEqual([
      { type: "html", source: "<b>" },
      { type: "dashHeading", source: "d\r\n---" },
    ]);
    expect(notesOf("a\rb <i>\rc")).toEqual([{ type: "html", source: "<i>" }]);
    const quotes = "> ".repeat(MAX_DEPTH - 1);
    expect(notesOf(`${quotes}a *b*\r\n${quotes}c`)).toEqual([
      { type: "tooDeep", source: "*b*" },
      { type: "tooDeep", source: `\r\n${quotes}c` },
    ]);
    // Text that shows as written but for how its lines end is no note.
    expect(notesOf(`${quotes}a\r\n<b>`)).toEqual([{ type: "tooDeep", source: "<b>" }]);
  });

  it("notes a table past its caps, and what nests past MAX_DEPTH, once each, as their source", () => {
    const wide = `|${" &aring; |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(notesOf(wide)).toEqual([{ type: "largeTable", source: wide }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH)}<b>`)).toEqual([{ type: "tooDeep", source: "<b>" }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}<b>`)).toEqual([{ type: "html", source: "<b>" }]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}a`)).toEqual([]);
    expect(notesOf(`${"> ".repeat(MAX_DEPTH - 1)}&amp;`)).toEqual([
      { type: "tooDeep", source: "&amp;" },
    ]);
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
    const hidden = [
      "\u3164",
      "\u115F",
      "\u2062",
      "\u00AD",
      "\u034F",
      "\u180E",
      "\uFE0F",
      "\u{E0041}",
      "\u{E0100}",
    ];
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
 * commonmark.js pathological tests, and those that made micromark slow),
 * each at the length cap, read in time linear in their length. A case
 * reads within `slowest` times what plain prose of the same length takes
 * (the best of three runs each), or else within `limit` times what its
 * first eighth takes read eight times over (`growth`): about once for
 * time linear in the length, eight times for quadratic. Both are CPU
 * time, not time on the clock, which a busy CI runner stretches more for
 * a long run than a short one. A budget in milliseconds would depend on
 * the machine: CI runs these tests about twenty times slower than a
 * laptop. The parser reads prose much faster than text dense with
 * blocks, such as a list of one-word items, which is linear all the same;
 * a quadratic case at the cap takes hundreds of times the prose. A slow
 * case takes seconds on CI, past vitest's default timeout, so the suite
 * sets its own.
 */
describe("pathological input", () => {
  const slowest = 25;
  const times = 8;
  const limit = 4;
  /** The CPU time of the fastest of three reads of a text, in microseconds. */
  const time = (markdown: string) => {
    let took = Infinity;
    for (let round = 0; round < 3; round++) {
      took = Math.min(
        took,
        cpuTime(() => parseMarkdown(markdown)),
      );
    }
    return took;
  };
  const fill = (unit: string, head = "", tail = "") =>
    head + unit.repeat(Math.floor((MAX_CHARS - head.length - tail.length) / unit.length)) + tail;
  it.each([
    ["nested block quotes", fill("> ", "", "a")],
    ["nested lists", fill("- ", "", "a")],
    ["nested ordered lists", fill("1. ", "", "a")],
    ["block quotes and lists nested 16 deep, line after line", fill(`${"> - ".repeat(8)}a\n`)],
    [
      "items holding a list or quote, 300 of them",
      fill("\nb", `${"- - a\n".repeat(150)}${"- > a\n".repeat(150)}`),
    ],
    ["items holding a list or quote, line after line", fill("- - a\n")],
    ["lazy lines, 200 to a run", fill(`- a\n${"b\n".repeat(200)}`)],
    ["lazy lines in a nested quote, run after run", fill(`> - > - a\n${"b\n".repeat(200)}`)],
    ["lazy lines, one long run", fill("b\n", "- a\n")],
    [
      "lazy lines with lines of non-breaking spaces among them",
      fill(`\u00a0\n${"b\n".repeat(150)}`, "- a\n"),
    ],
    [
      "lists nested by indentation",
      Array.from({ length: 139 }, (_, level) => `${"  ".repeat(level)}- a`).join("\n"),
    ],
    ["sibling list items", fill("- a\n")],
    ["loose sibling list items", fill("- a\n\n")],
    ["sibling block quotes", fill(">\n\n")],
    ["sibling block quotes, lines ended by carriage returns", fill(">\r\r")],
    ["block quotes among paragraphs, lines ended by carriage returns", fill("a\r>\r")],
    ["lazy lines ended by carriage returns", fill("b\r", "- a\r")],
    ["block quotes among paragraphs", fill("a\n>\n")],
    ["block quotes in sibling list items", fill("- >\n")],
    ["block quotes nested in one quote", fill("> a\n>\n> > b\n")],
    ["block quotes nested anew after code in a quote", fill("> >\n>     >\n")],
    ["block quotes nested anew before code in a quote", fill(">     >\n> >\n")],
    ["block quotes nested anew after code three quotes deep", fill("> > >\n> >     >\n")],
    ["block quotes after indented code", fill(">\n    >\n")],
    ["block quotes in and after list items", fill("- a\n  > b\n> c\n")],
    ["200 block quotes after paragraphs", fill("a\n\n", "", ">\n\n".repeat(200))],
    ["one block quote of many lines", fill("> a\n")],
    ["2,000 emphasis delimiters", fill("a", "*_".repeat(1_000))],
    ["unclosed links", fill("[")],
    ["unclosed images", fill("![")],
    ["images nested in images", fill("](b)", "![".repeat(3333))],
    ["images nested 200 deep in images", fill("a", `${"![".repeat(200)}${"](b)".repeat(200)}`)],
    ["images nested in a link's text", fill("](b)", `[${"![".repeat(3333)}`)],
    ["images nested in images, with no destination", fill("]()", `${"![".repeat(3333)}a`)],
    ["links and images nested in turn", fill("](b)", "[![".repeat(1000))],
    ["link openers and closers", fill("[a](")],
    ["emphasis openers", fill("*a ")],
    ["mixed delimiters", fill("*_")],
    ["strong closers", fill("a**")],
    ["emphasis delimiters among Hangul", fill("가", "**(가)**나".repeat(500))],
    ["strong closers after punctuation before Hangul", fill("가)**나")],
    ["underscores in words", fill("snake_case ")],
    ["backtick runs", fill("`a``")],
    ["entities", fill("&aaaaaaaa; ")],
    ["unclosed HTML comments", fill("<!--")],
    ["escaped backtick runs", fill("\\``\n")],
    ["escaped backtick runs before prose", fill("Plain words.\n\n", "\\``\n".repeat(490))],
    ["unclosed inline HTML comments", fill("a<!--\n")],
    ["unclosed inline HTML comments before prose", fill("Plain words.\n\n", "a<!--\n".repeat(400))],
    ["unclosed processing instructions", fill("a <?x ")],
    ["unclosed declarations", fill("a <!X ")],
    ["unclosed CDATA sections", fill("a<![CDATA[\n")],
    ["unclosed link titles", fill("[a](b\n(\n")],
    ["unclosed link titles after a space", fill("[](b (\n")],
    ["unclosed picture titles", fill("![a](b (\n")],
    ["unclosed link titles before prose", fill("Plain words.\n\n", "[](b (\n".repeat(370))],
    ["lists ended by paragraphs", fill("+ a\n\nb\n")],
    ["lists ended by paragraphs in one quote", fill("> - a\n>\n> b\n")],
    ["200 lists after prose", fill("Plain words.\n\n", "", "+ a\n\nb\n".repeat(200))],
    ["lists of an empty item", fill("+\n\n  b\n\n")],
    ["lists of an empty item after white space", fill("+ \n\n  b\n\n")],
    ["ordered lists of an empty item", fill("1.\n\n   b\n\n")],
    ["markers that cannot interrupt a paragraph", fill("2. c\n", "a\n")],
    ["table rows", fill("| 1 | 2 |\n", "| a | b |\n|-|-|\n")],
    ["table cells", fill("|", "| a | b |\n|-|-|\n")],
    ["reference definitions", fill("[a]: b\n")],
    ["200 setext headings", fill("a\n", "a\n=\n".repeat(200))],
    ["setext headings in a quote", fill(">a\n>=\n")],
    ["setext headings in a nested quote", fill(">>a\n>>=\n")],
    ["setext headings in a quote after spaces", fill("> a\n>  =\n")],
    ["setext headings of dashes in a quote", fill(">a\n>--\n")],
    ["setext headings indented in a list item", fill("    =\n    a\n", "-   a\n")],
    ["200 setext headings in a quote", fill(">a\n", ">a\n>=\n".repeat(200))],
    ["block quotes after each line of a paragraph", fill("a\n>>>>\n")],
    ["headings in quotes after each line of a paragraph", fill("a\n>#\n")],
    ["empty quotes between lazy lines", fill(">\na\n>>")],
    ["unclosed fences in quotes after each line of a paragraph", fill("a\n>~~~\n")],
    ["HTML in quotes after each line of a paragraph", fill("a\n><div>\n")],
    ["link openers before an unclosed declaration", fill("[><!X")],
    [
      "short rows of a wide table",
      fill(`|${"a|".repeat(128)}\n|${"-|".repeat(128)}\n${"x\n".repeat(508)}\n`),
    ],
    ["lines of `=` after a no-break space", fill("a\n\u00a0=\n")],
    ["lines of `=` after a form feed", fill("a\n\f=\n")],
    ["setext underlines", fill("=\n")],
    ["setext headings", fill("a\n-\n")],
    ["long setext underlines", fill("a\n==\n")],
    [
      "200 setext headings among long lines",
      fill(`${"a".repeat(80)}\n`, `${"a".repeat(80)}\n=\n`.repeat(200)),
    ],
  ])("reads %s in time", { timeout: 60_000 }, (_, input) => {
    expect(input.length).toBeLessThanOrEqual(MAX_CHARS);
    const base = time(fill("Plain words in a paragraph.\n"));
    const took = time(input);
    if (took < base * slowest) return;
    const ratio = growth(
      (length) => {
        const text = input.slice(0, length);
        return () => parseMarkdown(text);
      },
      Math.ceil(input.length / times),
      times,
    );
    expect(
      ratio,
      `${Math.round(took / 1000)} ms against ${Math.round(base / 1000)} ms of prose; the text took ${ratio.toFixed(1)} times its first ${times}th read ${times} times`,
    ).toBeLessThan(limit);
  });
});
