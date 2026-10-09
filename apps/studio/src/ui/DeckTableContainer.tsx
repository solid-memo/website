import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { activeCards, type Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { studyCountsQuery } from "@solid-memo/ui/DeckStudyAction";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { DeckTableScreen, type Count } from "./DeckTableScreen";

/**
 * Home's data: the instance's decks, then each deck's cards and today's
 * counts, read as Solid Memo reads them (the same queries), each row's
 * figures as they come.
 */
export function DeckTableContainer({
  useCases,
  instance,
  appHref,
}: {
  useCases: UseCases;
  instance: Instance;
  /** Solid Memo, open at the instance's decks. */
  appHref: string;
}) {
  const { t, errorText } = useI18n();
  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const decks = decksQuery.data ?? [];
  const cardQueries = useQueries({
    queries: decks.map((deck) => ({
      queryKey: ["cards", deck.cardsDocumentUrl],
      queryFn: () => useCases.listCards(deck),
    })),
  });
  const countQueries = useQueries({
    queries: decks.map((deck) => studyCountsQuery(useCases, instance.url, deck)),
  });

  if (decksQuery.error) return <ErrorMessage error={errorText(decksQuery.error)} />;
  if (decksQuery.data === undefined) return <Loading label={t("studio.decks.loading")} />;

  const count = <T,>(query: { data?: T; isError: boolean }, figure: (data: T) => number): Count =>
    query.data !== undefined ? figure(query.data) : query.isError ? "unreadable" : "loading";
  const at = (deck: Deck) => decks.indexOf(deck);
  return (
    <DeckTableScreen
      instance={instance}
      decks={decks}
      appHref={appHref}
      figures={(deck) => ({
        cards: count(cardQueries[at(deck)]!, (cards) => activeCards(cards).length),
        due: count(countQueries[at(deck)]!, (counts) => counts.dueCount),
      })}
    />
  );
}
