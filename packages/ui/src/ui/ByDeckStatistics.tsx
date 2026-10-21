// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChild } from "preact";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckStatistics } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/** A share as its percent, with what it is of; null when it is of nothing. */
type Share = { percent: string; of: string } | null;

/**
 * Each deck's figures, a block a deck, as many blocks to a row as fit:
 * ten figures a deck are too many for a table's row in the page's
 * column, let alone on a phone. A deck since removed is named as such.
 */
export function ByDeckStatistics({
  decks,
  statistics,
}: {
  decks: readonly Deck[];
  statistics: readonly DeckStatistics[];
}) {
  const { t } = useI18n();
  return (
    <>
      <h3 id="by-deck-heading">{t("statistics.byDeck")}</h3>
      <ul class="by-deck" aria-labelledby="by-deck-heading">
        {statistics.map((deck) => (
          <DeckBlock
            key={deck.deckUrl}
            deck={deck}
            title={decks.find((d) => d.url === deck.deckUrl)?.title}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * A deck's block: its name, its answers and when it was last studied,
 * then its figures, each under its own label. A share of nothing is
 * left out; recall each way only where the deck has reviews both ways.
 */
function DeckBlock({ deck, title }: { deck: DeckStatistics; title?: Deck["title"] }) {
  const { t, formatDate, formatPercent, directionLabel } = useI18n();
  const share = (part: number, whole: number, of: string): Share =>
    whole === 0 ? null : { percent: formatPercent(part / whole), of };
  const recall = ({ reviews, recalled }: { reviews: number; recalled: number }) =>
    share(recalled, reviews, t("statistics.ofReviews", { count: reviews }));
  const figure = (label: string, value: ComponentChild) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const shareFigure = (label: string, value: Share) =>
    value !== null && figure(label, <ShareText {...value} />);
  return (
    <li>
      <h4>{title === undefined ? t("statistics.removedDeck") : <ReaderText text={title} />}</h4>
      <p class="hint">
        {t("statistics.deckAnswered", {
          count: deck.answers,
          date: formatDate(deck.lastStudyDay),
        })}
      </p>
      <dl>
        {figure(t("statistics.introducedColumn"), deck.introduced)}
        {shareFigure(t("statistics.youngRecall"), recall(deck.retention.young))}
        {shareFigure(t("statistics.matureRecall"), recall(deck.retention.mature))}
        {shareFigure(
          t("statistics.firstTry"),
          share(
            deck.firstTry.recalled,
            deck.firstTry.introduced,
            t("statistics.ofNewCards", { count: deck.firstTry.introduced }),
          ),
        )}
        {figure(t("statistics.lapses"), deck.lapses)}
        {shareFigure(
          t("statistics.quizAccuracy"),
          share(
            deck.quiz.right,
            deck.quiz.answers,
            t("statistics.rightOfAnswers", { count: deck.quiz.answers }),
          ),
        )}
        {deck.directions.length > 1 && (
          <div class="by-deck-directions">
            <dt>{t("statistics.directionsColumn")}</dt>
            {deck.directions.map(({ direction, recall: { reviews, recalled } }) => (
              // Only a direction with reviews is listed (retentionByDirection).
              <dd key={direction}>
                <ShareText
                  percent={t("statistics.directionShare", {
                    direction: directionLabel(direction),
                    share: formatPercent(recalled / reviews),
                  })}
                  of={t("statistics.ofReviews", { count: reviews })}
                />
              </dd>
            ))}
          </div>
        )}
      </dl>
    </li>
  );
}

/** A percent, and what it is of on a line of its own under it. */
function ShareText({ percent, of }: { percent: string; of: string }) {
  return (
    <>
      {percent} <span class="share-of">{of}</span>
    </>
  );
}
