import { useCallback, useMemo, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { planCardEdit, type CardEdit, type CardEditPlan } from "@solid-memo/domain/cardBulk";
import { cardLanguages, queryCards, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { useCourseCopies } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { plainTexts } from "@solid-memo/ui/markdownCache";
import type { ReviewEdit } from "./CardBulkActions";
import { CardWorkbenchScreen, type CardEditMade, type ReviewEditMade } from "./CardWorkbenchScreen";

/**
 * The card workbench's data: the deck's cards and review states, read as
 * Solid Memo reads them (the same queries, so an edit there shows here),
 * and the instance's preferences, for the study day a card is due by.
 * The domain finds the cards the query keeps (queryCards), reading a
 * card in Markdown as its plain text, each text parsed once while the
 * cards stay the same, and sorting a side by the text the reader is
 * shown, in the UI's language.
 *
 * An edit of the selected cards is planned on the cards and review
 * states as read (planCardEdit) and made with the plan the user saw
 * (UseCases.editCards); the last one made can be undone
 * (UseCases.undoCardEdit) for as long as this page stays open: its plan
 * is kept here, never stored. The selected cards' review states are
 * forgotten (UseCases.resetCards) or set due on a day
 * (UseCases.rescheduleCards), with no undo. After any of these, the
 * deck's cards, review states and study queue are read afresh.
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
  const queryClient = useQueryClient();
  const [lastEdit, setLastEdit] = useState<CardEditMade | null>(null);
  const [undone, setUndone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [reviewDone, setReviewDone] = useState<ReviewEditMade | null>(null);
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

  const plan = useCallback(
    (ids: readonly string[], edit: CardEdit) => planCardEdit(cards!, ids, edit, states!),
    [cards, states],
  );
  const reread = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] }),
      queryClient.invalidateQueries({ queryKey: ["reviews", deck.reviewsDocumentUrl] }),
    ]);
    queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
  };
  const editMutation = useMutation({
    mutationFn: ({ ids, edit, plan }: { ids: readonly string[]; edit: CardEdit; plan: CardEditPlan }) =>
      useCases.editCards(instance.url, deck, ids, edit, plan),
    onMutate: () => {
      setFailure(null);
      setUndone(false);
      setLastEdit(null);
      setReviewDone(null);
    },
    onSuccess: (written, { edit }) => setLastEdit({ edit, plan: written }),
    onError: (error) => setFailure(error),
    onSettled: reread,
  });
  const reviewMutation = useMutation({
    mutationFn: ({ ids, edit }: { ids: readonly string[]; edit: ReviewEdit }) =>
      edit.kind === "reset"
        ? useCases.resetCards(instance.url, deck, ids)
        : useCases.rescheduleCards(instance.url, deck, ids, edit.due),
    onMutate: () => {
      setFailure(null);
      setUndone(false);
      // The last card edit can no longer be undone: it is not the last edit.
      setLastEdit(null);
      setReviewDone(null);
    },
    onSuccess: (count, { edit }) => setReviewDone({ edit, count }),
    onError: (error) => setFailure(error),
    onSettled: reread,
  });
  const undoMutation = useMutation({
    mutationFn: (made: CardEditMade) => useCases.undoCardEdit(instance.url, deck, made.plan),
    onMutate: () => setFailure(null),
    onSuccess: () => {
      setLastEdit(null);
      setUndone(true);
    },
    onError: (error) => setFailure(error),
    onSettled: reread,
  });

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
      busy={editMutation.isPending || undoMutation.isPending || reviewMutation.isPending}
      error={errorText(failure)}
    />
  );
}
