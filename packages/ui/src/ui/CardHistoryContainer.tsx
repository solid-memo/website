// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { effectiveStates } from "@solid-memo/domain/fsrs";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { CardHistory } from "./CardHistory";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { STATISTICS_STALE_MS } from "./studyFigures";
import { queryKeys } from "./queryKeys";

/**
 * Reads a card's answers from the whole answer log (with the Studio's
 * card inspector's query) and the deck's review states, and shows its
 * history (CardHistory). The answers are kept as the statistics are:
 * read again after half a minute, or at once after a change
 * (keepStudyFiguresFresh). When either cannot be read a quiet line says
 * so; the card's page works on. The preferences give the hour a study
 * day begins and the scheduler that sets the due days, whose due day and
 * interval the card's standing shows (effectiveStates; the defaults
 * until they are read).
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
    queryKey: queryKeys.reviews(deck.reviewsDocumentUrl),
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences(instanceUrl),
    queryFn: () => useCases.getPreferences(instanceUrl),
  });
  if (answersQuery.error || reviewsQuery.error)
    return <p class="hint">{t("card.historyUnavailable")}</p>;
  if (answersQuery.data === undefined || reviewsQuery.data === undefined)
    return <Loading label={t("card.historyLoading")} />;
  const { scheduler, dayBoundaryHour } = preferencesQuery.data ?? DEFAULT_PREFERENCES;
  const { sm2, fsrs } = reviewsQuery.data;
  return (
    <CardHistory
      deck={deck}
      card={card}
      answers={answersQuery.data}
      states={effectiveStates(sm2, fsrs, scheduler, dayBoundaryHour)}
      dayBoundaryHour={dayBoundaryHour}
    />
  );
}
