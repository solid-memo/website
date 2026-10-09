import { chunksOf } from "@solid-memo/markdown/chunks";
import { parseInlineMarkdown } from "@solid-memo/markdown/inline";
import { parseMarkdown, type MdBlock, type MdPhrase } from "@solid-memo/markdown/parse";
import { plainText } from "@solid-memo/markdown/plainText";

/** How many texts each cache keeps; the oldest goes first. */
export const CACHE_SIZE = 500;

/**
 * A function of a text remembered for the last CACHE_SIZE texts it was
 * given, so a list re-rendered, a card turned or a language switched
 * does not parse the same text again.
 */
function remembered<T>(compute: (text: string) => T): (text: string) => T {
  const cache = new Map<string, T>();
  return (text) => {
    if (cache.has(text)) return cache.get(text)!;
    const value = compute(text);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(text, value);
    return value;
  };
}

/** The text as Markdown blocks (parseMarkdown), null when it is to be shown as plain text. */
export const markdownBlocks: (text: string) => MdBlock[] | null = remembered(parseMarkdown);

/** The text as one line of Markdown phrasing (parseInlineMarkdown), null when it is to be shown as plain text. */
export const markdownPhrases: (text: string) => MdPhrase[] | null = remembered(parseInlineMarkdown);

/**
 * The text as Markdown chunks (chunksOf), split at its top-level
 * thematic breaks, as a step's theory is shown; null when it is to be
 * shown as plain text, one chunk. Read from markdownBlocks, so a text is
 * parsed once for both.
 */
export const markdownChunks: (text: string) => MdBlock[][] | null = remembered((text) => {
  const blocks = markdownBlocks(text);
  return blocks === null ? null : chunksOf(blocks);
});

/**
 * A plainText that remembers every text it was given, however many: one
 * for each list of texts searched again and again, such as a deck's cards
 * in the Studio's workbench, which holds more texts than CACHE_SIZE.
 */
export function plainTexts(): (text: string) => string {
  const cache = new Map<string, string>();
  return (text) => {
    let plain = cache.get(text);
    if (plain === undefined) {
      plain = plainText(text);
      cache.set(text, plain);
    }
    return plain;
  };
}
