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
 * there, and reads as written.
 */
export function labelText(text: string, max?: number): string {
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
  return max === undefined || label.length <= max ? label : cut(label, max);
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
