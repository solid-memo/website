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

/**
 * A heading of the repository's own Markdown, with its level, for a
 * page's outline, and the line it is on (from 1), for a message about it.
 */
export type DocHeading = {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  line: number;
  children: MdInline[];
};

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

/**
 * The most block quotes a text may open, wherever they are: side by
 * side, one after another, inside a list item or inside another quote.
 * A quote's next line, under the same `>`, opens none. The parser takes
 * time quadratic in them, so a text past it is shown as plain text.
 */
export const MAX_QUOTES = 200;

/**
 * The most lists a text may open: a list ends at a line that leaves its
 * items, or where an item of another kind of marker comes, so the next
 * marker opens another. An item that starts empty ends at a blank line
 * right after it. The parser takes time quadratic in them too, so
 * a text past it is shown as plain text. A list's next items open none.
 */
export const MAX_LISTS = 200;

/**
 * The most characters the parser may read ahead, all told, for the end
 * of a code span, of inline HTML or of a link's title. Each opener counts
 * the characters from it to its closer, or to the next blank line when
 * none comes, as an opener that never closes is read to the end of its
 * paragraph: a text whose count is past it is shown as plain text.
 * Repository Markdown lifts it with MAX_CHARS.
 */
export const MAX_LOOKAHEAD = 500_000;

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
 * MAX_CHARS, or past MAX_LOOKAHEAD, MAX_LINE_NESTING, MAX_NESTED_LINES,
 * MAX_LAZY_LINES, MAX_QUOTES, MAX_LISTS, MAX_DELIMITERS or MAX_UNDERLINES,
 * to be shown as plain text instead.
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
 * lifted, as a page of the docs is longer, and with it MAX_LOOKAHEAD,
 * which grows with the page, and that alone. Every other limit stays,
 * and what parseMarkdown would fold or show as its source throws a
 * DocumentError instead: raw HTML, a picture, a link reference
 * definition, what nests past MAX_DEPTH, a table past its caps, and a
 * text past MAX_LINE_NESTING, MAX_NESTED_LINES, MAX_LAZY_LINES,
 * MAX_QUOTES, MAX_LISTS, MAX_DELIMITERS or MAX_UNDERLINES. So a page
 * shows as it is written, or its build fails and says where.
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
  if (text.length > MAX_CHARS || readsTooFarAhead(text) || tooCostly(text) !== null) return null;
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
 * The containers a line opens, as CONTAINER_OPENER finds them, up to one
 * past MAX_LINE_NESTING: whether each is a quote, and whether it is one
 * of the `>`s the line starts with, which may go on with the line
 * above's quotes. Four columns of white space before an opener make it
 * code, or a paragraph's text, to the parser: after another opener, it
 * opens nothing, and nothing after it does, so the list ends before it.
 * At the line's start the white space may be a list item's indentation,
 * so the opener counts, but as one of its own, never going on from above.
 */
function openers(line: string): { quote: boolean; leading: boolean }[] {
  const found: { quote: boolean; leading: boolean }[] = [];
  let leading = true; // no list marker or indentation has come yet
  let column = 0; // the column the line is read to, tabs expanded
  let content = 0; // the column after the last opener and the one space it may take
  CONTAINER_OPENER.lastIndex = 0;
  for (
    let opener = CONTAINER_OPENER.exec(line);
    opener !== null && found.length <= MAX_LINE_NESTING;
    opener = CONTAINER_OPENER.exec(line)
  ) {
    const marker = opener[0].trim();
    const at = opener.index + opener[0].indexOf(marker);
    const markerColumn = columnAfter(line, opener.index, at, column);
    const indented = markerColumn - content >= 4;
    if (indented && found.length > 0) break;
    leading &&= marker === ">" && !indented;
    found.push({ quote: marker === ">", leading });
    content = columnAfter(line, at, at + marker.length, markerColumn) + 1;
    column = columnAfter(line, at, CONTAINER_OPENER.lastIndex, markerColumn);
  }
  return found;
}

/** The column after `text`'s characters from `start` to `end`, read from `column`: a tab goes on to the next multiple of 4. */
function columnAfter(text: string, start: number, end: number, column: number): number {
  let after = column;
  for (let index = start; index < end; index++)
    after = text[index] === "\t" ? after + 4 - (after % 4) : after + 1;
  return after;
}

/** The columns of white space a line starts with, tabs expanded. */
function indentOf(line: string): number {
  return columnAfter(line, 0, /^[ \t]*/.exec(line)![0].length, 0);
}

/**
 * How many of the line above's `>`s, `above`, a line may go on with. A
 * line indented less than the one above may have left a list item that
 * held those quotes, so its `>`s go on with none and each opens one.
 */
function quotesGoingOn(above: number, aboveIndent: number, indent: number): number {
  return indent < aboveIndent ? 0 : above;
}

/**
 * Why the parser would take too long on the text, and on which line (from
 * 1) when one says it; null when it would not: see MAX_LINE_NESTING,
 * MAX_NESTED_LINES, MAX_LAZY_LINES, MAX_QUOTES, MAX_LISTS, MAX_DELIMITERS
 * and MAX_UNDERLINES.
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
  let quotes = 0;
  let lazy = -1; // lines continuing the paragraph of a container opened above; -1: none open
  let above = 0; // the `>`s the line above starts with, before any list marker: the quotes a line may go on
  let aboveIndent = 0; // the columns of white space the line above starts with
  // A line ends at a line feed, a carriage return, or both, as CommonMark has it.
  const lines = text.split(/\r\n?|\n/);
  for (const [index, line] of lines.entries()) {
    // Only spaces and tabs make a line blank, as CommonMark has it: a line
    // of other white space, such as U+00A0, is a paragraph's text.
    if (/^[ \t]*$/.test(line) || FENCE.test(line)) {
      lazy = -1;
      above = 0;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      above = 0;
      continue;
    }
    const indent = indentOf(line);
    above = quotesGoingOn(above, aboveIndent, indent);
    aboveIndent = indent;
    let opened = 0;
    // The `>`s the line starts with, while no list marker comes before them.
    let leading = 0;
    // An opener is nested after a list marker on its line, or on an indented line.
    let inItem = /^[ \t]/.test(line);
    for (const opener of openers(line)) {
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
      if (!opener.quote) {
        inItem = true;
        continue;
      }
      // A `>` under one of the line above's goes on with its quote; any other opens one.
      if (!(opener.leading && leading < above) && ++quotes > MAX_QUOTES)
        return { what: `more than MAX_QUOTES (${MAX_QUOTES}) block quotes`, line: index + 1 };
      if (opener.leading) leading++;
    }
    above = leading;
    if (opened > 0) lazy = 0;
    else if (lazy >= 0 && !/^[ \t]/.test(line) && ++lazy > MAX_LAZY_LINES)
      return {
        what: `more than MAX_LAZY_LINES (${MAX_LAZY_LINES}) lazy continuation lines in a row`,
        line: index + 1,
      };
  }
  return listsPast(lines);
}

/**
 * Whether the parser may read ahead more than MAX_LOOKAHEAD characters,
 * all told, for the end of a code span, of inline HTML or of a link's
 * title (see readFrom). Each count reads the text only as far as it
 * counts, and the counting stops past the cap, so it takes time linear
 * in the text.
 */
function readsTooFarAhead(text: string): boolean {
  let total = 0;
  for (const opener of text.matchAll(OPENER)) {
    total += readFrom(text, opener.index, opener[0]);
    if (total > MAX_LOOKAHEAD) return true;
  }
  return false;
}

/**
 * A backtick run, `<!--`, `<?`, `<![CDATA[`, `<!` before a letter, or a
 * link's `](`: where the parser may read ahead to the end of a span.
 */
const OPENER = /`+|<!--|<\?|<!\[CDATA\[|<![A-Za-z]|\]\(/g;

/** A line break before a blank line, where a paragraph ends, so no span goes past it. */
const BLOCK_END = String.raw`(?:\r\n?|\n)[ \t]*(?=[\r\n]|$)`;

/** Before a character that comes after an even number of backslashes, so is not escaped. */
const UNESCAPED = String.raw`(?<=(?<!\\)(?:\\\\)*)`;

/**
 * The characters the parser may read from an opener at `at` for the end
 * of its span: to the span's closer, or to the end of the paragraph when
 * none comes. A backtick run closes at the next run of its length; an
 * escaped one opens one shorter, so that one counts too. `<!--` closes
 * at `-->`, `<?` at `?>`, `<![CDATA[` at `]]>` and `<!` and a letter at
 * `>`. A link reads to its title's closer, or past its destination when
 * it has no title (see linkRead). Counted high, as each run counts,
 * closers too, and an opener in code or a closed span counts as well.
 */
function readFrom(text: string, at: number, opener: string): number {
  if (opener === "](") return linkRead(text, at + 2) - at;
  if (opener === "<!--") return commentEnd(text, at + 2) - at;
  if (opener === "<?") return closerAt(text, at + 2, String.raw`\?>`) - at;
  if (opener === "<![CDATA[") return closerAt(text, at + 9, String.raw`\]\]>`) - at;
  if (opener.startsWith("<")) return closerAt(text, at + 2, ">") - at;
  const run = (length: number) => runAt(text, at + opener.length, length) - at;
  let slashes = 0;
  while (text[at - slashes - 1] === "\\") slashes++;
  return run(opener.length) + (slashes % 2 === 1 && opener.length > 1 ? run(opener.length - 1) : 0);
}

/** A backtick run, or a line break before a blank line. */
const RUN = new RegExp(`\`+|${BLOCK_END}`, "g");

/** Where the next run of `length` backticks comes from `from`, or the paragraph ends, whichever is first. */
function runAt(text: string, from: number, length: number): number {
  RUN.lastIndex = from;
  for (let found = RUN.exec(text); found !== null; found = RUN.exec(text))
    if (found[0].length === length || !found[0].startsWith("`")) return found.index;
  return text.length;
}

const closers = new Map<string, RegExp>();

/** Where `closer`, a pattern, first comes from `from`, or the paragraph ends, whichever is first. */
function closerAt(text: string, from: number, closer: string): number {
  let pattern = closers.get(closer);
  if (pattern === undefined) {
    pattern = new RegExp(`${closer}|${BLOCK_END}`, "g");
    closers.set(closer, pattern);
  }
  pattern.lastIndex = from;
  return pattern.exec(text)?.index ?? text.length;
}

/**
 * Where a comment's `-->` first comes from `from`, or the paragraph
 * ends, whichever is first. The parser closes a comment at `-->` only,
 * as CommonMark does, not at the `--!>` a browser also takes, so a count
 * that stopped there would count low. Found as a `--` before a `>`.
 */
function commentEnd(text: string, from: number): number {
  let end = closerAt(text, from, "--");
  while (text.startsWith("--", end) && text[end + 2] !== ">") end = closerAt(text, end + 1, "--");
  return end;
}

/** White space that may come between a link's parts: spaces, tabs and at most one line break. */
const LINK_SPACE = /[ \t]*(?:(?:\r\n?|\n)[ \t]*)?/y;

/** Where white space that may come between a link's parts ends, from `from`. */
function spaceAfter(text: string, from: number): number {
  LINK_SPACE.lastIndex = from;
  LINK_SPACE.exec(text);
  return LINK_SPACE.lastIndex;
}

/**
 * Where the parser stops reading a link from after its `](`: at its
 * title's closer, or the paragraph's end when none comes; past its
 * destination when no title follows. A title, in `"`, `'` or `(`, comes
 * after the destination and white space. A destination in `<` and `>`
 * ends at its first unescaped `>`, and has no title when a line break or
 * an unescaped `<` comes first. Any other ends at white space, or at a
 * `)` outside the parentheses it opens, which ends the link. Counted
 * high: a destination of too many parentheses, or of a control
 * character, holds no title to the parser.
 */
function linkRead(text: string, from: number): number {
  let end = spaceAfter(text, from);
  if (text[end] === "<") {
    end = closerAt(text, end + 1, `${UNESCAPED}[<>\\r\\n]`);
    if (text[end] !== ">") return end;
    end++;
  } else {
    let depth = 0;
    for (; end < text.length && !/[ \t\r\n]/.test(text[end]!); end++) {
      const character = text[end];
      if (character === "\\" && /[()\\]/.test(text[end + 1] ?? "")) end++;
      else if (character === "(") depth++;
      else if (character === ")" && depth-- === 0) return end;
    }
  }
  const title = spaceAfter(text, end);
  const closer = { '"': '"', "'": "'", "(": String.raw`\)` }[text[title] ?? ""];
  if (title === end || closer === undefined) return title;
  return closerAt(text, title + 1, UNESCAPED + closer);
}

/** The block quotes' `>`s a line starts with: a change in how many leaves every list. */
const QUOTE_PREFIX = /^(?: {0,3}>[ \t]?)*/;
/** A list item's marker, after its indentation, and the white space after it. */
const LIST_MARKER = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+|$)/;
/**
 * A line of a paragraph's plain words: one that starts with a letter or
 * digit and holds no `|`, `<` or `>`, so it is no table row, HTML or a
 * line that ends an HTML block.
 */
const PLAIN = /^[ \t]*[\p{L}\p{N}][^|<>]*$/u;

/**
 * Where a text opens more than MAX_LISTS lists, if it does. The lists
 * open at a line are kept as their marker and the column their items'
 * content starts at. A marker goes on with a list when it is of the same
 * kind and not indented into that list's item; a line indented less than
 * an item's content leaves it; a change in the quotes a line starts
 * with, a blank line out of a quote and a thematic break leave every
 * list. An item may start with at most one blank line, so a blank line
 * right after an item whose marker line has no content ends that item:
 * only a marker of its list's kind goes on with the list then. A marker
 * that would open a list but cannot interrupt a paragraph (an empty
 * item, or an ordered one that starts other than at 1) opens none while
 * a paragraph is open, and is a line of it. Counted high: a lazy line
 * leaves too, a marker in fenced code, indented code or an HTML block
 * opens one, and a paragraph counts as open only where it surely is
 * (see paragraphAfter).
 */
function listsPast(lines: string[]): { what: string; line: number } | null {
  let lists = 0;
  let prefix = "";
  // Each open list's last item ends (`ended`) at a blank line right after its empty marker line.
  let open: OpenList[] = [];
  let empty: { ended: boolean } | null = null; // the item opened empty on the line above
  let paragraph: Paragraph = "none";
  for (const [index, line] of lines.entries()) {
    const quotes = QUOTE_PREFIX.exec(line)![0];
    if (quotes.split(">").length !== prefix.split(">").length) open = [];
    // Under other `>`s, or the same ones written otherwise, the paragraph may have ended.
    if (quotes !== prefix) paragraph = "quiet";
    prefix = quotes;
    const rest = line.slice(quotes.length);
    const above = empty;
    empty = null;
    if (/^[ \t]*$/.test(rest)) {
      if (above !== null) above.ended = true;
      paragraph = "none";
      continue;
    }
    if (THEMATIC_BREAK.test(rest)) {
      open = [];
      paragraph = "quiet";
      continue;
    }
    const marker = LIST_MARKER.exec(rest);
    const indent = indentOf(rest);
    const place = marker === null ? null : placeItem(open, indent, marker);
    if (marker === null || (paragraph === "open" && !place!.goesOn && !interrupts(marker, rest))) {
      while (open.length > 0 && (open.at(-1)!.ended || open.at(-1)!.content > indent)) open.pop();
      paragraph = paragraphAfter(paragraph, rest, marker !== null);
      continue;
    }
    open.length = place!.keep;
    const item = enterItem(open, place!.goesOn, rest, marker);
    if (!place!.goesOn && ++lists > MAX_LISTS)
      return { what: `more than MAX_LISTS (${MAX_LISTS}) lists`, line: index + 1 };
    if (marker[0].length === rest.length) empty = item;
    paragraph = "quiet";
  }
  return null;
}

/**
 * Whether a paragraph is open under a line's `>`s, as listsPast keeps
 * it: `open` where one surely is, `none` after a blank line or at the
 * start, where the next plain line starts one, and `quiet` anywhere
 * else, till a blank line. Only after a blank line is no paragraph
 * left for that line to go on with lazily: where it does, under fewer
 * `>`s or less indented than an item, the parser lets any marker on the
 * lines after open a list.
 */
type Paragraph = "open" | "quiet" | "none";

/**
 * Whether a paragraph is open after a line that is no list item, or a
 * marker that cannot interrupt it (`skipped`). A plain line starts one
 * only unindented, as an indented line may be code in an item that the
 * next line leaves, and goes on with an open one at any indentation; a
 * dash alone underlines a heading; any other line may end it.
 */
function paragraphAfter(paragraph: Paragraph, rest: string, skipped: boolean): Paragraph {
  if (skipped) return /^ {0,3}-[ \t]*$/.test(rest) ? "quiet" : paragraph;
  if (!PLAIN.test(rest)) return "quiet";
  if (paragraph === "open" || (paragraph === "none" && indentOf(rest) === 0)) return "open";
  return paragraph;
}

/** Whether a marker may start a list where it interrupts a paragraph: with content, and if ordered, from 1. */
function interrupts(marker: RegExpExecArray, rest: string): boolean {
  return (
    marker[0].length < rest.length && (/^[-+*]$/.test(marker[2]!) || /^1[.)]$/.test(marker[2]!))
  );
}

/** A list open at a line, as listsPast keeps it. */
type OpenList = { kind: string; content: number; ended: boolean };

/**
 * Where an item at `indent` with `marker` goes among the lists `open`:
 * how many of them it keeps, and whether it goes on with the last of
 * those or opens a list in it.
 */
function placeItem(
  open: readonly OpenList[],
  indent: number,
  marker: RegExpExecArray,
): { keep: number; goesOn: boolean } {
  // A bullet list's kind is its bullet, an ordered list's its `.` or `)`.
  const kind = marker[2]!.at(-1)!;
  for (let keep = open.length; ; keep--) {
    const list = open[keep - 1];
    if (list === undefined || (!list.ended && indent >= list.content))
      return { keep, goesOn: false };
    if (list.kind === kind && indent >= (open[keep - 2]?.content ?? 0))
      return { keep, goesOn: true };
  }
}

/**
 * Puts the item a line's `marker` starts into the lists `open`, which
 * placeItem has cut to the ones it keeps: on with the last, or into a
 * list it opens. The list it is in.
 */
function enterItem(
  open: OpenList[],
  goesOn: boolean,
  rest: string,
  marker: RegExpExecArray,
): OpenList {
  const end = marker[1]!.length + marker[2]!.length;
  const after = columnAfter(rest, 0, end, 0);
  const space = columnAfter(rest, end, marker[0].length, after) - after;
  const blank = marker[0].length === rest.length;
  // The content starts after one to four columns of white space, or one past the marker.
  const content = after + (!blank && space >= 1 && space <= 4 ? space : 1);
  if (goesOn) {
    const list = open.at(-1)!;
    list.content = content;
    list.ended = false;
    return list;
  }
  const list = { kind: marker[2]!.at(-1)!, content, ended: false };
  open.push(list);
  return list;
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
              line: node.position!.start.line,
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
