import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { studyDirections, type Card, type Deck, type DeckDirection, type StudyDirection } from "@solid-memo/domain/deck";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import type { ReviewState } from "@solid-memo/domain/review";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { CardScheduleScreen, type CardDirectionSchedule, type ScheduleEditMade } from "./CardScheduleScreen";

const BOTH: readonly StudyDirection[] = ["front-to-back", "back-to-front"];

/**
 * The card's schedule in each direction: those the deck studies, then
 * one it no longer does while the card keeps a state there.
 */
export function directionSchedules(card: Card, direction: DeckDirection, states: readonly ReviewState[]): CardDirectionSchedule[] {
  const studied = studyDirections(direction);
  return BOTH.flatMap((each) => {
    const state = states.find((candidate) => candidate.cardId === card.id && candidate.direction === each) ?? null;
    return studied.includes(each) || state !== null ? [{ direction: each, state, studied: studied.includes(each) }] : [];
  });
}

/**
 * The card inspector's schedule tab's data: the deck's review states,
 * read with the workbench's query (so an edit here shows there). A
 * direction's state is forgotten (UseCases.resetCards) or given another
 * due day (UseCases.rescheduleCards), for this card in that direction
 * only; then the review states are read afresh, and the deck's study
 * queue dropped, as Solid Memo does after a reset of the day.
 */
export function CardScheduleContainer({ useCases, deck, card }: { useCases: UseCases; deck: Deck; card: Card }) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [done, setDone] = useState<ScheduleEditMade | null>(null);
  const reviewsQuery = useQuery({
    queryKey: ["reviews", deck.reviewsDocumentUrl],
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const instanceUrl = instanceUrlOfDeck(deck.url);
  const editMutation = useMutation({
    mutationFn: (edit: ScheduleEditMade) =>
      edit.kind === "reset"
        ? useCases.resetCards(instanceUrl, deck, [card.id], edit.direction)
        : useCases.rescheduleCards(instanceUrl, deck, [card.id], edit.due, edit.direction),
    onMutate: () => setDone(null),
    onSuccess: (_count, edit) => setDone(edit),
    onSettled: async () => {
      // The study counts go at once: a screen opened while the states are read again counts afresh.
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
      await queryClient.invalidateQueries({ queryKey: ["reviews", deck.reviewsDocumentUrl] });
    },
  });

  if (reviewsQuery.error) return <ErrorMessage error={errorText(reviewsQuery.error)} />;
  if (reviewsQuery.data === undefined) return <Loading label={t("studio.schedule.loading")} />;
  return (
    <CardScheduleScreen
      directions={directionSchedules(card, deck.direction, reviewsQuery.data)}
      busy={editMutation.isPending}
      done={done}
      error={errorText(editMutation.error)}
      onReset={(direction) => editMutation.mutate({ kind: "reset", direction })}
      onReschedule={(direction, due) => editMutation.mutate({ kind: "reschedule", direction, due })}
    />
  );
}
