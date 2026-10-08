import { parseMarkdown, type MdBlock, type MdInline, type MdPhrase } from "./parse";

/**
 * The text read as Markdown for a place that holds only a line of
 * phrasing, such as an option's `<label>` or a link (docs/markdown.md,
 * the inline profile): emphasis and code spans kept, everything else
 * flattened to them. Paragraphs, list items and table cells are joined
 * into one run of text, a code block becomes one code span with its
 * white space collapsed, and a link is its text, for a link cannot sit
 * in a label or another link. Null when the text is longer than
 * MAX_CHARS, to be shown as plain text instead.
 */
export function parseInlineMarkdown(text: string): MdPhrase[] | null {
  const blocks = parseMarkdown(text);
  return blocks === null ? null : joined(blocks.map(blockPhrases), " ");
}

function blockPhrases(block: MdBlock): MdPhrase[] {
  switch (block.type) {
    case "paragraph":
      return phrases(block.children);
    case "code":
      return [{ type: "inlineCode", value: block.value.replace(/\s+/g, " ").trim() }];
    case "list":
      return joined(
        block.items.map((item) => joined(item.map(blockPhrases), " ")),
        "; ",
      );
    case "quote":
      return joined(block.children.map(blockPhrases), " ");
    case "rule":
      return [];
    case "table":
      return joined(
        block.rows.flatMap((row) => row.map(phrases)),
        " · ",
      );
  }
}

function phrases(nodes: readonly MdInline[]): MdPhrase[] {
  return nodes.flatMap((node): MdPhrase[] => {
    switch (node.type) {
      case "text":
      case "inlineCode":
        return [node];
      case "emphasis":
      case "strong":
        return [{ type: node.type, children: phrases(node.children) }];
      case "link":
        return phrases(node.children);
      case "break":
        return [{ type: "text", value: " " }];
    }
  });
}

/** Runs of phrasing joined by a separator, the empty ones left out. */
function joined(runs: readonly MdPhrase[][], separator: string): MdPhrase[] {
  return runs
    .filter((run) => run.length > 0)
    .flatMap((run, index) => (index === 0 ? run : [{ type: "text" as const, value: separator }, ...run]));
}
