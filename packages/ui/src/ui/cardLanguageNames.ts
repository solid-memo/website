// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { deckCardLanguages, type LibraryDeck } from "@solid-memo/domain/library";
import type { I18n } from "./i18n";

/**
 * The languages a library deck's cards are in, each named in the app's
 * language ("Swedish", "svenska"), in the deck's order: those the app
 * knows (deckCardLanguages), none when the deck states none.
 */
export function cardLanguageNames(
  deck: Pick<LibraryDeck, "languages">,
  languageParts: I18n["languageParts"],
): string[] {
  return deckCardLanguages(deck).map((language) => languageParts(language.tag).name);
}
