import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { isCopyOf, type LibraryDeck } from "@solid-memo/domain/library";
import { LibraryDeckScreen } from "./LibraryDeckScreen";
import { libraryPreviewHref, routeToHash } from "./router";
import { useI18n } from "./i18n";

/**
 * Owns one library deck's page and its import; returns to the deck list
 * once the deck is in. A course is started instead (UseCases.startCourse,
 * which finds the deck of it the instance has, if any), and opened. The
 * deck itself is resolved by Workspace from the library index, like a pod
 * deck is from the catalog.
 */
export function LibraryDeckContainer({
  useCases,
  instance,
  deck,
  onDone,
  onCourseStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: LibraryDeck;
  /** Called after a successful import. */
  onDone: () => void;
  /** Called with the instance's deck of a course once it is started, the deck list refreshed. */
  onCourseStarted: (deck: Deck) => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();

  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const imported = (decksQuery.data ?? []).some((podDeck) => isCopyOf(podDeck, deck));

  const importMutation = useMutation({
    mutationFn: () => useCases.importLibraryDeck(instance.url, deck),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["decks", instance.url],
      });
      onDone();
    },
  });

  const startMutation = useMutation({
    mutationFn: () => useCases.startCourse(instance.url, deck),
    onSuccess: async (started) => {
      await queryClient.invalidateQueries({ queryKey: ["decks", instance.url] });
      onCourseStarted(started);
    },
  });

  return (
    <LibraryDeckScreen
      deck={deck}
      browseHref={routeToHash({
        screen: "libraryBrowser",
        instanceUrl: instance.url,
        libraryDeckUrl: deck.seriesUrl,
      })}
      previewHref={libraryPreviewHref(instance.url, deck.seriesUrl)}
      imported={imported}
      busy={importMutation.isPending || startMutation.isPending}
      error={errorText(importMutation.error ?? startMutation.error)}
      onImport={() => importMutation.mutate()}
      onStartCourse={() => startMutation.mutate()}
    />
  );
}
