// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LangTexts } from "@solid-memo/vocab/types.generated";
import { AppError } from "./appError";
import { NO_LANGUAGE } from "./languageTag";

export type { LangTexts };

/**
 * A deck's keywords (dcat:keyword), several per language: a language tag
 * (lower case) to the keywords in that language, in stored order, as deck
 * format 6 and library deck format 5 state them; keywords kept from an
 * older format, their language unknown, are untagged (""). The app shows
 * a reader only the keywords in their language, searches them in every
 * language, and writes new keywords only under the language the user
 * states (see docs/i18n.md).
 */

/** A copy of the keywords; an absent list is none. */
export function copyKeywords(keywords: LangTexts | undefined): Record<string, string[]> {
  return Object.fromEntries(Object.entries(keywords ?? {}).map(([tag, list]) => [tag, [...list]]));
}

/**
 * The keywords to show a reader whose language is `language` ("sv"):
 * those under every tag of that language, regional ones included ("sv",
 * "sv-fi"), and those in no stated language — untagged ("") and "zxx"
 * (codes, numbers) — each once, in stored order. Keywords in other
 * languages are not shown, not even as a fallback: a deck with none in
 * the reader's language shows none.
 */
export function keywordsIn(keywords: LangTexts | undefined, language: string): string[] {
  const wanted = primaryOf(language);
  const shown = new Set<string>();
  for (const [tag, list] of Object.entries(keywords ?? {})) {
    if (tag === "" || tag === NO_LANGUAGE || primaryOf(tag) === wanted) {
      for (const keyword of list) shown.add(keyword);
    }
  }
  return [...shown];
}

function primaryOf(tag: string): string {
  return tag.toLowerCase().split("-")[0];
}

/** Every keyword in every language, each once, in stored order: what a search looks through. */
export function allKeywords(keywords: LangTexts | undefined): string[] {
  return [...new Set(Object.values(keywords ?? {}).flat())];
}

/** Whether there are no keywords at all. */
export function noKeywords(keywords: LangTexts | undefined): boolean {
  return Object.values(keywords ?? {}).every((list) => list.length === 0);
}

/**
 * Whether two sets of keywords are the same, language by language: the
 * same keywords under the same tags, in any order. A language with no
 * keywords is no language, and absent keywords are none.
 */
export function sameKeywords(a: LangTexts | undefined, b: LangTexts | undefined): boolean {
  const tags = (k: LangTexts | undefined) =>
    Object.keys(k ?? {})
      .filter((tag) => k![tag].length > 0)
      .sort();
  const tagsA = tags(a);
  const tagsB = tags(b);
  return (
    tagsA.length === tagsB.length &&
    tagsA.every((tag, i) => {
      if (tag !== tagsB[i]) return false;
      const setA = new Set(a![tag]);
      const setB = new Set(b![tag]);
      return setA.size === setB.size && [...setA].every((keyword) => setB.has(keyword));
    })
  );
}

/**
 * Keywords as entered, per language: each trimmed, an empty one left out
 * and each once per language, a language left with none removed, tags
 * lower case (two that differ only in case are one language). New
 * keywords state their language: untagged ones ("") may be kept only as
 * `saved` has them — some of them removed, none added or changed —
 * otherwise the user is asked for their language (textNeedsLanguage).
 */
export function tidiedKeywords(keywords: LangTexts, saved: LangTexts | undefined): LangTexts {
  const tidied: Record<string, string[]> = {};
  for (const [tag, list] of Object.entries(keywords)) {
    const kept = list.map((keyword) => keyword.trim()).filter((keyword) => keyword !== "");
    if (kept.length === 0) continue;
    const lower = tag.toLowerCase();
    tidied[lower] = [...new Set([...(tidied[lower] ?? []), ...kept])];
  }
  const savedUntagged = new Set(saved?.[""] ?? []);
  if ((tidied[""] ?? []).some((keyword) => !savedUntagged.has(keyword))) {
    throw new AppError("textNeedsLanguage", { field: "the keywords" });
  }
  return tidied;
}

/**
 * Keywords of an older format, which states no language, as keywords per
 * language: untagged (""), their language unknown; none when there are
 * none. Nothing is guessed: such a list often mixes languages.
 */
export function untaggedKeywords(keywords: readonly string[] | undefined): LangTexts {
  return keywords === undefined || keywords.length === 0 ? {} : { "": [...keywords] };
}
