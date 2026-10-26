// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type DocBlock, type MdInline, parseDocument } from "@solid-memo/markdown/parse";
import { PAGE_KINDS, type PageKind } from "./docsIndex.ts";

/**
 * The docs' prose check (docs/style.md#the-prose-check): each page's text
 * read against the rules in `prose.json`, which say the words a page
 * leaves out, how long a sentence may be, and how a page links. A
 * page's kind, from the docs' index, picks the rules that apply to it.
 * Only prose is read: code, link addresses, quoted text and headings,
 * which links lead to, are left alone.
 */

/** What every rule has: its id, the reason it gives, and the kinds it applies to. */
type RuleBase = {
  id: string;
  message: string;
  /** The kinds it applies to; every kind when it names none. */
  kinds?: readonly PageKind[];
};

/** Words or phrases a page leaves out, or writes as the suggestion beside each. */
export type WordsRule = RuleBase & {
  check: "words";
  /** The words, or each word with what to write instead. */
  terms: readonly string[] | Readonly<Record<string, string>>;
  /** How many times a section may use each word; none when it says nothing. */
  perSection?: number;
};

/** A regular expression the prose may not match. */
export type PatternRule = RuleBase & { check: "pattern"; pattern: string };

/** The most words a sentence may have. */
export type SentenceRule = RuleBase & { check: "sentence"; maxWords: number };

/** Link texts that don't say where a link leads. */
export type LinkTextRule = RuleBase & { check: "linkText"; terms: readonly string[] };

/** A section links each address once, at its first mention. */
export type LinkOnceRule = RuleBase & { check: "linkOnce" };

export type ProseRule = WordsRule | PatternRule | SentenceRule | LinkTextRule | LinkOnceRule;

/** A rule broken at a line of a page (from 1). */
export type ProseProblem = { line: number; rule: string; what: string };

const CHECKS = ["words", "pattern", "sentence", "linkText", "linkOnce"];

/** Whether a value is a list of strings. */
function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** What is wrong with one rule of the file, or null when nothing is. */
function ruleProblem(rule: Record<string, unknown>): string | null {
  if (typeof rule.id !== "string" || typeof rule.message !== "string")
    return "a rule needs an id and a message";
  if (!CHECKS.includes(rule.check as string))
    return `${rule.id}: check is not one of ${CHECKS.join(", ")}`;
  if (
    rule.kinds !== undefined &&
    !(isStrings(rule.kinds) && rule.kinds.every((kind) => PAGE_KINDS.includes(kind as PageKind)))
  )
    return `${rule.id}: kinds are not page kinds (${PAGE_KINDS.join(", ")})`;
  const terms = rule.terms;
  const termsOk =
    isStrings(terms) ||
    (rule.check === "words" &&
      typeof terms === "object" &&
      terms !== null &&
      isStrings(Object.values(terms)));
  if ((rule.check === "words" || rule.check === "linkText") && !termsOk)
    return `${rule.id}: terms are not a list of words`;
  if (rule.check === "pattern" && typeof rule.pattern !== "string")
    return `${rule.id}: a pattern rule needs a pattern`;
  if (rule.check === "sentence" && !Number.isInteger(rule.maxWords))
    return `${rule.id}: a sentence rule needs maxWords, a whole number`;
  return null;
}

/** The rules from `prose.json`'s text; an Error that says what is wrong with them otherwise. */
export function readProseRules(text: string): ProseRule[] {
  const data = JSON.parse(text) as { rules?: unknown };
  if (!Array.isArray(data.rules)) throw new Error("prose.json has no list of rules");
  for (const rule of data.rules as Record<string, unknown>[]) {
    const problem = ruleProblem(rule);
    if (problem !== null) throw new Error(`prose.json: ${problem}`);
  }
  return data.rules as ProseRule[];
}

/** What stands for a code span in the text: one word, never one of a rule's. */
const CODE = "Ⓒ";

/** A link in a unit's text: its address, its text, and where that text starts. */
type Link = { url: string; label: string; at: number };

/**
 * A stretch of prose: a paragraph, or a table's cell. Its text has a code
 * span as CODE; `masked` is the same text with quoted words blanked out,
 * so the word rules pass over what a page quotes.
 */
type Unit = {
  line: number;
  section: number;
  text: string;
  masked: string;
  links: Link[];
  sentences: boolean;
};

/** Quoted text, straight or curly. */
const QUOTED = /"[^"]*"|“[^”]*”/g;

/** A unit's text and links from its inlines. */
function flatten(inlines: readonly MdInline[]): { text: string; links: Link[]; first: string } {
  let text = "";
  let first = "";
  const links: Link[] = [];
  const walk = (nodes: readonly MdInline[]) => {
    for (const node of nodes) {
      if (node.type === "text" || node.type === "inlineCode") {
        if (first === "") first = node.value.split("\n")[0]!.trim();
        text += node.type === "text" ? node.value : CODE;
      } else if (node.type === "break") text += "\n";
      else if (node.type === "link") {
        const at = text.length;
        walk(node.children);
        links.push({ url: node.url, label: text.slice(at), at });
      } else walk(node.children);
    }
  };
  walk(inlines);
  return { text, links, first };
}

/** The line (from 1) of an offset in a text. */
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** The page's prose, unit by unit, each with its line and section. */
function unitsOf(source: string, blocks: readonly DocBlock[]): Unit[] {
  const units: Unit[] = [];
  let cursor = 0;
  let section = 0;
  const add = (inlines: readonly MdInline[], sentences: boolean) => {
    const { text, links, first } = flatten(inlines);
    // A unit is found in the source by its first words, after the one before it.
    const found = first === "" ? -1 : source.indexOf(first, cursor);
    if (found >= 0) cursor = found + first.length;
    units.push({
      line: lineAt(source, found >= 0 ? found : cursor),
      section,
      text,
      masked: text.replace(QUOTED, (quote) => quote.replace(/[^\n]/g, " ")),
      links,
      sentences,
    });
  };
  const walk = (nodes: readonly DocBlock[]) => {
    for (const block of nodes) {
      if (block.type === "heading") {
        section++;
        cursor = source.split("\n").slice(0, block.line).join("\n").length;
      } else if (block.type === "paragraph") add(block.children, true);
      else if (block.type === "list") for (const item of block.items) walk(item);
      else if (block.type === "quote") walk(block.children);
      else if (block.type === "table")
        for (const row of block.rows) for (const cell of row) add(cell, false);
    }
  };
  walk(blocks);
  return units;
}

/** A word or phrase as a pattern: whole words, any space between them, any case. */
function termPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ +/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}'-])${escaped}(?![\\p{L}\\p{N}'-])`, "giu");
}

/**
 * Where a sentence may end: after its stop, before a word, a code span, a
 * link or a quote. A lowercase word counts, as a sentence may start with a
 * name (node-solid-server) or a link; the docs write no abbreviations
 * that end in a stop (the plain-words rule).
 */
const SENTENCE_END = /(?<=[.!?])["”’)]*\s+(?=[\p{L}\p{N}"“(*Ⓒ[])/u;

/** Each sentence of a text, with where it starts. */
function sentencesOf(text: string): { sentence: string; at: number }[] {
  const sentences: { sentence: string; at: number }[] = [];
  let at = 0;
  for (const sentence of text.split(SENTENCE_END)) {
    const start = text.indexOf(sentence, at);
    sentences.push({ sentence, at: start });
    at = start + sentence.length;
  }
  return sentences;
}

/** A text's words: what has a letter, a digit or a code span in it. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}Ⓒ]/u.test(word)).length;
}

/** Whether a rule applies to a page of a kind. */
function applies(rule: ProseRule, kind: PageKind): boolean {
  return rule.kinds === undefined || rule.kinds.includes(kind);
}

/** The problems a words rule finds in the units. */
function wordsProblems(rule: WordsRule, units: readonly Unit[]): ProseProblem[] {
  const problems: ProseProblem[] = [];
  const terms = Array.isArray(rule.terms)
    ? rule.terms.map((term) => [term, null] as const)
    : Object.entries(rule.terms);
  for (const [term, instead] of terms) {
    const pattern = termPattern(term);
    const seen = new Map<number, number>();
    for (const unit of units) {
      for (const match of unit.masked.replace(/’/g, "'").matchAll(pattern)) {
        const count = (seen.get(unit.section) ?? 0) + 1;
        seen.set(unit.section, count);
        if (count <= (rule.perSection ?? 0)) continue;
        const word = `"${match[0].replace(/\s+/g, " ")}"`;
        problems.push({
          line: unit.line + lineAt(unit.text, match.index) - 1,
          rule: rule.id,
          what:
            instead === null
              ? `${word}: ${rule.message}`
              : `${word}: write "${instead}"; ${rule.message}`,
        });
      }
    }
  }
  return problems;
}

/** The problems one rule finds in a page's units. */
function ruleProblems(rule: ProseRule, units: readonly Unit[]): ProseProblem[] {
  const at = (unit: Unit, offset: number, what: string): ProseProblem => ({
    line: unit.line + lineAt(unit.text, offset) - 1,
    rule: rule.id,
    what,
  });
  switch (rule.check) {
    case "words":
      return wordsProblems(rule, units);
    case "pattern": {
      const pattern = new RegExp(rule.pattern, "gu");
      return units.flatMap((unit) =>
        [...unit.masked.matchAll(pattern)].map((match) =>
          at(unit, match.index, `"${match[0]}": ${rule.message}`),
        ),
      );
    }
    case "sentence":
      return units
        .filter((unit) => unit.sentences)
        .flatMap((unit) =>
          sentencesOf(unit.text)
            .map(({ sentence, at: offset }) => ({ offset, words: wordCount(sentence) }))
            .filter(({ words }) => words > rule.maxWords)
            .map(({ offset, words }) =>
              at(
                unit,
                offset,
                `a sentence of ${words} words, over ${rule.maxWords}: ${rule.message}`,
              ),
            ),
        );
    case "linkText": {
      const terms = new Set(rule.terms.map((term) => term.toLowerCase()));
      return units.flatMap((unit) =>
        unit.links
          .filter((link) =>
            terms.has(
              link.label
                .trim()
                .toLowerCase()
                .replace(/[.,:;]$/, ""),
            ),
          )
          .map((link) => at(unit, link.at, `a link that says "${link.label}": ${rule.message}`)),
      );
    }
    case "linkOnce": {
      const seen = new Set<string>();
      return units.flatMap((unit) =>
        unit.links.flatMap((link) => {
          const key = `${unit.section} ${link.url}`;
          if (!seen.has(key)) {
            seen.add(key);
            return [];
          }
          return [
            at(unit, link.at, `${link.url} is linked again in this section: ${rule.message}`),
          ];
        }),
      );
    }
  }
}

/**
 * What a page breaks of the rules, for its kind, in the order of its
 * lines; a DocumentError when the page is not the docs' Markdown, which
 * the docs' build reports too.
 */
export function proseProblems(
  source: string,
  kind: PageKind,
  rules: readonly ProseRule[],
): ProseProblem[] {
  const units = unitsOf(source, parseDocument(source));
  return rules
    .filter((rule) => applies(rule, kind))
    .flatMap((rule) => ruleProblems(rule, units))
    .sort((a, b) => a.line - b.line);
}
