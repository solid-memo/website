// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { type DocBlock, parseDocument } from "@solid-memo/markdown/parse";
import { DiagramError, type DrawInputs } from "./diagrams.ts";
import { DOCS_INDEX, readDocsIndex } from "./docsIndex.ts";
import {
  DOCS_CSP,
  DOCS_CSS,
  type DocsIo,
  type DocsSiteOptions,
  DocsSiteError,
  type Draw,
  escapeHtml,
  renderDocsSite,
  repositoryIo,
  withDocsVersion,
} from "./docsSite.ts";
import { drawInputs } from "./drawDiagrams.ts";

let inputs: DrawInputs;
beforeAll(async () => {
  inputs = await drawInputs();
});

const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://example.org/team/memo";

/** A repository in memory: its files by path, and its folders. */
function memoryIo(files: Record<string, string>, folders: string[] = []): DocsIo {
  const all: Record<string, string> = { [DOCS_CSS]: "body{}", ...files };
  return {
    pages: async () =>
      Object.keys(all)
        .filter((path) => /^docs\/[^/]+\.md$/.test(path))
        .map((path) => path.slice("docs/".length)),
    read: async (path) => all[path] ?? null,
    kind: async (path) => {
      if (path in all) return "file";
      if (path === "" || folders.includes(path)) return "folder";
      return null;
    },
  };
}

/** Draws each diagram as a small SVG that names its title and theme. */
const fakeDraw: Draw = async (diagrams) =>
  new Map(
    diagrams.map((diagram) => [
      diagram.hash,
      {
        light: `<svg viewBox="0 0 100.5 40"><text>${diagram.title} light</text></svg>`,
        dark: `<svg viewBox="0 0 100.5 40"><text>${diagram.title} dark</text></svg>`,
      },
    ]),
  );

const page = (title: string, ...rest: string[]) =>
  [`# ${title}`, "", `What ${title} is about.`, "", ...rest].join("\n");

const diagram = (title: string, ...lines: string[]) =>
  [
    "```mermaid",
    "flowchart LR",
    `  accTitle: ${title}`,
    `  accDescr: How ${title} flows.`,
    ...lines,
    "  A --> B",
    "```",
  ].join("\n");

/**
 * A docs.ttl: the docs' title "Docs" unless said, then each group, as its
 * id, title and pages' names, in order. Its first group's line is 9, and
 * each page's block, with the blank line before it, takes 6 lines.
 */
function docsTtl(groups: [string, string, string[]][], title = "Docs"): string {
  return [
    "@base <https://solid-memo.com/docs/> .",
    "@prefix dcterms: <http://purl.org/dc/terms/> .",
    "@prefix schema: <https://schema.org/> .",
    "",
    "<>",
    "    a schema:Collection ;",
    `    dcterms:title "${title}"@en .`,
    ...groups.flatMap(([id, name, pages], place) => [
      "",
      `<#${id}>`,
      "    a schema:Collection ;",
      `    dcterms:title "${name}"@en ;`,
      "    schema:isPartOf <> ;",
      `    schema:position ${(place + 1) * 10} .`,
      ...pages.flatMap((listed, at) => [
        "",
        `<${listed}>`,
        "    a schema:TechArticle ;",
        `    schema:isPartOf <#${id}> ;`,
        `    schema:position ${(at + 1) * 10} ;`,
        '    schema:learningResourceType "reference" ;',
        `    dcterms:abstract "what ${listed} *covers*."@en .`,
      ]),
    ]),
    "",
  ].join("\n");
}

/** A small site: the README, the two pages, and the index that lists them. */
function siteFiles(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "docs/README.md": page("Docs"),
    "docs/one.md": page("One", "## Part", "", "Text."),
    "docs/two.md": page("Two", "## Part", "", "Text."),
    [DOCS_INDEX]: docsTtl([["pages", "Pages", ["one.md", "two.md"]]]),
    ...extra,
  };
}

function options(io: DocsIo, more: Partial<DocsSiteOptions> = {}): DocsSiteOptions {
  return {
    io,
    repoUrl: REPO,
    ref: SHA,
    version: "2.2.0",
    origin: "https://memo.example",
    mode: "live",
    inputs,
    draw: fakeDraw,
    ...more,
  };
}

const render = (files: Record<string, string>, more: Partial<DocsSiteOptions> = {}) =>
  renderDocsSite(options(memoryIo(files, ["packages", "packages/app"]), more));

/** The problems renderDocsSite lists for a site. */
async function problemsOf(
  files: Record<string, string>,
  more: Partial<DocsSiteOptions> = {},
): Promise<string[]> {
  const error = await render(files, more).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(DocsSiteError);
  return (error as DocsSiteError).problems.map(
    ({ file, line, what }) => `${file}${line === null ? "" : `:${line}`}: ${what}`,
  );
}

/** Every address a page's HTML names: in href, src and srcset. */
const addresses = (html: string) =>
  [...html.matchAll(/\s(?:href|src|srcset)="([^"]*)"/g)].map(([, value]) => value!);

/** The hrefs of a page's article, its sections' list aside. */
const articleLinks = (html: string) => {
  const article = html.slice(html.indexOf("<article>"), html.indexOf("</article>"));
  return addresses(article.replace(/<nav class="toc"[\s\S]*?<\/nav>/, ""));
};

describe("renderDocsSite", () => {
  it("writes each page and the stylesheet", async () => {
    const files = await render(siteFiles());
    expect([...files.keys()].sort()).toEqual([
      "docs.css",
      "index.html",
      "one/index.html",
      "two/index.html",
    ]);
    expect(files.get("docs.css")).toBe("body{}");
  });

  it("frames a page: policy, title, description, canonical, header, sections, neighbors and footer", async () => {
    const files = await render(siteFiles());
    const one = files.get("one/index.html")!;
    expect(one).toMatch(
      /^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="([^"]*)">/,
    );
    expect(one).toContain(`content="${DOCS_CSP}"`);
    expect(DOCS_CSP).toContain("style-src 'self'");
    expect(DOCS_CSP).toContain("script-src 'none'");
    expect(one).toContain("<title>One - Solid Memo docs</title>");
    expect(one).toContain('<meta name="description" content="What One is about.">');
    expect(one).toContain('<link rel="canonical" href="https://memo.example/docs/one/">');
    expect(one).not.toContain("noindex");
    expect(one).toContain('<link rel="stylesheet" href="../docs.css">');
    expect(one).toContain('<a href="../../">Solid Memo</a> <a href="../">Docs</a>');
    expect(one).toContain('<p class="version">Version 2.2.0</p>');
    expect(one).toContain('<a class="skip" href="#main">');
    expect(one).toContain('<main id="main">');
    expect(one).toContain(
      '<nav class="toc" aria-label="On this page">\n<p>On this page</p>\n<ul>\n<li><a href="#part">Part</a></li>',
    );
    expect(one).toContain('<a rel="prev" href="../">Previous: Docs</a>');
    expect(one).toContain('<a rel="next" href="../two/">Next: Two</a>');
    expect(one).toContain(`<a href="${REPO}/blob/${SHA}/docs/one.md">This page's source</a>`);
    expect(one).toContain(`<a href="${REPO}/issues/new/choose">Report a problem</a>`);
    expect(one).toContain(`<a href="${REPO}/blob/${SHA}/LICENSE">MIT License</a>`);
    expect(one).toContain(`Built from <a href="${REPO}/commit/${SHA}">0123456</a>`);
    expect(one).not.toContain("Fredoka");
    // The title and description come first in the article, then its sections.
    expect(one.indexOf('<h1 id="one">One</h1>')).toBeLessThan(one.indexOf('class="toc"'));

    const readme = files.get("index.html")!;
    expect(readme).toContain('<link rel="canonical" href="https://memo.example/docs/">');
    expect(readme).toContain('<link rel="stylesheet" href="docs.css">');
    expect(readme).toContain('<a href="../">Solid Memo</a> <a href="./">Docs</a>');
    expect(readme).not.toContain('rel="prev"');
    expect(readme).toContain('<a rel="next" href="one/">Next: One</a>');
    expect(files.get("two/index.html")).not.toContain('rel="next"');
  });

  it("lists the index's groups on the README, each page's title linked with its summary, and orders the pages by them", async () => {
    const files = await render({
      ...siteFiles(),
      "docs/README.md": page("Docs", "## Start", "", "Text."),
      "docs/three.md": page("Three"),
      [DOCS_INDEX]: docsTtl([
        ["first", "First steps", ["two.md"]],
        ["more", "More & more", ["one.md", "three.md"]],
      ]),
    });
    const readme = files.get("index.html")!;
    expect(readme).toContain(
      [
        '<h2 id="first">First steps</h2>',
        "<ul>",
        '<li><a href="two/">Two</a> — what two.md <em>covers</em>.</li>',
        "</ul>",
        '<h2 id="more">More &amp; more</h2>',
        "<ul>",
        '<li><a href="one/">One</a> — what one.md <em>covers</em>.</li>',
        '<li><a href="three/">Three</a> — what three.md <em>covers</em>.</li>',
        "</ul>",
      ].join("\n"),
    );
    // The groups come after the README's own text, and its sections list them after its own.
    expect(readme.indexOf('<h2 id="start">')).toBeLessThan(readme.indexOf('<h2 id="first">'));
    expect(readme).toContain(
      [
        '<li><a href="#start">Start</a></li>',
        '<li><a href="#first">First steps</a></li>',
        '<li><a href="#more">More &amp; more</a></li>',
        "</ul>",
      ].join("\n"),
    );
    // Only the README lists the groups.
    expect(files.get("one/index.html")).not.toContain('href="#first"');
    expect(readme).toContain('<a rel="next" href="two/">Next: Two</a>');
    const two = files.get("two/index.html")!;
    expect(two).toContain('<a rel="prev" href="../">Previous: Docs</a>');
    expect(two).toContain('<a rel="next" href="../one/">Next: One</a>');
    const one = files.get("one/index.html")!;
    expect(one).toContain('<a rel="prev" href="../two/">Previous: Two</a>');
    expect(one).toContain('<a rel="next" href="../three/">Next: Three</a>');
    expect(files.get("three/index.html")).not.toContain('rel="next"');
  });

  it("puts every page under All pages in each page's header, the page itself marked as the current one", async () => {
    const files = await render(siteFiles());
    const all = (up: string, current: string) =>
      [
        '<details class="pages">',
        "<summary>All pages</summary>",
        '<nav aria-label="All pages">',
        "<ul>",
        `<li><a href="${up || "./"}"${current === "Docs" ? ' aria-current="page"' : ""}>Docs</a></li>`,
        "<li>Pages",
        "<ul>",
        `<li><a href="${up}one/"${current === "One" ? ' aria-current="page"' : ""}>One</a></li>`,
        `<li><a href="${up}two/"${current === "Two" ? ' aria-current="page"' : ""}>Two</a></li>`,
        "</ul>",
        "</li>",
        "</ul>",
        "</nav>",
        "</details>",
        "</header>",
      ].join("\n");
    expect(files.get("index.html")).toContain(all("", "Docs"));
    expect(files.get("one/index.html")).toContain(all("../", "One"));
    expect(files.get("two/index.html")).toContain(all("../", "Two"));
  });

  it("links the index's source from the README's footer, at the ref", async () => {
    const files = await render(siteFiles());
    const source = `<li><a href="${REPO}/blob/${SHA}/docs/docs.ttl">The list of pages' source</a></li>`;
    expect(files.get("index.html")).toContain(
      `<a href="${REPO}/blob/${SHA}/docs/README.md">This page's source</a></li>\n${source}`,
    );
    expect(files.get("one/index.html")).not.toContain("docs.ttl");
  });

  it("lists what is wrong with the index: a page it does not list or lists without the file, another title, a group's id the README has", async () => {
    expect(
      await problemsOf({
        ...siteFiles(),
        "docs/README.md": page("Doc", "## Part", "", "Text."),
        "docs/three.md": page("Three"),
        [DOCS_INDEX]: docsTtl(
          [
            ["part", "Part", ["one.md", "gone.md"]],
            ["main", "Main", ["two.md"]],
          ],
          "Docs",
        ),
      }),
    ).toEqual([
      "docs/three.md: docs/docs.ttl does not list the page",
      "docs/docs.ttl:22: lists gone.md, which is not in docs/",
      `docs/docs.ttl:5: the docs' title, "Docs", is not the README's, "Doc"`,
      'docs/docs.ttl:9: <#part>: the README already has a heading with the id "part"',
      'docs/docs.ttl:29: <#main>: the README already has a heading with the id "main"',
    ]);
    // A README that does not open with its title is a problem of its own, not the index's.
    expect(
      await problemsOf({ ...siteFiles(), "docs/README.md": "Text.\n\n# Docs\n\nText.\n" }),
    ).toEqual([
      "docs/README.md:1: the page does not open with its title, a heading of level 1 (`# …`)",
    ]);
  });

  it("says when there is no index, and, when it is not Turtle, only that", async () => {
    const { [DOCS_INDEX]: _index, ...unindexed } = siteFiles();
    expect(await problemsOf(unindexed)).toEqual([
      "docs/docs.ttl: there is no docs.ttl, the docs' index",
    ]);
    const problems = await problemsOf({
      ...siteFiles(),
      "docs/three.md": page("Three"),
      [DOCS_INDEX]: "<> a .\n",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^docs\/docs\.ttl(:1)?: not Turtle: /);
  });

  it("describes a page by its first paragraph, as one line", async () => {
    const files = await render({
      ...siteFiles(),
      "docs/one.md": "# One\n\nWhat *One*  \nis `about`.\n",
    });
    expect(files.get("one/index.html")).toContain(
      '<meta name="description" content="What One is about.">',
    );
  });

  it("gives no canonical address without an origin, and names a tag as it is", async () => {
    const files = await render(siteFiles(), { origin: undefined, ref: "main" });
    const one = files.get("one/index.html")!;
    expect(one).not.toContain("canonical");
    expect(one).toContain(`Built from <a href="${REPO}/tree/main">main</a>`);
    expect((await render(siteFiles(), { origin: null })).get("index.html")).not.toContain(
      "canonical",
    );
  });

  it("makes every link work where the pages are served, from the README and from a page", async () => {
    const links = [
      "[a](one.md)",
      "[b](./two.md#part)",
      "[c](README.md)",
      "[d](#part)",
      "[e](../packages/app/main.ts)",
      "[f](../packages/app/)",
      "[g](../packages)",
      "[h](../)",
      "[i](../CONTRIBUTING.md#review)",
      "-",
      "[j](../notes.txt#L2)",
      "[k](https://example.com/a?b=1&c=2)",
      "[l](http://example.com/)",
      "<https://example.com/auto>",
      "*[m](one.md)*",
      "| [n](two.md) |\n|---|",
    ].join("\n\n");
    const files = await render({
      ...siteFiles(),
      "docs/README.md": page("Docs", "## Part", "", links),
      "docs/one.md": page("One", "## Part", "", links),
      "packages/app/main.ts": "",
      "CONTRIBUTING.md":
        "# Contributing\n\n```\n~~~\n# Not a heading\n```\n\n~~~\n## Nowhere\n~~~~\n\n## Review ##\n",
      "notes.txt": "",
    });
    const blob = `${REPO}/blob/${SHA}`;
    const tree = `${REPO}/tree/${SHA}`;
    const expected = (up: string, self: string) => [
      `${up}one/`,
      `${up}two/#part`,
      self,
      "#part",
      `${blob}/packages/app/main.ts`,
      `${tree}/packages/app`,
      `${tree}/packages`,
      tree,
      `${blob}/CONTRIBUTING.md#review`,
      `${blob}/notes.txt#L2`,
      "https://example.com/a?b=1&amp;c=2",
      "http://example.com/",
      "https://example.com/auto",
      `${up}one/`,
      `${up}two/`,
    ];
    // The README's article ends with the index's list of the pages.
    expect(articleLinks(files.get("index.html")!)).toEqual([...expected("", "./"), "one/", "two/"]);
    expect(articleLinks(files.get("one/index.html")!)).toEqual(expected("../", "../"));
    for (const html of files.values()) {
      for (const address of addresses(html)) {
        expect(address).not.toMatch(/^\//);
        if (!address.startsWith(REPO)) expect(address).not.toMatch(/\.md(#|$)/);
      }
    }
  });

  it("finds a heading outside the docs by the id GitHub gives it, numbered when repeated", async () => {
    const changelog = [
      "# Changelog",
      "``` `not` a fence",
      "## Features",
      "```bash",
      "```bash",
      "# Not a heading",
      "```",
      "## Features",
      "## Bug Fixes",
      "## Features",
      "## After",
    ].join("\n");
    const links =
      "[a](../CHANGELOG.md#features-1) [b](../CHANGELOG.md#features-2) [c](../CHANGELOG.md#after)";
    const files = await render({
      ...siteFiles(),
      "docs/README.md": page("Docs", links),
      "CHANGELOG.md": changelog,
    });
    const blob = `${REPO}/blob/${SHA}/CHANGELOG.md`;
    expect(articleLinks(files.get("index.html")!).slice(0, -2)).toEqual([
      `${blob}#features-1`,
      `${blob}#features-2`,
      `${blob}#after`,
    ]);
    const refused = "[d](../CHANGELOG.md#features-3) [e](../CHANGELOG.md#not-a-heading)";
    expect(
      await problemsOf({
        "docs/README.md": page("Docs", refused),
        [DOCS_INDEX]: docsTtl([]),
        "CHANGELOG.md": changelog,
      }),
    ).toEqual([
      'docs/README.md:5: a link to "../CHANGELOG.md#features-3": CHANGELOG.md has no such heading',
      'docs/README.md:5: a link to "../CHANGELOG.md#not-a-heading": CHANGELOG.md has no such heading',
    ]);
  });

  it("lists every problem, each with its file and line", async () => {
    const problems = await problemsOf({
      "docs/README.md": [
        page("Docs", "- [One](one.md)", "- [Gone](gone.md)"),
        "[a](#nowhere) [b](one.md#nowhere) [c](../missing.ts) [d](../../outside.md)",
        "[e](/docs/one/) [f](mailto:team@example.org) [g](https://) [h](one%E0%A4%A.md)",
        "[i](../CONTRIBUTING.md#nowhere) [j](&#47;top)",
        "",
        "- [ ] to do",
        "- [x] done",
        "",
        "## Part",
        "",
        "## Part",
        "",
        "## Main",
        "",
        "# Again",
      ].join("\n"),
      "docs/one.md": "Text before the title.\n\n# One\n",
      "docs/two.md": "# Two\n\n## No description\n",
      "docs/raw.md": page("Raw", "<b>raw</b>"),
      "docs/drawn.md": page("Drawn", "```mermaid\nflowchart LR\n  A --> B\n```", ""),
      "docs/nested.md": page(
        "Nested",
        "- item",
        "",
        `  ${diagram("Nested").replaceAll("\n", "\n  ")}`,
        "",
        "- item",
        "",
        "    ```mermaid\n    flowchart LR\n    ```",
        "",
        "> ```mermaid\n> flowchart LR\u202e\n> ```",
      ),
      "docs/diagrams.md": "",
      "docs/Upper_Case.md": "",
      [DOCS_INDEX]: docsTtl([
        ["pages", "Pages", ["one.md", "raw.md", "diagrams.md", "Upper_Case.md", "gone.md"]],
      ]),
      "CONTRIBUTING.md": "# Contributing\n",
    });
    expect(problems).toEqual([
      "docs/README.md:11: a task list item: write **Done.** or **Open.** instead (style.md)",
      "docs/README.md:12: a task list item: write **Done.** or **Open.** instead (style.md)",
      'docs/README.md:16: a heading whose id ("part") the page already has',
      'docs/README.md:18: a heading whose id ("main") the page already has',
      "docs/README.md:20: a second heading of level 1",
      "docs/Upper_Case.md: a page name that is not lowercase and hyphenated",
      "docs/diagrams.md: a page name the site keeps for a folder of its own",
      "docs/drawn.md:5: no accTitle: the drawing's alternative text",
      "docs/drawn.md:5: no accDescr: the sentence that says what the diagram shows",
      "docs/one.md:1: the page does not open with its title, a heading of level 1 (`# …`)",
      "docs/raw.md:5: raw HTML",
      "docs/two.md:1: the title is not followed by a paragraph, the page's description",
      "docs/drawn.md: docs/docs.ttl does not list the page",
      "docs/nested.md: docs/docs.ttl does not list the page",
      "docs/two.md: docs/docs.ttl does not list the page",
      "docs/docs.ttl:43: lists gone.md, which is not in docs/",
      'docs/README.md:6: a link to "gone.md": no such page',
      'docs/README.md:7: a link to "#nowhere": no such heading',
      'docs/README.md:7: a link to "one.md#nowhere": one.md has no such heading',
      'docs/README.md:7: a link to "../missing.ts": the repository has no missing.ts',
      'docs/README.md:7: a link to "../../outside.md", which leads out of the repository',
      'docs/README.md:8: a link to "/docs/one/" from the root: write it relative to the page',
      'docs/README.md:8: a link to "mailto:team@example.org": only http: and https: addresses are kept',
      'docs/README.md:8: a link to "https://", which is not a web address',
      'docs/README.md:8: a link to "one%E0%A4%A.md", which is not a valid address',
      'docs/README.md:9: a link to "../CONTRIBUTING.md#nowhere": CONTRIBUTING.md has no such heading',
      'docs/README.md: a link to "/top" from the root: write it relative to the page',
      "docs/nested.md:7: a Mermaid block in a list or quote, which is not drawn: put it at the top level",
      "docs/nested.md:16: a Mermaid block in a list or quote, which is not drawn: put it at the top level",
      "docs/nested.md: a Mermaid block in a list or quote, which is not drawn: put it at the top level",
    ]);
  });

  it("says when there is no README, or a Mermaid block it cannot place", async () => {
    expect(await problemsOf({ "docs/one.md": page("One") })).toEqual([
      "docs/README.md: there is no README.md",
      "docs/docs.ttl: there is no docs.ttl, the docs' index",
    ]);
    expect(
      await problemsOf({
        "docs/one.md": page("One"),
        [DOCS_INDEX]: docsTtl([["pages", "Pages", ["one.md"]]]),
      }),
    ).toEqual(["docs/README.md: there is no README.md"]);
    expect(
      await problemsOf({
        ...siteFiles(),
        "docs/one.md": page("One", ` ${diagram("Indented").replaceAll("\n", "\n ")}`),
      }),
    ).toEqual([
      "docs/one.md:5: a Mermaid block whose fence is indented, which is not drawn: start it at the margin",
    ]);
  });

  it("lists the diagrams Mermaid refuses with the rest, and passes on any other failure", async () => {
    const files = { ...siteFiles(), "docs/one.md": page("One", diagram("Flow")) };
    const refused: Draw = async () => {
      throw new DiagramError([{ file: "docs/one.md", line: 9, what: "Parse error" }]);
    };
    expect(await problemsOf(files, { draw: refused })).toEqual(["docs/one.md:9: Parse error"]);
    const broken: Draw = async () => {
      throw new Error("Chromium did not start");
    };
    await expect(render(files, { draw: broken })).rejects.toThrow("Chromium did not start");
    const shapeless: Draw = async (diagrams) =>
      new Map(diagrams.map((one) => [one.hash, { light: "<svg></svg>", dark: "<svg></svg>" }]));
    expect(await problemsOf(files, { draw: shapeless })).toEqual([
      "docs/one.md:5: Mermaid's drawing has no viewBox, which the figure is sized from",
    ]);
  });

  it("names each problem in its message", async () => {
    const error = await render({
      "docs/README.md": "# Docs\n\n## A\n\n## A\n",
      [DOCS_INDEX]: docsTtl([]),
    }).catch((thrown: DocsSiteError) => thrown);
    expect((error as Error).message).toBe(
      [
        "The docs cannot be built as pages (docs/markdown.md, The docs as a site):",
        "  docs/README.md:1: the title is not followed by a paragraph, the page's description",
        '  docs/README.md:5: a heading whose id ("a") the page already has',
      ].join("\n"),
    );
  });

  it("escapes what the text holds, so nothing in it is markup", async () => {
    const files = await render({
      ...siteFiles(),
      "docs/one.md": [
        "# One &lt;script&gt;",
        "",
        "A \"quoted\" & 'single' &lt;script&gt;alert(1)&lt;/script&gt;.",
        "",
        "`<script>` in code, *<em>* aside.",
        "",
        "```html\n<script>alert(1)</script>\n```",
      ]
        .join("\n")
        .replace("*<em>*", "*&lt;em&gt;*"),
    });
    const one = files.get("one/index.html")!;
    expect(one).not.toMatch(/<script|<\/script/i);
    expect(one).toContain("<title>One &lt;script&gt; - Solid Memo docs</title>");
    expect(one).toContain(
      'content="A &quot;quoted&quot; &amp; &#39;single&#39; &lt;script&gt;alert(1)&lt;/script&gt;."',
    );
    expect(one).toContain('<code translate="no">&lt;script&gt;</code>');
    expect(one).toContain(
      '<pre><code translate="no">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    );
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("writes every kind of block and phrasing", async () => {
    const one = (
      await render({
        ...siteFiles(),
        "docs/one.md": page(
          "One",
          "### Deeper",
          "",
          "*em* **strong** `code`  ",
          "after a break",
          "",
          "3. three",
          "4. four",
          "",
          "1) loose",
          "",
          "   second paragraph",
          "",
          "2) and apart",
          "",
          "> quoted",
          "",
          "---",
          "",
          "| L | C | R | N |",
          "|:--|:-:|--:|---|",
          "| 1 | 2 | 3 | 4 |",
          "| short |",
        ),
      })
    ).get("one/index.html")!;
    expect(one).toContain('<h3 id="deeper">Deeper</h3>');
    expect(one).toContain(
      '<p><em>em</em> <strong>strong</strong> <code translate="no">code</code><br>after a break</p>',
    );
    expect(one).toContain('<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>');
    expect(one).toContain(
      "<ol>\n<li><p>loose</p>\n<p>second paragraph</p></li>\n<li><p>and apart</p></li>\n</ol>",
    );
    expect(one).toContain("<blockquote>\n<p>quoted</p>\n</blockquote>");
    expect(one).toContain("<hr>");
    expect(one).toContain(
      '<div class="table"><table>\n<thead><tr><th class="align-left">L</th><th class="align-center">C</th><th class="align-right">R</th><th>N</th></tr></thead>',
    );
    expect(one).toContain(
      '<tbody>\n<tr><td class="align-left">1</td><td class="align-center">2</td><td class="align-right">3</td><td>4</td></tr>\n<tr><td class="align-left">short</td></tr>\n</tbody>',
    );
    // A page without sections of level 2 lists none.
    expect(one).not.toContain('class="toc"');
  });

  it("shows each diagram as a figure of its two drawings, with the font's license beside them", async () => {
    const files = await render({
      ...siteFiles(),
      "docs/README.md": page("Docs", "- [One](one.md)", "- [Two](two.md)", "", diagram("Top")),
      "docs/one.md": page("One", diagram("Flow <a>"), "", diagram("Other")),
    });
    const svgs = [...files.keys()].filter((path) => path.endsWith(".svg")).sort();
    expect(svgs).toHaveLength(6);
    for (const path of svgs)
      expect(path).toMatch(/^diagrams\/(one|README)-[0-9a-f]{8}(\.dark)?\.svg$/);
    const license = await readFile(
      createRequire(import.meta.url).resolve("@fontsource-variable/fredoka/LICENSE"),
      "utf8",
    );
    expect(files.get("diagrams/OFL-Fredoka.txt")).toBe(license);

    const one = files.get("one/index.html")!;
    const name = svgs.find((path) => path.startsWith("diagrams/one-"))!.slice(9, -4);
    const flow = name.replace(/\.dark$/, "");
    expect(files.get(`diagrams/${flow}.svg`)).toContain("light");
    expect(files.get(`diagrams/${flow}.dark.svg`)).toContain("dark");
    expect(one).toMatch(
      new RegExp(
        [
          "<figure>",
          "<picture>",
          `<source srcset="\\.\\./diagrams/one-[0-9a-f]{8}\\.dark\\.svg" media="\\(prefers-color-scheme: dark\\)">`,
          `<img src="\\.\\./diagrams/one-[0-9a-f]{8}\\.svg" alt="Flow &lt;a&gt;" width="101" height="40">`,
          "</picture>",
          "<figcaption>How Flow &lt;a&gt; flows\\.</figcaption>",
          `<details><summary>The diagram's source</summary><pre><code translate="no">flowchart LR\n  accTitle: Flow &lt;a&gt;`,
        ].join("\n"),
      ),
    );
    expect(one.match(/<figure>/g)).toHaveLength(2);
    expect(one).toContain(
      '<li><a href="../diagrams/OFL-Fredoka.txt">Diagrams set in Fredoka, SIL Open Font License 1.1</a></li>',
    );
    expect(files.get("index.html")).toContain('<img src="diagrams/README-');
    expect(files.get("index.html")).toContain('href="diagrams/OFL-Fredoka.txt"');
    expect(files.get("two/index.html")).not.toContain("OFL-Fredoka");
  });

  it("shows each diagram's source, open, when the diagrams were not drawn", async () => {
    const files = await render(
      { ...siteFiles(), "docs/one.md": page("One", diagram("Flow")) },
      { draw: async () => null },
    );
    expect([...files.keys()].some((path) => path.startsWith("diagrams/"))).toBe(false);
    const one = files.get("one/index.html")!;
    expect(one).toContain(
      [
        '<figure class="undrawn">',
        '<p class="note">This diagram was not drawn in this build.</p>',
        "<figcaption>How Flow flows.</figcaption>",
        `<details open><summary>The diagram's source</summary><pre><code translate="no">flowchart LR`,
      ].join("\n"),
    );
    expect(one).not.toContain("<img");
    expect(one).not.toContain("Fredoka");
  });

  it("writes an archive never indexed, its links at the release's tag and to the site at its origin", async () => {
    const files = await render(
      {
        ...siteFiles(),
        "docs/one.md": page("One", "[code](../packages/app/main.ts)"),
        "packages/app/main.ts": "",
      },
      { mode: "archive", ref: "v2.2.0" },
    );
    const one = files.get("one/index.html")!;
    expect(one).toContain('<meta name="robots" content="noindex">');
    expect(one).not.toContain("canonical");
    expect(one).toContain(
      '<p class="archive">These are the docs as released with Solid Memo 2.2.0. <a href="https://memo.example/docs/">Read the latest docs</a>.</p>',
    );
    expect(one).toContain('<a href="https://memo.example/">Solid Memo</a> <a href="../">Docs</a>');
    expect(one).not.toContain('rel="icon"');
    expect(one).toContain('<p class="version">Version 2.2.0</p>');
    expect(one).toContain(`<a href="${REPO}/blob/v2.2.0/packages/app/main.ts">code</a>`);
    expect(one).toContain(`<a href="${REPO}/blob/v2.2.0/docs/one.md">This page's source</a>`);
    expect(one).toContain(`Built from <a href="${REPO}/tree/v2.2.0">v2.2.0</a>`);
    expect(files.get("index.html")).toContain(
      '<a href="https://memo.example/">Solid Memo</a> <a href="./">Docs</a>',
    );
    const alone = await render(siteFiles(), { mode: "archive", origin: null });
    const readme = alone.get("index.html")!;
    expect(readme).toContain('<nav aria-label="Site"><a href="./">Docs</a></nav>');
    expect(readme).toContain(
      '<p class="archive">These are the docs as released with Solid Memo 2.2.0.</p>',
    );
  });
});

describe("repositoryIo", () => {
  it("reads the repository from disk", async () => {
    const io = repositoryIo();
    expect(await io.pages()).toContain("README.md");
    expect(await io.read("docs/README.md")).toMatch(/^# Docs\n/);
    expect(await io.read("docs/nowhere.md")).toBeNull();
    expect(await io.kind("docs")).toBe("folder");
    expect(await io.kind("docs/README.md")).toBe("file");
    expect(await io.kind("docs/nowhere.md")).toBeNull();
  });
});

describe("the repository's own docs", () => {
  /** What a page's source holds, counted from parseDocument's blocks. */
  function counted(blocks: readonly DocBlock[]) {
    const count = { links: 0, tables: 0, figures: 0 };
    const phrasing = (nodes: readonly unknown[]): void => {
      for (const node of nodes as { type: string; children?: unknown[] }[]) {
        if (node.type === "link") count.links++;
        if (node.children !== undefined) phrasing(node.children);
      }
    };
    const walk = (list: readonly DocBlock[]): void => {
      for (const block of list) {
        if (block.type === "paragraph" || block.type === "heading") phrasing(block.children);
        if (block.type === "table") {
          count.tables++;
          phrasing(block.rows.flat(2));
        }
        if (block.type === "code" && block.lang === "mermaid") count.figures++;
        if (block.type === "list") for (const item of block.items) walk(item);
        if (block.type === "quote") walk(block.children);
      }
    };
    walk(blocks);
    return count;
  }

  // Reading every page twice, about 870 KB of Markdown, takes a second on
  // a laptop and took 25 s with every package's tests running at once:
  // this test has a timeout of its own, as the one in Chromium has.
  it("render, each page with every link, table and diagram its source has", async () => {
    const io = repositoryIo();
    const files = await renderDocsSite(options(io));
    const names = await io.pages();
    expect(names.length).toBeGreaterThan(30);
    const { index } = readDocsIndex((await io.read(DOCS_INDEX))!);
    const listed = index!.groups.flatMap((group) => group.pages.map((listed) => listed.name));
    const htmlOf = (name: string) =>
      files.get(name === "README.md" ? "index.html" : `${name.slice(0, -3)}/index.html`)!;
    // The pages read in the index's order, the README first.
    const order = ["README.md", ...listed];
    order.forEach((name, place) => {
      const next = order[place + 1];
      if (next !== undefined)
        expect(htmlOf(name), name).toContain(
          `<a rel="next" href="${name === "README.md" ? "" : "../"}${next.slice(0, -3)}/">`,
        );
    });
    expect(htmlOf(order.at(-1)!)).not.toContain('rel="next"');
    for (const name of names) {
      const html = htmlOf(name);
      const source = counted(parseDocument((await io.read(`docs/${name}`))!));
      // The README's article lists every page the index lists, too.
      if (name === "README.md") source.links += listed.length;
      expect(
        {
          links: articleLinks(html).filter((address) => !address.includes("diagrams/")).length,
          tables: html.match(/<table>/g)?.length ?? 0,
          figures: html.match(/<figure>/g)?.length ?? 0,
        },
        name,
      ).toEqual(source);
    }
  }, 120_000);
});

describe("withDocsVersion", () => {
  it("makes a live page the one its build at that version would write", async () => {
    const built = await render(siteFiles());
    const released = await render(siteFiles(), { version: "3.0.0" });
    for (const name of ["index.html", "one/index.html", "two/index.html"]) {
      expect(withDocsVersion(built.get(name)!, "3.0.0")).toBe(released.get(name));
    }
  });

  it("is null for a page that states no version", () => {
    expect(withDocsVersion("<header></header>", "3.0.0")).toBeNull();
  });
});
