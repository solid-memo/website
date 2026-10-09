import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { CardContent, Deck } from "@solid-memo/domain/deck";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardCreatorScreen } from "./CardCreatorScreen";
import { useI18n } from "./i18n";

/**
 * Owns the add-card mutation. Deliberately stays on the page after a
 * successful add (the form clears itself once told) so several cards can be entered
 * in a row; Back (backHref) leaves the page. Reads the deck's cards for
 * the languages new text starts in.
 */
export function CardCreatorContainer({
  useCases,
  deck,
  deckHref,
  backHref,
}: {
  useCases: UseCases;
  deck: Deck;
  deckHref: string;
  backHref: string;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();

  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  const languages = useMemo(() => deckLanguages(cardsQuery.data ?? []), [cardsQuery.data]);

  const addCardMutation = useMutation({
    mutationFn: (content: CardContent) => useCases.addCard(deck, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });

  return (
    <CardCreatorScreen
      deck={deck}
      languages={languages}
      deckHref={deckHref}
      busy={addCardMutation.isPending}
      error={errorText(addCardMutation.error)}
      onAdd={(content, onAdded) => addCardMutation.mutate(content, { onSuccess: onAdded })}
      backHref={backHref}
    />
  );
}
