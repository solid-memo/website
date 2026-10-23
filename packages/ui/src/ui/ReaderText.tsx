// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";
import type { LangText } from "@solid-memo/domain/langText";
import { breakable } from "./breakable";
import { useCardText } from "./cardLanguage";
import { useI18n } from "./i18n";

/**
 * Deck or card text in the reader's language when it has it, marked with
 * the language it is shown in when that is not the page's (an English-only
 * deck on a Swedish page, a card side in Japanese), so a screen reader
 * speaks it in that language's voice. `breaks` lets card text wrap after
 * a slash (breakable).
 */
export function ReaderText({ text, breaks = false }: { text: LangText; breaks?: boolean }) {
  const { readerText, readerLang } = useI18n();
  return <Marked shown={readerText(text)} lang={readerLang(text)} breaks={breaks} />;
}

/**
 * A card's text, as ReaderText, but in the deck's card language first
 * when the screen is under its CardLanguage (useCardText); a deck's or a
 * chapter's title stays a ReaderText.
 */
export function CardText({ text, breaks = false }: { text: LangText; breaks?: boolean }) {
  const { cardText, cardLang } = useCardText();
  return <Marked shown={cardText(text)} lang={cardLang(text)} breaks={breaks} />;
}

/** Text as shown, in a span marked with its language when that is not the page's. */
function Marked({ shown, lang, breaks }: { shown: string; lang?: string; breaks: boolean }) {
  const text = breaks ? breakable(shown) : shown;
  return lang === undefined ? <>{text}</> : <span lang={lang}>{text}</span>;
}

/** Several texts, such as a deck's topics, each marked as `ReaderText`, separated by commas. */
export function ReaderTexts({ texts }: { texts: readonly LangText[] }) {
  return (
    <>
      {texts.map((text, index) => (
        <Fragment key={index}>
          {index > 0 && ", "}
          <ReaderText text={text} />
        </Fragment>
      ))}
    </>
  );
}
