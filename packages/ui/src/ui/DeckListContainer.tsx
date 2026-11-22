// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { CourseStripContainer } from "./CourseStrip";
import { DeckListScreen } from "./DeckListScreen";
import { DeckStudyActionContainer } from "./DeckStudyAction";
import { useDeckCompletion } from "./deckCompletion";
import { isPaused } from "@solid-memo/domain/deckPause";
import { ComebackNotes } from "./ComebackNotes";
import { PauseDeckDialog } from "./PauseDeckDialog";
import { useStudyToday } from "./pausedToday";
import { queryKeys } from "./queryKeys";
import { useCopies, useDeckTreeEditor } from "./deckTreeEditor";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { NewcomerCourseContainer } from "./NewcomerCourseContainer";
import { SchedulerInvitationContainer } from "./SchedulerInvitation";
import { TodaySummaryContainer } from "./TodaySummaryContainer";
import { WhatsNewContainer } from "./WhatsNew";
import {
  courseHref,
  deckHref,
  importUrlHref,
  libraryHref,
  routeToHash,
  studioHref,
} from "./router";

/**
 * Owns the deck list of one instance, as the user arranged it into
 * groups, and its edits (useDeckTreeEditor). A deck set aside for
 * invalid data (docs/validation.md) is listed, but not offered for study.
 *
 * A deck copied from a course (docs/courses.md) is continued from the
 * strip of courses above the list, while it is unfinished, and from its
 * menu; while every deck is a course, the strip points to the deck
 * library too, whatever the courses are. A copy of a release added from
 * a link says the host it came from, and a copy the library has a newer
 * release of says so, its row leading to the deck's page, which offers
 * the upgrade (useCopies). An instance with no decks (groups aside) is
 * offered the library's course for newcomers under the list's heading
 * (NewcomerCourseContainer), which opens once started. A learner still
 * on SM-2 is invited to switch to FSRS-6 above the list
 * (SchedulerInvitationContainer), until they switch or answer "Not now".
 * The highlights of a version this browser has not shown are at the top
 * (WhatsNewContainer), until closed. A study session just left with an
 * answer (`celebrate`) is celebrated in today's strip once nothing is
 * left to study today (TodaySummary). A deck paused today
 * (useStudyToday) is left out of today's strip and of the course strip;
 * its menu offers to resume it, any other deck's to pause it
 * (PauseDeckDialog). A deck that resumed from a pause is welcomed back
 * above the list while its backlog lasts (ComebackNotes). A deck whose
 * every card is learned, and a course finished, turn gold in the list
 * and are decorated (useDeckCompletion).
 */
export function DeckListContainer({
  useCases,
  instance,
  isSetAside = () => false,
  arrangementSetAside = false,
  checking = false,
  celebrate = false,
  onStudyDeck,
  onCourseStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  isSetAside?: (deck: Deck) => boolean;
  /** The catalog or a deck group is invalid, and the policy sets it aside: the list cannot be rearranged. */
  arrangementSetAside?: boolean;
  /** The instance's data is still being checked, under a policy that may set some of it aside: the list cannot be rearranged yet. */
  checking?: boolean;
  /** A study session was just left with an answer: finishing the day's study is celebrated. */
  celebrate?: boolean;
  onStudyDeck: (deck: Deck) => void;
  /** Called with the instance's deck of the course for newcomers once it is started. */
  onCourseStarted: (deck: Deck) => void;
}) {
  const { t, errorText } = useI18n();
  const { treeQuery, editor } = useDeckTreeEditor(useCases, instance);
  const decks = decksOf(treeQuery.data?.children ?? []);
  const { isCourse, linkedHost, newerRelease, readsRefused } = useCopies(useCases, decks);
  const today = useStudyToday(useCases, instance.url);
  const pausedToday = (deck: Deck) => isPaused(deck, today);
  const studied = (deck: Deck) => !isSetAside(deck) && !pausedToday(deck);
  const completion = useDeckCompletion(useCases, instance, decks.filter(studied), isCourse);
  const queryClient = useQueryClient();
  /** The deck whose pause dialog is open. */
  const [pausing, setPausing] = useState<Deck | null>(null);
  // The deck's entry changed, and with it what it counts today: its queue, counts and comeback.
  const refresh = (deck: Deck) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.studyQueue(deck.url) }),
    ]);
  const pauseMutation = useMutation({
    mutationFn: ({ deck, resumesOn }: { deck: Deck; resumesOn: string | null }) =>
      useCases.pauseDeck(instance.url, deck, resumesOn, new Date()),
    onSettled: (_paused, _error, { deck }) => refresh(deck),
  });
  const resumeMutation = useMutation({
    mutationFn: (deck: Deck) => useCases.resumeDeck(instance.url, deck, new Date()),
    onSettled: (_resumed, _error, deck) => refresh(deck),
  });

  if (treeQuery.error) {
    return <ErrorMessage error={errorText(treeQuery.error)} />;
  }
  if (editor === undefined) {
    return <Loading label={t("deckList.loading")} />;
  }

  return (
    <>
      <WhatsNewContainer useCases={useCases} />
      <TodaySummaryContainer
        useCases={useCases}
        instance={instance}
        decks={decks.filter(studied)}
        celebrate={celebrate}
      />
      <CourseStripContainer
        useCases={useCases}
        instance={instance}
        decks={decks.filter((deck) => isCourse(deck) && studied(deck))}
        libraryHref={decks.every(isCourse) ? libraryHref(instance.url) : undefined}
        readsRefused={readsRefused}
      />
      <ComebackNotes useCases={useCases} instanceUrl={instance.url} decks={decks} today={today} />
      <SchedulerInvitationContainer useCases={useCases} instance={instance} />
      <ErrorMessage error={errorText(resumeMutation.error)} />
      <DeckListScreen
        {...editor}
        arrangementSetAside={arrangementSetAside}
        checking={checking}
        libraryHref={libraryHref(instance.url)}
        deckHref={(deck) => deckHref(instance.url, deck.url)}
        courseHref={(deck) => (isCourse(deck) ? courseHref(instance.url, deck.url) : undefined)}
        fromHost={linkedHost}
        newerRelease={newerRelease}
        importUrlHref={importUrlHref(instance.url)}
        preferencesHref={(deck) =>
          routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url })
        }
        studioHref={studioHref(instance.url)}
        pause={{
          pausedToday,
          onPause: (deck) => {
            pauseMutation.reset();
            setPausing(deck);
          },
          onResume: (deck) => resumeMutation.mutate(deck),
        }}
        renderStudyAction={(deck) =>
          isSetAside(deck) ? (
            <span class="hint">{t("deckList.setAside")}</span>
          ) : pausedToday(deck) ? null : (
            <DeckStudyActionContainer
              useCases={useCases}
              instance={instance}
              deck={deck}
              onStudy={() => onStudyDeck(deck)}
            />
          )
        }
        completion={completion}
        createDeckHref={routeToHash({ screen: "deckCreator", instanceUrl: instance.url })}
        offer={
          decksOf(editor.tree.children).length === 0 && (
            <NewcomerCourseContainer
              useCases={useCases}
              instance={instance}
              onCourseStarted={onCourseStarted}
            />
          )
        }
      />
      {pausing !== null && (
        <PauseDeckDialog
          useCases={useCases}
          instanceUrl={instance.url}
          deck={pausing}
          today={today}
          busy={pauseMutation.isPending}
          error={errorText(pauseMutation.error)}
          onPause={(resumesOn) =>
            pauseMutation.mutateAsync({ deck: pausing, resumesOn }).then(
              () => true,
              () => false,
            )
          }
          onClose={() => setPausing(null)}
        />
      )}
    </>
  );
}
