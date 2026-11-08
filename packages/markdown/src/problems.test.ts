// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { liveLink } from "./links";
import { MAX_CHARS, MAX_DEPTH, MAX_TABLE_COLUMNS } from "./parse";
import { markdownProblems, OPTION, PROSE, SIDE } from "./problems";
import { growth } from "./testing/growth";

// The links module as it is, its liveLink counted, so a test can tell how often a URL is read.
vi.mock("./links", async (importOriginal) => {
  const links = await importOriginal<typeof import("./links")>();
  return { ...links, liveLink: vi.fn(links.liveLink) };
});

describe("markdownProblems", () => {
  it("finds nothing in prose, code, lists and tables", () => {
    const text =
      "Use `git diff --staged`:\n\n```sh\ngit diff --staged\n```\n\n- a\n- b\n\n| A | B |\n|---|---|\n| `x` | *y* |";
    expect(markdownProblems(text, SIDE)).toEqual([]);
    expect(markdownProblems(text, PROSE)).toEqual([]);
  });

  it("reads the corpus's look-alikes: plain-text habits that Markdown reads otherwise", () => {
    expect(markdownProblems("M87* ln|x| `&aring;` \\&aring;", SIDE)).toEqual([]);
    expect(markdownProblems("git clone <url>", SIDE)).toEqual([{ code: "html", source: "<url>" }]);
    expect(markdownProblems("&aring;", SIDE)).toEqual([
      { code: "characterReference", source: "&aring;" },
    ]);
    expect(markdownProblems('"<ex:title>"', OPTION)).toEqual([
      { code: "link", source: "<ex:title>", autolink: true },
    ]);
    // A rule meant under a line of text, with no blank line between them, underlines it as a heading.
    expect(markdownProblems("Intro\n---\n\nMore.", PROSE)).toEqual([
      { code: "dashHeading", source: "Intro\n---" },
    ]);
  });

  it("names a text past the parser's limits, and nothing else in it", () => {
    expect(markdownProblems(`<b>${"a".repeat(MAX_CHARS)}`, PROSE)).toEqual([
      { code: "tooLong", length: MAX_CHARS + 3 },
    ]);
    // A block quote after each line of a paragraph: past the parser's work.
    expect(markdownProblems(`<b>${"a\n>>>>\n".repeat(400)}`, PROSE)).toEqual([
      { code: "tooComplex" },
    ]);
  });

  it("names raw HTML and pictures, which are not shown", () => {
    expect(
      markdownProblems("<div>x</div>\n\na <i>b</i> ![c](https://c.example/c.png)", PROSE),
    ).toEqual([
      { code: "html", source: "<div>x</div>" },
      { code: "html", source: "<i>" },
      { code: "html", source: "</i>" },
      { code: "image", source: "![c](https://c.example/c.png)" },
    ]);
  });

  it("names what nests too deep, and a table too large, which show as their source", () => {
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH)}*a*`, PROSE)).toEqual([
      { code: "tooDeep", source: "*a*" },
    ]);
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH - 1)}a *b*`, PROSE)).toEqual([
      { code: "tooDeep", source: "*b*" },
    ]);
    const wide = `|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(markdownProblems(wide, PROSE)).toEqual([{ code: "largeTable", source: wide }]);
  });

  it("passes what nests to the limit but shows as written, plain text", () => {
    const list = Array.from(
      { length: MAX_DEPTH - 1 },
      (_, level) => `${"  ".repeat(level)}- ${level}`,
    ).join("\n");
    for (const text of [`${"> ".repeat(MAX_DEPTH - 1)}a`, `${"> ".repeat(MAX_DEPTH)}a`, list]) {
      expect(markdownProblems(text, PROSE)).toEqual([]);
    }
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH - 1)}a \\* b`, PROSE)).toEqual([
      { code: "tooDeep", source: "a \\* b" },
    ]);
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH)}a\nb`, PROSE)).toEqual([
      { code: "tooDeep", source: "a\nb" },
    ]);
  });

  it("names every link in a field without links, references and autolinks too", () => {
    expect(
      markdownProblems(
        "[a](https://a.example) [b][r] <https://c.example>\n\n[r]: https://r.example",
        SIDE,
      ),
    ).toEqual([
      { code: "link", source: "[a](https://a.example)", autolink: false },
      { code: "link", source: "[b][r]", autolink: false },
      { code: "link", source: "<https://c.example>", autolink: true },
    ]);
  });

  it("accepts in prose a link that is followed and says where it leads", () => {
    for (const link of [
      "[the specification](https://solidproject.org/TR/protocol)",
      "[solidproject.org](https://solidproject.org/TR/protocol)",
      "[www.solidproject.org](https://www.solidproject.org/)",
      "[solidproject.org](https://www.solidproject.org/)",
      "[https://solidproject.org/TR](https://solidproject.org/TR/protocol)",
      "<https://solidproject.org/>",
      "[Bücher.example](https://xn--bcher-kva.example/)",
      "[Bu\u0308cher.example](https://xn--bcher-kva.example/)",
      "<https://my_site.example/>",
      "[https://[broken](https://x.example/)",
    ]) {
      expect(markdownProblems(link, PROSE)).toEqual([]);
    }
  });

  it("names in prose a link that is not followed", () => {
    expect(
      markdownProblems(
        "[a](http://a.example) [b](javascript:alert(1)) [c](https://u:p@c.example) [d](/d) <mailto:e@e.example>",
        PROSE,
      ),
    ).toEqual([
      { code: "linkNotFollowed", url: "http://a.example" },
      { code: "linkNotFollowed", url: "javascript:alert(1)" },
      { code: "linkNotFollowed", url: "https://u:p@c.example" },
      { code: "linkNotFollowed", url: "/d" },
      { code: "linkNotFollowed", url: "mailto:e@e.example" },
    ]);
  });

  it("names link text that reads as an address or a host other than the link's", () => {
    expect(
      markdownProblems(
        "[bank.example](https://evil.example/) [https://bank.example/login](https://evil.example/) [example.org](https://notexample.org/) [bаnk.example](https://bank.example/) [github.io](https://evil.github.io/) [example.org](https://docs.example.org/) [package.json](https://docs.npmjs.com/)",
        PROSE,
      ),
    ).toEqual([
      { code: "linkHost", text: "bank.example", host: "evil.example" },
      { code: "linkHost", text: "https://bank.example/login", host: "evil.example" },
      { code: "linkHost", text: "example.org", host: "notexample.org" },
      { code: "linkHost", text: "bаnk.example", host: "bank.example" },
      { code: "linkHost", text: "github.io", host: "evil.github.io" },
      { code: "linkHost", text: "example.org", host: "docs.example.org" },
      { code: "linkHost", text: "package.json", host: "docs.npmjs.com" },
    ]);
  });

  it("names an address whose host as written is not the one it opens", () => {
    expect(
      markdownProblems(
        "<https://login.bank.example%2E%65%76%69%6C%2E%63%6F%6D/> <https://bank.example\u3002evil.com/> [https://bank.example@evil.com/](https://evil.com/) [https://0x7f.1/](https://127.0.0.1/) [WWW.Example.org](https://example.org/)",
        PROSE,
      ),
    ).toEqual([
      {
        code: "linkHost",
        text: "https://login.bank.example%2E%65%76%69%6C%2E%63%6F%6D/",
        host: "login.bank.example.evil.com",
      },
      {
        code: "linkHost",
        text: "https://bank.example\u3002evil.com/",
        host: "bank.example.evil.com",
      },
      { code: "linkHost", text: "https://bank.example@evil.com/", host: "evil.com" },
      { code: "linkHost", text: "https://0x7f.1/", host: "127.0.0.1" },
    ]);
  });

  it("names bidi and zero-width controls in code and in links", () => {
    expect(
      markdownProblems(
        "a‮b `c‮d`\n\n```\ne​f\n```\n\n[g⁦h](https://x.example/) [i](https://x.example/‮)",
        PROSE,
      ),
    ).toEqual([
      { code: "hiddenControl", controls: ["⟨U+202E⟩"], in: "code" },
      { code: "hiddenControl", controls: ["⟨U+200B⟩"], in: "code" },
      { code: "hiddenControl", controls: ["⟨U+2066⟩"], in: "link" },
      { code: "hiddenControl", controls: ["⟨U+202E⟩"], in: "link" },
    ]);
    expect(markdownProblems("[`a‮`](https://x.example/)", PROSE)).toEqual([
      { code: "hiddenControl", controls: ["⟨U+202E⟩"], in: "link" },
    ]);
    expect(markdownProblems("[a‮](b)", SIDE)).toEqual([
      { code: "link", source: "[a‮](b)", autolink: false },
      { code: "hiddenControl", controls: ["⟨U+202E⟩"], in: "link" },
    ]);
  });

  it("checks a reference link's URL once for each use, its text's controls first", () => {
    const text = "[a‮][r] [b][r] [c‮][r]\n\n[r]: https://r.example/⁦‮";
    expect(markdownProblems(text, PROSE)).toEqual([
      { code: "hiddenControl", controls: ["⟨U+202E⟩", "⟨U+2066⟩"], in: "link" },
      { code: "hiddenControl", controls: ["⟨U+2066⟩", "⟨U+202E⟩"], in: "link" },
      { code: "hiddenControl", controls: ["⟨U+202E⟩", "⟨U+2066⟩"], in: "link" },
    ]);
    expect(markdownProblems("[a][r] [b][r]\n\n[r]: http://r.example/", PROSE)).toEqual([
      { code: "linkNotFollowed", url: "http://r.example/" },
      { code: "linkNotFollowed", url: "http://r.example/" },
    ]);
  });

  it("reads each distinct URL once, however often the text links to it", () => {
    vi.mocked(liveLink).mockClear();
    const text =
      "[a][r] [b][r] [c][s] [d](https://r.example/)\n\n[r]: https://r.example/\n[s]: https://s.example/";
    expect(markdownProblems(text, PROSE)).toEqual([]);
    expect(vi.mocked(liveLink).mock.calls).toEqual([
      ["https://r.example/"],
      ["https://s.example/"],
    ]);
  });

  /**
   * One reference link with a long URL, used as often as the text has
   * room for: each use is checked with its URL, so the parser charges
   * the URL's length for each use (MAX_WORK), and a text past it is
   * shown as plain text. Its check takes time linear in the text's
   * length: the text eight times as long takes under four times what
   * the short one does eight times over (about one for linear, eight for
   * quadratic). Both lengths are past MAX_WORK.
   */
  it("checks a long URL used again and again in time linear in the text's length", () => {
    const card = (length: number) => {
      const uses = Math.floor(length / 8);
      const head = `[a]: <https://e.example/${"‮".repeat(length - 4 * uses - 30)}>\n\n`;
      return head + "[a] ".repeat(uses);
    };
    expect(markdownProblems(card(2_000), PROSE)).toEqual([{ code: "tooComplex" }]);
    expect(markdownProblems(card(16_000), PROSE)).toEqual([{ code: "tooComplex" }]);
    const ratio = growth(
      (length) => {
        const text = card(length);
        return () => markdownProblems(text, PROSE);
      },
      2_000,
      8,
    );
    expect(
      ratio,
      `the text at 16,000 characters took ${ratio.toFixed(1)} times the one at 2,000 checked 8 times`,
    ).toBeLessThan(4);
  });

  it("holds an option to one paragraph", () => {
    expect(markdownProblems("`409 Conflict`, *always*", OPTION)).toEqual([]);
    expect(markdownProblems("a  \nb", OPTION)).toEqual([]);
    expect(markdownProblems("a\n\n[r]: https://r.example", OPTION)).toEqual([]);
    for (const text of ["a\n\nb", "- a", "```\na\n```", "", "# a\n\nb", "# a", "a\n==="]) {
      expect(markdownProblems(text, OPTION)).toEqual([{ code: "notOneParagraph" }]);
    }
    expect(markdownProblems("a\n\nb", SIDE)).toEqual([]);
  });
});
