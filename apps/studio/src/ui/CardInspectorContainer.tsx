import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck, Distractor } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { untouched } from "@solid-memo/domain/libraryUpgrade";
import { CardContainer } from "@solid-memo/ui/CardContainer";
import { publishedDistractorIds, useDeckRelease } from "@solid-memo/ui/deckRelease";
import { DistractorFields } from "@solid-memo/ui/DistractorFields";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { CardInspectorScreen, type CardReleaseLink } from "./CardInspectorScreen";
import type { CardTab } from "./router";

/** How the card stands to the release (`release`, as useDeckRelease reads it): unknown while it is read, or when it cannot be. */
export function releaseLinkOf(card: Card, release: LibraryDeckContent | null | undefined): CardReleaseLink {
  const theirs = release?.cards.find((released) => released.id === card.id);
  if (theirs === undefined) return "none";
  return untouched(card, theirs) ? "same" : "changed";
}

/**
 * The card inspector's data: the card (resolved by the workspace from
 * the ["cards", …] query, so a save shows here once that query is read
 * afresh) and the release its deck was copied from, if any, which says
 * how the card stands to it and which wrong options it published (never
 * deleted). The content tab is Solid Memo's card editor (CardContainer,
 * its wrong options left to their own tab); the wrong options' tab saves
 * each change as it is made (UseCases.updateCard, the card's content as
 * it is with its distractors as changed), then reads the cards afresh
 * and drops the deck's study queue, as a save in Solid Memo does. An
 * option being written stays open until it is saved, so a failed save
 * loses none of it.
 */
export function CardInspectorContainer({
  useCases,
  deck,
  card,
  tab,
  tabHref,
  onTab,
  appHref,
  onRemoved,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
  tab: CardTab;
  tabHref: (tab: CardTab) => string;
  onTab: (tab: CardTab) => void;
  appHref: string;
  /** The card is gone; leave its page. */
  onRemoved: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const release = useDeckRelease(useCases, deck);
  const saveMutation = useMutation({
    mutationFn: (distractors: Distractor[]) => useCases.updateCard(deck, card, { ...card, distractors }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });

  return (
    <CardInspectorScreen card={card} release={releaseLinkOf(card, release)} tab={tab} tabHref={tabHref} onTab={onTab} appHref={appHref}>
      {tab === "content" ? (
        <CardContainer useCases={useCases} deck={deck} card={card} onRemoved={onRemoved} heading={false} withDistractors={false} />
      ) : (
        <>
          <DistractorFields
            cardId={card.id}
            distractors={card.distractors ?? []}
            published={publishedDistractorIds(release, card)}
            back={card.back}
            textFormat={card.textFormat}
            busy={saveMutation.isPending}
            suggestions={Object.keys(card.back).filter((tag) => tag !== "")}
            onChange={(distractors) => saveMutation.mutateAsync(distractors).then(() => true, () => false)}
          />
          {/* Mounted throughout, so each save is heard. */}
          <p class="hint" role="status">
            {saveMutation.isSuccess ? t("card.saved") : ""}
          </p>
          <ErrorMessage error={errorText(saveMutation.error)} />
        </>
      )}
    </CardInspectorScreen>
  );
}
