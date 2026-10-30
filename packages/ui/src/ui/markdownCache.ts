// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { chunksOf, inspectChunks } from "@solid-memo/markdown/chunks";
import { parseInlineMarkdown } from "@solid-memo/markdown/inline";
import { parseMarkdown, type MdBlock, type MdPhrase } from "@solid-memo/markdown/parse";
import { plainText } from "@solid-memo/markdown/plainText";
import {
  markdownProblems,
  OPTION,
  PROSE,
  SIDE,
  type FieldRule,
  type MarkdownProblem,
} from "@solid-memo/markdown/problems";
import { textHash } from "./textHash";
import type { DeckTextCheck } from "@solid-memo/domain/deckHealth";
import type { FieldRuleName, MarkdownCheck } from "@solid-memo/domain/release/markdownFields";

/** How many texts each cache keeps; the oldest goes first. */
export const CACHE_SIZE = 500;

/**
 * A function of a text remembered for the last `limit` texts it was
 * given (the oldest goes first), so a list re-rendered, a card turned or
 * a language switched does not parse the same text again. A text is kept
 * under its hash (textHash), with the text: a lookup compares the text
 * with the one text kept under its hash only, never with the others, as
 * V8's Map keyed by the texts would when many long texts share a length
 * (it hashes a long string by its length alone). A text whose hash
 * another text has replaces that entry, not chained to it.
 */
function remembered<T>(compute: (text: string) => T, limit = CACHE_SIZE): (text: string) => T {
  const cache = new Map<number, { text: string; value: T }>();
  return (text) => {
    const key = textHash(text);
    const hit = cache.get(key);
    if (hit?.text === text) return hit.value;
    const value = compute(text);
    if (!cache.delete(key) && cache.size >= limit) cache.delete(cache.keys().next().value!);
    cache.set(key, { text, value });
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
 * many (remembered without a limit): for a list of texts read again and
 * again in the same order, which a cache of the last CACHE_SIZE would
 * miss on every text once the list is longer.
 */
function rememberedAll<T>(compute: (text: string) => T): (text: string) => T {
  return remembered(compute, Infinity);
}

/**
 * A markdownBlocks for a list of texts shown again on every render, such
 * as a course's chapter descriptions, which may number more than
 * CACHE_SIZE: each position in the list keeps the blocks of the last text
 * it was given. A lookup compares the text with that one text only, never
 * with the others, as a Map keyed by the texts would when many long texts
 * share a length (a long string is hashed by its length alone).
 */
export function blocksByPosition(): (position: number, text: string) => MdBlock[] | null {
  const cache: { text: string; blocks: MdBlock[] | null }[] = [];
  return (position, text) => {
    const hit = cache[position];
    if (hit !== undefined && hit.text === text) return hit.blocks;
    const blocks = parseMarkdown(text);
    cache[position] = { text, blocks };
    return blocks;
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
