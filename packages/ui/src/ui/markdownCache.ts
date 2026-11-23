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
 * How much each cache keeps of its texts and their values, in all, in
 * the units of weightOf (about bytes, rounded up); the oldest goes first.
 * A count of texts alone does not bound it: the tree of a text of short
 * Markdown lines is many times larger than the text.
 */
export const CACHE_WEIGHT = 64 * 1024 * 1024;

/**
 * What weightOf counts for each character of a text: the text, and the
 * parts of it its value holds, joined line by line. An upper estimate for
 * strings the parser builds from small pieces, such as a paragraph's
 * text joined from its lines (`last.value +=` in parse.ts), which V8 may
 * keep as a chain of those pieces: revisit it if the parser comes to
 * build its strings from smaller pieces than that.
 */
const CHAR_WEIGHT = 32;

/** What weightOf counts for each object or array of a value, such as a node of a Markdown tree. */
const NODE_WEIGHT = 96;

/**
 * About how many bytes a cache holds for a text and its value, rounded
 * up: CHAR_WEIGHT for each character of the text, and NODE_WEIGHT for
 * each object and array the value is made of, counted one at a time, not
 * by recursion, so a deep tree does not overflow the stack.
 */
function weightOf(text: string, value: unknown): number {
  let nodes = 0;
  const pending = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next !== "object" || next === null) continue;
    nodes++;
    for (const part of Object.values(next)) pending.push(part);
  }
  return text.length * CHAR_WEIGHT + nodes * NODE_WEIGHT;
}

/**
 * A function of a text remembered for the last `limit` texts it was
 * given, as many as fit in CACHE_WEIGHT (weightOf), the oldest going
 * first, so a list re-rendered, a card turned or a language switched does
 * not parse the same text again. A text whose weight alone is more than
 * CACHE_WEIGHT is not kept. A text is kept under its hash (textHash),
 * with the text: a lookup compares the text with the one text kept under
 * its hash only, never with the others, as V8's Map keyed by the texts
 * would when many long texts share a length (it hashes a long string by
 * its length alone). A text whose hash another text has replaces that
 * entry, not chained to it.
 */
function remembered<T>(compute: (text: string) => T, limit = CACHE_SIZE): (text: string) => T {
  const cache = new Map<number, { text: string; value: T; weight: number }>();
  let total = 0;
  return (text) => {
    const key = textHash(text);
    const hit = cache.get(key);
    if (hit?.text === text) return hit.value;
    const value = compute(text);
    const weight = weightOf(text, value);
    if (hit !== undefined) {
      cache.delete(key);
      total -= hit.weight;
    }
    if (weight > CACHE_WEIGHT) return value;
    for (const [oldest, entry] of cache) {
      if (cache.size < limit && total + weight <= CACHE_WEIGHT) break;
      cache.delete(oldest);
      total -= entry.weight;
    }
    cache.set(key, { text, value, weight });
    total += weight;
    return value;
  };
}

/** The text as Markdown blocks (parseMarkdown), null when it is to be shown as plain text. */
export const markdownBlocks: (text: string) => MdBlock[] | null = remembered(parseMarkdown);

/** The text as one line of Markdown phrasing (parseInlineMarkdown), null when it is to be shown as plain text. */
export const markdownPhrases: (text: string) => MdPhrase[] | null = remembered(parseInlineMarkdown);

/** The text as plain text (plainText), what it shows as Markdown with its marks gone. */
export const markdownPlainText: (text: string) => string = remembered(plainText);

/**
 * The markdown package's check of a text in a field held to a rule
 * (markdownProblems), remembered for the last `limit` texts of each rule
 * that fit in CACHE_WEIGHT (remembered).
 */
function problemsByRule(limit = CACHE_SIZE): (text: string, rule: FieldRule) => MarkdownProblem[] {
  const byRule = new Map<FieldRule, (text: string) => MarkdownProblem[]>();
  return (text, rule) => {
    let problemsOf = byRule.get(rule);
    if (problemsOf === undefined) {
      problemsOf = remembered((text) => markdownProblems(text, rule), limit);
      byRule.set(rule, problemsOf);
    }
    return problemsOf(text);
  };
}

/**
 * The markdown package's check of a text in a field held to `rule`
 * (problemsByRule), remembered for the last CACHE_SIZE texts of each
 * rule that fit in CACHE_WEIGHT: an editor's hints check its text again
 * on every render.
 */
export const markdownFieldProblems: (text: string, rule: FieldRule) => MarkdownProblem[] =
  problemsByRule();

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
 * many, as long as they fit in CACHE_WEIGHT (remembered without a limit
 * of texts): for a list of texts read again and again in the same order,
 * which a cache of the last CACHE_SIZE would miss on every text once the
 * list is longer.
 */
function rememberedAll<T>(compute: (text: string) => T): (text: string) => T {
  return remembered(compute, Infinity);
}

/** How many courses courseDescriptionBlocks keeps the descriptions of; the one used longest ago goes first. */
export const COURSES_KEPT = 8;

/** How much courseDescriptionBlocks keeps of each course's descriptions (weightOf), so all it keeps stays within CACHE_WEIGHT. */
const COURSE_WEIGHT = CACHE_WEIGHT / COURSES_KEPT;

/**
 * A markdownBlocks for a list of texts shown again on every render, such
 * as a course's chapter descriptions, which may number more than
 * CACHE_SIZE: each position in the list keeps the blocks of the last text
 * it was given, as long as all it keeps fits in COURSE_WEIGHT (weightOf);
 * a text that does not fit is parsed again each time it is shown. A
 * lookup compares the text with that one text only, never with the
 * others, as a Map keyed by the texts would when many long texts share a
 * length (a long string is hashed by its length alone).
 */
function blocksByPosition(): (position: number, text: string) => MdBlock[] | null {
  const cache = new Map<number, { text: string; blocks: MdBlock[] | null; weight: number }>();
  let total = 0;
  return (position, text) => {
    const hit = cache.get(position);
    if (hit?.text === text) return hit.blocks;
    const blocks = parseMarkdown(text);
    const weight = weightOf(text, blocks);
    if (hit !== undefined) {
      cache.delete(position);
      total -= hit.weight;
    }
    if (total + weight > COURSE_WEIGHT) return blocks;
    cache.set(position, { text, blocks, weight });
    total += weight;
    return blocks;
  };
}

const descriptionsByRelease = new Map<
  string,
  (position: number, text: string) => MdBlock[] | null
>();

/**
 * The blocks of a course's chapter descriptions, by position
 * (blocksByPosition), kept for the release (its URL) while the app is
 * open, for the last COURSES_KEPT courses, COURSE_WEIGHT of each at most:
 * coming back to a course's page does not parse its descriptions again.
 */
export function courseDescriptionBlocks(
  releaseUrl: string,
): (position: number, text: string) => MdBlock[] | null {
  let blocksOf = descriptionsByRelease.get(releaseUrl);
  if (blocksOf === undefined) {
    blocksOf = blocksByPosition();
    if (descriptionsByRelease.size >= COURSES_KEPT)
      descriptionsByRelease.delete(descriptionsByRelease.keys().next().value!);
  } else descriptionsByRelease.delete(releaseUrl);
  descriptionsByRelease.set(releaseUrl, blocksOf);
  return blocksOf;
}

/**
 * A plainText that remembers every text it was given (rememberedAll): one
 * for each list of texts searched again and again, such as a deck's cards
 * in the Studio's workbench, which holds more texts than CACHE_SIZE.
 */
export function plainTexts(): (text: string) => string {
  return rememberedAll(plainText);
}

/**
 * A markdownPhrases that remembers every text it was given
 * (rememberedAll): one for each list of options shown again on every
 * render, such as a course question's, which may hold more texts than
 * CACHE_SIZE.
 */
export function optionPhrases(): (text: string) => MdPhrase[] | null {
  return rememberedAll(parseInlineMarkdown);
}

/**
 * The markdown package's check of a field held to a rule, by the rule's
 * name (problemsByRule), remembered for every text of each rule: a text
 * checked again is not parsed again.
 */
function rememberedProblems(): (text: string, rule: FieldRuleName) => MarkdownProblem[] {
  const check = problemsByRule(Infinity);
  const rules: Record<FieldRuleName, FieldRule> = { side: SIDE, option: OPTION, prose: PROSE };
  return (text, rule) => check(text, rules[rule]);
}

/**
 * How a deck's health reads its text in Markdown (UseCases.checkDeck):
 * the plain text, each text parsed once (plainTexts), and the markdown
 * package's check of a field held to a rule, each text checked once by
 * each rule (rememberedProblems): many cards may say the same. Frozen,
 * so what a deck's health finds with it is worked out once for the
 * decks that share their cards and this check (domain/deckHealth.ts).
 */
export function deckTextCheck(): DeckTextCheck<MarkdownProblem> {
  return Object.freeze({ plain: plainTexts(), check: rememberedProblems() });
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
  return { problems: rememberedProblems(), chunks: rememberedAll(inspectChunks) };
}
