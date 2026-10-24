// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  type DocBlock,
  type DocumentError,
  type MdInline,
  parseDocument,
} from "@solid-memo/markdown/parse";
import {
  type Diagram,
  DiagramError,
  type DrawInputs,
  diagramsOf,
  FONT_FAMILY,
} from "./diagrams.ts";
import type { Drawing } from "./drawDiagrams.ts";
import {
  DOCS_INDEX,
  type DocsGroup,
  type DocsIndex,
  type DocsProblem,
  listingProblems,
  readDocsIndex,
} from "./docsIndex.ts";
import { numberedIds, Slugger, slug } from "./slug.ts";

/**
 * The docs folder as a site of static pages (docs/markdown.md, The docs
 * as a site): each page read in the app's own dialect (parseDocument),
 * written out as HTML with nothing in it unescaped and no script, its
 * links made to work where the pages are served, and its diagrams drawn.
 * What the pages hold that would not show as written, or would lead
 * nowhere, fails the build, every problem listed with its file and line.
 */

/** What the site is built from: the repository's files, by their paths from its root. */
export type DocsIo = {
  /** The names of the docs' pages: the `.md` files in docs/. */
  pages(): Promise<string[]>;
  /** A file's text; null when there is none. */
  read(path: string): Promise<string | null>;
  /** Whether a path is a file or a folder; null when there is nothing there. */
  kind(path: string): Promise<"file" | "folder" | null>;
};

/** The repository's root folder, ending in a slash. */
export const REPOSITORY_ROOT = join(import.meta.dirname, "../../../");

/** The repository on disk, as the site is built from it. */
export function repositoryIo(root: string = REPOSITORY_ROOT): DocsIo {
  return {
    pages: async () => (await readdir(join(root, "docs"))).filter((name) => name.endsWith(".md")),
    read: (path) => readFile(join(root, path), "utf8").catch(() => null),
    kind: (path) =>
      stat(join(root, path)).then(
        (found) => (found.isDirectory() ? "folder" : "file"),
        () => null,
      ),
  };
}

/** The stylesheet every page links to, by its path from the repository's root. */
export const DOCS_CSS = "packages/site/src/docs.css";

/** Draws the diagrams, by their hash: drawDiagrams in a build; null when they were not drawn (DOCS_DIAGRAMS=skip). */
export type Draw = (diagrams: readonly Diagram[]) => Promise<Map<string, Drawing> | null>;

export type DocsSiteOptions = {
  io: DocsIo;
  /** The repository's web address (VITE_REPO_URL), which links out of docs/ lead into. */
  repoUrl: string;
  /** The commit or tag those links name: the built commit, or `vX.Y.Z` in an archive. */
  ref: string;
  /** The app's version, which every page names. */
  version: string;
  /** The site's origin (`https://solid-memo.com`), for the canonical address; null for none. */
  origin?: string | null;
  /** `live`: the site's own docs, at /docs/; `archive`: a release's, for its GitHub release, never indexed. */
  mode: "live" | "archive";
  inputs: DrawInputs;
  draw: Draw;
};

/** Every problem the docs have, each with its file and line. */
export class DocsSiteError extends Error {
  override name = "DocsSiteError";
  readonly problems: readonly DocsProblem[];

  constructor(problems: readonly DocsProblem[]) {
    super(
      [
        `The docs cannot be built as pages (docs/markdown.md, The docs as a site):`,
        ...problems.map(
          ({ file, line, what }) => `  ${file}${line === null ? "" : `:${line}`}: ${what}`,
        ),
      ].join("\n"),
    );
    this.problems = problems;
  }
}

/** The name of the drawings' font license, beside them. */
export const FONT_LICENSE_NAME = `OFL-${FONT_FAMILY}.txt`;

/** A page name that a folder of the site has: the drawings'. */
const RESERVED = /^diagrams\.md$/;
/** A page's name: lowercase, hyphenated (style.md). */
const PAGE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const README = "README.md";

/** A page as read, before it is written out. */
type Page = {
  name: string;
  file: string;
  text: string;
  blocks: DocBlock[];
  /** Folders below the docs' root: 0 for the README (index.html), 1 for the rest (`<page>/index.html`). */
  depth: number;
  /** Each heading's id, by the heading; null for one the page repeats. */
  ids: Map<DocBlock, string | null>;
  /** The page's diagrams; null when they have problems, which are listed already. */
  diagrams: Diagram[] | null;
  /** Each link's address on the site, by its address as written. */
  hrefs: Map<string, string>;
};

/**
 * The docs as pages, by their path in the site's docs folder:
 * `index.html` (the README), `<page>/index.html`, `docs.css`, and each
 * diagram's drawings in `diagrams/` with the font's license
 * (FONT_LICENSE_NAME) beside them.
 * Throws a DocsSiteError that lists every problem.
 */
export async function renderDocsSite(options: DocsSiteOptions): Promise<Map<string, string>> {
  const { io, inputs } = options;
  const problems: DocsProblem[] = [];
  const pages = new Map<string, Page>();
  const names = (await io.pages()).sort();
  if (!names.includes(README))
    problems.push({ file: "docs/README.md", line: null, what: "there is no README.md" });
  for (const name of names) {
    const file = `docs/${name}`;
    if (RESERVED.test(name)) {
      problems.push({
        file,
        line: null,
        what: "a page name the site keeps for a folder of its own",
      });
      continue;
    }
    if (name !== README && !PAGE_NAME.test(name)) {
      problems.push({ file, line: null, what: "a page name that is not lowercase and hyphenated" });
      continue;
    }
    const text = (await io.read(file))!;
    let blocks: DocBlock[];
    let diagrams: Diagram[] | null = null;
    try {
      blocks = parseDocument(text);
    } catch (error) {
      const refused = error as DocumentError;
      problems.push({ file, line: refused.line, what: refused.what });
      continue;
    }
    try {
      diagrams = diagramsOf(file, text, inputs);
    } catch (error) {
      problems.push(...(error as DiagramError).problems);
    }
    const page: Page = {
      name,
      file,
      text,
      blocks,
      depth: name === README ? 0 : 1,
      ids: new Map(),
      diagrams,
      hrefs: new Map(),
    };
    pages.set(name, page);
    problems.push(...outline(page));
  }
  const indexText = await io.read(DOCS_INDEX);
  let index: DocsIndex | null = null;
  if (indexText === null)
    problems.push({ file: DOCS_INDEX, line: null, what: "there is no docs.ttl, the docs' index" });
  else {
    const read = readDocsIndex(indexText);
    index = read.index;
    problems.push(...read.problems);
  }
  const order = readingOrder(pages, names, index, problems);
  for (const page of pages.values()) problems.push(...(await resolveLinks(page, pages, options)));

  let drawings: Map<string, Drawing> | null = null;
  try {
    drawings = await options.draw([...pages.values()].flatMap((page) => page.diagrams ?? []));
  } catch (error) {
    if (!(error instanceof DiagramError)) throw error;
    problems.push(...error.problems);
  }

  const files = new Map<string, string>();
  const written = [...pages.values()].map((page) => {
    const writer = new Writer(page, drawings, files, problems);
    // The title and the description, then the page's sections, then the rest.
    const top = writer.blocks(page.blocks.slice(0, 2), false);
    const rest = writer.blocks(page.blocks.slice(2), false);
    return { page, top, rest, writer };
  });
  if (problems.length > 0) throw new DocsSiteError(problems);
  // Checked by outline: each page opens with a heading of level 1, then a paragraph.
  const titles = new Map(
    [...pages.values()].map((page) => [page.name, plain(titleOf(page).children)]),
  );
  // Checked by readDocsIndex: there are no problems, so there is an index.
  const groups = index!.groups;
  for (const { page, top, rest, writer } of written) {
    const own = page.name === README ? groups : [];
    const list = own.map((group) => groupList(page, group, titles, writer)).join("\n");
    const body = [top, outlineNav(page, own), rest, list].filter((part) => part !== "").join("\n");
    files.set(
      page.depth === 0 ? "index.html" : `${page.name.slice(0, -3)}/index.html`,
      pageShell(options, page, { order, titles, groups, body, figures: writer.figures }),
    );
  }
  files.set("docs.css", (await io.read(DOCS_CSS))!);
  if ([...files.keys()].some((path) => path.endsWith(".svg")))
    files.set(`diagrams/${FONT_LICENSE_NAME}`, inputs.license);
  return files;
}

/** The plain text of phrasing: its text and code, a break a space. */
function plain(inlines: readonly MdInline[]): string {
  return inlines
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value;
      if (node.type === "break") return " ";
      return plain(node.children);
    })
    .join("");
}

/** The line (from 1) a text first holds a piece of source on; null when it is not written so. */
function lineOf(text: string, needle: string): number | null {
  const at = text.indexOf(needle);
  return at < 0 ? null : text.slice(0, at).split("\n").length;
}

/**
 * The line (from 1) of a code block's opening fence, at or after a line:
 * where its lines are written, each read without what a list or quote
 * puts before it; null when they are not written so.
 */
function fenceLine(text: string, source: string, from: number): number | null {
  const lines = text.split("\n");
  const wanted = source.split("\n").map((line) => line.trim());
  for (let index = from; index + wanted.length <= lines.length; index++) {
    if (wanted.every((line, offset) => lines[index + offset]!.trim().endsWith(line))) return index;
  }
  return null;
}

/** Each block of a page and those inside it, in order, with whether it is inside a list or quote. */
function* everyBlock(blocks: readonly DocBlock[], nested = false): Generator<[DocBlock, boolean]> {
  for (const block of blocks) {
    yield [block, nested];
    if (block.type === "list") for (const item of block.items) yield* everyBlock(item, true);
    if (block.type === "quote") yield* everyBlock(block.children, true);
  }
}

/** The phrasing a block holds itself: a paragraph's, a heading's, a table's cells. */
function phrasing(block: DocBlock): MdInline[] {
  if (block.type === "paragraph" || block.type === "heading") return block.children;
  if (block.type === "table") return block.rows.flat(2);
  return [];
}

/** Each link of some phrasing, those in emphasis too. */
function* everyLink(inlines: readonly MdInline[]): Generator<string> {
  for (const node of inlines) {
    if (node.type === "link") yield node.url;
    else if (node.type === "emphasis" || node.type === "strong") yield* everyLink(node.children);
  }
}

/**
 * A page's outline, checked: it opens with its one H1 and a paragraph
 * (its title and description), each heading has an id of its own, and
 * no list item is a task (`[ ]`, `[x]`), which the dialect does not
 * have and would show as typed.
 */
function outline(page: Page): DocsProblem[] {
  const problems: DocsProblem[] = [];
  const at = (line: number | null, what: string) => problems.push({ file: page.file, line, what });
  const [first, second] = page.blocks;
  if (first?.type !== "heading" || first.depth !== 1)
    at(1, "the page does not open with its title, a heading of level 1 (`# …`)");
  else if (second?.type !== "paragraph")
    at(first.line, "the title is not followed by a paragraph, the page's description");
  const slugger = new Slugger();
  // The skip link's target.
  slugger.take("main");
  let titles = 0;
  for (const [block] of everyBlock(page.blocks)) {
    if (block.type === "heading") {
      if (block.depth === 1 && ++titles > 1) at(block.line, "a second heading of level 1");
      const id = slugger.take(plain(block.children));
      if (id === null)
        at(
          block.line,
          `a heading whose id ("${slug(plain(block.children))}") the page already has`,
        );
      page.ids.set(block, id);
    }
    if (block.type === "list") {
      for (const [item] of block.items) {
        const marker = item?.type === "paragraph" ? item.children[0] : undefined;
        if (marker?.type === "text" && /^\[[ xX]\](\s|$)/.test(marker.value)) {
          at(
            lineOf(page.text, marker.value.split("\n")[0]!),
            "a task list item: write **Done.** or **Open.** instead (style.md)",
          );
        }
      }
    }
  }
  return problems;
}

/**
 * The pages in the index's order, the README first, for a page's
 * previous and next; what the index lists that is not in docs/, and
 * what it does not list, are problems (listingProblems), as is a
 * title other than the README's, and a group whose id the README's
 * headings have. `names` are the names of every page in docs/; without
 * an index (it does not parse, a problem already) the order is the
 * README alone.
 */
function readingOrder(
  pages: Map<string, Page>,
  names: readonly string[],
  index: DocsIndex | null,
  problems: DocsProblem[],
): string[] {
  if (index === null) return [README];
  problems.push(...listingProblems(index, names));
  const readme = pages.get(README);
  const first = readme?.blocks[0];
  if (first?.type === "heading" && first.depth === 1) {
    const title = plain(first.children);
    if (index.title !== title)
      problems.push({
        file: DOCS_INDEX,
        line: index.line,
        what: `the docs' title, "${index.title}", is not the README's, "${title}"`,
      });
  }
  const taken = new Set(["main", ...(readme === undefined ? [] : readme.ids.values())]);
  for (const group of index.groups) {
    if (taken.has(group.id))
      problems.push({
        file: DOCS_INDEX,
        line: group.line,
        what: `<#${group.id}>: the README already has a heading with the id "${group.id}"`,
      });
  }
  return [
    README,
    ...index.groups.flatMap((group) =>
      group.pages.map((page) => page.name).filter((name) => pages.has(name)),
    ),
  ];
}

/**
 * The headings' ids of a Markdown file outside docs/, as GitHub makes
 * them: its ATX headings outside fenced code, a repeated one numbered
 * (numberedIds). A fence closes on a line of at least as many of its
 * characters and nothing else, as CommonMark has it.
 */
function headingIds(text: string): Set<string> {
  const texts: string[] = [];
  let fence = "";
  for (const line of text.split(/\r?\n/)) {
    const marks = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marks !== null) {
      const [, run, rest] = marks;
      if (fence === "") {
        if (run![0] !== "`" || !rest!.includes("`")) fence = run!;
      } else if (run![0] === fence[0] && run!.length >= fence.length && rest!.trim() === "") {
        fence = "";
      }
      continue;
    }
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (fence === "" && heading !== null) {
      texts.push(heading[1]!.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, ""));
    }
  }
  return new Set(numberedIds(texts));
}

/**
 * Where each link of a page leads on the site (docs/markdown.md, Links):
 *
 * - `#id` stays, when the page has that heading;
 * - another page (`srs.md#id`) is its address, relative, when it and its
 *   heading are there;
 * - anything else in the repository (`../packages/…`) is its address on
 *   the repository's host at the built commit, `blob/` for a file and
 *   `tree/` for a folder, when it is there and, for Markdown, has the
 *   heading;
 * - an address on the web stays, when it is `http:` or `https:`.
 *
 * Anything else is a problem: a link that would lead nowhere, out of the
 * repository, from the site's root, or to another scheme.
 */
async function resolveLinks(
  page: Page,
  pages: Map<string, Page>,
  options: DocsSiteOptions,
): Promise<DocsProblem[]> {
  const problems: DocsProblem[] = [];
  const outside = new Map<string, Set<string>>();
  for (const [block] of everyBlock(page.blocks)) {
    for (const url of everyLink(phrasing(block))) {
      if (page.hrefs.has(url)) continue;
      const resolved = await linkHref(url, page, pages, options, outside);
      if ("href" in resolved) {
        page.hrefs.set(url, resolved.href);
      } else {
        problems.push({ file: page.file, line: lineOf(page.text, url), what: resolved.refused });
        page.hrefs.set(url, "");
      }
    }
  }
  return problems;
}

/** Where a link leads on the site (resolveLinks), or why it is refused. */
type LinkHref = { href: string } | { refused: string };

/** Where one link of a page leads (resolveLinks); `outside` keeps the heading ids of Markdown outside docs/ read so far. */
async function linkHref(
  url: string,
  page: Page,
  pages: Map<string, Page>,
  options: DocsSiteOptions,
  outside: Map<string, Set<string>>,
): Promise<LinkHref> {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (scheme !== null) {
    if (!/^https?$/i.test(scheme[1]!))
      return { refused: `a link to "${url}": only http: and https: addresses are kept` };
    if (!URL.canParse(url)) return { refused: `a link to "${url}", which is not a web address` };
    return { href: url };
  }
  if (url.startsWith("/"))
    return { refused: `a link to "${url}" from the root: write it relative to the page` };
  const hash = url.indexOf("#");
  const path = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? null : url.slice(hash + 1);
  let id: string | null = null;
  try {
    id = fragment === null ? null : decodeURIComponent(fragment);
    decodeURIComponent(path);
  } catch {
    return { refused: `a link to "${url}", which is not a valid address` };
  }
  if (path === "") {
    if (![...page.ids.values()].includes(id))
      return { refused: `a link to "#${id}": no such heading` };
    return { href: url };
  }
  const target = posix
    .normalize(posix.join("docs", decodeURIComponent(path)))
    .replace(/(.)\/$/, "$1");
  if (target === ".." || target.startsWith("../"))
    return { refused: `a link to "${url}", which leads out of the repository` };
  const pageName = /^docs\/([^/]+\.md)$/.exec(target)?.[1];
  if (pageName !== undefined) {
    const other = pages.get(pageName);
    if (other === undefined) return { refused: `a link to "${url}": no such page` };
    if (id !== null && ![...other.ids.values()].includes(id))
      return { refused: `a link to "${url}": ${pageName} has no such heading` };
    return { href: `${pageHref(page, pageName)}${fragment === null ? "" : `#${fragment}`}` };
  }
  return repositoryHref(url, target, id, fragment, options, outside);
}

/**
 * Where a link to anything else in the repository leads (linkHref): its
 * address on the repository's host at the built commit, when it is there
 * and, for Markdown, has the heading.
 */
async function repositoryHref(
  url: string,
  target: string,
  id: string | null,
  fragment: string | null,
  { io, repoUrl, ref }: DocsSiteOptions,
  outside: Map<string, Set<string>>,
): Promise<LinkHref> {
  const kind = await io.kind(target === "." ? "" : target);
  if (kind === null) return { refused: `a link to "${url}": the repository has no ${target}` };
  if (id !== null && kind === "file" && target.endsWith(".md")) {
    if (!outside.has(target)) outside.set(target, headingIds((await io.read(target))!));
    if (!outside.get(target)!.has(id))
      return { refused: `a link to "${url}": ${target} has no such heading` };
  }
  const where = target === "." ? "" : `/${target}`;
  return {
    href: `${repoUrl}/${kind === "folder" ? "tree" : "blob"}/${ref}${where}${fragment === null ? "" : `#${fragment}`}`,
  };
}

/** A page's address from another page: relative, `./` for itself. */
function pageHref(from: Page, name: string): string {
  const to = name === README ? "" : `${name.slice(0, -3)}/`;
  return `${"../".repeat(from.depth)}${to}` || "./";
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text as HTML, in an element or an attribute's quotes: nothing in it is markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char]!);
}

/** A page's blocks written out as HTML, its figures counted. */
class Writer {
  /** Whether the page holds a drawn diagram, for the font's line in its footer. */
  figures = false;
  private readonly page: Page;
  private readonly drawings: Map<string, Drawing> | null;
  private readonly files: Map<string, string>;
  private readonly problems: DocsProblem[];
  /** The line (from 0) a search for the next Mermaid block's place starts at. */
  private searched = 1;
  /** The page's diagrams not yet shown; null when they have problems. */
  private readonly diagrams: Diagram[] | null;

  constructor(
    page: Page,
    drawings: Map<string, Drawing> | null,
    files: Map<string, string>,
    problems: DocsProblem[],
  ) {
    this.page = page;
    this.drawings = drawings;
    this.files = files;
    this.problems = problems;
    this.diagrams = page.diagrams === null ? null : [...page.diagrams];
  }

  blocks(blocks: readonly DocBlock[], nested: boolean, tight = false): string {
    return blocks.map((block) => this.block(block, nested, tight)).join("\n");
  }

  private block(block: DocBlock, nested: boolean, tight: boolean): string {
    switch (block.type) {
      case "heading": {
        const id = this.page.ids.get(block);
        const attribute = id === null ? "" : ` id="${escapeHtml(id!)}"`;
        return `<h${block.depth}${attribute}>${this.inlines(block.children)}</h${block.depth}>`;
      }
      case "paragraph":
        return tight ? this.inlines(block.children) : `<p>${this.inlines(block.children)}</p>`;
      case "code":
        if (block.lang === "mermaid") return this.figure(block.value, nested);
        return code(block.value);
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
        const items = block.items.map((item) => `<li>${this.blocks(item, true, block.tight)}</li>`);
        return `<${tag}${start}>\n${items.join("\n")}\n</${tag}>`;
      }
      case "quote":
        return `<blockquote>\n${this.blocks(block.children, true)}\n</blockquote>`;
      case "rule":
        return "<hr>";
      case "table": {
        // A row's cells are cut to the header's width, which align has.
        const align = (index: number) => {
          const value = block.align[index]!;
          return value === null ? "" : ` class="align-${value}"`;
        };
        const row = (cells: MdInline[][], tag: string) =>
          `<tr>${cells.map((cell, index) => `<${tag}${align(index)}>${this.inlines(cell)}</${tag}>`).join("")}</tr>`;
        const [head, ...body] = block.rows;
        return [
          '<div class="table"><table>',
          `<thead>${row(head!, "th")}</thead>`,
          `<tbody>\n${body.map((cells) => row(cells, "td")).join("\n")}\n</tbody>`,
          "</table></div>",
        ].join("\n");
      }
    }
  }

  inlines(inlines: readonly MdInline[]): string {
    return inlines
      .map((node) => {
        switch (node.type) {
          case "text":
            return escapeHtml(node.value);
          case "inlineCode":
            return `<code translate="no">${escapeHtml(node.value)}</code>`;
          case "emphasis":
            return `<em>${this.inlines(node.children)}</em>`;
          case "strong":
            return `<strong>${this.inlines(node.children)}</strong>`;
          case "break":
            return "<br>";
          case "link":
            return `<a href="${escapeHtml(this.page.hrefs.get(node.url)!)}">${this.inlines(node.children)}</a>`;
        }
      })
      .join("");
  }

  /**
   * A diagram as a figure: its light and dark drawings through `<img>`,
   * sized from the drawing so the page does not move as it loads, with
   * its accTitle as their alternative text, its accDescr as the caption,
   * and its source beside it. Without drawings (DOCS_DIAGRAMS=skip), the
   * caption and the source, open, and a note.
   */
  private figure(source: string, nested: boolean): string {
    const at = (line: number | null, what: string) =>
      this.problems.push({ file: this.page.file, line, what });
    // The diagrams' problems are listed already.
    if (this.diagrams === null) return code(source);
    const line = () => {
      const found = fenceLine(this.page.text, source, this.searched);
      if (found !== null) this.searched = found + 1;
      return found;
    };
    if (nested) {
      at(line(), "a Mermaid block in a list or quote, which is not drawn: put it at the top level");
      return code(source);
    }
    const index = this.diagrams.findIndex((diagram) => diagram.source === source);
    if (index < 0) {
      at(
        line(),
        "a Mermaid block whose fence is indented, which is not drawn: start it at the margin",
      );
      return code(source);
    }
    const [diagram] = this.diagrams.splice(index, 1) as [Diagram];
    const details = (open: string) =>
      `<details${open}><summary>The diagram's source</summary>${code(diagram.source)}</details>`;
    const caption = `<figcaption>${escapeHtml(diagram.description)}</figcaption>`;
    const drawing = this.drawings?.get(diagram.hash);
    if (drawing === undefined) {
      return [
        '<figure class="undrawn">',
        `<p class="note">This diagram was not drawn in this build.</p>`,
        caption,
        details(" open"),
        "</figure>",
      ].join("\n");
    }
    const size = /\sviewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(drawing.light);
    if (size === null) {
      at(diagram.line, "Mermaid's drawing has no viewBox, which the figure is sized from");
      return code(source);
    }
    this.files.set(`diagrams/${diagram.name}.svg`, drawing.light);
    this.files.set(`diagrams/${diagram.name}.dark.svg`, drawing.dark);
    this.figures = true;
    const up = "../".repeat(this.page.depth);
    const [, width, height] = size.map((value) => String(Math.ceil(Number(value))));
    return [
      "<figure>",
      "<picture>",
      `<source srcset="${up}diagrams/${diagram.name}.dark.svg" media="(prefers-color-scheme: dark)">`,
      `<img src="${up}diagrams/${diagram.name}.svg" alt="${escapeHtml(diagram.title)}" width="${width}" height="${height}">`,
      "</picture>",
      caption,
      details(""),
      "</figure>",
    ].join("\n");
  }
}

/** A code block: shown as written, not translated, nothing highlighted. */
function code(value: string): string {
  return `<pre><code translate="no">${escapeHtml(value)}</code></pre>`;
}

/** The pages' Content Security Policy, as the About page's but with styles from docs.css alone. */
export const DOCS_CSP =
  "default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Where the site's root and the docs' root are from a page `depth` folders below the docs' root. */
function roots(options: DocsSiteOptions, depth: number) {
  const docs = "../".repeat(depth);
  return {
    docs,
    site: `${docs}..${options.mode === "archive" ? "/.." : ""}/`,
  };
}

/** A page's title: its first block, checked by outline to be a heading of level 1. */
function titleOf(page: Page): DocBlock & { type: "heading" } {
  return page.blocks[0] as DocBlock & { type: "heading" };
}

/**
 * A page's sections, its headings of level 2, and on the README the
 * index's groups after them, as links; none for a page without any.
 */
function outlineNav(page: Page, groups: readonly DocsGroup[]): string {
  const sections = page.blocks
    .filter(
      (block): block is DocBlock & { type: "heading" } =>
        block.type === "heading" && block.depth === 2,
    )
    .map((heading) => ({ id: page.ids.get(heading)!, title: plain(heading.children) }));
  sections.push(...groups);
  if (sections.length === 0) return "";
  return [
    '<nav class="toc" aria-label="On this page">',
    "<p>On this page</p>",
    "<ul>",
    ...sections.map(
      ({ id, title }) => `<li><a href="#${escapeHtml(id)}">${escapeHtml(title)}</a></li>`,
    ),
    "</ul>",
    "</nav>",
  ].join("\n");
}

/** A group of the index on the README: its heading, then each page's title as a link, and its summary. */
function groupList(
  page: Page,
  group: DocsGroup,
  titles: Map<string, string>,
  writer: Writer,
): string {
  return [
    `<h2 id="${escapeHtml(group.id)}">${escapeHtml(group.title)}</h2>`,
    "<ul>",
    ...group.pages.map(
      (listed) =>
        `<li><a href="${pageHref(page, listed.name)}">${escapeHtml(titles.get(listed.name)!)}</a> — ${writer.inlines(listed.summary)}</li>`,
    ),
    "</ul>",
  ].join("\n");
}

/**
 * Every page, by the index's groups, under "All pages" in a page's
 * header: a disclosure, as the pages run no script, with the page
 * itself marked as the current one.
 */
function pagesNav(page: Page, groups: readonly DocsGroup[], titles: Map<string, string>): string {
  const link = (name: string) =>
    `<a href="${pageHref(page, name)}"${name === page.name ? ' aria-current="page"' : ""}>${escapeHtml(titles.get(name)!)}</a>`;
  return [
    '<details class="pages">',
    "<summary>All pages</summary>",
    '<nav aria-label="All pages">',
    "<ul>",
    `<li>${link(README)}</li>`,
    ...groups.flatMap((group) => [
      `<li>${escapeHtml(group.title)}`,
      "<ul>",
      ...group.pages.map((listed) => `<li>${link(listed.name)}</li>`),
      "</ul>",
      "</li>",
    ]),
    "</ul>",
    "</nav>",
    "</details>",
  ].join("\n");
}

/** A commit's or tag's link on the repository's host, and how it reads. */
function refLink({ repoUrl, ref }: DocsSiteOptions): string {
  const sha = /^[0-9a-f]{40}$/.test(ref);
  const href = `${repoUrl}/${sha ? "commit" : "tree"}/${ref}`;
  return `<a href="${escapeHtml(href)}">${escapeHtml(sha ? ref.slice(0, 7) : ref)}</a>`;
}

/**
 * A page around its body: the About page's Content Security Policy,
 * with docs.css as the one stylesheet; its title and description; in a live build its canonical address, in an
 * archive `noindex` and a note that points to the latest docs; a skip
 * link; a header with the app, the docs and the version; the page's
 * sections; the previous and next page; and a footer.
 */
function pageShell(
  options: DocsSiteOptions,
  page: Page,
  site: {
    /** The pages in reading order (readingOrder). */
    order: readonly string[];
    /** Each page's title, by its name. */
    titles: Map<string, string>;
    /** The index's groups, for the list of every page. */
    groups: readonly DocsGroup[];
    body: string;
    /** Whether the page shows a drawn diagram. */
    figures: boolean;
  },
): string {
  const { repoUrl, ref, version, mode, origin = null } = options;
  const { order, titles, groups, body, figures } = site;
  const at = roots(options, page.depth);
  const lead = page.blocks[1] as DocBlock & { type: "paragraph" };
  const description = plain(lead.children).replace(/\s+/g, " ");
  const path = page.depth === 0 ? "" : `${page.name.slice(0, -3)}/`;
  const head = [
    mode === "archive" ? '<meta name="robots" content="noindex">' : "",
    mode === "live" && origin !== null
      ? `<link rel="canonical" href="${escapeHtml(`${origin}/docs/${path}`)}">`
      : "",
  ];
  const place = order.indexOf(page.name);
  const neighbor = (name: string | undefined, rel: string, label: string) =>
    name === undefined
      ? ""
      : `<a rel="${rel}" href="${pageHref(page, name)}">${label}: ${escapeHtml(titles.get(name)!)}</a>`;
  const archived =
    mode === "archive"
      ? `<p class="archive">These are the docs as released with Solid Memo ${escapeHtml(version)}. <a href="${at.docs}../">Read the latest docs</a>.</p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DOCS_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="light dark">
${head.filter((line) => line !== "").join("\n")}
<link rel="icon" href="${at.site}favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="${at.site}favicon.svg">
<link rel="stylesheet" href="${at.docs}docs.css">
<title>${escapeHtml(titles.get(page.name)!)} - Solid Memo docs</title>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="site">
<nav aria-label="Site"><a href="${at.site}">Solid Memo</a> <a href="${at.docs || "./"}">Docs</a></nav>
<p class="version">Version ${escapeHtml(version)}</p>
${pagesNav(page, groups, titles)}
</header>
<main id="main">
${archived}
<article>
${body}
</article>
<nav class="pager" aria-label="Previous and next">
${neighbor(order[place - 1], "prev", "Previous")}
${neighbor(order[place + 1], "next", "Next")}
</nav>
</main>
<footer>
<ul>
<li><a href="${escapeHtml(`${repoUrl}/blob/${ref}/${page.file}`)}">This page's source</a></li>
${page.name === README ? `<li><a href="${escapeHtml(`${repoUrl}/blob/${ref}/${DOCS_INDEX}`)}">The list of pages' source</a></li>` : ""}
<li><a href="${escapeHtml(`${repoUrl}/issues/new/choose`)}">Report a problem</a></li>
<li><a href="${escapeHtml(`${repoUrl}/blob/${ref}/LICENSE`)}">MIT License</a></li>
<li>Built from ${refLink(options)}</li>
${figures ? `<li><a href="${at.docs}diagrams/${FONT_LICENSE_NAME}">Diagrams set in ${FONT_FAMILY}, SIL Open Font License 1.1</a></li>` : ""}
</ul>
</footer>
</body>
</html>
`;
}

/** The version a page of the docs states in its header, as pageShell writes it. */
const STATED_VERSION = /(<p class="version">Version )[^ <]+/;

/**
 * A page of the docs stating `version` in its header instead of the one
 * it was built with; null for a page that states none. The deploy gives
 * the site CI tested, built before its release, the released version
 * (docs/deployment.md#github-pages-automatic). Only the header changes:
 * a page names its version nowhere else.
 */
export function withDocsVersion(html: string, version: string): string | null {
  if (!STATED_VERSION.test(html)) return null;
  return html.replace(STATED_VERSION, (_, before: string) => `${before}${escapeHtml(version)}`);
}
