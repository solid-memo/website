// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { isCopyOf, releaseUrlOf, type LibraryDeck } from "@solid-memo/domain/library";
import { useI18n } from "./i18n";
import { ImportUrlScreen } from "./ImportUrlScreen";
import { queries } from "./queries";
import { changes, useWrite } from "./writeEffects";
import { tryReleaseHref } from "./router";

/**
 * Owns adding a release from a link (UseCases.readReleaseFromLink, then
 * importReleaseFromUrl): the release at `url` read and checked afresh
 * each time the screen opens (and the same link shown again), as an
 * address may hold anything; then the release shown is added: a deck
 * imported, which returns to the deck list, or a course started, which
 * opens it. Its link to copy is the one shown, for anyone (#/try?url=).
 */
export function ImportUrlContainer({
  useCases,
  instance,
  url,
  onShow,
  onDone,
  onCourseStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The link the URL holds; none yet. */
  url?: string;
  /** Shows the release at the link (the route's `url`). */
  onShow: (url: string) => void;
  /** Called once a deck is imported. */
  onDone: () => void;
  /** Called with the instance's deck of a course once it is started. */
  onCourseStarted: (deck: Deck) => void;
}) {
  const { errorText } = useI18n();

  const releaseQuery = useQuery(queries.releaseFromLink(useCases, url));
  const release = url === undefined ? undefined : releaseQuery.data;

  // A library release reached by its link is still the library's to fix (UseCases.reportPlace).
  const reportQuery = useQuery(queries.reportPlace(useCases, release?.url));

  const decksQuery = useQuery(queries.decks(useCases, instance.url));
  const imported =
    release !== undefined && (decksQuery.data ?? []).some((deck) => isCopyOf(deck, release));

  const addMutation = useWrite({
    mutationFn: (shown: LibraryDeck) => useCases.importReleaseFromUrl(instance.url, shown),
    changes: () => [changes.decks(instance.url)],
    onSuccess: (added, shown) => {
      if (shown.isCourse === true) onCourseStarted(added);
      else onDone();
    },
  });

  return (
    <ImportUrlScreen
      key={url}
      url={url}
      release={release}
      reading={url !== undefined && releaseQuery.isFetching}
      readError={url === undefined ? null : errorText(releaseQuery.error)}
      imported={imported}
      busy={addMutation.isPending}
      error={errorText(addMutation.error)}
      // The link goes into the URL as the URL standard writes it (a host in capitals, a default port),
      // so the route and the copy's prov:wasDerivedFrom name it alike; one that is no link is shown as typed,
      // and refused. The same link again reads it again: what is there may have changed.
      onShow={(typed) => {
        const shown = releaseUrlOf(typed) ?? typed;
        if (shown === url) void releaseQuery.refetch();
        else onShow(shown);
      }}
      onAdd={() => addMutation.mutate(release!)}
      reportPlace={reportQuery.data}
      shareUrl={
        url === undefined
          ? undefined
          : `${window.location.origin}${window.location.pathname}${tryReleaseHref(url)}`
      }
    />
  );
}
