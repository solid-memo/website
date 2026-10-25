// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { useI18n, type CardReader } from "./i18n";

/** The card language of the deck whose cards the screens below show; undefined for none. */
const CardLanguageContext = createContext<string | undefined>(undefined);

/** The card language of the course whose own text the screens below show; undefined for none. */
const CourseLanguageContext = createContext<string | undefined>(undefined);

/**
 * Shows the cards of a deck below it in the deck's card language first
 * (Deck.cardLanguage, docs/i18n.md "Which language"): every component
 * that shows card text takes its reader from useCardText. It renders
 * nothing of its own, and changes nothing else below it: a deck's title,
 * a step's theory, and the app's own text are shown as before (a
 * course's own text follows CourseLanguage instead). Without one, or
 * with no language, card text is shown as `readerText` shows any text.
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

/**
 * Shows a course below it in its course language first: a course is a
 * deck, and its card language (Deck.cardLanguage) covers its own text
 * too, its title and description, each chapter's title and description,
 * and each step's theory (docs/i18n.md "Which language"), besides the
 * cards of its questions (CardLanguage). Only the app's course screens
 * are under one: elsewhere, a step's theory and a deck's title are
 * shown as before, under a CardLanguage too (the Studio's). Every
 * component that shows course text takes its reader from useCourseText.
 */
export function CourseLanguage({
  language,
  children,
}: {
  /** The course's card language, a lower-case tag; undefined for the usual order. */
  language: string | undefined;
  children: ComponentChildren;
}) {
  return (
    <CardLanguage language={language}>
      <CourseLanguageContext.Provider value={language}>{children}</CourseLanguageContext.Provider>
    </CardLanguage>
  );
}

/** How a course's own text is shown here: in the language of the nearest CourseLanguage first. */
export function useCourseText(): CardReader {
  return useI18n().cardReader(useContext(CourseLanguageContext));
}
