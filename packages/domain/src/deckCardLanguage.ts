// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import { cardLanguages, UNSTATED } from "./cardQuery";
import type { Card, Deck } from "./deck";
import { canonicalTag, NO_LANGUAGE } from "./languageTag";

/**
 * A deck's card language: the language the learner wants the deck's
 * card text shown in first, ahead of the app's language and the
 * browser's. On a deck that is a course it ranks all of the course's
 * text too: its title and description, its chapters' titles and
 * descriptions and its steps' theory. A text not in it is shown as
 * usual; the deck's keywords, and the title and description of a deck
 * that is no course, never follow it.
 */

/**
 * The tag a stored card language stands for, or undefined when it is none
 * the app would choose: not a language code, or "zxx" (text in no
 * language), which no card text could be preferred in.
 */
export function cardLanguageTag(value: string): string | undefined {
  const tag = canonicalTag(value);
  return tag === null || tag === NO_LANGUAGE ? undefined : tag;
}

/**
 * The deck with its card language set to `language`, in the case the app
 * stores tags in ("PT-br" becomes "pt-br"), or left out for null, which
 * goes back to the usual order. Throws textLanguageInvalid on a tag that
 * names no language, "zxx" included.
 */
export function withCardLanguage(deck: Deck, language: string | null): Deck {
  const { cardLanguage: _old, ...rest } = deck;
  if (language === null) return rest;
  const tag = cardLanguageTag(language);
  if (tag === undefined) throw new AppError("textLanguageInvalid", { tag: language });
  return { ...rest, cardLanguage: tag };
}

/**
 * The languages a deck's cards can be shown in first: the stated tags of
 * their fronts and backs, in order, without untagged text and text in no
 * language.
 */
export function preferableCardLanguages(cards: readonly Card[]): string[] {
  return cardLanguages(cards).filter((tag) => tag !== UNSTATED && tag !== NO_LANGUAGE);
}
