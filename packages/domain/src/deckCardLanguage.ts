// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import type { Deck } from "./deck";
import { canonicalTag, NO_LANGUAGE } from "./languageTag";

/**
 * A deck's card language: the language the learner wants the deck's
 * card text shown in first. It ranks card text only, ahead of the app's
 * language and the browser's; a card without text in it is shown as
 * usual, and the deck's title, description and keywords never follow it.
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
