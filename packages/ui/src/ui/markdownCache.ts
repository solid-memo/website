import { chunksOf, inspectChunks } from "@solid-memo/markdown/chunks";
import { parseInlineMarkdown } from "@solid-memo/markdown/inline";
import { parseMarkdown, type MdBlock, type MdPhrase } from "@solid-memo/markdown/parse";
import { plainText } from "@solid-memo/markdown/plainText";
import { markdownProblems, OPTION, PROSE, SIDE, type FieldRule, type MarkdownProblem } from "@solid-memo/markdown/problems";
import type { DeckTextCheck } from "@solid-memo/domain/deckHealth";
import type { FieldRuleName, MarkdownCheck } from "@solid-memo/domain/release/markdownFields";

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
 * A function of a text remembered for every text it was given, however
 * many: for a list of texts read again and again in the same order,
 * which a cache of the last CACHE_SIZE would miss on every text once the
 * list is longer.
 */
function rememberedAll<T>(compute: (text: string) => T): (text: string) => T {
  const cache = new Map<string, T>();
  return (text) => {
    if (cache.has(text)) return cache.get(text)!;
    const value = compute(text);
    cache.set(text, value);
    return value;
  };
}

/**
 * A plainText that remembers every text it was given (rememberedAll): one
 * for each list of texts searched again and again, such as a deck's cards
 * in the Studio's workbench, which holds more texts than CACHE_SIZE.
 */
export function plainTexts(): (text: string) => string {
  return rememberedAll(plainText);
}

/** The markdown package's rule of each field rule the domain names. */
const RULES: Record<FieldRuleName, FieldRule> = { side: SIDE, option: OPTION, prose: PROSE };

/**
 * How a deck's health reads its text in Markdown (UseCases.checkDeck):
 * the plain text, each text parsed once (plainTexts), and the markdown
 * package's check of a field held to a rule (markdownProblems).
 */
export function deckTextCheck(): DeckTextCheck<MarkdownProblem> {
  return { plain: plainTexts(), check: (text, rule) => markdownProblems(text, RULES[rule]) };
}

/**
 * How the Studio's release check reads a release's text in Markdown
 * (UseCases.checkReleaseDraft): the markdown package's check of a field
 * held to a rule, and its chunks of a step's theory (inspectChunks),
 * remembered for every text of each rule (rememberedAll):
 * a draft is checked again as it changes, most of its text as it was,
 * and a course has more texts of a rule than CACHE_SIZE.
 */
export function releaseMarkdownCheck(): MarkdownCheck {
  const byRule: Record<FieldRuleName, (text: string) => MarkdownProblem[]> = {
    side: rememberedAll((text) => markdownProblems(text, SIDE)),
    option: rememberedAll((text) => markdownProblems(text, OPTION)),
    prose: rememberedAll((text) => markdownProblems(text, PROSE)),
  };
  return { problems: (text, rule) => byRule[rule](text), chunks: rememberedAll(inspectChunks) };
}
