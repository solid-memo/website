// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { parseMarkdown, type MdBlock, type MdInline } from "./parse";

/**
 * Markdown as plain text, for places that take only text: a window's
 * title, a confirmation, an accessible name (docs/markdown.md, the plain
 * profile). Code is kept as written, emphasis marks are dropped, a link
 * is its text and a picture its alt text; list items are joined by "; ",
 * a table's cells by " | " and its rows by line breaks, and blocks by
 * line breaks. A text longer than MAX_CHARS is plain already, and is
 * returned as it is.
 */
export function plainText(text: string): string {
  const blocks = parseMarkdown(text);
  return blocks === null ? text : blocksText(blocks);
}

/** The longest start of a text `labelText` reads. */
export const LABEL_PREFIX = 2_000;

/**
 * A short name for Markdown text, such as a card's in a list, a
 * breadcrumb or a confirmation: the plain text of its first block that
 * shows any (not a rule's), its white space collapsed, cut at a word to
 * at most `max` characters with "…" when given. The text is read a run
 * of lines up to a blank line at a time, LABEL_RUNS runs at most and
 * then the rest at once, and at most LABEL_PREFIX characters of it, so a
 * label costs the same however long the text, and about what one parse
 * of LABEL_PREFIX characters does however its runs are written; it
 * is derived before it is cut, so it is never cut inside Markdown's own
 * marks. A reference link whose definition comes later is not resolved
 * there, and reads as written. The label of each text's start is
 * remembered (LABEL_CACHE_CHARS), so a list shown again, such as a
 * draft's outline, reads none of its texts again.
 */
export function labelText(text: string, max?: number): string {
  const start = startOf(text);
  let label = LABELS.get(start);
  if (label === undefined) label = labelOf(start);
  remember(start, label);
  return max === undefined || label.length <= max ? label : cut(label, max);
}

/**
 * How many characters of text starts, in all, labelText remembers the
 * labels of; the one used longest ago goes first. As many as the app
 * reads of a release's terms, so the labels of the largest draft all
 * fit, however many texts it has: a cache of a number of texts would
 * miss on every one of a longer list shown again in the same order.
 */
export const LABEL_CACHE_CHARS = 64 * 1024 * 1024;

/** The label (labelOf) of each text's start, the one used longest ago first, and how many characters of start they are of. */
const LABELS = new Map<string, string>();
let labelChars = 0;

/**
 * The part of a text its label depends on: its first LABEL_PREFIX
 * characters, as a string of its own. A key is then never longer than
 * that, so looking one up costs the same however many texts there are,
 * and it doesn't keep the rest of a long text alive, as a slice of it
 * would.
 */
function startOf(text: string): string {
  if (text.length <= LABEL_PREFIX) return text;
  return JSON.parse(JSON.stringify(text.slice(0, LABEL_PREFIX))) as string;
}

function remember(start: string, label: string): void {
  if (LABELS.delete(start)) labelChars -= start.length;
  for (const old of LABELS.keys()) {
    if (labelChars + start.length <= LABEL_CACHE_CHARS) break;
    LABELS.delete(old);
    labelChars -= old.length;
  }
  LABELS.set(start, label);
  labelChars += start.length;
}

/**
 * The most runs of a text's start labelOf reads one at a time. Past
 * them, it reads the rest of the start at once: runs that show nothing,
 * such as a list marker alone, cost a parse each, so a label costs at
 * most this many short parses more than one of its whole start.
 */
const LABEL_RUNS = 16;

/** The label of a text's start, uncut: labelText without its cache. */
function labelOf(text: string): string {
  let rest = text;
  for (let runs = 0; runs < LABEL_RUNS; runs++) {
    const start = rest.replace(/^(?:[ \t]*\r?\n)+/, "");
    if (start === "") return "";
    const end = start.search(/\r?\n[ \t]*\r?\n/);
    const length = end < 0 ? start.length : end;
    const label = shownText(start.slice(0, length));
    if (label !== "") return label;
    rest = start.slice(length);
  }
  return shownText(rest, shownItemsText);
}

/** The plain text of a text's first block that shows any (by `textOf`), its white space collapsed. */
function shownText(text: string, textOf = blockText): string {
  const blocks = parseMarkdown(text);
  const shown = blocks === null ? [text] : blocks.map(textOf);
  return (shown.find((block) => block.trim() !== "") ?? "").replace(/\s+/g, " ").trim();
}

/** A label cut to at most `max` characters, "…" included, at a word when there is one to cut at. */
function cut(label: string, max: number): string {
  const kept = label.slice(0, max - 1);
  const space = kept.lastIndexOf(" ");
  return `${(space > 0 ? kept.slice(0, space) : kept).trimEnd()}…`;
}

function blocksText(blocks: readonly MdBlock[]): string {
  return blocks
    .map(blockText)
    .filter((text) => text !== "")
    .join("\n");
}

/**
 * A block's plain text (blockText), a list's items that show nothing
 * left out: read at once, empty items that runs would each have read on
 * their own, such as `-` lines between blank ones, are one list.
 */
function shownItemsText(block: MdBlock): string {
  if (block.type !== "list") return blockText(block);
  return itemsText(block.items)
    .filter((item) => item.trim() !== "")
    .join("; ");
}

function itemsText(items: readonly MdBlock[][]): string[] {
  return items.map((item) => blocksText(item).replace(/\n/g, " "));
}

function blockText(block: MdBlock): string {
  switch (block.type) {
    case "paragraph":
      return inlinesText(block.children);
    case "code":
      return block.value;
    case "list":
      return itemsText(block.items).join("; ");
    case "quote":
      return blocksText(block.children);
    case "rule":
      return "";
    case "table":
      return block.rows.map((row) => row.map(inlinesText).join(" | ")).join("\n");
  }
}

function inlinesText(nodes: readonly MdInline[]): string {
  return nodes.map(inlineText).join("");
}

function inlineText(node: MdInline): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "emphasis":
    case "strong":
    case "link":
      return inlinesText(node.children);
    case "break":
      return "\n";
  }
}
