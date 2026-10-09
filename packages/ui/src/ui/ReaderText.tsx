import { Fragment } from "preact";
import type { LangText } from "@solid-memo/domain/langText";
import { breakable } from "./breakable";
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
  const shown = breaks ? breakable(readerText(text)) : readerText(text);
  const lang = readerLang(text);
  return lang === undefined ? <>{shown}</> : <span lang={lang}>{shown}</span>;
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
