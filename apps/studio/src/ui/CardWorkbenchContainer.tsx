// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { planCardEdit, type CardEdit, type CardEditPlan } from "@solid-memo/domain/cardBulk";
import { deckAnswers, lapseIndex } from "@solid-memo/domain/cardHistory";
import { cardLanguages, queryCards, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { effectiveStates } from "@solid-memo/domain/fsrs";
import type { Instance } from "@solid-memo/domain/instance";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { useCopies } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { plainTexts } from "@solid-memo/ui/markdownCache";
import type { ReviewEdit } from "./CardBulkActions";
import {
  CardWorkbenchScreen,
  type CardEditMade,
  type ReviewEditMade,
  type TransferMade,
} from "./CardWorkbenchScreen";
import type { CardTransfer } from "./TransferCardsDialog";
import type { SavedView } from "./shell/views";
import { queryKeys } from "./queryKeys";

/**
 * The card workbench's data: the deck's cards and review states, read as
 * Solid Memo reads them (the same queries, so an edit there shows here),
 * and the instance's preferences, for the study day a card is due by.
 * The domain finds the cards the query keeps (queryCards), reading a
 * card in Markdown as its plain text, each text parsed once while the
 * cards stay the same, and sorting a side by the text the table shows
 * the reader: in the reader's languages, the UI's first. The instance's
 * answer log (UseCases.loadAnswerLog) says how often each card was
 * forgotten (lapseIndex), for the lapses column, the leech filter and
 * the sort by lapses; while it is read, a query that needs it waits,
 * and the others show the cards without.
 *
 * An edit of the selected cards is planned on the cards and review
 * states as read (planCardEdit) and made with the plan the user saw
 * (UseCases.editCards); the last one made can be undone
 * (UseCases.undoCardEdit) for as long as this page stays open: its plan
 * is kept here, never stored. The selected cards' review states are
 * forgotten (UseCases.resetCards) or set due on a day
 * (UseCases.rescheduleCards), with no undo. They are moved or copied
 * to another of the instance's decks (UseCases.transferCards), with no
 * undo either. After any of these, the cards, review states and study
 * queue of each deck it touched are read afresh, and after a transfer
 * the instance's decks too, for their counts. Until the instance's data
 * check is done, and while the deck is set aside (useDataCheck), no edit
 * is offered; a deck set aside is never offered to move or copy cards
 * to. It says which cards the query keeps, in its order (`onRows`), for
 * the Previous and Next of a card shown beside them (`current`).
 */
export function CardWorkbenchContainer({
  useCases,
  instance,
  deck,
  decks,
  query,
  onQuery,
  savedViews,
  onSavedViews,
  cardHref,
  onOpen,
  current,
  onMove,
  onRows,
  healthHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  /** The instance's decks, this one among them. */
  decks: readonly Deck[];
  query: CardQuery;
  onQuery: (query: CardQuery) => void;
  /** As CardWorkbenchScreen's: the views saved, and keeping them. */
  savedViews: readonly SavedView[];
  onSavedViews: (views: SavedView[]) => void;
  /** A card's editor in Solid Memo. */
  cardHref: (card: Card) => string;
  onOpen: (card: Card) => void;
  /** As CardWorkbenchScreen's: the card shown beside the table, and showing another. */
  current?: string;
  onMove?: (card: Card) => void;
  /** The URLs of the cards the query keeps, in its order, as they change. */
  onRows?: (urls: readonly string[]) => void;
  /** The deck's health, where data set aside is repaired. */
  healthHref: string;
}) {
  const { t, errorText, locale } = useI18n();
  const queryClient = useQueryClient();
  const [lastEdit, setLastEdit] = useState<CardEditMade | null>(null);
  const [undone, setUndone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [reviewDone, setReviewDone] = useState<ReviewEditMade | null>(null);
  const [transferDone, setTransferDone] = useState<TransferMade | null>(null);
  const cardsQuery = useQuery({
    queryKey: queryKeys.cards(deck.cardsDocumentUrl),
    queryFn: () => useCases.listCards(deck),
  });
  const reviewsQuery = useQuery({
    queryKey: queryKeys.reviews(deck.reviewsDocumentUrl),
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences(instance.url),
    queryFn: () => useCases.getPreferences(instance.url),
  });
  const check = useDataCheck(useCases, instance.url);
  // Only a deck that may be changed takes cards.
  const others = decks.filter((other) => other.url !== deck.url && check.readOnly(other) === null);
  const answersQuery = useQuery({
    queryKey: ["answerLog", instance.url],
    queryFn: () => useCases.loadAnswerLog(instance.url),
  });
  const answers = answersQuery.data;
  const lapses = useMemo(
    () => (answers === undefined ? undefined : lapseIndex(deckAnswers(answers, deck))),
    [answers, deck],
  );
  const needsLapses = query.state === "leech" || query.sort?.key === "lapses";
  const isCourse = useCopies(useCases, [deck]).isCourse;
  const cards = cardsQuery.data;
  const plain = useMemo(() => plainTexts(), [cards]);
  const prefs = preferencesQuery.data;
  const today = prefs === undefined ? undefined : studyDayOf(new Date(), prefs.dayBoundaryHour);
  const reviews = reviewsQuery.data;
  const states = reviews?.sm2;
  // As the cards are shown (cardReader): in the deck's card language first, so a sort by side sorts what is seen.
  const languages = useMemo(
    () => [
      ...(deck.cardLanguage === undefined ? [] : [deck.cardLanguage]),
      locale,
      ...navigator.languages,
    ],
    [deck.cardLanguage, locale],
  );
  const rows = useMemo(
    () =>
      cards === undefined ||
      reviews === undefined ||
      prefs === undefined ||
      (needsLapses && lapses === undefined)
        ? undefined
        : queryCards(
            cards,
            {
              direction: deck.direction,
              states: reviews.sm2,
              // The due days and intervals shown are those of the scheduler that sets them.
              due: effectiveStates(
                reviews.sm2,
                reviews.fsrs,
                prefs.scheduler,
                prefs.dayBoundaryHour,
              ),
            },
            query,
            today!,
            plain,
            languages,
            lapses?.lapses,
          ),
    [cards, reviews, prefs, today, query, deck.direction, plain, languages, lapses, needsLapses],
  );

  useEffect(() => {
    if (rows !== undefined) onRows?.(rows.map((row) => row.card.url));
  }, [rows]);

  const plan = useCallback(
    (ids: readonly string[], edit: CardEdit) => planCardEdit(cards!, ids, edit, states!),
    [cards, states],
  );
  const reread = async (touched: readonly Deck[] = [deck]) => {
    // The study counts go at once: a screen opened while the rest is read again counts afresh.
    for (const each of touched)
      queryClient.removeQueries({ queryKey: queryKeys.studyQueue(each.url) });
    await Promise.all(
      touched.flatMap((each) => [
        queryClient.invalidateQueries({ queryKey: queryKeys.cards(each.cardsDocumentUrl) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reviews(each.reviewsDocumentUrl) }),
      ]),
    );
  };
  /** Before an edit: what the last one said goes, and it can no longer be undone, as it is not the last. */
  const starting = () => {
    setFailure(null);
    setUndone(false);
    setLastEdit(null);
    setReviewDone(null);
    setTransferDone(null);
  };
  const editMutation = useMutation({
    mutationFn: ({
      ids,
      edit,
      plan,
    }: {
      ids: readonly string[];
      edit: CardEdit;
      plan: CardEditPlan;
    }) => useCases.editCards(instance.url, deck, ids, edit, plan),
    onMutate: starting,
    onSuccess: (written, { edit }) => setLastEdit({ edit, plan: written }),
    onError: (error) => setFailure(error),
    onSettled: () => reread(),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ ids, edit }: { ids: readonly string[]; edit: ReviewEdit }) =>
      edit.kind === "reset"
        ? useCases.resetCards(instance.url, deck, ids)
        : useCases.rescheduleCards(instance.url, deck, ids, edit.due),
    onMutate: starting,
    onSuccess: (count, { edit }) => setReviewDone({ edit, count }),
    onError: (error) => setFailure(error),
    onSettled: () => reread(),
  });
  const transferMutation = useMutation({
    mutationFn: ({ ids, transfer }: { ids: readonly string[]; transfer: CardTransfer }) =>
      useCases.transferCards(instance.url, deck, transfer.to, ids, {
        mode: transfer.mode,
        keepProgress: transfer.keepProgress,
      }),
    onMutate: starting,
    onSuccess: (plan, { transfer }) => setTransferDone({ transfer, plan }),
    onError: (error) => setFailure(error),
    onSettled: async (_plan, _error, { transfer }) => {
      await Promise.all([
        reread([deck, transfer.to]),
        queryClient.invalidateQueries({ queryKey: queryKeys.decks(instance.url) }),
      ]);
    },
  });
  const undoMutation = useMutation({
    mutationFn: (made: CardEditMade) => useCases.undoCardEdit(instance.url, deck, made.plan),
    onMutate: () => setFailure(null),
    onSuccess: () => {
      setLastEdit(null);
      setUndone(true);
    },
    onError: (error) => setFailure(error),
    onSettled: () => reread(),
  });

  const error =
    cardsQuery.error ??
    reviewsQuery.error ??
    preferencesQuery.error ??
    (needsLapses ? answersQuery.error : null);
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (rows === undefined) return <Loading label={t("studio.cards.loading")} />;

  return (
    <CardWorkbenchScreen
      deck={deck}
      course={isCourse(deck)}
      rows={rows}
      total={cards!.length}
      languages={cardLanguages(cards!)}
      lapses={lapses}
      lapsesFailed={answersQuery.error !== null}
      healthHref={healthHref}
      query={query}
      onQuery={onQuery}
      savedViews={savedViews}
      onSavedViews={onSavedViews}
      cardHref={cardHref}
      onOpen={onOpen}
      current={current}
      onMove={onMove}
      plan={plan}
      onEdit={(ids, edit, planned) =>
        editMutation.mutateAsync({ ids, edit, plan: planned }).then(
          () => true,
          () => false,
        )
      }
      lastEdit={lastEdit}
      undone={undone}
      onUndo={() => undoMutation.mutate(lastEdit!)}
      today={today!}
      onReviewEdit={(ids, edit) =>
        reviewMutation.mutateAsync({ ids, edit }).then(
          () => true,
          () => false,
        )
      }
      reviewDone={reviewDone}
      decks={others}
      onTransfer={(ids, transfer) =>
        transferMutation.mutateAsync({ ids, transfer }).then(
          () => true,
          () => false,
        )
      }
      transferDone={transferDone}
      readOnly={check.readOnly(deck)}
      busy={
        editMutation.isPending ||
        undoMutation.isPending ||
        reviewMutation.isPending ||
        transferMutation.isPending
      }
      error={errorText(failure)}
    />
  );
}
