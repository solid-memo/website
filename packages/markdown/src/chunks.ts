import { parseMarkdown, type MdBlock } from "./parse.ts";

/**
 * A text in chunks (docs/markdown.md, "Chunks"): a step's theory is
 * shown a chunk at a time, split at its thematic breaks. Only a break
 * at the top level splits it: one inside a list or a quote is part of
 * that block. The parsed tree is split, not the source, so a reference
 * link in one chunk resolves by a definition in another.
 */

/**
 * The blocks split at their top-level rules, the rules left out: one
 * piece more than there are rules, empty ones (a rule first or last, two
 * in a row) included.
 */
export function splitAtRules(blocks: readonly MdBlock[]): MdBlock[][] {
  const pieces: MdBlock[][] = [[]];
  for (const block of blocks) {
    if (block.type === "rule") pieces.push([]);
    else pieces.at(-1)!.push(block);
  }
  return pieces;
}

/**
 * The chunks the blocks are shown in: the pieces splitAtRules makes,
 * the empty ones dropped. Always at least one: blocks that show nothing,
 * or nothing but rules, are one empty chunk.
 */
export function chunksOf(blocks: readonly MdBlock[]): MdBlock[][] {
  const chunks = splitAtRules(blocks).filter((piece) => piece.length > 0);
  return chunks.length > 0 ? chunks : [[]];
}

/**
 * How a text written in Markdown is chunked, for a check of a library:
 * how many chunks it is shown in (chunksOf), and how many empty pieces
 * its rules make, which the app drops. A text past the parser's limits
 * is shown as plain text, one chunk, with none.
 */
export function inspectChunks(text: string): { chunks: number; empty: number } {
  const blocks = parseMarkdown(text);
  if (blocks === null) return { chunks: 1, empty: 0 };
  const pieces = splitAtRules(blocks);
  const chunks = pieces.filter((piece) => piece.length > 0).length;
  return { chunks: Math.max(chunks, 1), empty: pieces.length > 1 ? pieces.length - chunks : 0 };
}
