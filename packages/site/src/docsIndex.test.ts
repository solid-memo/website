// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOCS_BASE,
  DOCS_INDEX,
  type DocsIndex,
  listingProblems,
  pageBlock,
  readDocsIndex,
} from "./docsIndex.ts";

const PREFIXES = [
  "@base <https://solid-memo.com/docs/> .",
  "@prefix dcterms: <http://purl.org/dc/terms/> .",
  "@prefix schema: <https://schema.org/> .",
  "",
].join("\n");

const DOCS = ["<>", "    a schema:Collection ;", '    dcterms:title "Docs"@en .', ""].join("\n");

/** A group's block, its lines as the index writes them. */
function group(id: string, position: string, title = "Group"): string {
  return [
    `<#${id}>`,
    "    a schema:Collection ;",
    `    dcterms:title "${title}"@en ;`,
    "    schema:isPartOf <> ;",
    `    schema:position ${position} .`,
    "",
  ].join("\n");
}

/** A page's block, its lines as the index writes them. */
function page(name: string, of: string, position: string, abstract = '"a page."@en'): string {
  return [
    `<${name}>`,
    "    a schema:TechArticle ;",
    `    schema:isPartOf <#${of}> ;`,
    `    schema:position ${position} ;`,
    `    dcterms:abstract ${abstract} .`,
    "",
  ].join("\n");
}

/** The problems' messages of an index made of the prefixes, the docs and `body`. */
function whats(body: string, docs = DOCS): string[] {
  return readDocsIndex(PREFIXES + docs + body).problems.map((problem) => problem.what);
}

/** A page's summary problems, for an abstract written as `abstract`. */
function summaryWhats(abstract: string): string[] {
  return whats(group("g", "10") + page("a.md", "g", "10", abstract));
}

describe("readDocsIndex", () => {
  it("reads the docs, their groups and pages in order by position, with their lines", () => {
    const text =
      PREFIXES +
      DOCS +
      page("b.md", "second", "20", '"*the* `second` **page**"@en') +
      group("second", "20", "Second") +
      page("a.md", "second", "10") +
      group("first", "10", "First") +
      page("c.md", "first", "5");
    const { index, problems } = readDocsIndex(text);
    expect(problems).toEqual([]);
    const lines = text.split("\n");
    const line = (token: string) => lines.indexOf(token) + 1;
    expect(index).toEqual({
      title: "Docs",
      line: line("<>"),
      groups: [
        {
          id: "first",
          title: "First",
          line: line("<#first>"),
          pages: [
            {
              name: "c.md",
              summary: [{ type: "text", value: "a page." }],
              position: 5,
              line: line("<c.md>"),
            },
          ],
        },
        {
          id: "second",
          title: "Second",
          line: line("<#second>"),
          pages: [
            {
              name: "a.md",
              summary: [{ type: "text", value: "a page." }],
              position: 10,
              line: line("<a.md>"),
            },
            {
              name: "b.md",
              summary: [
                { type: "emphasis", children: [{ type: "text", value: "the" }] },
                { type: "text", value: " " },
                { type: "inlineCode", value: "second" },
                { type: "text", value: " " },
                { type: "strong", children: [{ type: "text", value: "page" }] },
              ],
              position: 20,
              line: line("<b.md>"),
            },
          ],
        },
      ],
      named: [
        { name: "b.md", line: line("<b.md>") },
        { name: "a.md", line: line("<a.md>") },
        { name: "c.md", line: line("<c.md>") },
      ],
    } satisfies DocsIndex);
  });

  it("reads the index in docs/", () => {
    const text = readFileSync(new URL("../../../docs/docs.ttl", import.meta.url), "utf8");
    const { index, problems } = readDocsIndex(text);
    expect(problems).toEqual([]);
    expect(index!.groups.length).toBeGreaterThan(0);
  });

  it("says where the Turtle does not parse, and reads no index", () => {
    const { index, problems } = readDocsIndex(`${PREFIXES}${DOCS}<a.md> a .\n`);
    expect(index).toBeNull();
    expect(problems).toHaveLength(1);
    expect(problems[0]!.file).toBe(DOCS_INDEX);
    expect(problems[0]!.line).toBe(7);
    expect(problems[0]!.what).toMatch(/^not Turtle: /);
  });

  it("refuses a blank node", () => {
    expect(whats("[] a schema:Collection .\n")).toEqual([
      "a blank node: name every subject (`<>`, `<#group>` or `<page.md>`)",
    ]);
  });

  it("refuses a named graph, which N3 reads and Turtle does not have", () => {
    expect(whats("<#g> { <a.md> a schema:TechArticle }\n")).toEqual([
      "a named graph (`<g> { … }`), which Turtle does not have",
    ]);
  });

  it("needs the docs themselves", () => {
    const { index, problems } = readDocsIndex(
      PREFIXES + group("g", "10") + page("a.md", "g", "10"),
    );
    expect(problems).toEqual([
      {
        file: DOCS_INDEX,
        line: null,
        what: "the docs themselves (`<>`) are missing, with their title",
      },
    ]);
    expect(index!.title).toBe("");
    expect(index!.line).toBeNull();
    expect(index!.groups.map((g) => g.pages.map((p) => p.name))).toEqual([["a.md"]]);
  });

  it("needs each subject typed as its kind alone", () => {
    const docs = ["<>", '    dcterms:title "Docs"@en .', ""].join("\n");
    expect(whats(group("g", "10") + page("a.md", "g", "10"), docs)).toEqual([
      "<> is not typed schema:Collection alone",
    ]);
    const twice = DOCS.replace("a schema:Collection", "a schema:Collection, schema:TechArticle");
    expect(whats(group("g", "10") + page("a.md", "g", "10"), twice)).toEqual([
      "<> is not typed schema:Collection alone",
    ]);
    expect(
      whats(
        group("g", "10").replace("schema:Collection", "schema:TechArticle") +
          page("a.md", "g", "10").replace("schema:TechArticle", "schema:Collection"),
      ),
    ).toEqual([
      "<#g> is not typed schema:Collection alone",
      "<a.md> is not typed schema:TechArticle alone",
    ]);
  });

  it("refuses a property its kind does not have", () => {
    const docs = DOCS.replace(" .", ' ;\n    dcterms:abstract "x"@en .');
    expect(whats(group("g", "10") + page("a.md", "g", "10"), docs)).toEqual([
      "<> has <http://purl.org/dc/terms/abstract>, which a docs of the docs does not have",
    ]);
    expect(
      whats(
        group("g", "10").replace("    a ", '    dcterms:abstract "x"@en ;\n    a ') +
          page("a.md", "g", "10").replace("    a ", '    dcterms:title "x"@en ;\n    a '),
      ),
    ).toEqual([
      "<#g> has <http://purl.org/dc/terms/abstract>, which a group of the docs does not have",
      "<a.md> has <http://purl.org/dc/terms/title>, which a page of the docs does not have",
    ]);
  });

  it("needs exactly one of each value", () => {
    const docs = ["<>", "    a schema:Collection .", ""].join("\n");
    expect(whats(group("g", "10") + page("a.md", "g", "10"), docs)).toEqual([
      "<> has no dcterms:title: it needs exactly one",
    ]);
    expect(
      whats(
        group("g", "10").replace('"Group"@en', '"Group"@en, "Other"@en') + page("a.md", "g", "10"),
      ),
    ).toEqual(["<#g> has more than one dcterms:title: it needs exactly one"]);
    const bare = ["<a.md>", "    a schema:TechArticle .", ""].join("\n");
    const { index, problems } = readDocsIndex(PREFIXES + DOCS + group("g", "10") + bare);
    expect(problems.map((problem) => problem.what)).toEqual([
      "<a.md> has no schema:isPartOf: it needs exactly one",
      "<a.md> has no dcterms:abstract: it needs exactly one",
      "<a.md> has no schema:position: it needs exactly one",
      "<#g> has no pages",
    ]);
    expect(index!.groups[0]!.pages).toEqual([]);
  });

  it("needs text in English", () => {
    const docs = DOCS.replace('"Docs"@en', '"Docs"');
    expect(whats(group("g", "10") + page("a.md", "g", "10"), docs)).toEqual([
      '<>\'s dcterms:title is not text in English ("…"@en)',
    ]);
    expect(
      whats(
        group("g", "10").replace('"Group"@en', '"Gruppe"@de') + page("a.md", "g", "10", "<#g>"),
      ),
    ).toEqual([
      '<#g>\'s dcterms:title is not text in English ("…"@en)',
      '<a.md>\'s dcterms:abstract is not text in English ("…"@en)',
    ]);
  });

  it("needs a position that is a whole number from 0", () => {
    for (const position of ["-10", "1.5", '"10"', "<#g>"])
      expect(whats(group("g", "10") + page("a.md", "g", position))).toEqual([
        "<a.md>'s schema:position is not a whole number from 0",
      ]);
    expect(whats(group("g", "0") + page("a.md", "g", "0"))).toEqual([]);
  });

  it("needs a group's id to be lowercase words and hyphens", () => {
    for (const id of ["The-code", "the--code", "the_code", "-code"])
      expect(whats(group(id, "10") + page("a.md", id, "10"))).toEqual([
        `<#${id}>: a group's id is lowercase words and hyphens, as a heading's is`,
      ]);
  });

  it("needs a group to be part of the docs themselves", () => {
    expect(
      whats(
        group("g", "10").replace("schema:isPartOf <>", "schema:isPartOf <#h>") +
          page("a.md", "g", "10"),
      ),
    ).toEqual(["<#g> is not part of the docs themselves (schema:isPartOf <>)"]);
    expect(
      whats(
        group("g", "10").replace(
          "schema:isPartOf <>",
          'schema:isPartOf "https://solid-memo.com/docs/"',
        ) + page("a.md", "g", "10"),
      ),
    ).toEqual(["<#g> is not part of the docs themselves (schema:isPartOf <>)"]);
  });

  it("needs a page to be part of a group", () => {
    const text =
      PREFIXES + DOCS + group("g", "10") + page("a.md", "g", "10") + page("b.md", "h", "10");
    const { index, problems } = readDocsIndex(text);
    expect(problems).toEqual([
      {
        file: DOCS_INDEX,
        line: text.split("\n").indexOf("<b.md>") + 1,
        what: "<b.md> is part of <#h>, which is not a group",
      },
    ]);
    expect(index!.groups[0]!.pages.map((p) => p.name)).toEqual(["a.md"]);
    expect(
      whats(
        group("g", "10") +
          page("b.md", "g", "20") +
          page("a.md", "g", "10").replace("<#g>", "<https://example.org/>"),
      ),
    ).toEqual(["<a.md> is part of <https://example.org/>, which is not a group"]);
    // Text that reads as a group's address is not the group.
    const literal = readDocsIndex(
      PREFIXES +
        DOCS +
        group("g", "10") +
        page("b.md", "g", "20") +
        page("a.md", "g", "10").replace("<#g>", '"https://solid-memo.com/docs/#g"'),
    );
    expect(literal.problems.map((problem) => problem.what)).toEqual([
      "<a.md>'s schema:isPartOf is not a group (`<#group>`)",
    ]);
    expect(literal.index!.groups[0]!.pages.map((p) => p.name)).toEqual(["b.md"]);
    // It is still named, so it is not reported as unlisted too.
    expect(literal.index!.named.map((p) => p.name)).toEqual(["b.md", "a.md"]);
  });

  it("needs a group to have pages", () => {
    expect(whats(group("g", "10") + page("a.md", "g", "10") + group("empty", "20"))).toEqual([
      "<#empty> has no pages",
    ]);
  });

  it("refuses tied positions, of groups and of pages", () => {
    const text =
      PREFIXES +
      DOCS +
      group("g", "10") +
      group("h", "10") +
      page("a.md", "g", "10") +
      page("b.md", "g", "10") +
      page("c.md", "h", "10");
    const lines = text.split("\n");
    expect(readDocsIndex(text).problems).toEqual([
      {
        file: DOCS_INDEX,
        line: lines.indexOf("<#h>") + 1,
        what: "<#h> has the position of <#g>, 10",
      },
      {
        file: DOCS_INDEX,
        line: lines.indexOf("<b.md>") + 1,
        what: "<b.md> has the position of <a.md>, 10",
      },
    ]);
  });

  it("still lists, last, what has no position", () => {
    const text =
      PREFIXES +
      DOCS +
      group("late", '"x"') +
      group("g", "10") +
      page("z.md", "g", '"x"') +
      page("b.md", "g", "20") +
      page("a.md", "g", "10") +
      page("c.md", "late", "10");
    const { index, problems } = readDocsIndex(text);
    expect(problems.map((problem) => problem.what)).toEqual([
      "<#late>'s schema:position is not a whole number from 0",
      "<z.md>'s schema:position is not a whole number from 0",
    ]);
    expect(index!.groups.map((g) => [g.id, g.pages.map((p) => [p.name, p.position])])).toEqual([
      [
        "g",
        [
          ["a.md", 10],
          ["b.md", 20],
          ["z.md", 0],
        ],
      ],
      ["late", [["c.md", 10]]],
    ]);
  });

  it("gives no line for a subject it does not write as its own block", () => {
    const text = `${PREFIXES}<https://solid-memo.com/docs/> a schema:Collection .\n${group("g", "10")}${page("a.md", "g", "10").replace("<a.md>\n    a", `<${DOCS_BASE}a.md> a`)}`;
    const { index, problems } = readDocsIndex(text);
    expect(problems).toEqual([
      { file: DOCS_INDEX, line: null, what: "<> has no dcterms:title: it needs exactly one" },
    ]);
    expect(index!.line).toBeNull();
    expect(index!.groups[0]!.pages[0]!.line).toBeNull();
  });

  it("refuses a subject that is neither the docs, a group nor a page", () => {
    expect(
      whats(
        `${group("g", "10")}${page("a.md", "g", "10")}<notes.txt> a schema:TechArticle .\n<sub/b.md> a schema:TechArticle .\n<https://example.org/c.md> a schema:TechArticle .\n`,
      ),
    ).toEqual([
      "<notes.txt> is neither the docs (`<>`), a group (`<#group>`) nor a page in docs/ (`<page.md>`)",
      "<sub/b.md> is neither the docs (`<>`), a group (`<#group>`) nor a page in docs/ (`<page.md>`)",
      "<https://example.org/c.md> is neither the docs (`<>`), a group (`<#group>`) nor a page in docs/ (`<page.md>`)",
    ]);
  });

  describe("a summary", () => {
    it("is one line of text", () => {
      expect(summaryWhats('"""one.\n\ntwo."""@en')).toEqual([
        "<a.md>'s summary is not one line of text",
      ]);
      expect(summaryWhats('"# a heading"@en')).toEqual([
        "<a.md>'s summary is not one line of text",
      ]);
      expect(summaryWhats('""@en')).toEqual(["<a.md>'s summary is not one line of text"]);
    });

    it("has no link and no line break, not even in emphasis", () => {
      const what = "<a.md>'s summary has a link or a line break: a summary has neither";
      expect(summaryWhats('"see [this](srs.md)."@en')).toEqual([what]);
      expect(summaryWhats('"one\\\\\\ntwo."@en')).toEqual([what]);
      expect(summaryWhats('"*see [this](srs.md)*."@en')).toEqual([what]);
      expect(summaryWhats('"**_see <https://example.org>_**."@en')).toEqual([what]);
    });

    it("is refused as the docs' Markdown refuses a text", () => {
      const [what] = summaryWhats('"a <b>bold</b> page."@en');
      expect(what).toMatch(/^<a\.md>'s summary: /);
    });

    it("is empty when refused", () => {
      const { index } = readDocsIndex(
        PREFIXES + DOCS + group("g", "10") + page("a.md", "g", "10", '"[a](b.md)"@en'),
      );
      expect(index!.groups[0]!.pages[0]!.summary).toEqual([]);
    });
  });
});

/** An index of groups, each with the named pages at positions 10, 20 and so on. */
function indexOf(groups: Record<string, string[]>): DocsIndex {
  return {
    title: "Docs",
    line: 1,
    groups: Object.entries(groups).map(([id, names], at) => ({
      id,
      title: id,
      line: at + 2,
      pages: names.map((name, place) => ({
        name,
        summary: [],
        position: (place + 1) * 10,
        line: 100 + place,
      })),
    })),
    named: Object.values(groups).flatMap((names) =>
      names.map((name, place) => ({ name, line: 100 + place })),
    ),
  };
}

describe("listingProblems", () => {
  it("finds nothing wrong when the index lists every page but the README", () => {
    expect(
      listingProblems(indexOf({ g: ["a.md", "b.md"] }), ["README.md", "a.md", "b.md"]),
    ).toEqual([]);
  });

  it("finds a page the index does not list", () => {
    expect(listingProblems(indexOf({ g: ["a.md"] }), ["README.md", "a.md", "new.md"])).toEqual([
      { file: "docs/new.md", line: null, what: `${DOCS_INDEX} does not list the page` },
    ]);
  });

  it("finds a page it lists that is not there, and the README listed", () => {
    expect(
      listingProblems(indexOf({ g: ["a.md", "gone.md"], h: ["README.md"] }), ["README.md", "a.md"]),
    ).toEqual([
      { file: DOCS_INDEX, line: 101, what: "lists gone.md, which is not in docs/" },
      {
        file: DOCS_INDEX,
        line: 100,
        what: "lists README.md, which is the docs' own page, not one of them",
      },
    ]);
  });
});

describe("pageBlock", () => {
  it("places a page after the last group's last page", () => {
    expect(pageBlock(indexOf({ g: ["a.md"], h: ["b.md", "c.md"] }), "new.md")).toBe(
      [
        "<new.md>",
        "    a schema:TechArticle ;",
        "    schema:isPartOf <#h> ;",
        "    schema:position 30 ;",
        '    dcterms:abstract "what the page covers, in one line."@en .',
      ].join("\n"),
    );
  });

  it("starts a group with no pages, and names a group to write when there is none", () => {
    expect(pageBlock(indexOf({ g: [] }), "new.md")).toContain("schema:position 10 ;");
    const block = pageBlock(indexOf({}), "new.md");
    expect(block).toContain("schema:isPartOf <#group> ;");
    expect(block).toContain("schema:position 10 ;");
  });

  it("writes a block the index reads", () => {
    const index = indexOf({ g: ["a.md"] });
    const text =
      PREFIXES + DOCS + group("g", "10") + page("a.md", "g", "10") + pageBlock(index, "new.md");
    expect(readDocsIndex(text).problems).toEqual([]);
  });
});
