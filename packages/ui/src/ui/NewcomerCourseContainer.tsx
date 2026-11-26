// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { useI18n } from "./i18n";
import { NewcomerCourseOffer } from "./NewcomerCourseOffer";
import { libraryDeckHref } from "./router";
import { queries } from "./queries";
import { changes, useWrite } from "./writeEffects";

/**
 * The course the library offers newcomers (its index names it,
 * docs/courses.md), for an instance with no decks yet. Nothing while the
 * library loads, when it cannot be read, or when it names no course: the
 * deck list works without it. Started as from its library page
 * (LibraryDeckContainer), then opened.
 */
export function NewcomerCourseContainer({
  useCases,
  instance,
  onCourseStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  /** Called with the instance's deck of the course once it is started, the deck list refreshed. */
  onCourseStarted: (deck: Deck) => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const libraryQuery = useQuery(queries.library(useCases));
  // In the options, not mutate's: the refreshed list has the course's deck, so this offer is gone by then.
  const startMutation = useWrite({
    mutationFn: (course: LibraryDeck) => useCases.startCourse(instance.url, course),
    changes: () => [changes.decks(instance.url)],
    onSuccess: async (started) => {
      // The course screen finds its deck among the instance's decks, which nothing
      // on the deck list reads (Workspace fills them in from the arrangement, later).
      // A prefetch never throws: the course is started, and a failed read is the course screen's to make again.
      await queryClient.prefetchQuery(queries.decks(useCases, instance.url));
      onCourseStarted(started);
    },
  });

  const course = libraryQuery.data?.find((deck) => deck.forNewcomers === true);
  if (course === undefined) return null;
  return (
    <NewcomerCourseOffer
      course={course}
      aboutHref={libraryDeckHref(instance.url, course.seriesUrl)}
      busy={startMutation.isPending}
      error={errorText(startMutation.error)}
      onStart={() => startMutation.mutate(course)}
    />
  );
}
