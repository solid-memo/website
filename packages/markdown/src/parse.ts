// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StateBlock, StateInline, Token } from "markdown-it";
import MarkdownIt from "markdown-it";
import cjkFriendly from "markdown-it-cjk-friendly";

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
  /**
   * `tight` when no blank line separates its items, or the blocks in one,
   * as CommonMark has it: their paragraphs are shown as bare text.
   */
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

/** A table wider than this, or with more cells than MAX_TABLE_CELLS, is shown as its source. */
export const MAX_TABLE_COLUMNS = 20;
export const MAX_TABLE_CELLS = 2_000;

/**
 * The most work the parser may do on a text, for each of its characters
 * (and as if it had at least WORK_FLOOR): a try of one of its rules, a
 * step through a link's label, or a token it makes, is one unit of work,
 * as is each byte of a link's or a picture's destination in UTF-8, for
 * each time it is used, counted as it is done. A try that reads past
 * what its one unit covers costs what it reads: a silent try of a rule
 * that reads on through its line (see reads) a unit for each character
 * of its line past TRY_READ, and a block quote's try or a link
 * reference definition's for each line it reads on through, as both may
 * read lines that rules after them read again.
 * What a try reads otherwise is its own line, or lines that its block,
 * or a paragraph read there instead, then holds, once for each level of
 * blocks they are in (up to NESTING). Past it, the text is shown as
 * plain text, so no text costs more than time linear in its length.
 * markdown-it reads most text in time linear in its length, but some
 * shapes, such as a block quote after each line of a paragraph, make it
 * read the rest of the text again and again: this bounds them, whatever
 * their shape, without predicting it. Repository Markdown lifts it with
 * MAX_CHARS.
 */
const MAX_WORK = 40;
const WORK_FLOOR = 1_000;

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

/**
 * The markers of the hidden characters (HIDDEN_CONTROLS) in a text, each
 * once, in the order they first come: a marker for each character, not
 * for each time it comes.
 */
export function hiddenControls(text: string): string[] {
  const found = new Set<string>();
  for (const [control] of text.matchAll(HIDDEN_CONTROLS)) found.add(control);
  return [...found].map(marker);
}

function marker(control: string): string {
  return `⟨U+${control.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}⟩`;
}

/**
 * The text read as Markdown, as blocks; null when it is longer than
 * MAX_CHARS, or the parser works on it past MAX_WORK, to be shown as
 * plain text instead.
 */
export function parseMarkdown(text: string): MdBlock[] | null {
  const tree = read(text);
  // Without its outline, Fold makes no heading: the blocks are MdBlock's.
  return tree === null ? null : (new Fold(text, false).blocks(tree, 0) as MdBlock[]);
}

/**
 * The repository's own Markdown, its docs, read as blocks in the same
 * dialect, with headings kept at their level (docs/markdown.md). For
 * trusted input read at build time only, never for data: MAX_CHARS and
 * MAX_WORK are lifted, as a page of the docs is longer. What
 * parseMarkdown would fold or show as its source throws a DocumentError
 * instead: raw HTML, a picture, a link reference definition, what nests
 * past MAX_DEPTH and a table past its caps. So a page shows as it is
 * written, or its build fails and says where.
 */
export function parseDocument(text: string): DocBlock[] {
  return new Fold(text, true).blocks(parse(text, Infinity)!, 0);
}

/** What parseDocument refuses in a text, and on which line it starts (from 1). */
export class DocumentError extends Error {
  readonly what: string;
  readonly line: number;

  constructor(what: string, line: number) {
    super(`line ${line}: ${what}`);
    this.name = "DocumentError";
    this.what = what;
    this.line = line;
  }
}

/** The parser's tree of a text, or null past MAX_CHARS or MAX_WORK. */
function read(text: string): Node[] | null {
  return text.length > MAX_CHARS ? null : parse(text, MAX_WORK * Math.max(text.length, WORK_FLOOR));
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
  new Inspect(text, notes).visitAll(tree, 0, false);
  const blocks = tree.filter((node) => node.type !== "definition");
  return {
    notes,
    oneParagraph: blocks.length === 1 && blocks[0]!.type === "paragraph",
  };
}

/**
 * The parser's tree, as this module reads it: markdown-it's tokens
 * nested, each node with the span of the text it was read from, `start`
 * to `end`.
 */
type Node = { start: number; end: number } & (
  | { type: "paragraph"; children: Node[] }
  /** `dashes` when it is underlined with them (`Text` over `---`). */
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; dashes: boolean; children: Node[] }
  | { type: "thematicBreak" }
  | { type: "blockquote"; children: Node[] }
  /** `first`: the number of its first item, as `start` is in MdBlock's list. */
  | { type: "list"; ordered: boolean; first: number; tight: boolean; items: Node[][] }
  /** A code block; `lang` is its info string's first word, as written but for escapes and references. */
  | { type: "code"; lang: string | undefined; value: string }
  | { type: "definition" }
  /** Each row cut to the header's width, a short one not padded. */
  | { type: "table"; align: MdAlign[]; rows: Node[][][] }
  /** A table past MAX_TABLE_COLUMNS or MAX_TABLE_CELLS, its rows unread. */
  | { type: "largeTable" }
  /** Raw HTML, block or inline: its value is its source. */
  | { type: "html"; value: string }
  /** `references`: the character references CommonMark decoded in it, as written. */
  | { type: "text"; value: string; references: string[] }
  | { type: "inlineCode"; value: string }
  | { type: "emphasis"; children: Node[] }
  | { type: "strong"; children: Node[] }
  | { type: "break" }
  | { type: "link"; url: string; autolink: boolean; children: Node[] }
  | { type: "image"; alt: string }
);

/**
 * How deep blocks are read: past it, a container's content is passed
 * over a line at a time, unread, so nested containers don't take time
 * quadratic in their depth. A quote nests one level and a list two (the
 * list and its item), while each is one level of MAX_DEPTH, so what is
 * passed over is always inside a node past MAX_DEPTH, which Fold shows as
 * its source. A container ends where it would have, as each of its lines
 * is still its own: markdown-it's own cut, maxNesting, would end it at
 * the end of its parent instead. Phrasing doesn't nest blocks, and links
 * don't nest, so it never cuts phrasing.
 */
const NESTING = 2 * MAX_DEPTH + 2;

const md = new MarkdownIt("commonmark", { html: true }).enable("table").use(cjkFriendly);
// Links as written, for the renderer to judge (liveLink): no URL is
// encoded, made punycode or refused, so `javascript:` is a link too.
md.normalizeLink = (url) => url;
md.normalizeLinkText = (url) => url;
md.validateLink = () => true;
// Each text token keeps its span: Build joins them.
md.core.ruler.disable("text_join");
md.inline.ruler2.disable("fragments_join");

// Inline content is read as markdown-it's own "inline" rule does, but
// for empty content, such as each cell markdown-it pads a short table row
// with, which holds nothing to read.
md.block.ruler.before("table", "nesting", (state, startLine) => {
  if (state.level < NESTING) return false;
  state.line = startLine + 1;
  return true;
});

md.core.ruler.at("inline", (state) => {
  for (const token of state.tokens)
    if (token.type === "inline" && token.content !== "")
      state.md.inline.parse(token.content, state.md, state.env, token.children!);
});

/** The work the parser may still do on the text it reads (see MAX_WORK). */
let work = 0;
/** Whether a try of a link reference definition is reading (see isEmpty). */
let defining = false;
/** What stops a parse that has done all the work it may. */
const tooMuchWork = new Error("too much work");

/** Units of the parser's work, one by default, or the end of the parse when too few are left. */
function spend(units = 1): void {
  work -= units;
  if (work < 0) throw tooMuchWork;
}

/**
 * The work of a link's or a picture's destination, one unit for each
 * byte of it in UTF-8, for each time it is used (see MAX_WORK). A
 * reference link resolves to its definition's URL however often it is
 * used, and the check and the renderer handle the URL of each use on
 * its own: a URL in an `href` takes at most three characters for each
 * byte (a percent escape), so the links a text shows hold at most a
 * small multiple of its length.
 */
function spendOn(token: Token): void {
  // The destination is the first attribute of each: `href` of a link, `src` of a picture.
  const url = String(token.attrs![0]![1]);
  let bytes = url.length;
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    // Up to U+07FF two bytes, a surrogate pair's halves two each (four in all), the rest three.
    if (code >= 0x80) bytes += code < 0x800 || (code >= 0xd800 && code < 0xe000) ? 1 : 2;
  }
  spend(bytes);
}

/**
 * A token as this module keeps it: where it was read from in its
 * state's source, `start` to `end` (-1 till a rule says), whether it is
 * pending text its state flushed, and for an `inline` block token, the
 * map from an offset in its content to one in the block source (none for
 * a cell markdown-it pads a short row with). Fields on the token, set as
 * it is pushed, so each token keeps one shape and costs no lookup.
 */
type Read = Token & {
  start: number;
  end: number;
  flushed: boolean;
  mapper?: (offset: number) => number;
};

/** A token just pushed, its span not yet known. */
function unread(token: Token, flushed: boolean): Read {
  const read = token as Read;
  read.start = -1;
  read.end = -1;
  read.flushed = flushed;
  return read;
}

md.inline.State = class extends md.inline.State {
  /** Where the state's pending text starts: where the last token read ends. */
  pendingFrom = 0;

  override pushPending(): Token {
    spend();
    return unread(super.pushPending(), true);
  }

  override push(type: string, tag: string, nesting: -1 | 0 | 1): Token {
    spend();
    return unread(super.push(type, tag, nesting), false);
  }
};

type Inline = StateInline & { pendingFrom: number };

// A link's label is read a step at a time, each step a unit of work, cached or not.
const skipToken = md.inline.skipToken.bind(md.inline);
md.inline.skipToken = (state) => {
  spend();
  skipToken(state);
};

const tokenize = md.inline.tokenize.bind(md.inline);
md.inline.tokenize = (state) => {
  spend();
  // A link's label is read in the middle of the text around it, whose pending text starts where it did.
  const around = (state as Inline).pendingFrom;
  (state as Inline).pendingFrom = state.pos;
  tokenize(state);
  const last = state.tokens.at(-1) as Read | undefined;
  if (last?.flushed && last.start < 0) {
    last.start = (state as Inline).pendingFrom;
    last.end = state.pos;
  }
  (state as Inline).pendingFrom = around;
};

for (const { name, fn, alt } of md.inline.ruler.__rules__) {
  md.inline.ruler.at(
    name,
    (state, silent) => {
      spend();
      const start = state.pos;
      const from = state.tokens.length;
      const pending = state.pending.length;
      if (!fn(state, silent)) return false;
      if (silent || state.tokens.length === from) return true;
      const tokens = state.tokens as Read[];
      let index = from;
      // Pending text, flushed by the first token the rule pushed, ends where the rule started.
      const text = tokens[index]!.flushed ? tokens[index++]! : null;
      if (text !== null) {
        text.start = (state as Inline).pendingFrom;
        text.end = start;
      }
      // Emphasis pushes a token for each of its delimiter run's characters.
      for (let character = 0; index < tokens.length; index++, character++) {
        const token = tokens[index]!;
        if (name === "emphasis") {
          token.start = start + character;
          token.end = start + character + 1;
        } else if (token.start < 0) {
          token.start = start;
          token.end = state.pos;
          if (token.type === "link_open" || token.type === "image") spendOn(token);
        }
      }
      const last = tokens.at(-1)!;
      if (name === "newline") {
        // A line break takes the spaces it trims off the text before it, and ends with its line.
        const trimmed = pending - (text?.content.length ?? 0);
        if (text !== null) text.end -= trimmed;
        last.start = start - trimmed;
        last.end = start + 1;
      } else if (name === "escape" && last.type === "hardbreak") last.end = start + 2;
      // An autolink's text is its URL, inside its angle brackets.
      else if (name === "autolink") {
        tokens.at(-2)!.start = start + 1;
        tokens.at(-2)!.end = state.pos - 1;
      }
      (state as Inline).pendingFrom = state.pos;
      return true;
    },
    { alt },
  );
}

/**
 * The block tokens not yet spanned, in the order they were pushed. A
 * container's rule reads its content with other rules, which span theirs
 * and take them off before it goes on, so what a rule finds past where
 * it started is its own: each token is spanned once, however deep it
 * nests.
 */
const unspanned: Read[] = [];

md.block.State = class extends md.block.State {
  /**
   * Whether a line is blank. A link reference definition's try asks it
   * of each line it reads on to, its destination's or its title's, as
   * far as the paragraph it would be read as goes: that line costs a
   * unit and one for each of its characters past TRY_READ, as a try
   * that fails, or ends before its title, leaves the lines it read to
   * the next rule's try.
   */
  override isEmpty(line: number): boolean {
    if (defining)
      spend(
        1 + Math.max(0, this.eMarks[line]! - this.bMarks[line]! - this.tShift[line]! - TRY_READ),
      );
    return super.isEmpty(line);
  }

  override push(type: string, tag: string, nesting: -1 | 0 | 1): Token {
    spend();
    const token = unread(super.push(type, tag, nesting), false);
    unspanned.push(token);
    return token;
  }
};

/**
 * The characters a try of a block rule reads for its one unit of work,
 * as a heading's reads its marker of up to six `#`.
 */
const TRY_READ = 8;

/**
 * What a silent try of a block rule reads of its line, past its
 * indentation, where that may be more than TRY_READ: raw HTML tries its
 * patterns on the whole line and a fence reads its info string, once
 * the line starts as their blocks do; a thematic break reads its markers
 * and spaces, and a list its marker and the spaces after it. A table's
 * try reads the next line while it reads as a delimiter row, and then
 * its own line (see silentRead).
 */
const reads: Record<string, RegExp> = {
  html_block: /<[^\n]*/y,
  fence: /(?:`{3,}|~{3,})[^\n]*/y,
  hr: /[*_-][\t *_-]*/y,
  list: /(?:\d{1,9}[.)]|[*+-])[\t ]*/y,
  table: /[|:-][\t |:-]*/y,
};

for (const { name, fn, alt } of md.block.ruler.__rules__) {
  const read = reads[name];
  md.block.ruler.at(
    name,
    (state, startLine, endLine, silent) => {
      const pushed = unspanned.length;
      const start = state.bMarks[startLine]! + state.tShift[startLine]!;
      spend(silent && read ? 1 + silentRead(read, name === "table", state, startLine) : 1);
      if (name === "blockquote" && !silent) quoteLines(state, startLine, endLine);
      if (name === "table" && !silent) {
        if (!largeTable(state, startLine, endLine, fn) && !fn(state, startLine, endLine, false))
          return false;
      } else if (name === "reference") {
        // Never tried silently: no rule ends where a definition starts.
        defining = true;
        const found = fn(state, startLine, endLine, false);
        defining = false;
        if (!found) return false;
      } else if (!fn(state, startLine, endLine, silent)) return false;
      if (silent) return true;
      // A definition shows nothing, but parseDocument refuses it where it is.
      if (name === "reference") state.push("definition", "", 0);
      let last = state.line - 1;
      while (last > startLine && state.isEmpty(last)) last--;
      // Raw HTML and indented code show as their source, from their first line's indentation past their container's.
      const at =
        name === "html_block" || name === "code"
          ? indentedFrom(state.src, start, state.sCount[startLine]! - state.blkIndent)
          : start;
      const tokens = unspanned.splice(pushed);
      for (const token of tokens) {
        token.start = at;
        token.end = state.eMarks[last]!;
      }
      mapContent(state, name, tokens, start);
      return true;
    },
    { alt },
  );
}

/**
 * The work, past its one unit, of a silent try of a block rule that
 * reads `pattern` (see reads) at `line`, or past it for a table: a unit
 * for each character it reads past TRY_READ, so a try of a line that a
 * text makes the parser read again and again costs what it reads each
 * time.
 */
function silentRead(pattern: RegExp, table: boolean, state: StateBlock, line: number): number {
  const at = table ? line + 1 : line;
  const start = state.bMarks[at]! + state.tShift[at]!;
  const end = state.eMarks[at]!;
  if (!table && end - start <= TRY_READ) return 0;
  pattern.lastIndex = start;
  let read = pattern.exec(state.src)?.[0].length ?? 0;
  if (table && read > 0 && start + read === end)
    read += state.eMarks[line]! - state.bMarks[line]! - state.tShift[line]!;
  return Math.max(0, read - TRY_READ);
}

/** The spaces and tabs at a point in a line. */
const spaces = /[\t ]*/y;

/**
 * The work of the lines a block quote's try reads before it reads its
 * content, read as markdown-it's blockquote rule reads them: each line
 * that goes on the quote with a `>` costs a unit and one for each space
 * or tab after the `>` past TRY_READ, as its try reads on through the
 * rest of the quote, while it reads its content only up to the first
 * line that goes on it lazily, without a `>`, so a quote after each line
 * of a paragraph would read the rest of the text again and again. A line
 * without a `>` costs its tries of the rules that may end the quote,
 * asked here as the rule asks them, so they cost twice.
 */
function quoteLines(state: StateBlock, startLine: number, endLine: number): void {
  if (state.src.charCodeAt(state.bMarks[startLine]! + state.tShift[startLine]!) !== 0x3e) return;
  const ends = state.md.block.ruler.getRules("blockquote");
  const parentType = state.parentType;
  state.parentType = "blockquote";
  let blank = false;
  for (let line = startLine; line < endLine; line++) {
    const start = state.bMarks[line]! + state.tShift[line]!;
    const end = state.eMarks[line]!;
    if (start >= end) break;
    if (state.src.charCodeAt(start) === 0x3e && state.sCount[line]! >= state.blkIndent) {
      spaces.lastIndex = start + 1;
      const read = spaces.exec(state.src)![0].length;
      spend(1 + Math.max(0, read - TRY_READ));
      blank = start + 1 + read >= end;
    } else if (blank || ends.some((rule) => rule(state, line, endLine, true))) break;
  }
  state.parentType = parentType;
}

/**
 * Reads a table at `startLine` as one large table, when it is past
 * MAX_TABLE_COLUMNS or MAX_TABLE_CELLS: shown as its source, its rows
 * aren't read, so markdown-it never pads a short row of a wide table
 * with cells, three tokens each. Whether a table is there is markdown-it's
 * table rule's (`fn`), asked without reading it; its rows are the ones
 * that rule reads (tableRows). Whether it read one.
 */
function largeTable(
  state: StateBlock,
  startLine: number,
  endLine: number,
  fn: (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean,
): boolean {
  if (!fn(state, startLine, endLine, true)) return false;
  const header = state.bMarks[startLine]! + state.tShift[startLine]!;
  const columns = cellsOf(state.src, header, state.eMarks[startLine]!).length;
  const rows = tableRows(state, startLine, endLine, columns);
  if (columns <= MAX_TABLE_COLUMNS && rows.cells <= MAX_TABLE_CELLS) return false;
  state.push("large_table", "", 0);
  state.line = rows.end;
  return true;
}

/** The most cells markdown-it pads a table's short rows with before it ends the table. */
const MAX_AUTOCOMPLETED_CELLS = 65_536;

/**
 * Where a table at `startLine`, of `columns` columns, ends, and how many
 * cells it has, a row's past the header's not counted: its rows as
 * markdown-it's table rule reads them, up to a line its container
 * leaves, a block that interrupts it, a blank line, indented code, or
 * the row that would take it past MAX_AUTOCOMPLETED_CELLS.
 */
function tableRows(
  state: StateBlock,
  startLine: number,
  endLine: number,
  columns: number,
): { end: number; cells: number } {
  const terminators = state.md.block.ruler.getRules("blockquote");
  const parentType = state.parentType;
  state.parentType = "table";
  let cells = columns;
  let padded = 0;
  let line = startLine + 2;
  for (; line < endLine; line++) {
    if (state.sCount[line]! < state.blkIndent) break;
    if (terminators.some((rule) => rule(state, line, endLine, true))) break;
    const start = state.bMarks[line]! + state.tShift[line]!;
    if (state.src.slice(start, state.eMarks[line]).trim() === "") break;
    if (state.sCount[line]! - state.blkIndent >= 4) break;
    const row = cellsOf(state.src, start, state.eMarks[line]!).length;
    padded += columns - row;
    if (padded > MAX_AUTOCOMPLETED_CELLS) break;
    cells += Math.min(row, columns);
  }
  state.parentType = parentType;
  return { end: line, cells };
}

/**
 * Where a block at `start` in `source` starts with the `columns` of
 * indentation it holds past its container's: the white space before it
 * that lies wholly in those columns, a tab reaching to the next multiple
 * of 4 from its line's start, as CommonMark has it. A tab its container
 * takes part of is the container's.
 */
function indentedFrom(source: string, start: number, columns: number): number {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  // The column each character of the line before the block starts at.
  const at: number[] = [];
  let column = 0;
  for (let index = lineStart; index < start; index++) {
    at.push(column);
    column = source[index] === "\t" ? column + 4 - (column % 4) : column + 1;
  }
  let from = start;
  while (from > lineStart && column - at[from - 1 - lineStart]! <= columns) from--;
  return from;
}

/** ASCII white space, which markdown-it trims off a paragraph's or heading's content. */
const TRIMMED = /[ \t\n\r]/;

/**
 * Gives the inline tokens a block rule made their mappers, while the
 * state still holds the lines as the rule read them: a paragraph's
 * content is its lines, each from its container's content to its end,
 * the last trimmed; an ATX heading's is its line after its `#`s; a table
 * cell's is its part of its row (cellsOf).
 */
function mapContent(state: StateBlock, rule: string, tokens: Read[], start: number): void {
  if (rule === "paragraph" || rule === "lheading") {
    const inline = tokens[1]!;
    inline.mapper = linesMapper(state, inline.map!, inline.content);
  } else if (rule === "heading") {
    let at = start + tokens[0]!.markup.length;
    while (at < state.eMarks[tokens[0]!.map![0]]! && TRIMMED.test(state.src[at]!)) at++;
    tokens[1]!.mapper = (offset) => at + offset;
  } else if (rule === "table") {
    let cells: number[][] = [];
    let cell = 0;
    for (const token of tokens) {
      if (token.type === "tr_open") {
        const line = token.map![0];
        cells = cellsOf(state.src, state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]!);
        cell = 0;
      } else if (token.type === "inline") {
        // A cell past the row's, which markdown-it pads the row with, has none.
        const at = cells[cell++];
        if (at !== undefined) token.mapper = (offset) => at[offset]!;
      }
    }
  }
}

/**
 * The mapper of content read from `lines`, each to its end, the last
 * trimmed: each line of the content is the end of its source line, after
 * its container's markers and any indentation the content leaves out.
 * Read once into a table of every offset, so each lookup is direct.
 */
function linesMapper(
  state: StateBlock,
  lines: [number, number],
  content: string,
): (offset: number) => number {
  const at = new Int32Array(content.length + 1);
  let offset = 0;
  for (let line = lines[0]; line < lines[1]; line++) {
    const start = state.bMarks[line]!;
    let end = state.eMarks[line]!;
    const newline = content.indexOf("\n", offset);
    const contentEnd = newline < 0 ? content.length : newline;
    if (newline < 0) while (end > start && TRIMMED.test(state.src[end - 1]!)) end--;
    // Indentation markdown-it writes out as spaces, from a tab it read in part, maps to the line's start.
    for (; offset <= contentEnd; offset++)
      at[offset] = Math.max(start, end - (contentEnd - offset));
  }
  return (offset) => at[offset]!;
}

/**
 * Where each character of each cell of a table row, from `start` to
 * `end` in `source`, was read from, as markdown-it splits the row: the
 * row trimmed, split at each `|` without a `\` before it, a `\` before a
 * `|` dropped, the first and last parts dropped when empty, and each
 * trimmed.
 */
function cellsOf(source: string, start: number, end: number): number[][] {
  const row = source.slice(start, end);
  const from = start + row.length - row.trimStart().length;
  const text = row.trim();
  // Each part as its characters, kept apart so dropping a `\` copies nothing.
  const parts: { characters: string[]; at: number[] }[] = [];
  let part = { characters: [] as string[], at: [] as number[] };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === "|" && text[index - 1] !== "\\") {
      parts.push(part);
      part = { characters: [], at: [] };
      continue;
    }
    if (character === "|") {
      part.characters.pop();
      part.at.pop();
    }
    part.characters.push(character);
    part.at.push(from + index);
  }
  parts.push(part);
  if (parts[0]?.characters.length === 0) parts.shift();
  if (parts.at(-1)?.characters.length === 0) parts.pop();
  return parts.map(({ characters, at }) => {
    const value = characters.join("");
    const lead = value.length - value.trimStart().length;
    return at.slice(lead, lead + value.trim().length);
  });
}

/**
 * The text read into the tree, with the span each node was read from;
 * null when the parser works more than `budget` on it (see MAX_WORK).
 */
function parse(text: string, budget: number): Node[] | null {
  unspanned.length = 0;
  work = budget;
  defining = false;
  let tokens: Token[];
  try {
    tokens = md.parse(text, {});
  } catch {
    // Past MAX_WORK (tooMuchWork), the one way a parse throws. Were the
    // parser to throw otherwise, the text would show as plain text too.
    return null;
  }
  return new Build(tokens as Read[], offsetsIn(text)).blocks(null);
}

/**
 * The offset in a text of each offset in its source as markdown-it
 * reads it, where a carriage return and line feed is one line feed and
 * a lone carriage return is one too: where what the source has there
 * starts in the text, so a span that ends at an offset ends before it.
 */
function offsetsIn(text: string): (offset: number) => number {
  if (!text.includes("\r")) return (offset) => offset;
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index++)
    if (!(text[index] === "\n" && text[index - 1] === "\r")) offsets.push(index);
  offsets.push(text.length);
  return (offset) => offsets[offset]!;
}

/** The walk from markdown-it's tokens to the tree, each node's span an offset in the text. */
class Build {
  private readonly tokens: Read[];
  private readonly at: (offset: number) => number;
  private index = 0;
  /** Each list being read: its level, and whether a paragraph in one of its items shows as one. */
  private readonly lists: { level: number; loose: boolean }[] = [];

  constructor(tokens: Read[], at: (offset: number) => number) {
    this.tokens = tokens;
    this.at = at;
  }

  /** The blocks up to the token of type `close` (null: the end), which is passed. */
  blocks(close: string | null): Node[] {
    const nodes: Node[] = [];
    for (
      let token = this.tokens[this.index++];
      token !== undefined && token.type !== close;
      token = this.tokens[this.index++]
    )
      nodes.push(this.block(token));
    return nodes;
  }

  private block(token: Read): Node {
    const span = { start: this.at(token.start), end: this.at(token.end) };
    switch (token.type) {
      case "paragraph_open": {
        const list = this.lists.at(-1);
        if (list !== undefined && token.level === list.level + 2 && !token.hidden)
          list.loose = true;
        const children = this.inlines(this.tokens[this.index]!);
        this.index += 2;
        return { type: "paragraph", ...span, children };
      }
      case "heading_open": {
        const children = this.inlines(this.tokens[this.index]!);
        this.index += 2;
        const depth = Number(token.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
        return { type: "heading", ...span, depth, dashes: token.markup === "-", children };
      }
      case "hr":
        return { type: "thematicBreak", ...span };
      case "blockquote_open":
        return { type: "blockquote", ...span, children: this.blocks("blockquote_close") };
      case "bullet_list_open":
      case "ordered_list_open": {
        const list = { level: token.level, loose: false };
        this.lists.push(list);
        const items: Node[][] = [];
        for (
          let item = this.tokens[this.index++]!;
          item.type === "list_item_open";
          item = this.tokens[this.index++]!
        )
          items.push(this.blocks("list_item_close"));
        this.lists.pop();
        return {
          type: "list",
          ...span,
          ordered: token.type === "ordered_list_open",
          first: Number(token.attrGet("start") ?? 1),
          tight: !list.loose,
          items,
        };
      }
      case "fence":
      case "code_block": {
        const lang = md.utils.unescapeAll(token.info).trim().split(/\s+/)[0];
        return {
          type: "code",
          ...span,
          lang: lang === "" ? undefined : lang,
          value: token.content.endsWith("\n") ? token.content.slice(0, -1) : token.content,
        };
      }
      case "table_open":
        return this.table(span);
      case "definition":
        return { type: "definition", ...span };
      case "large_table":
        return { type: "largeTable", ...span };
      // html_block
      default:
        return { type: "html", ...span, value: token.content };
    }
  }

  /** A table, from its header row to its `table_close`. */
  private table(span: { start: number; end: number }): Node {
    const align: MdAlign[] = [];
    const rows: Node[][][] = [];
    for (
      let token = this.tokens[this.index++]!;
      token.type !== "table_close";
      token = this.tokens[this.index++]!
    ) {
      if (token.type === "tr_open") rows.push([]);
      else if (token.type === "th_open")
        align.push(
          (String(token.attrGet("style") ?? "").slice("text-align:".length) || null) as MdAlign,
        );
      else if (token.type === "inline" && token.mapper !== undefined)
        rows.at(-1)!.push(this.inlines(token));
    }
    return { type: "table", ...span, align, rows };
  }

  /** The phrasing of an inline token, each node's span read through its mapper. */
  private inlines(inline: Read): Node[] {
    const mapper = inline.mapper!;
    const at = (offset: number) => this.at(mapper(offset));
    // Where a span ends that ends at `offset` in the content: after its last character, a line ending kept whole.
    const after = (offset: number) => this.at(mapper(offset - 1) + 1);
    const root: Node[] = [];
    // The emphasis, strong and links open, each with the children read so far.
    const open: (Node & { children: Node[] })[] = [];
    for (const token of inline.children as Read[]) {
      const children = open.at(-1)?.children ?? root;
      const { start, end } = token;
      const span = { start: at(start), end: after(end) };
      switch (token.type) {
        case "text":
        case "text_special":
        case "softbreak": {
          // A delimiter emptied when its run became strong.
          if (token.type === "text" && token.content === "") break;
          const value = token.type === "softbreak" ? "\n" : token.content;
          const references = token.info === "entity" ? [token.markup] : [];
          const last = children.at(-1);
          if (last?.type === "text") {
            last.value += value;
            last.end = span.end;
            last.references.push(...references);
          } else children.push({ type: "text", ...span, value, references });
          break;
        }
        case "hardbreak":
          children.push({ type: "break", ...span });
          break;
        case "code_inline":
          children.push({ type: "inlineCode", ...span, value: token.content });
          break;
        case "html_inline":
          children.push({ type: "html", ...span, value: token.content });
          break;
        case "image":
          children.push({ type: "image", ...span, alt: altOf(token.children!) });
          break;
        case "em_open":
        case "strong_open": {
          // Strong opens at its run's first character, its token the second.
          const node = {
            type: token.type === "em_open" ? "emphasis" : "strong",
            start: at(start - token.markup.length + 1),
            end: span.end,
            children: [],
          } as Node & { children: Node[] };
          children.push(node);
          open.push(node);
          break;
        }
        case "link_open": {
          const url = String(token.attrGet("href"));
          const node: Node & { children: Node[] } = {
            type: "link",
            ...span,
            url,
            autolink: token.markup === "autolink",
            children: [],
          };
          children.push(node);
          open.push(node);
          break;
        }
        // em_close, strong_close and link_close: strong closes at its run's second character, its token the first.
        default:
          open.pop()!.end =
            token.type === "link_close" ? span.end : after(start + token.markup.length);
      }
    }
    return root;
  }
}

/**
 * A picture's alt text: the text of its description, its code and raw
 * HTML as written, a picture in it by its alt text, a soft break a line
 * break and a hard one nothing, as CommonMark has it; walked without
 * recursion, however deep pictures nest.
 */
function altOf(tokens: Token[]): string {
  let alt = "";
  const stack = [...tokens].reverse();
  while (stack.length > 0) {
    const token = stack.pop()!;
    if (token.type === "image") stack.push(...[...token.children!].reverse());
    else if (token.type === "softbreak") alt += "\n";
    else if (token.nesting === 0 && token.type !== "hardbreak") alt += token.content;
  }
  return alt;
}

// Node runs this module as it is (npm run library:check), stripping its types: erasable syntax only (tsconfig.json).
/**
 * The walk from the parser's tree to the package's. With `outline`
 * (parseDocument), headings keep their level and what would be folded
 * throws a DocumentError, so nothing on a page shows other than written.
 */
class Fold {
  private readonly text: string;
  private readonly outline: boolean;
  /** Where each of the text's lines starts, for a heading's line or a refusal's: read once asked. */
  private lineStarts: number[] | null = null;

  constructor(text: string, outline: boolean) {
    this.text = text;
    this.outline = outline;
  }

  blocks(nodes: readonly Node[], depth: number): DocBlock[] {
    return nodes.flatMap((node) => this.block(node, depth));
  }

  /** One block, or none for a definition, folded to what is shown. */
  private block(node: Node, depth: number): DocBlock[] {
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
              line: this.lineOf(node),
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
            ordered: node.ordered,
            start: node.first,
            tight: node.tight,
            items: node.items.map((item) => this.blocks(item, depth + 1)),
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
      case "table":
        return [
          {
            type: "table",
            align: node.align,
            rows: node.rows.map((row) => row.map((cell) => this.inlines(cell, depth + 1, false))),
          },
        ];
      case "largeTable":
        if (this.outline) {
          this.refuse(
            node,
            `a table past MAX_TABLE_COLUMNS (${MAX_TABLE_COLUMNS}) or MAX_TABLE_CELLS (${MAX_TABLE_CELLS})`,
          );
        }
        return [this.sourceParagraph(node)];
      // Raw HTML ("html"), and anything else the parser could make, is shown as its source.
      default:
        if (this.outline) this.refuse(node, "raw HTML");
        return [this.sourceParagraph(node)];
    }
  }

  private inlines(nodes: readonly Node[], depth: number, inLink: boolean): MdInline[] {
    return nodes.flatMap((node) => this.inline(node, depth, inLink));
  }

  private inline(node: Node, depth: number, inLink: boolean): MdInline | MdInline[] {
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
        if (inLink) return this.inlines(node.children, depth + 1, true);
        return {
          type: "link",
          url: node.url,
          children: this.inlines(node.children, depth + 1, true),
        };
      // A picture is never loaded: its alt text stands in for it.
      case "image":
        if (this.outline) this.refuse(node, "a picture");
        return { type: "text", value: inLink ? visibleControls(node.alt) : node.alt };
      // Raw HTML ("html"), and anything else the parser could make, is shown as its source.
      default:
        if (this.outline) this.refuse(node, "raw HTML");
        return { type: "text", value: this.source(node) };
    }
  }

  /** Throws parseDocument's refusal of a node, at the line it starts on. */
  private refuse(node: Node, what: string): never {
    throw new DocumentError(what, this.lineOf(node));
  }

  /** The line a node starts on, from 1. */
  private lineOf(node: Node): number {
    if (this.lineStarts === null) {
      this.lineStarts = [0];
      for (const lineEnd of this.text.matchAll(/\r\n?|\n/g))
        this.lineStarts.push(lineEnd.index + lineEnd[0].length);
    }
    let line = 0;
    let after = this.lineStarts.length;
    while (line + 1 < after) {
      const middle = (line + after) >> 1;
      if (this.lineStarts[middle]! <= node.start) line = middle;
      else after = middle;
    }
    return line + 1;
  }

  /** The Markdown a node was parsed from, as written. */
  private source(node: Node): string {
    return this.text.slice(node.start, node.end);
  }

  /** A block shown as its source, its lines kept apart. */
  private sourceParagraph(node: Node): DocBlock {
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

/** The text of phrasing as plain text: its text, code and raw HTML as written, a picture's alt text, a hard break a space; walked without recursion, however deep it nests. */
function phrasingText(nodes: readonly Node[]): string {
  let text = "";
  const stack: Node[] = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "text" || node.type === "inlineCode" || node.type === "html")
      text += node.value;
    else if (node.type === "image") text += node.alt;
    else if (node.type === "break") text += " ";
    // Emphasis, strong and links: what else a link's text may hold.
    else stack.push(...[...(node as Extract<Node, { children: Node[] }>).children].reverse());
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
  private readonly notes: MdNote[];

  constructor(text: string, notes: MdNote[]) {
    this.text = text;
    this.notes = notes;
  }

  visitAll(nodes: readonly Node[], depth: number, inLink: boolean): void {
    for (const node of nodes) this.visit(node, depth, inLink);
  }

  private visit(node: Node, depth: number, inLink: boolean): void {
    if (depth >= MAX_DEPTH) {
      if (!this.asWritten(node)) this.notes.push({ type: "tooDeep", source: this.source(node) });
      return;
    }
    switch (node.type) {
      case "html":
        this.notes.push({ type: "html", source: this.source(node) });
        return;
      case "image":
        this.notes.push({ type: "image", source: this.source(node) });
        return;
      case "code":
      case "inlineCode":
        if (!inLink) this.notes.push({ type: "code", value: node.value });
        return;
      case "text":
        for (const reference of node.references)
          this.notes.push({ type: "characterReference", source: reference });
        return;
      case "link": {
        this.notes.push({
          type: "link",
          url: node.url,
          text: phrasingText(node.children),
          source: this.source(node),
          autolink: node.autolink,
        });
        // An autolink's text is its URL as written: nothing in it is decoded.
        if (!node.autolink) this.visitAll(node.children, depth + 1, true);
        return;
      }
      case "heading":
        if (node.dashes) this.notes.push({ type: "dashHeading", source: this.source(node) });
        this.visitAll(node.children, depth + 1, inLink);
        return;
      case "list":
        for (const item of node.items) this.visitAll(item, depth + 1, inLink);
        return;
      case "table":
        for (const cell of node.rows.flat()) this.visitAll(cell, depth + 1, inLink);
        return;
      case "largeTable":
        this.notes.push({ type: "largeTable", source: this.source(node) });
        return;
      default:
        if ("children" in node) this.visitAll(node.children, depth + 1, inLink);
    }
  }

  /**
   * Whether a node Fold shows as its source shows as it would have:
   * text whose source is its value, its line endings as the parser reads
   * them, or a paragraph of one line of it (Fold keeps a source's lines
   * apart).
   */
  private asWritten(node: Node): boolean {
    if (node.type === "text") return this.source(node).replace(/\r\n?/g, "\n") === node.value;
    return (
      node.type === "paragraph" &&
      node.children.every((child) => this.asWritten(child) && !this.source(child).includes("\n"))
    );
  }

  /** The Markdown a node was parsed from, as written. */
  private source(node: Node): string {
    return this.text.slice(node.start, node.end);
  }
}
