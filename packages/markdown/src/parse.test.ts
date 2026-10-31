// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  MAX_CHARS,
  MAX_DELIMITERS,
  MAX_DEPTH,
  MAX_LAZY_LINES,
  MAX_LINE_NESTING,
  MAX_LISTS,
  MAX_LOOKAHEAD,
  MAX_NESTED_LINES,
  MAX_QUOTES,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  MAX_UNDERLINES,
  DocumentError,
  hiddenControls,
  inspectMarkdown,
  parseDocument,
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

  it("reads nothing past MAX_LINE_NESTING containers opened on one line, a thematic break aside", () => {
    expect(parseMarkdown(`${"- ".repeat(MAX_LINE_NESTING)}a`)).not.toBeNull();
    expect(
      parseMarkdown(
        `ok\n${"> ".repeat(MAX_LINE_NESTING / 2)}${"1) ".repeat(MAX_LINE_NESTING / 2)}a`,
      ),
    ).not.toBeNull();
    expect(parseMarkdown(`ok\n${"- ".repeat(MAX_LINE_NESTING + 1)}a`)).toBeNull();
    expect(parseMarkdown(`${">".repeat(MAX_LINE_NESTING + 1)}a`)).toBeNull();
    expect(parseMarkdown("* ".repeat(MAX_LINE_NESTING + 1))).toEqual([{ type: "rule" }]);
    expect(parseMarkdown(`${"-".repeat(MAX_LINE_NESTING + 1)}a`)).not.toBeNull();
  });

  it("reads nothing past MAX_NESTED_LINES quotes and list items opened inside a list item", () => {
    expect(parseMarkdown("- - a\n".repeat(MAX_NESTED_LINES))).not.toBeNull();
    expect(parseMarkdown("- - a\n".repeat(MAX_NESTED_LINES + 1))).toBeNull();
    expect(parseMarkdown(`${"- > a\n".repeat(MAX_NESTED_LINES)}  - b`)).toBeNull();
    expect(
      parseMarkdown(
        `${"- a\n".repeat(MAX_NESTED_LINES)}${"   1. b\n".repeat(MAX_NESTED_LINES + 1)}`,
      ),
    ).toBeNull();
    expect(parseMarkdown("> - a\n> > b\n".repeat(MAX_QUOTES - 1))).not.toBeNull();
  });

  it("reads nothing past MAX_QUOTES block quotes, a quote's next lines aside", () => {
    expect(parseMarkdown(">\n\n".repeat(MAX_QUOTES))).not.toBeNull();
    expect(parseMarkdown(">\n\n".repeat(MAX_QUOTES + 1))).toBeNull();
    expect(parseMarkdown(">\n\n".repeat(6666))).toBeNull();
    expect(parseMarkdown(`${"a\n".repeat(MAX_QUOTES)}${"> a\n".repeat(MAX_QUOTES * 10)}`)).toEqual([
      expect.objectContaining({ type: "paragraph" }),
      expect.objectContaining({ type: "quote" }),
    ]);
    expect(parseMarkdown("> > a\n>> b\n".repeat(MAX_QUOTES * 2))).not.toBeNull();
    expect(
      parseMarkdown(`${"> a\n".repeat(MAX_QUOTES)}\n${"> a\n".repeat(MAX_QUOTES)}`),
    ).not.toBeNull();
    for (const unit of [
      ">\n\n",
      "> \n\n",
      " >a\n\n",
      ">\na\n",
      "a\n>\n",
      "- >\n",
      "> a\n>\n> > b\n",
      ">\r\r",
      ">\r\n\r\n",
      "a\r>\r",
      "> >\n>     >\n",
      ">     >\n> >\n",
      "> > >\n> >     >\n",
      "> >\n>\t  >\n",
      ">\n    >\n",
      "- a\n  > b\n> c\n",
      "1. a\n   > b\n> c\n",
    ]) {
      expect(parseMarkdown(unit.repeat(MAX_QUOTES + 1)), JSON.stringify(unit)).toBeNull();
      expect(
        parseMarkdown(unit.repeat(Math.floor(MAX_CHARS / unit.length))),
        JSON.stringify(unit),
      ).toBeNull();
    }
    // A `>` on a line indented less than the one above opens a quote of its own.
    expect(parseMarkdown("- a\n  > b\n> c\n".repeat(MAX_QUOTES / 2))).not.toBeNull();
    expect(parseMarkdown("- a\n  > b\n> c\n".repeat(MAX_QUOTES / 2 + 1))).toBeNull();
    expect(parseMarkdown("  > a\n> b\n".repeat(MAX_QUOTES))).toBeNull();
    expect(parseMarkdown("> a\n  > b\n".repeat(MAX_QUOTES))).not.toBeNull();
    // A `>` after four columns of white space is code, and counts as no quote.
    expect(parseMarkdown(">     > a\n".repeat(MAX_QUOTES * 2))).toEqual([
      expect.objectContaining({ type: "quote" }),
    ]);
    expect(parseMarkdown(">\n***\n".repeat(MAX_QUOTES + 1))).toBeNull();
    expect(parseMarkdown(">\n```\n```\n".repeat(MAX_QUOTES + 1))).toBeNull();
  });

  it("reads nothing past MAX_LAZY_LINES lines in a row that continue a quote's or item's paragraph without its markers", () => {
    expect(parseMarkdown(`- a\r${"b\r".repeat(MAX_LAZY_LINES + 1)}`)).toBeNull();
    const run = (lines: number) => "b\n".repeat(lines);
    expect(parseMarkdown(`- a\n${run(MAX_LAZY_LINES)}`)).not.toBeNull();
    expect(parseMarkdown(`- a\n${run(MAX_LAZY_LINES + 1)}`)).toBeNull();
    expect(parseMarkdown(`> a\n${run(MAX_LAZY_LINES + 1)}`)).toBeNull();
    expect(parseMarkdown(`- a\n${run(MAX_LAZY_LINES)}- c\n${run(MAX_LAZY_LINES)}`)).not.toBeNull();
    expect(parseMarkdown(`- a\n${run(MAX_LAZY_LINES)}\n${run(MAX_LAZY_LINES)}`)).not.toBeNull();
    expect(parseMarkdown(`- a\n${"  b\n".repeat(MAX_LAZY_LINES + 1)}`)).not.toBeNull();
    expect(parseMarkdown(`- a\n\`\`\`\n${run(MAX_LAZY_LINES + 1)}\`\`\``)).not.toBeNull();
    expect(parseMarkdown(run(MAX_LAZY_LINES + 1))).not.toBeNull();
    for (const space of ["\u00a0", "\f", "\v", "\ufeff", "\u3000"])
      expect(
        parseMarkdown(`- a\n${run(MAX_LAZY_LINES / 2)}${space}\n${run(MAX_LAZY_LINES / 2)}`),
      ).toBeNull();
    expect(
      parseMarkdown(`- a\n${run(MAX_LAZY_LINES / 2)} \t\n${run(MAX_LAZY_LINES / 2)}`),
    ).not.toBeNull();
  });

  it("reads nothing past MAX_LOOKAHEAD characters from openers that never close to the next blank line", () => {
    // k openers, one every u characters from o, in one paragraph: u k (k + 1) / 2 - k o characters ahead.
    const ahead = (u: number, o: number) => (k: number) => (u * k * (k + 1)) / 2 - k * o;
    for (const [unit, cost] of [
      ["<!a", ahead(3, 0)],
      ["<?a", ahead(3, 0)],
      ["<!--", ahead(4, 0)],
      ["<![CDATA[", ahead(9, 0)],
      ["[](b (", ahead(6, 1)],
      // An escaped run opens one a backtick shorter, which never closes; the run itself closes at the next.
      ["\\``", (k: number) => ahead(3, 1)(k) + 3 * k - 1],
    ] as const) {
      let fit = 0;
      while (cost(fit + 1) <= MAX_LOOKAHEAD) fit++;
      expect(parseMarkdown(unit.repeat(fit)), JSON.stringify(unit)).not.toBeNull();
      expect(parseMarkdown(unit.repeat(fit + 1)), JSON.stringify(unit)).toBeNull();
    }
    const fit = Math.floor((Math.sqrt(1 + (8 * MAX_LOOKAHEAD) / 3) - 1) / 2);
    // Each block's openers count to its end, and every block counts.
    expect(parseMarkdown(`${"<!a".repeat(fit)}\n\n${"<!a".repeat(fit)}`)).toBeNull();
    for (const blank of ["\n\n", "\n \t\n", "\r\r", "\r\n\r\n"])
      expect(parseMarkdown(`<!a${blank}`.repeat(2_000)), JSON.stringify(blank)).not.toBeNull();
    expect(parseMarkdown("<!a\n \n".repeat(fit))).toBeNull();
    expect(parseMarkdown(`<?${"a".repeat(MAX_CHARS - 2)}`)).not.toBeNull();
  });

  it("counts from each opener to its closer, or to the end of its paragraph", () => {
    // A text whose openers read `count` characters ahead: k `<!a` in one paragraph read
    // 3 k (k + 1) / 2, and each `<!a` or `<?` in a paragraph of its own 3 or 2.
    const reading = (count: number) => {
      let k = Math.floor((Math.sqrt(1 + (8 * count) / 3) - 1) / 2);
      let rest = count - (3 * k * (k + 1)) / 2;
      if (rest === 1) rest += 3 * k--;
      const twos = [0, 2, 1][rest % 3]!;
      return [
        "<!a".repeat(k),
        ...Array<string>(twos).fill("<?"),
        ...Array<string>((rest - 2 * twos) / 3).fill("<!a"),
      ].join("\n\n");
    };
    for (const [markdown, count] of [
      ["`a`", 3],
      ["`a``b`", 10],
      ["`a\n\n`", 3],
      ["\\``a`", 8],
      ["\\`a`", 3],
      ["\\\\``a``", 5],
      ["<!-- a -->", 7],
      ["<!-->", 2],
      ["<? a ?>", 5],
      ["<![CDATA[ a ]]>", 12],
      ["<!X a>", 5],
      ["<!X a", 5],
      ["[a](b)", 3],
      ["[a]( b)", 4],
      ['[a](b "t")', 6],
      ["[a](b 't')", 6],
      ["[a](b (t))", 6],
      ['[a](b "t\\"")', 8],
      ['[a](<b c> "t")', 10],
      ['[a](<b\nc> "t")', 4],
      ['[a](<b<c> "t")', 4],
      ['[a](<b\\>c> "t")', 11],
      ['[a](<b>"t")', 5],
      ['[a](b(c)d "t', 10],
      ["[a](b\\) (t", 8],
      ["[a](b\\\\) (t", 5],
      ["[a](b\\c (t", 8],
      ["[a](b", 3],
      ["[a](b\\", 4],
      ["[a](b c", 4],
      ['[a](b\n"t', 6],
      ['[a](b\n\n"t', 4],
    ] as const) {
      const at = (count: number) => parseMarkdown(`${reading(count)}\n\n${markdown}`);
      expect(at(MAX_LOOKAHEAD - count), JSON.stringify(markdown)).not.toBeNull();
      expect(at(MAX_LOOKAHEAD - count + 1), JSON.stringify(markdown)).toBeNull();
    }
  });

  it("reads closed code spans in linear time, as the parser does", () => {
    const items = Array.from({ length: 200 }, (_, i) => `- \`cmd${i}\` does a thing\n`).join("");
    const rows = Array.from({ length: 80 }, (_, i) => `| \`:s/a${i}/b/\` | \`:%s/x/y/g\` |\n`);
    const sentences = Array.from(
      { length: 100 },
      (_, i) => `Use \`git commit\` and \`git push\` ${i}.`,
    );
    for (const markdown of [
      items,
      `| Command | Example |\n| --- | --- |\n${rows.join("")}`,
      sentences.join(" "),
      "Run `npm run check`, then `npm run lint`.\n".repeat(400),
    ])
      expect(parseMarkdown(markdown)).not.toBeNull();
  });

  it("reads nothing past MAX_LISTS lists", () => {
    const lists = (unit: string, count: number) => parseMarkdown(unit.repeat(count));
    for (const unit of [
      "+ a\n\nb\n",
      "> - a\n>\n> b\n",
      "1. a\n\n b\n",
      "- a\n***\n",
      // An item that starts empty ends at a blank line, and the line after leaves the list.
      "+\n\n  b\n\n",
      "+\n\n  b\n",
      "+ \n\n  b\n\n",
      "1.\n\n   b\n\n",
      "1)\n\n   b\n\n",
      "> +\n>\n>   b\n",
    ]) {
      expect(lists(unit, MAX_LISTS), JSON.stringify(unit)).not.toBeNull();
      expect(lists(unit, MAX_LISTS + 1), JSON.stringify(unit)).toBeNull();
    }
    // A list of another marker is another list.
    expect(lists("- a\n+ b\n", MAX_LISTS / 2)).not.toBeNull();
    expect(lists("- a\n+ b\n", MAX_LISTS / 2 + 1)).toBeNull();
    expect(lists("1. a\n2) b\n", MAX_LISTS / 2 + 1)).toBeNull();
    // A list's next items, and the lines its items hold, open none.
    for (const unit of [
      "- a\n",
      "- a\n\n",
      "1. a\n\n   b\n",
      "-\ta\n\n\tb\n",
      "-      a\n  b\n",
      "*\n  b\n",
      "+\n  b\n\n",
      "+\n\n",
      "1.\n\n2. a\n",
      "> - a\n>   b\n",
    ])
      expect(lists(unit, MAX_LISTS * 2), JSON.stringify(unit)).not.toBeNull();
    // Each item's own sublist is a list; the sublist's next items are not.
    expect(lists("- a\n  - b\n  - c\n", MAX_NESTED_LINES / 2)).not.toBeNull();
    expect(lists("- a\n  - b\n  + c\n", MAX_LISTS / 2)).toBeNull();
    // Quotes opened anew, side by side or after a blank line, hold lists of their own.
    expect(lists("> - a\n>> - b\n", MAX_LISTS / 2 + 1)).toBeNull();
  });

  it("counts the markers in fenced code too", () => {
    const diff = (count: number) => "- a\n+ b\n".repeat(count / 2);
    // Each line of a long diff opens a list, inside a fence as outside.
    for (const fence of ["```diff\n", "~~~\n", "- a\n\n  ```\n", "> ```\n"]) {
      const markdown = (count: number) => `${fence}${diff(count)}\`\`\`\n`;
      expect(parseMarkdown(markdown(MAX_LISTS - 2)), JSON.stringify(fence)).not.toBeNull();
      expect(parseMarkdown(markdown(MAX_LISTS + 2)), JSON.stringify(fence)).toBeNull();
    }
    // No fence, closed or not, HTML or other, lets the lists after it go uncounted.
    for (const head of [
      "```\n```\n",
      "````\n`````\n",
      " ```\n```\n",
      "  ~~~\n~~~\n",
      "- a\n\n ```\n```\n",
      "<x\n```\n\n```\n",
      "<x\n~~~\n\n~~~\n",
      "a\n<x\n```\n\n```\n",
      "<div>\n\n```\n",
      "<!--\n\n```\n-->\n",
    ])
      for (const unit of ["+ a\n\nb\n", "> - a\n>\n> b\n"]) {
        const markdown = (count: number) => head + unit.repeat(count);
        expect(parseMarkdown(markdown(MAX_LISTS - 1)), JSON.stringify(head + unit)).not.toBeNull();
        expect(parseMarkdown(markdown(MAX_LISTS + 1)), JSON.stringify(head + unit)).toBeNull();
      }
  });

  it("counts lists after an indented fence, whatever the item above it", () => {
    const unit = "+ a\n\nb\n";
    // A thematic break, a quote or a lazy line in an item: the fence after it is still the item's.
    for (const head of ["- a\n  ***\n", "- a\n  > b\n", "- a\nb\n"]) {
      const markdown = (count: number) => `${head}  \`\`\`\nx\n\n${unit.repeat(count)}`;
      expect(parseMarkdown(markdown(MAX_LISTS - 1)), JSON.stringify(head)).not.toBeNull();
      expect(parseMarkdown(markdown(MAX_LISTS)), JSON.stringify(head)).toBeNull();
      expect(parseMarkdown(markdown(MAX_LISTS * 2)), JSON.stringify(head)).toBeNull();
    }
  });

  it("counts no list for a marker that cannot interrupt a paragraph, and every other", () => {
    const lists = (head: string, unit: string, count: number) =>
      parseMarkdown(head + unit.repeat(count));
    // An empty item, or an ordered one that starts other than at 1, is a line of the paragraph.
    for (const unit of ["2. c\nb\n", "2) c\n", "01. c\n", "+\nb\n", "* \n", "1.\n", "10. c\n  b\n"])
      expect(lists("a\n", unit, MAX_LISTS * 2), JSON.stringify(unit)).not.toBeNull();
    expect(lists("a\n\nb\n", "2. c\n", MAX_LISTS * 2)).not.toBeNull();
    // Where a paragraph is not open, or not surely, each marker that opens a list counts.
    for (const [unit, per] of [
      ["a\n- c\n\n", 1],
      ["a\n1. c\n\n", 1],
      ["a\n\n2. c\n\n", 1],
      ["# a\n2. c\n\n", 1],
      ["a\n-\n2. c\n\n- d\n\n", 2],
      ["> a\nb\n2) c\n- d\n", 2],
      ["- ```\n  a\n2. c\n", 2],
      ["<!--\n\na\n-->\n2. c\n\n", 1],
    ] as const) {
      expect(lists("", unit, MAX_LISTS / per), JSON.stringify(unit)).not.toBeNull();
      expect(() => parseDocument(unit.repeat(MAX_LISTS / per + 1)), JSON.stringify(unit)).toThrow(
        `more than MAX_LISTS (${MAX_LISTS}) lists`,
      );
    }
  });

  it("reads nothing past MAX_DELIMITERS asterisks and underscores", () => {
    expect(parseMarkdown("*_".repeat(MAX_DELIMITERS / 2))).not.toBeNull();
    expect(parseMarkdown(`${"*_".repeat(MAX_DELIMITERS / 2)}*`)).toBeNull();
  });

  it("reads nothing past MAX_UNDERLINES lines that could underline a heading", () => {
    expect(
      parseMarkdown("a\n=\n".repeat(MAX_UNDERLINES / 2) + "b\n---\n".repeat(MAX_UNDERLINES / 2)),
    ).not.toBeNull();
    expect(parseMarkdown(`${"a\n=\n".repeat(MAX_UNDERLINES)}   ---  `)).toBeNull();
    expect(parseMarkdown("a\n- b\n- c\n".repeat(MAX_UNDERLINES / 2 + 1))).not.toBeNull();
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

  it("reads a text past MAX_LOOKAHEAD, which grows with a page as MAX_CHARS does", () => {
    const page = `a${"<!a".repeat(1_000)}`;
    expect(parseMarkdown(page)).toBeNull();
    expect(parseDocument(page)).toHaveLength(1);
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

  it("refuses a text past the parser's other limits, naming the line where one says it", () => {
    expect(refusal(`${"*_".repeat(MAX_DELIMITERS / 2)}*`)).toMatchObject({
      what: `more than MAX_DELIMITERS (${MAX_DELIMITERS}) * and _`,
      line: null,
    });
    const underlines = refusal("a\n=\n".repeat(MAX_UNDERLINES + 1));
    expect(underlines).toMatchObject({
      what: `more than MAX_UNDERLINES (${MAX_UNDERLINES}) lines that could underline a heading`,
      line: null,
    });
    expect(underlines.message).toBe(underlines.what);
    expect(refusal(`ok\n${"- ".repeat(MAX_LINE_NESTING + 1)}a`)).toMatchObject({
      what: `more than MAX_LINE_NESTING (${MAX_LINE_NESTING}) quotes and list items opened on one line`,
      line: 2,
    });
    expect(refusal("- - a\n".repeat(MAX_NESTED_LINES + 1))).toMatchObject({
      what: `more than MAX_NESTED_LINES (${MAX_NESTED_LINES}) quotes and list items opened inside a list item`,
      line: MAX_NESTED_LINES + 1,
    });
    expect(refusal(`ok\n\n${">\n\n".repeat(MAX_QUOTES + 1)}`)).toMatchObject({
      what: `more than MAX_QUOTES (${MAX_QUOTES}) block quotes`,
      line: 3 + MAX_QUOTES * 2,
    });
    expect(refusal(`- a\n${"b\n".repeat(MAX_LAZY_LINES + 1)}`)).toMatchObject({
      what: `more than MAX_LAZY_LINES (${MAX_LAZY_LINES}) lazy continuation lines in a row`,
      line: MAX_LAZY_LINES + 2,
    });
    expect(refusal("+ a\n\nb\n".repeat(MAX_LISTS + 1))).toMatchObject({
      what: `more than MAX_LISTS (${MAX_LISTS}) lists`,
      line: MAX_LISTS * 3 + 1,
    });
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
 * commonmark.js pathological tests, and micromark's own), each at the
 * length cap, read in time linear in their length: within `slowest`
 * times what plain prose of the same length takes on the same machine,
 * the better of two each. A wall-clock budget would depend on the
 * machine: CI runs these tests about twenty times slower than a laptop.
 * Text people write reads within about 11 times the prose; a quadratic
 * case at the cap takes 40 times or more. A case near the caps takes
 * seconds on CI, past vitest's default timeout, so the suite sets its own.
 */
describe("pathological input", () => {
  const slowest = 25;
  const fill = (unit: string, head = "", tail = "") =>
    head + unit.repeat(Math.floor((MAX_CHARS - head.length - tail.length) / unit.length)) + tail;
  it.each([
    ["nested block quotes", fill("> ", "", "a")],
    ["nested lists", fill("- ", "", "a")],
    ["nested ordered lists", fill("1. ", "", "a")],
    [
      "block quotes and lists nested at the cap, line after line",
      fill(`${"> - ".repeat(MAX_LINE_NESTING / 2)}a\n`),
    ],
    [
      "items holding a list or quote, at the cap",
      fill(
        "\nb",
        `${"- - a\n".repeat(MAX_NESTED_LINES / 2)}${"- > a\n".repeat(MAX_NESTED_LINES / 2)}`,
      ),
    ],
    ["items holding a list or quote, past the cap", fill("- - a\n")],
    ["lazy lines at the cap, run after run", fill(`- a\n${"b\n".repeat(MAX_LAZY_LINES)}`)],
    [
      "lazy lines in a nested quote, run after run",
      fill(`> - > - a\n${"b\n".repeat(MAX_LAZY_LINES)}`),
    ],
    ["lazy lines past the cap", fill("b\n", "- a\n")],
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
    ["block quotes at the cap after paragraphs", fill("a\n\n", "", ">\n\n".repeat(MAX_QUOTES))],
    ["one block quote of many lines", fill("> a\n")],
    ["emphasis delimiters at the cap", fill("a", "*_".repeat(MAX_DELIMITERS / 2))],
    ["unclosed links", fill("[")],
    ["unclosed images", fill("![")],
    ["link openers and closers", fill("[a](")],
    ["emphasis openers", fill("*a ")],
    ["mixed delimiters", fill("*_")],
    ["strong closers", fill("a**")],
    [
      "emphasis delimiters among Hangul at the cap",
      fill("가", "**(가)**나".repeat(MAX_DELIMITERS / 4)),
    ],
    ["strong closers after punctuation before Hangul", fill("가)**나")],
    ["underscores in words", fill("snake_case ")],
    ["backtick runs", fill("`a``")],
    ["entities", fill("&aaaaaaaa; ")],
    ["unclosed HTML comments", fill("<!--")],
    ["escaped backtick runs", fill("\\``\n")],
    ["escaped backtick runs at the cap", fill("Plain words.\n\n", "\\``\n".repeat(490))],
    ["unclosed inline HTML comments", fill("a<!--\n")],
    ["unclosed inline HTML comments at the cap", fill("Plain words.\n\n", "a<!--\n".repeat(400))],
    ["unclosed processing instructions", fill("a <?x ")],
    ["unclosed declarations", fill("a <!X ")],
    ["unclosed CDATA sections", fill("a<![CDATA[\n")],
    ["unclosed link titles", fill("[a](b\n(\n")],
    ["unclosed link titles after a space", fill("[](b (\n")],
    ["unclosed picture titles", fill("![a](b (\n")],
    ["unclosed link titles at the cap", fill("Plain words.\n\n", "[](b (\n".repeat(370))],
    ["lists ended by paragraphs", fill("+ a\n\nb\n")],
    ["lists ended by paragraphs in one quote", fill("> - a\n>\n> b\n")],
    ["lists at the cap", fill("Plain words.\n\n", "", "+ a\n\nb\n".repeat(MAX_LISTS))],
    ["lists of an empty item", fill("+\n\n  b\n\n")],
    ["lists of an empty item after white space", fill("+ \n\n  b\n\n")],
    ["ordered lists of an empty item", fill("1.\n\n   b\n\n")],
    ["markers that cannot interrupt a paragraph", fill("2. c\n", "a\n")],
    ["table rows", fill("| 1 | 2 |\n", "| a | b |\n|-|-|\n")],
    ["table cells", fill("|", "| a | b |\n|-|-|\n")],
    ["reference definitions", fill("[a]: b\n")],
    ["setext headings at the cap", fill("a\n", "a\n=\n".repeat(MAX_UNDERLINES))],
    ["setext underlines", fill("=\n")],
    ["setext headings", fill("a\n-\n")],
    ["long setext underlines", fill("a\n==\n")],
    [
      "setext headings at the cap among long lines",
      fill(`${"a".repeat(80)}\n`, `${"a".repeat(80)}\n=\n`.repeat(MAX_UNDERLINES)),
    ],
  ])("reads %s in time", { timeout: 60_000 }, (_, input) => {
    expect(input.length).toBeLessThanOrEqual(MAX_CHARS);
    const baseline = fill("Plain words in a paragraph.\n");
    let base = Infinity;
    let took = Infinity;
    for (let round = 0; round < 2; round++) {
      let started = performance.now();
      parseMarkdown(baseline);
      base = Math.min(base, performance.now() - started);
      started = performance.now();
      parseMarkdown(input);
      took = Math.min(took, performance.now() - started);
    }
    expect(took, `${Math.round(took)} ms against ${Math.round(base)} ms`).toBeLessThan(
      base * slowest,
    );
  });
});
