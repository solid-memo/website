import type { ComponentChildren } from "preact";
import type { LangText } from "@solid-memo/domain/langText";
import { licenseLabel } from "@solid-memo/domain/license";
import { AuthorNames } from "./AuthorName";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { linkify } from "./linkify";

/**
 * "By Anton Wiklund · CC0 1.0 · Updated September 27, 2026", and under
 * it the deck's description when it has one: who made a deck, under what
 * terms, when it last changed, and where its content came from. Renders
 * nothing when none is stated, as for most home-made decks. The licence
 * URL and any URL in the description come from deck data, so they go
 * through ExternalLink.
 */
export function DeckProvenance({
  authors,
  license,
  modifiedAt,
  description,
}: {
  authors: string[];
  license?: string;
  /** ISO dateTime of the deck's last change, when it says. */
  modifiedAt?: string;
  /** Shown in the reader's language, marked when that is not the page's. */
  description?: LangText;
}) {
  const { t, tx, formatDate, readerText, readerLang } = useI18n();
  const parts: ComponentChildren[] = [];
  if (authors.length > 0) {
    parts.push(
      <span>{tx("deckProvenance.by", { authors: <AuthorNames authors={authors} /> })}</span>,
    );
  }
  if (license !== undefined) {
    parts.push(<ExternalLink url={license}>{licenseLabel(license)}</ExternalLink>);
  }
  if (modifiedAt !== undefined) {
    parts.push(<span>{t("deckProvenance.updated", { date: formatDate(modifiedAt) })}</span>);
  }
  if (parts.length === 0 && description === undefined) return null;
  return (
    <span class="hint provenance">
      {parts.map((part, i) => (
        <>
          {i > 0 && " · "}
          {part}
        </>
      ))}
      {description !== undefined && (
        <span
          class="deck-description"
          role="group"
          aria-label={t("deckAbout.description")}
          lang={readerLang(description)}
        >
          {linkify(readerText(description))}
        </span>
      )}
    </span>
  );
}
