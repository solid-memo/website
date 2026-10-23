// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { distractorPicksOf } from "@solid-memo/domain/cardHistory";
import type { Card, CardTextPart, Deck, Distractor } from "@solid-memo/domain/deck";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { untouched } from "@solid-memo/domain/libraryUpgrade";
import { CardContainer } from "@solid-memo/ui/CardContainer";
import type { CardEdits } from "@solid-memo/ui/CardScreen";
import { useCardText } from "@solid-memo/ui/cardLanguage";
import { cardName } from "@solid-memo/ui/DataText";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { publishedDistractorIds, useDeckRelease } from "@solid-memo/ui/deckRelease";
import { DistractorFields } from "@solid-memo/ui/DistractorFields";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { CardHistoryScreen } from "./CardHistoryScreen";
import { CardInspectorScreen, type CardReleaseLink } from "./CardInspectorScreen";
import { CardScheduleContainer } from "./CardScheduleContainer";
import { ReadOnlyScope } from "./ReadOnly";
import type { CardTab } from "./router";
import { useActivityLog } from "./shell/activity";
import { queryKeys } from "./queryKeys";

/** How the card stands to the release (`release`, as useDeckRelease reads it): unknown while it is read, or when it cannot be. */
export function releaseLinkOf(
  card: Card,
  release: LibraryDeckContent | null | undefined,
): CardReleaseLink {
  const theirs = release?.cards.find((released) => released.id === card.id);
  if (theirs === undefined) return "none";
  return untouched(card, theirs) ? "same" : "changed";
}

/**
 * The card inspector's data: the card (resolved by the workspace from
 * the queryKeys.cards query, so a save shows here once that query is read
 * afresh) and the release its deck was copied from, if any, which says
 * how the card stands to it and which wrong options it published (never
 * deleted). The content tab is Solid Memo's card editor (CardContainer,
 * its wrong options left to their own tab); the wrong options' tab saves
 * each change as it is made (UseCases.updateCard, the card's content as
 * it is with its distractors as changed), then reads the cards afresh
 * and drops the deck's study queue, as a save in Solid Memo does. An
 * option being written stays open until it is saved, so a failed save
 * loses none of it. The schedule tab is CardScheduleContainer's. The
 * history tab lists the card's answers (UseCases.cardAnswers, read from
 * the answer log), and the wrong options' tab says from them how often
 * each option was chosen, once they are read. Opened at a field (`field`,
 * as the health screen links to one), that is where the user arrives: a
 * text of the content, or a wrong option's Edit button. Until the
 * instance's data check is done, and while the deck is set aside
 * (useDataCheck), every tab is shown but nothing can be changed
 * (ReadOnlyScope), with a link to the deck's health (`healthHref`). The
 * content tab says while its edits are not saved (`onUnsaved`, as
 * CardScreen's), so the workspace asks before they are left, and keeps
 * them where the workspace says (`keep`, as CardScreen's), so the card
 * shown beside its deck's cards or alone, as the window changes, has
 * them still. Each save, of either tab, is told to the Studio's activity.
 */
export function CardInspectorContainer({
  useCases,
  deck,
  card,
  tab,
  field,
  tabHref,
  onTab,
  appHref,
  healthHref,
  onRemoved,
  steps,
  onUnsaved,
  keep,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
  tab: CardTab;
  /** The field the inspector was opened at: a text of the content (front, backNote…), or a wrong option by its id. */
  field?: string;
  tabHref: (tab: CardTab) => string;
  onTab: (tab: CardTab) => void;
  appHref: string;
  /** The deck's health, where data set aside is repaired. */
  healthHref: string;
  /** The card is gone; leave its page. */
  onRemoved: () => void;
  /** As CardInspectorScreen's: the cards before and after it beside it. */
  steps?: { previous: (() => void) | null; next: (() => void) | null };
  onUnsaved?: (save: (() => Promise<boolean>) | null) => void;
  keep?: { current: CardEdits | null };
}) {
  const { t, errorText } = useI18n();
  const { cardText } = useCardText();
  const log = useActivityLog();
  const logSaved = () => log(t("studio.card.saved", { card: cardName(card, cardText) }));
  const queryClient = useQueryClient();
  const release = useDeckRelease(useCases, deck);
  const readOnly = useDataCheck(useCases, instanceUrlOfDeck(deck.url)).readOnly(deck);
  const answersQuery = useQuery({
    queryKey: ["cardAnswers", deck.url, card.id],
    queryFn: () => useCases.cardAnswers(instanceUrlOfDeck(deck.url), deck, card.id),
    enabled: tab === "history" || tab === "distractors",
  });
  const answers = answersQuery.data;
  const picks = useMemo(
    () =>
      answers === undefined
        ? undefined
        : new Map(
            [...distractorPicksOf(answers)].map(([iri, count]) => [fragmentIdOf(iri), count]),
          ),
    [answers],
  );
  const saveMutation = useMutation({
    mutationFn: (distractors: Distractor[]) =>
      useCases.updateCard(deck, card, { ...card, distractors }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cards(deck.cardsDocumentUrl) });
      queryClient.removeQueries({ queryKey: queryKeys.studyQueue(deck.url) });
      logSaved();
    },
  });

  return (
    <CardInspectorScreen
      card={card}
      release={releaseLinkOf(card, release)}
      tab={tab}
      tabHref={tabHref}
      onTab={onTab}
      appHref={appHref}
      steps={steps}
    >
      <ReadOnlyScope reason={readOnly} subject="deck" healthHref={healthHref}>
        {tab === "content" ? (
          <CardContainer
            useCases={useCases}
            deck={deck}
            card={card}
            onRemoved={onRemoved}
            heading={false}
            withDistractors={false}
            // A field the content does not have marks none.
            arrival={field as CardTextPart | undefined}
            onUnsaved={onUnsaved}
            onSaved={logSaved}
            keep={keep}
          />
        ) : tab === "schedule" ? (
          <CardScheduleContainer useCases={useCases} deck={deck} card={card} />
        ) : tab === "history" ? (
          answersQuery.error ? (
            <ErrorMessage error={errorText(answersQuery.error)} />
          ) : answers === undefined ? (
            <Loading label={t("studio.history.loading")} />
          ) : (
            <CardHistoryScreen card={card} answers={answers} />
          )
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
              picks={picks}
              arrival={field}
              onChange={(distractors) =>
                saveMutation.mutateAsync(distractors).then(
                  () => true,
                  () => false,
                )
              }
            />
            {/* Mounted throughout, so each save is heard. */}
            <p class="hint" role="status">
              {saveMutation.isSuccess ? t("card.saved") : ""}
            </p>
            <ErrorMessage error={errorText(saveMutation.error)} />
          </>
        )}
      </ReadOnlyScope>
    </CardInspectorScreen>
  );
}
