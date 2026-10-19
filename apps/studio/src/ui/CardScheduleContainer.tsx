// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import {
  studyDirections,
  type Card,
  type Deck,
  type DeckDirection,
  type StudyDirection,
} from "@solid-memo/domain/deck";
import { isFresh, recallNow, type Scheduler } from "@solid-memo/domain/fsrs";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import type { FsrsState, ReviewState, ReviewStates } from "@solid-memo/domain/review";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import {
  CardScheduleScreen,
  type CardDirectionSchedule,
  type FsrsSchedule,
  type ScheduleEditMade,
} from "./CardScheduleScreen";

const BOTH: readonly StudyDirection[] = ["front-to-back", "back-to-front"];

/** How the instance schedules: its scheduler, and the hour its study day starts. */
export interface ScheduleSettings {
  scheduler: Scheduler;
  dayBoundaryHour: number;
}

/**
 * What FSRS-6 holds of a prompt studied so (`sm2`), `now`: nothing to
 * show while SM-2 schedules and FSRS-6 has no state of it; that it is
 * estimated at the next review while FSRS-6 schedules and its state is
 * missing or stale (it then counts for nothing); else its memory.
 */
function fsrsScheduleOf(
  sm2: ReviewState,
  fsrs: FsrsState | null,
  settings: ScheduleSettings,
  now: Date,
): FsrsSchedule | null {
  const sets = settings.scheduler === "fsrs6";
  if (sets && (fsrs === null || !isFresh(fsrs, sm2))) return { kind: "estimated" };
  if (fsrs === null) return null;
  return {
    kind: "memory",
    stability: fsrs.stability,
    difficulty: fsrs.difficulty,
    recall: recallNow(fsrs, now, settings.dayBoundaryHour),
    due: fsrs.due,
    sets,
  };
}

/**
 * The card's schedule in each direction: those the deck studies, then
 * one it no longer does while the card keeps a state there. An FSRS-6
 * state of a direction with no SM-2 state counts for nothing, so it is
 * not shown.
 */
export function directionSchedules(
  card: Card,
  direction: DeckDirection,
  states: ReviewStates,
  settings: ScheduleSettings,
  now: Date,
): CardDirectionSchedule[] {
  const studied = studyDirections(direction);
  const of = <T extends ReviewState | FsrsState>(list: readonly T[], each: StudyDirection) =>
    list.find((candidate) => candidate.cardId === card.id && candidate.direction === each) ?? null;
  return BOTH.flatMap((each) => {
    const state = of(states.sm2, each);
    if (!studied.includes(each) && state === null) return [];
    return [
      {
        direction: each,
        state,
        studied: studied.includes(each),
        fsrs: state === null ? null : fsrsScheduleOf(state, of(states.fsrs, each), settings, now),
      },
    ];
  });
}

/**
 * The card inspector's schedule tab's data: the deck's review states,
 * read with the workbench's query (so an edit here shows there), and
 * the instance's preferences, for the scheduler that sets the due days
 * and the study day a recall chance is counted to. A
 * direction's state is forgotten (UseCases.resetCards) or given another
 * due day (UseCases.rescheduleCards), for this card in that direction
 * only; then the review states are read afresh, and the deck's study
 * queue dropped, as Solid Memo does after a reset of the day.
 */
export function CardScheduleContainer({
  useCases,
  deck,
  card,
}: {
  useCases: UseCases;
  deck: Deck;
  card: Card;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [done, setDone] = useState<ScheduleEditMade | null>(null);
  const reviewsQuery = useQuery({
    queryKey: ["reviews", deck.reviewsDocumentUrl],
    queryFn: () => useCases.listDeckReviewStates(deck),
  });
  const instanceUrl = instanceUrlOfDeck(deck.url);
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instanceUrl],
    queryFn: () => useCases.getPreferences(instanceUrl),
  });
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

  const failure = reviewsQuery.error ?? preferencesQuery.error;
  if (failure) return <ErrorMessage error={errorText(failure)} />;
  if (reviewsQuery.data === undefined || preferencesQuery.data === undefined)
    return <Loading label={t("studio.schedule.loading")} />;
  return (
    <CardScheduleScreen
      directions={directionSchedules(
        card,
        deck.direction,
        reviewsQuery.data,
        preferencesQuery.data,
        new Date(),
      )}
      busy={editMutation.isPending}
      done={done}
      error={errorText(editMutation.error)}
      onReset={(direction) => editMutation.mutate({ kind: "reset", direction })}
      onReschedule={(direction, due) => editMutation.mutate({ kind: "reschedule", direction, due })}
    />
  );
}
