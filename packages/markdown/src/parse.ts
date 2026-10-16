// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Nodes, Parents, PhrasingContent, Root, RootContent, Table, TableCell } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { cjkFriendlyExtension } from "micromark-extension-cjk-friendly";
import { gfmTable } from "micromark-extension-gfm-table";

/**
 * Markdown as Solid Memo reads it (docs/markdown.md): CommonMark 0.31.2
 * with GitHub Flavored Markdown pipe tables and CJK-friendly emphasis
 * (`**스크립트(script)**라고` is strong), `sm:markdown`. This is the
 * one module that touches the parser; everything else sees the tree
 * below, already folded to what the app shows: headings as bold
 * paragraphs, raw HTML as its source text, pictures as their alt text,
 * reference links resolved, definitions gone. Nothing here decides
 * whether a link is followed: that is the renderer's (liveLink).
 *
 * The repository's own Markdown, its docs, is read here too, in the
 * same dialect (parseDocument): trusted, so longer than data may be,
 * and refused where data would be folded.
 */

/** Phrasing content as the inline profile keeps it: no links, no breaks. */
export type MdPhrase =
  | { type: "text"; value: string }
  | { type: "inlineCode"; value: string }
  | { type: "emphasis"; children: MdPhrase[] }
  | { type: "strong"; children: MdPhrase[] };

/** Phrasing content: text, code spans, emphasis, links (their URL as written) and hard breaks. */
export type MdInline =
  | { type: "text"; value: string }
  | { type: "inlineCode"; value: string }
  | { type: "emphasis"; children: MdInline[] }
  | { type: "strong"; children: MdInline[] }
  | { type: "link"; url: string; children: MdInline[] }
  | { type: "break" };

/** A table cell's alignment, as its delimiter row says; null when it says none. */
export type MdAlign = "left" | "right" | "center" | null;

/** Block content, with what a profile adds to it (`Extra`). */
type Blocks<Extra> =
  | Extra
  | { type: "paragraph"; children: MdInline[] }
  /** A fenced or indented code block; `lang` is the info string's first word, normalized, when it is one. */
  | { type: "code"; lang?: string; value: string }
  /** `tight` when no blank line separates its items: their paragraphs are shown as bare text. */
  | { type: "list"; ordered: boolean; start: number; tight: boolean; items: Blocks<Extra>[][] }
  | { type: "quote"; children: Blocks<Extra>[] }
  | { type: "rule" }
  /**
   * The first row is the header, as wide as `align`. A body row's cells
   * past that width are dropped, as GFM has it; a short row is not padded.
   */
  | { type: "table"; align: MdAlign[]; rows: MdInline[][][] };

/** Block content, as data shows it: its headings folded to bold paragraphs. */
export type MdBlock = Blocks<never>;

/** A heading of the repository's own Markdown, with its level, for a page's outline. */
export type DocHeading = { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] };

/** Block content of the repository's own Markdown (parseDocument): MdBlock and headings. */
export type DocBlock = Blocks<DocHeading>;

/** The longest text read as Markdown; a longer one is shown as plain text. */
export const MAX_CHARS = 20_000;

/** How deep blocks and phrasing nest before the rest is shown as its source. */
export const MAX_DEPTH = 8;

/**
 * The most block quotes and list items one line may open, and the most
 * emphasis delimiters (`*`, `_`) a text may hold. The parser takes time
 * quadratic in either, so a text past them is shown as plain text: no
 * text people write comes near them, and its source still reads.
 */
export const MAX_LINE_NESTING = 16;
export const MAX_DELIMITERS = 2_000;

/**
 * The most lines a text may hold that could underline a heading (`===`,
 * `---`, a thematic break among them): the parser takes time quadratic
 * in them too, so a text past it is shown as plain text.
 */
export const MAX_UNDERLINES = 200;

/**
 * The most block quotes and list items a text may open inside a list
 * item (`- - a`, `- > a`, a list item indented under another), and the
 * most lines in a row that continue a paragraph inside a block quote or
 * list item without its `>` or indentation (lazy continuation lines).
 * The parser takes time quadratic in either, so a text past them is
 * shown as plain text.
 */
export const MAX_NESTED_LINES = 300;
export const MAX_LAZY_LINES = 200;

/** A table wider than this, or with more cells than MAX_TABLE_CELLS, is shown as its source. */
export const MAX_TABLE_COLUMNS = 20;
export const MAX_TABLE_CELLS = 2_000;

/** The first word of a code block's info string, when it looks like a language name. */
const LANGUAGE = /^[a-z0-9+#-]{1,20}$/;

/**
 * Characters that make code or a link read other than it is ("Trojan
 * Source"): every format character (Unicode's Cf: bidi overrides,
 * embeddings and isolates, zero-width characters, the soft hyphen,
 * invisible operators, tag characters), and the characters that show
 * nothing or look blank yet count, such as the Hangul fillers JavaScript
 * takes in a name, the combining grapheme joiner, the Mongolian and
 * other variation selectors, and Khmer's invisible vowels. They are
 * shown as visible markers there.
 */
const HIDDEN_CONTROLS = /[\p{Cf}͏ᅟᅠ឴឵᠋-᠏ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}]/gu;

/** The text with its hidden characters (HIDDEN_CONTROLS) shown as markers such as ⟨U+202E⟩ or ⟨U+E0041⟩. */
export function visibleControls(text: string): string {
  return text.replace(HIDDEN_CONTROLS, marker);
}

/** The markers of the hidden characters (HIDDEN_CONTROLS) in a text, each once, in the order they first come. */
export function hiddenControls(text: string): string[] {
  return [...new Set(text.match(HIDDEN_CONTROLS)?.map(marker))];
}

function marker(control: string): string {
  return `⟨U+${control.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}⟩`;
}

/**
 * The text read as Markdown, as blocks; null when it is longer than
 * MAX_CHARS, or past MAX_LINE_NESTING, MAX_DELIMITERS or MAX_UNDERLINES, to be shown as
 * plain text instead.
 */
export function parseMarkdown(text: string): MdBlock[] | null {
  const tree = read(text);
  // Without its outline, Fold makes no heading: the blocks are MdBlock's.
  return tree === null
    ? null
    : (new Fold(text, definitions(tree), false).blocks(tree.children, 0) as MdBlock[]);
}

/**
 * The repository's own Markdown, its docs, read as blocks in the same
 * dialect, with headings kept at their level (docs/markdown.md). For
 * trusted input read at build time only, never for data: MAX_CHARS is
 * lifted, as a page of the docs is longer, and that alone. Every other
 * limit stays, and what parseMarkdown would fold or show as its source
 * throws a DocumentError instead: raw HTML, a picture, a link reference
 * definition, what nests past MAX_DEPTH, a table past its caps, and a
 * text past MAX_LINE_NESTING, MAX_NESTED_LINES, MAX_LAZY_LINES,
 * MAX_DELIMITERS or MAX_UNDERLINES. So a page shows as it is written, or
 * its build fails and says where.
 */
export function parseDocument(text: string): DocBlock[] {
  const costly = tooCostly(text);
  if (costly !== null) throw new DocumentError(costly.what, costly.line);
  const tree = parse(text);
  return new Fold(text, definitions(tree), true).blocks(tree.children, 0);
}

/**
 * What parseDocument refuses in a text, and on which line it starts
 * (from 1); null for a limit on the whole text.
 */
export class DocumentError extends Error {
  readonly what: string;
  readonly line: number | null;

  constructor(what: string, line: number | null) {
    super(line === null ? what : `line ${line}: ${what}`);
    this.name = "DocumentError";
    this.what = what;
    this.line = line;
  }
}

/** The parser's tree of a text, or null past the limits parseMarkdown names. */
function read(text: string): Root | null {
  if (text.length > MAX_CHARS || tooCostly(text) !== null) return null;
  return parse(text);
}

function parse(text: string): Root {
  return fromMarkdown(text, {
    extensions: [gfmTable(), cjkFriendlyExtension()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
}

/**
 * What a text holds that its tree folds away or a check of the data
 * looks at (markdownProblems): raw HTML and pictures, each link (a
 * reference resolved to its URL, its text as plain text, and whether it
 * is an autolink, `<…>`), the value of each code span and block,
 * character references outside code (`&aring;`, which CommonMark
 * decodes), what nests past MAX_DEPTH and a table past its caps (both
 * shown as their source), and a heading underlined with dashes. Each
 * with the Markdown it was read from.
 */
export type MdNote =
  | { type: "html"; source: string }
  | { type: "image"; source: string }
  | { type: "link"; url: string; text: string; source: string; autolink: boolean }
  | { type: "code"; value: string }
  | { type: "characterReference"; source: string }
  | { type: "tooDeep"; source: string }
  | { type: "largeTable"; source: string }
  /** A heading underlined with dashes (`Text` over `---`), which reads like a line of text over a thematic break. */
  | { type: "dashHeading"; source: string };

/**
 * The text's notes, and whether it is one paragraph as written, link
 * reference definitions aside (a heading, which parseMarkdown folds to a
 * paragraph, is not); null when parseMarkdown's is.
 */
export function inspectMarkdown(text: string): { notes: MdNote[]; oneParagraph: boolean } | null {
  const tree = read(text);
  if (tree === null) return null;
  const notes: MdNote[] = [];
  new Inspect(text, definitions(tree), notes).visitAll(tree.children, 0, false);
  const blocks = tree.children.filter((node) => node.type !== "definition");
  return {
    notes,
    oneParagraph: blocks.length === 1 && blocks[0]!.type === "paragraph",
  };
}

/** One container opened at the start of a line: a block quote's `>`, or a list item's marker. */
const CONTAINER_OPENER = /[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$))[ \t]?/y;
/** A thematic break, whose `* * *` would otherwise count as list items. */
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** A code fence, which ends a paragraph, so no line after it is lazy. */
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/** A line that could underline a heading. */
const UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/gm;

/**
 * Why the parser would take too long on the text, and on which line (from
 * 1) when one says it; null when it would not: see MAX_LINE_NESTING,
 * MAX_NESTED_LINES, MAX_LAZY_LINES, MAX_DELIMITERS and MAX_UNDERLINES.
 */
function tooCostly(text: string): { what: string; line: number | null } | null {
  if ((text.match(/[*_]/g)?.length ?? 0) > MAX_DELIMITERS)
    return { what: `more than MAX_DELIMITERS (${MAX_DELIMITERS}) * and _`, line: null };
  if ((text.match(UNDERLINE)?.length ?? 0) > MAX_UNDERLINES)
    return {
      what: `more than MAX_UNDERLINES (${MAX_UNDERLINES}) lines that could underline a heading`,
      line: null,
    };
  let nested = 0;
  let lazy = -1; // lines continuing the paragraph of a container opened above; -1: none open
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "" || FENCE.test(line)) {
      lazy = -1;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) continue;
    CONTAINER_OPENER.lastIndex = 0;
    let opened = 0;
    // An opener is nested after a list marker on its line, or on an indented line.
    let inItem = /^[ \t]/.test(line);
    for (
      let opener = CONTAINER_OPENER.exec(line);
      opener !== null;
      opener = CONTAINER_OPENER.exec(line)
    ) {
      if (++opened > MAX_LINE_NESTING)
        return {
          what: `more than MAX_LINE_NESTING (${MAX_LINE_NESTING}) quotes and list items opened on one line`,
          line: index + 1,
        };
      if (inItem && ++nested > MAX_NESTED_LINES)
        return {
          what: `more than MAX_NESTED_LINES (${MAX_NESTED_LINES}) quotes and list items opened inside a list item`,
          line: index + 1,
        };
      if (!opener[0].includes(">")) inItem = true;
    }
    if (opened > 0) lazy = 0;
    else if (lazy >= 0 && !/^[ \t]/.test(line) && ++lazy > MAX_LAZY_LINES)
      return {
        what: `more than MAX_LAZY_LINES (${MAX_LAZY_LINES}) lazy continuation lines in a row`,
        line: index + 1,
      };
  }
  return null;
}

/**
 * The destination of each link reference definition, by its normalized
 * label, the first one winning, as CommonMark has it. Definitions may
 * sit in any container, so the whole tree is walked, without recursion,
 * however deep it nests.
 */
function definitions(tree: Root): Map<string, string> {
  const found = new Map<string, string>();
  const stack: Nodes[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "definition" && !found.has(node.identifier))
      found.set(node.identifier, node.url);
    if ("children" in node) stack.push(...[...(node as Parents).children].reverse());
  }
  return found;
}

// Node runs this module as it is (npm run library:check), stripping its types: erasable syntax only (tsconfig.json).
/**
 * The walk from the parser's tree to the package's. With `outline`
 * (parseDocument), headings keep their level and what would be folded
 * throws a DocumentError, so nothing on a page shows other than written.
 */
class Fold {
  private readonly text: string;
  private readonly definitions: Map<string, string>;
  private readonly outline: boolean;

  constructor(text: string, definitions: Map<string, string>, outline: boolean) {
    this.text = text;
    this.definitions = definitions;
    this.outline = outline;
  }

  blocks(nodes: readonly RootContent[], depth: number): DocBlock[] {
    return nodes.flatMap((node) => this.block(node, depth));
  }

  /** One block, or none for a definition, folded to what is shown. */
  private block(node: RootContent, depth: number): DocBlock[] {
    if (depth >= MAX_DEPTH) {
      if (this.outline) this.refuse(node, `nested deeper than MAX_DEPTH (${MAX_DEPTH})`);
      return [this.sourceParagraph(node)];
    }
    switch (node.type) {
      case "paragraph":
        return [{ type: "paragraph", children: this.inlines(node.children, depth + 1, false) }];
      case "heading":
        if (this.outline) {
          return [
            {
              type: "heading",
              depth: node.depth,
              children: this.inlines(node.children, depth + 1, false),
            },
          ];
        }
        // A heading in data must not add to the page's outline.
        return [
          {
            type: "paragraph",
            children: [{ type: "strong", children: this.inlines(node.children, depth + 1, false) }],
          },
        ];
      case "thematicBreak":
        return [{ type: "rule" }];
      case "blockquote":
        return [{ type: "quote", children: this.blocks(node.children, depth + 1) }];
      case "list":
        return [
          {
            type: "list",
            ordered: node.ordered === true,
            start: node.start ?? 1,
            tight: node.spread !== true,
            items: node.children.map((item) => this.blocks(item.children, depth + 1)),
          },
        ];
      case "code": {
        const lang = node.lang?.toLowerCase();
        return [
          {
            type: "code",
            ...(lang !== undefined && LANGUAGE.test(lang) ? { lang } : {}),
            value: visibleControls(node.value),
          },
        ];
      }
      case "definition":
        if (this.outline) this.refuse(node, "a link reference definition");
        return [];
      case "table": {
        const rows = rowsOf(node);
        if (rows === null) {
          if (this.outline) {
            this.refuse(
              node,
              `a table past MAX_TABLE_COLUMNS (${MAX_TABLE_COLUMNS}) or MAX_TABLE_CELLS (${MAX_TABLE_CELLS})`,
            );
          }
          return [this.sourceParagraph(node)];
        }
        return [
          {
            type: "table",
            align: node.align!.map((align) => align ?? null),
            rows: rows.map((row) =>
              row.map((cell) => this.inlines(cell.children, depth + 1, false)),
            ),
          },
        ];
      }
      // Raw HTML ("html"), and anything else the parser could make, is shown as its source.
      default:
        if (this.outline) this.refuse(node, "raw HTML");
        return [this.sourceParagraph(node)];
    }
  }

  private inlines(nodes: readonly PhrasingContent[], depth: number, inLink: boolean): MdInline[] {
    return nodes.flatMap((node) => this.inline(node, depth, inLink));
  }

  private inline(node: PhrasingContent, depth: number, inLink: boolean): MdInline | MdInline[] {
    if (depth >= MAX_DEPTH) {
      if (this.outline) this.refuse(node, `nested deeper than MAX_DEPTH (${MAX_DEPTH})`);
      return { type: "text", value: this.source(node) };
    }
    switch (node.type) {
      case "text":
        return { type: "text", value: inLink ? visibleControls(node.value) : node.value };
      case "inlineCode":
        return { type: "inlineCode", value: visibleControls(node.value) };
      case "emphasis":
        return { type: "emphasis", children: this.inlines(node.children, depth + 1, inLink) };
      case "strong":
        return { type: "strong", children: this.inlines(node.children, depth + 1, inLink) };
      case "break":
        return { type: "break" };
      // A link in a link's text (an autolink may sit there) is only its
      // text, so a link never holds another one and the host shown after
      // a link's text is always where that text leads.
      case "link":
      case "linkReference":
        if (inLink) return this.inlines(node.children, depth + 1, true);
        return node.type === "link"
          ? { type: "link", url: node.url, children: this.inlines(node.children, depth + 1, true) }
          : {
              // The parser makes a reference only when its definition exists.
              type: "link",
              url: this.definitions.get(node.identifier)!,
              children: this.inlines(node.children, depth + 1, true),
            };
      // A picture is never loaded: its alt text stands in for it.
      case "image":
      case "imageReference":
        if (this.outline) this.refuse(node, "a picture");
        return { type: "text", value: inLink ? visibleControls(node.alt!) : node.alt! };
      // Raw HTML ("html"), and anything else the parser could make, is shown as its source.
      default:
        if (this.outline) this.refuse(node, "raw HTML");
        return { type: "text", value: this.source(node) };
    }
  }

  /** Throws parseDocument's refusal of a node, at the line it starts on. */
  private refuse(node: Nodes, what: string): never {
    throw new DocumentError(what, node.position!.start.line);
  }

  /** The Markdown a node was parsed from, as written. */
  private source(node: Nodes): string {
    return this.text.slice(node.position!.start.offset, node.position!.end.offset);
  }

  /** A block shown as its source, its lines kept apart. */
  private sourceParagraph(node: Nodes): DocBlock {
    const lines = this.source(node).split("\n");
    return {
      type: "paragraph",
      children: lines.flatMap((line, index): MdInline[] =>
        index === 0
          ? [{ type: "text", value: line }]
          : [{ type: "break" }, { type: "text", value: line }],
      ),
    };
  }
}

/**
 * A table's rows, each cut to the header's width as GFM has it; null
 * when the table is past MAX_TABLE_COLUMNS or MAX_TABLE_CELLS, to be
 * shown as its source.
 */
function rowsOf(table: Table): TableCell[][] | null {
  const columns = table.align!.length;
  const rows = table.children.map((row) => row.children.slice(0, columns));
  const cells = rows.reduce((sum, row) => sum + row.length, 0);
  return columns > MAX_TABLE_COLUMNS || cells > MAX_TABLE_CELLS ? null : rows;
}

/**
 * A character reference, `&name;`, `&#nn;` or `&#xhh;`, after an even
 * run of backslashes (an odd one escapes its `&`). Whether CommonMark
 * decodes it, a name it knows, is asked of the parser (decodes).
 */
const REFERENCE =
  /(?<!\\)(?:\\\\)*(&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{0,31});)/g;

const decoded = new Map<string, boolean>();

/** Whether CommonMark reads a character reference, alone, as other than it is written. */
function decodes(reference: string): boolean {
  let answer = decoded.get(reference);
  if (answer === undefined) {
    const paragraph = fromMarkdown(reference).children[0] as Parents;
    answer = (paragraph.children[0] as { value: string }).value !== reference;
    decoded.set(reference, answer);
  }
  return answer;
}

/** The text of phrasing as plain text: its text, code and raw HTML as written, a picture's alt text, a hard break a space; walked without recursion, however deep it nests. */
function phrasingText(nodes: readonly PhrasingContent[]): string {
  let text = "";
  const stack: Nodes[] = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "text" || node.type === "inlineCode" || node.type === "html")
      text += node.value;
    else if (node.type === "image" || node.type === "imageReference") text += node.alt!;
    else if (node.type === "break") text += " ";
    // Emphasis and strong: what else a link's text may hold.
    else stack.push(...[...(node as Parents).children].reverse());
  }
  return text;
}

/**
 * The walk inspectMarkdown makes, nesting as Fold does, so what Fold
 * shows as its source is noted once, as too deep: unless it would show
 * as it does anyway, plain text with nothing escaped or referenced.
 * Code in a link's text is not noted apart, being in the link's.
 */
class Inspect {
  private readonly text: string;
  private readonly definitions: Map<string, string>;
  private readonly notes: MdNote[];

  constructor(text: string, definitions: Map<string, string>, notes: MdNote[]) {
    this.text = text;
    this.definitions = definitions;
    this.notes = notes;
  }

  visitAll(nodes: readonly Nodes[], depth: number, inLink: boolean): void {
    for (const node of nodes) this.visit(node, depth, inLink);
  }

  private visit(node: Nodes, depth: number, inLink: boolean): void {
    if (depth >= MAX_DEPTH) {
      if (!this.asWritten(node)) this.notes.push({ type: "tooDeep", source: this.source(node) });
      return;
    }
    switch (node.type) {
      case "html":
        this.notes.push({ type: "html", source: this.source(node) });
        return;
      case "image":
      case "imageReference":
        this.notes.push({ type: "image", source: this.source(node) });
        return;
      case "code":
      case "inlineCode":
        if (!inLink) this.notes.push({ type: "code", value: node.value });
        return;
      case "text":
        for (const [, reference] of this.source(node).matchAll(REFERENCE)) {
          if (decodes(reference!))
            this.notes.push({ type: "characterReference", source: reference! });
        }
        return;
      case "link":
      case "linkReference": {
        const source = this.source(node);
        // An autolink's text is its URL as written: nothing in it is decoded.
        const autolink = source.startsWith("<");
        this.notes.push({
          type: "link",
          url: node.type === "link" ? node.url : this.definitions.get(node.identifier)!,
          text: phrasingText(node.children),
          source,
          autolink,
        });
        if (!autolink) this.visitAll(node.children, depth + 1, true);
        return;
      }
      case "heading":
        // Underlined with dashes (a heading of level 2 over more than one line, as `##` takes one), as `---` right
        // under a line of text is when no blank line comes between them.
        if (node.depth === 2 && node.position!.start.line < node.position!.end.line) {
          this.notes.push({ type: "dashHeading", source: this.source(node) });
        }
        this.visitAll(node.children, depth + 1, inLink);
        return;
      case "list":
        for (const item of node.children) this.visitAll(item.children, depth + 1, inLink);
        return;
      case "table": {
        const rows = rowsOf(node);
        if (rows === null) this.notes.push({ type: "largeTable", source: this.source(node) });
        else for (const cell of rows.flat()) this.visitAll(cell.children, depth + 1, inLink);
        return;
      }
      default:
        if ("children" in node) this.visitAll((node as Parents).children, depth + 1, inLink);
    }
  }

  /**
   * Whether a node Fold shows as its source shows as it would have:
   * text whose source is its value, or a paragraph of one line of it
   * (Fold keeps a source's lines apart).
   */
  private asWritten(node: Nodes): boolean {
    if (node.type === "text") return this.source(node) === node.value;
    return (
      node.type === "paragraph" &&
      node.children.every((child) => this.asWritten(child) && !this.source(child).includes("\n"))
    );
  }

  /** The Markdown a node was parsed from, as written. */
  private source(node: Nodes): string {
    return this.text.slice(node.position!.start.offset, node.position!.end.offset);
  }
}
