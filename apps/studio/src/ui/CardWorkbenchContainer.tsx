import { useMemo } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { cardLanguages, queryCards, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { useCourseCopies } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { plainTexts } from "@solid-memo/ui/markdownCache";
import { CardWorkbenchScreen } from "./CardWorkbenchScreen";

/**
 * The card workbench's data: the deck's cards and review states, read as
 * Solid Memo reads them (the same queries, so an edit there shows here),
 * and the instance's preferences, for the study day a card is due by.
 * The domain finds the cards the query keeps (queryCards), reading a
 * card in Markdown as its plain text, each text parsed once while the
 * cards stay the same, and sorting a side by the text the reader is
 * shown, in the UI's language.
 */
export function CardWorkbenchContainer({
  useCases,
  instance,
  deck,
  query,
  onQuery,
  cardHref,
  onOpen,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  query: CardQuery;
  onQuery: (query: CardQuery) => void;
  /** A card's editor in Solid Memo. */
  cardHref: (card: Card) => string;
  onOpen: (card: Card) => void;
}) {
  const { t, errorText, readerText, locale } = useI18n();
  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  const reviewsQuery = useQuery({
    queryKey: ["reviews", deck.reviewsDocumentUrl],
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  const isCourse = useCourseCopies(useCases, [deck]);
  const cards = cardsQuery.data;
  const plain = useMemo(() => plainTexts(), [cards]);
  const today = preferencesQuery.data === undefined ? undefined : studyDayOf(new Date(), preferencesQuery.data.dayBoundaryHour);
  const states = reviewsQuery.data;
  const rows = useMemo(
    () =>
      cards === undefined || states === undefined || today === undefined
        ? undefined
        : queryCards(cards, { direction: deck.direction, states }, query, today, plain, readerText, locale),
    [cards, states, today, query, deck.direction, plain, readerText, locale],
  );

  const error = cardsQuery.error ?? reviewsQuery.error ?? preferencesQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (rows === undefined) return <Loading label={t("studio.cards.loading")} />;

  return (
    <CardWorkbenchScreen
      deck={deck}
      course={isCourse(deck)}
      rows={rows}
      total={cards!.length}
      languages={cardLanguages(cards!)}
      query={query}
      onQuery={onQuery}
      cardHref={cardHref}
      onOpen={onOpen}
    />
  );
}
