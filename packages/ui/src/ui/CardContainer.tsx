import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardScreen } from "./CardScreen";
import { publishedDistractorIds, useDeckRelease } from "./deckRelease";
import { useI18n } from "./i18n";

/**
 * Owns the edit/remove mutations of one card's page. The card itself is
 * resolved by the Workspace from the ["cards", …] query, so a save shows
 * up here as a fresh `card` prop once that query is invalidated. The
 * deck's cards (the same query) give the languages its new text starts
 * in, and the release the deck came from, if any, the wrong options it
 * published, which are never deleted.
 */
export function CardContainer({
  useCases,
  deck,
  card,
  onRemoved,
  heading,
  withDistractors,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
  /** The card is gone; leave its page. */
  onRemoved: () => void;
  /** As CardScreen's: whether it heads the card, and edits its wrong options. */
  heading?: boolean;
  withDistractors?: boolean;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();

  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  const languages = useMemo(() => deckLanguages(cardsQuery.data ?? []), [cardsQuery.data]);
  const release = useDeckRelease(useCases, deck);

  const updateCardMutation = useMutation({
    mutationFn: (content: CardContent) =>
      useCases.updateCard(deck, card, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });

  const removeCardMutation = useMutation({
    mutationFn: () => useCases.removeCard(deck, card),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      await queryClient.invalidateQueries({
        queryKey: ["reviews", deck.reviewsDocumentUrl],
      });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
      onRemoved();
    },
  });

  return (
    <CardScreen
      card={card}
      deckTitle={deck.title}
      languages={languages}
      published={publishedDistractorIds(release, card)}
      heading={heading}
      withDistractors={withDistractors}
      busy={updateCardMutation.isPending || removeCardMutation.isPending}
      saved={updateCardMutation.isSuccess}
      error={
        errorText(updateCardMutation.error) ??
        errorText(removeCardMutation.error)
      }
      onSave={(content) => updateCardMutation.mutate(content)}
      onRemove={() => removeCardMutation.mutate()}
    />
  );
}
