import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { isCopyOf, releaseUrlOf, type LibraryDeck } from "@solid-memo/domain/library";
import { useI18n } from "./i18n";
import { ImportUrlScreen } from "./ImportUrlScreen";

/**
 * Owns adding a release from a link (UseCases.readReleaseFromLink, then
 * importReleaseFromUrl): the release at `url` read and checked afresh
 * each time the screen opens (and the same link shown again), as an
 * address may hold anything; then the release shown is added: a deck
 * imported, which returns to the deck list, or a course started, which
 * opens it.
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
  const queryClient = useQueryClient();

  const releaseQuery = useQuery({
    queryKey: ["releaseFromLink", url],
    queryFn: () => useCases.readReleaseFromLink(url!),
    enabled: url !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const release = url === undefined ? undefined : releaseQuery.data;

  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const imported = release !== undefined && (decksQuery.data ?? []).some((deck) => isCopyOf(deck, release));

  const addMutation = useMutation({
    mutationFn: (shown: LibraryDeck) => useCases.importReleaseFromUrl(instance.url, shown),
    onSuccess: async (added, shown) => {
      await queryClient.invalidateQueries({ queryKey: ["decks", instance.url] });
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
    />
  );
}
