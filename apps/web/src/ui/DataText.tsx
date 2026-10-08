import { cardLabel, cardLabelText, isMarkdown, type CardContent } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { labelText } from "@solid-memo/markdown/plainText";
import { breakable } from "./breakable";
import { useI18n, type I18n } from "./i18n";
import { MarkdownBlocks, MarkdownInlines } from "./Markdown";
import { markdownBlocks, markdownPhrases } from "./markdownCache";

/**
 * Text from data — a card's side, a note, a step's theory — in the
 * reader's language, marked with that language when it is not the
 * page's, as ReaderText does (docs/markdown.md). Text not in Markdown
 * (`markdown` false) renders exactly as plain text always has: a
 * paragraph of the text as written, which may wrap after a slash
 * (`breaks`, breakable).
 *
 * Markdown that reads as a single paragraph renders as that same
 * paragraph, so a card with a word or two of code looks like any other;
 * anything more becomes a `div.md` of its blocks. Text past the
 * parser's limits is shown as plain text.
 */
export function DataText({
  text,
  markdown,
  breaks = false,
  class: className,
}: {
  text: LangText;
  markdown: boolean;
  breaks?: boolean;
  class?: string;
}) {
  const { readerText, readerLang } = useI18n();
  const shown = readerText(text);
  const lang = readerLang(text);
  const blocks = markdown ? markdownBlocks(shown) : null;
  if (blocks === null) {
    return (
      <p class={className} lang={lang}>
        {breaks ? breakable(shown) : shown}
      </p>
    );
  }
  const [first] = blocks;
  if (blocks.length === 1 && first!.type === "paragraph") {
    return (
      <p class={className} lang={lang}>
        <MarkdownInlines nodes={first.children} />
      </p>
    );
  }
  return (
    <div class={className === undefined ? "md" : `md ${className}`} lang={lang}>
      <MarkdownBlocks blocks={blocks} />
    </div>
  );
}

/**
 * Text from data that is prose of its own, such as a step's theory: a
 * `div` of the given class, in the reader's language as DataText is.
 * Plain text is split into paragraphs at its blank lines; Markdown is
 * its blocks, the div then a `div.md` too. Text past the parser's
 * limits is shown as plain text.
 */
export function DataProse({ text, markdown, class: className }: { text: LangText; markdown: boolean; class: string }) {
  const { readerText, readerLang } = useI18n();
  const shown = readerText(text);
  const lang = readerLang(text);
  const blocks = markdown ? markdownBlocks(shown) : null;
  if (blocks !== null) {
    return (
      <div class={`${className} md`} lang={lang}>
        <MarkdownBlocks blocks={blocks} />
      </div>
    );
  }
  const paragraphs = shown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  return (
    <div class={className} lang={lang}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/**
 * Text from data that must stay one line of phrasing, such as an option
 * in a `<label>` or a card's label: as DataText, but Markdown keeps only
 * emphasis and code (the inline profile, parseInlineMarkdown). The bare
 * content, for the caller's own element; DataLine wraps it with its
 * language.
 */
export function DataLineContent({ text, markdown }: { text: LangText; markdown: boolean }) {
  const { readerText } = useI18n();
  const shown = readerText(text);
  const phrases = markdown ? markdownPhrases(shown) : null;
  return phrases === null ? <>{breakable(shown)}</> : <MarkdownInlines nodes={phrases} />;
}

/** DataLineContent in a span marked with its language, when that is not the page's. */
export function DataLine({ text, markdown }: { text: LangText; markdown: boolean }) {
  const { readerLang } = useI18n();
  const lang = readerLang(text);
  const content = <DataLineContent text={text} markdown={markdown} />;
  return lang === undefined ? content : <span lang={lang}>{content}</span>;
}

/**
 * Text from data as plain text, for a place that takes nothing else (a
 * title, a confirmation, a picture's name): a Markdown text's label
 * (labelText), cut to `max` characters when given, else the text itself.
 */
export function plainDataText(shown: string, markdown: boolean, max?: number): string {
  return markdown ? labelText(shown, max) : shown;
}

/**
 * How a card is named (cardLabel) in the reader's language: its front,
 * else its back, as plain text even when written in Markdown. A Markdown
 * side that shows no text (a rule alone) names nothing either, so the
 * name falls back to the back, then to the card's id.
 */
export function cardName(card: CardContent & { id: string }, readerText: I18n["readerText"]): string {
  if (!isMarkdown(card.textFormat)) return cardLabel(card, readerText);
  return labelText(readerText(cardNameText(card, readerText))) || card.id;
}

/**
 * The side cardName takes a card's name from, so the name can be marked
 * with that side's language: the first side whose text shows any, else
 * the side cardLabelText picks.
 */
export function cardNameText(card: CardContent, readerText: I18n["readerText"]): LangText {
  if (!isMarkdown(card.textFormat)) return cardLabelText(card);
  return [card.front, card.back].find((text) => labelText(readerText(text)) !== "") ?? cardLabelText(card);
}
