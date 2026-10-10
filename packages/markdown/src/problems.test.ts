import { describe, expect, it } from "vitest";
import { MAX_CHARS, MAX_DELIMITERS, MAX_DEPTH, MAX_TABLE_COLUMNS } from "./parse";
import { markdownProblems, OPTION, PROSE, SIDE } from "./problems";

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
    expect(markdownProblems("&aring;", SIDE)).toEqual([{ code: "characterReference", source: "&aring;" }]);
    expect(markdownProblems('"<ex:title>"', OPTION)).toEqual([{ code: "link", source: "<ex:title>", autolink: true }]);
    // A rule meant under a line of text, with no blank line between them, underlines it as a heading.
    expect(markdownProblems("Intro\n---\n\nMore.", PROSE)).toEqual([{ code: "dashHeading", source: "Intro\n---" }]);
  });

  it("names a text past the parser's limits, and nothing else in it", () => {
    expect(markdownProblems(`<b>${"a".repeat(MAX_CHARS)}`, PROSE)).toEqual([
      { code: "tooLong", length: MAX_CHARS + 3 },
    ]);
    expect(markdownProblems(`<b>${"*_".repeat(MAX_DELIMITERS)}`, PROSE)).toEqual([{ code: "tooComplex" }]);
  });

  it("names raw HTML and pictures, which are not shown", () => {
    expect(markdownProblems("<div>x</div>\n\na <i>b</i> ![c](https://c.example/c.png)", PROSE)).toEqual([
      { code: "html", source: "<div>x</div>" },
      { code: "html", source: "<i>" },
      { code: "html", source: "</i>" },
      { code: "image", source: "![c](https://c.example/c.png)" },
    ]);
  });

  it("names what nests too deep, and a table too large, which show as their source", () => {
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH)}*a*`, PROSE)).toEqual([{ code: "tooDeep", source: "*a*" }]);
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH - 1)}a *b*`, PROSE)).toEqual([{ code: "tooDeep", source: "*b*" }]);
    const wide = `|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`;
    expect(markdownProblems(wide, PROSE)).toEqual([{ code: "largeTable", source: wide }]);
  });

  it("passes what nests to the limit but shows as written, plain text", () => {
    const list = Array.from({ length: MAX_DEPTH - 1 }, (_, level) => `${"  ".repeat(level)}- ${level}`).join("\n");
    for (const text of [`${"> ".repeat(MAX_DEPTH - 1)}a`, `${"> ".repeat(MAX_DEPTH)}a`, list]) {
      expect(markdownProblems(text, PROSE)).toEqual([]);
    }
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH - 1)}a \\* b`, PROSE)).toEqual([
      { code: "tooDeep", source: "a \\* b" },
    ]);
    expect(markdownProblems(`${"> ".repeat(MAX_DEPTH)}a\nb`, PROSE)).toEqual([{ code: "tooDeep", source: "a\nb" }]);
  });

  it("names every link in a field without links, references and autolinks too", () => {
    expect(
      markdownProblems("[a](https://a.example) [b][r] <https://c.example>\n\n[r]: https://r.example", SIDE),
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

  it("names bidi and zero-width controls in code and in links", () => {
    expect(
      markdownProblems("a‮b `c‮d`\n\n```\ne​f\n```\n\n[g⁦h](https://x.example/) [i](https://x.example/‮)", PROSE),
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
