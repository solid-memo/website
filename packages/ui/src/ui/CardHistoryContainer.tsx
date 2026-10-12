// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { CardHistory } from "./CardHistory";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { STATISTICS_STALE_MS } from "./studyFigures";

/**
 * Reads a card's answers from the whole answer log (with the Studio's
 * card inspector's query) and the deck's review states, and shows its
 * history (CardHistory). The answers are kept as the statistics are:
 * read again after half a minute, or at once after a change
 * (keepStudyFiguresFresh). When either cannot be read a quiet line says
 * so; the card's page works on. The preferences give the hour a study
 * day begins (the default until they are read).
 */
export function CardHistoryContainer({
  useCases,
  instanceUrl,
  deck,
  card,
}: {
  useCases: UseCases;
  instanceUrl: string;
  deck: Deck;
  card: Card;
}) {
  const { t } = useI18n();
  const answersQuery = useQuery({
    queryKey: ["cardAnswers", deck.url, card.id],
    queryFn: () => useCases.cardAnswers(instanceUrl, deck, card.id),
    staleTime: STATISTICS_STALE_MS,
  });
  const reviewsQuery = useQuery({
    queryKey: ["reviews", deck.reviewsDocumentUrl],
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instanceUrl],
    queryFn: () => useCases.getPreferences(instanceUrl),
  });
  if (answersQuery.error || reviewsQuery.error)
    return <p class="hint">{t("card.historyUnavailable")}</p>;
  if (answersQuery.data === undefined || reviewsQuery.data === undefined)
    return <Loading label={t("card.historyLoading")} />;
  return (
    <CardHistory
      deck={deck}
      card={card}
      answers={answersQuery.data}
      states={reviewsQuery.data}
      dayBoundaryHour={
        preferencesQuery.data?.dayBoundaryHour ?? DEFAULT_PREFERENCES.dayBoundaryHour
      }
    />
  );
}
