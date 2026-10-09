import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardScreen } from "./CardScreen";
import { useI18n } from "./i18n";

/**
 * Owns the edit/remove mutations of one card's page. The card itself is
 * resolved by the Workspace from the ["cards", …] query, so a save shows
 * up here as a fresh `card` prop once that query is invalidated. The
 * deck's cards (the same query) give the languages its new text starts
 * in.
 */
export function CardContainer({
  useCases,
  deck,
  card,
  onRemoved,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
  /** The card is gone; leave its page. */
  onRemoved: () => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();

  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  const languages = useMemo(() => deckLanguages(cardsQuery.data ?? []), [cardsQuery.data]);

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
