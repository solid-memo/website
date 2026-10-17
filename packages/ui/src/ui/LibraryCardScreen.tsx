// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LibraryCard } from "@solid-memo/domain/library";
import { CardFace } from "./CardFace";
import { useI18n } from "./i18n";
import { CardIcon } from "./icons";
import { ReportMistake } from "./ReportMistake";
import { RetiredNotice } from "./RetiredCards";

/**
 * One card of a library deck, both sides as study shows them, read-only:
 * a library card is edited only once the deck is imported. A mistake in
 * it is reported to the library (ReportMistake).
 */
export function LibraryCardScreen({
  card,
  deckName,
  deckLang,
  deckHref,
  releaseUrl,
}: {
  card: LibraryCard;
  deckName: string;
  /** The language the deck's name is in, when not the page's (readerLang). */
  deckLang?: string;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  /** The library release the card is read from. */
  releaseUrl: string;
}) {
  const { t, tx } = useI18n();
  return (
    <section>
      <header>
        <h2>
          <CardIcon />
          {t("libraryCard.heading")}
        </h2>
      </header>
      <div class="practice-card">
        <CardFace
          side="front"
          text={card.front}
          imageUrl={card.frontImageUrl}
          imageDescription={card.frontImageDescription}
          label={card.frontLabel}
          note={card.frontNote}
          textFormat={card.textFormat}
        />
        <CardFace
          side="back"
          text={card.back}
          imageUrl={card.backImageUrl}
          imageDescription={card.backImageDescription}
          label={card.backLabel}
          note={card.backNote}
          textFormat={card.textFormat}
        />
      </div>
      {card.retired && <RetiredNotice />}
      <p class="hint">
        {tx("libraryCard.from", {
          deck: (
            <a href={deckHref} lang={deckLang}>
              {deckName}
            </a>
          ),
        })}
      </p>
      <ReportMistake place={{ library: true }} releaseUrl={releaseUrl} cardId={card.id} />
    </section>
  );
}
