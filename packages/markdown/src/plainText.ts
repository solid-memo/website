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
 * of lines up to a blank line at a time, and at most LABEL_PREFIX
 * characters of it, so a label costs the same however long the text; it
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

/** The label of a text's start, uncut: labelText without its cache. */
function labelOf(text: string): string {
  let rest = text;
  let read = 0;
  let label = "";
  while (label === "" && read < LABEL_PREFIX) {
    const start = rest.replace(/^(?:[ \t]*\r?\n)+/, "");
    read += rest.length - start.length;
    if (start === "" || read >= LABEL_PREFIX) break;
    const end = start.search(/\r?\n[ \t]*\r?\n/);
    const length = Math.min(end < 0 ? start.length : end, LABEL_PREFIX - read);
    const run = start.slice(0, length);
    const blocks = parseMarkdown(run);
    const shown = blocks === null ? [run] : blocks.map(blockText);
    label = (shown.find((block) => block.trim() !== "") ?? "").replace(/\s+/g, " ").trim();
    read += length;
    rest = start.slice(length);
  }
  return label;
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

function blockText(block: MdBlock): string {
  switch (block.type) {
    case "paragraph":
      return inlinesText(block.children);
    case "code":
      return block.value;
    case "list":
      return block.items.map((item) => blocksText(item).replace(/\n/g, " ")).join("; ");
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
