// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { useI18n, type CardReader } from "./i18n";

/** The card language of the deck whose cards the screens below show; undefined for none. */
const CardLanguageContext = createContext<string | undefined>(undefined);

/**
 * Shows the cards of a deck below it in the deck's card language first
 * (Deck.cardLanguage, docs/i18n.md "Which language"): every component
 * that shows card text takes its reader from useCardText. It renders
 * nothing of its own, and changes nothing else below it: a deck's title,
 * a chapter's title or theory, and the app's own text are shown as
 * before. Without one, or with no language, card text is shown as
 * `readerText` shows any text.
 */
export function CardLanguage({
  language,
  children,
}: {
  /** The deck's card language, a lower-case tag; undefined for the usual order. */
  language: string | undefined;
  children: ComponentChildren;
}) {
  return <CardLanguageContext.Provider value={language}>{children}</CardLanguageContext.Provider>;
}

/** How card text is shown here: in the card language of the nearest CardLanguage first. */
export function useCardText(): CardReader {
  return useI18n().cardReader(useContext(CardLanguageContext));
}
