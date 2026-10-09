import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck, DeckDirection } from "@solid-memo/domain/deck";
import type { DeckAbout } from "@solid-memo/domain/deckAbout";
import { unlikeRelease } from "@solid-memo/domain/deckLanguages";
import { BrowserScreen } from "./BrowserScreen";
import { ErrorMessage } from "./ErrorMessage";
import { useDeckRelease } from "./deckRelease";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import type { BrowserLanguageFilter } from "./router";

/**
 * Owns the card list and the deck/card mutations for the Browser view.
 * The library release the deck was copied from tells which cards' languages
 * are the user's to settle (unlikeRelease): none is marked until it is read.
 */
export function BrowserContainer({
  useCases,
  deck,
  deckHref,
  page,
  languageFilter,
  addCardHref,
  cardHref,
  onPageChange,
  onLanguageFilterChange,
}: {
  useCases: UseCases;
  deck: Deck;
  deckHref: string;
  /** 1-based Browser page, from the route. */
  page: number;
  /** The cards to list by their languages, from the route; undefined lists all. */
  languageFilter?: BrowserLanguageFilter;
  /** URL of the card creator. */
  addCardHref: string;
  /** URL of a card's own page. */
  cardHref: (card: Card) => string;
  onPageChange: (page: number) => void;
  onLanguageFilterChange: (filter: BrowserLanguageFilter | undefined) => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();

  const release = useDeckRelease(useCases, deck);

  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });

  const describeDeckMutation = useMutation({
    mutationFn: (about: DeckAbout) => useCases.describeDeck(deck, about),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decks"] }),
  });

  const setDirectionMutation = useMutation({
    mutationFn: (direction: DeckDirection) =>
      useCases.setDeckDirection(deck, direction),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });

  const toSettle = useMemo(
    () => (cardsQuery.data === undefined || release === undefined ? [] : unlikeRelease(cardsQuery.data, release?.cards)),
    [cardsQuery.data, release],
  );

  const removeCardMutation = useMutation({
    mutationFn: (card: Card) => useCases.removeCard(deck, card),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      await queryClient.invalidateQueries({
        queryKey: ["reviews", deck.reviewsDocumentUrl],
      });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });

  if (cardsQuery.error) {
    return <ErrorMessage error={errorText(cardsQuery.error)} />;
  }
  if (cardsQuery.data === undefined) {
    return <Loading label={t("browser.loading")} />;
  }

  return (
    <BrowserScreen
      deck={deck}
      deckHref={deckHref}
      cards={cardsQuery.data}
      page={page}
      languageFilter={languageFilter}
      toSettle={toSettle}
      busy={
        describeDeckMutation.isPending ||
        setDirectionMutation.isPending ||
        removeCardMutation.isPending
      }
      error={
        errorText(describeDeckMutation.error) ??
        errorText(setDirectionMutation.error) ??
        errorText(removeCardMutation.error)
      }
      onDescribeDeck={(about) => describeDeckMutation.mutate(about)}
      onChangeDirection={(direction) => setDirectionMutation.mutate(direction)}
      addCardHref={addCardHref}
      cardHref={cardHref}
      onRemoveCard={(card) => removeCardMutation.mutate(card)}
      onPageChange={onPageChange}
      onLanguageFilterChange={onLanguageFilterChange}
    />
  );
}
