// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, CardContent, CardTextPart, Deck } from "@solid-memo/domain/deck";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardScreen, type CardEdits } from "./CardScreen";
import { publishedDistractorIds, useDeckRelease } from "./deckRelease";
import { useI18n } from "./i18n";
import { queryKeys } from "./queryKeys";

/**
 * Owns the edit/remove mutations of one card's page. The card itself is
 * resolved by the Workspace from the ["cards", …] query, so a save shows
 * up here as a fresh `card` prop once that query is invalidated. The
 * deck's cards (the same query) give the languages its new text starts
 * in, and the release the deck came from, if any, the wrong options it
 * published, which are never deleted. A save made says so (`onSaved`),
 * once the deck's cards are read afresh.
 */
export function CardContainer({
  useCases,
  deck,
  card,
  onRemoved,
  heading,
  withDistractors,
  arrival,
  onUnsaved,
  onSaved,
  keep,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
  /** The card is gone; leave its page. */
  onRemoved: () => void;
  /** As CardScreen's: whether it heads the card, and edits its wrong options. */
  heading?: boolean;
  withDistractors?: boolean;
  /** The text the page was opened at: where the user arrives. */
  arrival?: CardTextPart;
  /** As CardScreen's: the editor holds changes not saved, and how to save them. */
  onUnsaved?: (save: (() => Promise<boolean>) | null) => void;
  /** The card was saved. */
  onSaved?: () => void;
  /** As CardScreen's: where its edits are kept. */
  keep?: { current: CardEdits | null };
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
    mutationFn: (content: CardContent) => useCases.updateCard(deck, card, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
      onSaved?.();
    },
  });

  const removeCardMutation = useMutation({
    mutationFn: () => useCases.removeCard(deck, card),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["cards", deck.cardsDocumentUrl],
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.reviews(deck.reviewsDocumentUrl),
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
      arrival={arrival}
      busy={updateCardMutation.isPending || removeCardMutation.isPending}
      saved={updateCardMutation.isSuccess}
      error={errorText(updateCardMutation.error) ?? errorText(removeCardMutation.error)}
      onSave={(content) =>
        updateCardMutation.mutateAsync(content).then(
          () => true,
          () => false,
        )
      }
      onRemove={() => removeCardMutation.mutate()}
      onUnsaved={onUnsaved}
      keep={keep}
    />
  );
}
