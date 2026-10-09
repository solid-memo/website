import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { isCopyOf, type LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { forgetLibrarySelection, LibraryScreen } from "./LibraryScreen";
import { Loading } from "./Loading";
import { libraryDeckHref, libraryPreviewHref } from "./router";

/**
 * Owns the library listing and the import mutation for one instance;
 * returns to the deck list once every selected deck is in.
 */
export function LibraryContainer({
  useCases,
  instance,
  onDone,
}: {
  useCases: UseCases;
  instance: Instance;
  /** Called after a successful import. */
  onDone: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  // Per instance: another instance's library is a fresh list.
  const memoryKey = `library:${instance.url}`;

  const libraryQuery = useQuery({
    queryKey: ["library"],
    queryFn: () => useCases.listLibraryDecks(),
  });

  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const podDecks = decksQuery.data ?? [];

  const importMutation = useMutation({
    mutationFn: async (decks: LibraryDeck[]) => {
      for (const deck of decks) {
        await useCases.importLibraryDeck(instance.url, deck);
      }
    },
    onSuccess: async () => {
      // The ticked decks are in now; the next visit starts with none.
      forgetLibrarySelection(memoryKey);
      await queryClient.invalidateQueries({
        queryKey: ["decks", instance.url],
      });
      onDone();
    },
    onError: () =>
      queryClient.invalidateQueries({ queryKey: ["decks", instance.url] }),
  });

  if (libraryQuery.error) {
    return <ErrorMessage error={errorText(libraryQuery.error)} />;
  }
  if (libraryQuery.data === undefined) {
    return <Loading label={t("library.loading")} />;
  }

  return (
    <LibraryScreen
      key={memoryKey}
      memoryKey={memoryKey}
      decks={libraryQuery.data}
      deckHref={(deck) => libraryDeckHref(instance.url, deck.seriesUrl)}
      previewHref={(deck) => libraryPreviewHref(instance.url, deck.seriesUrl)}
      isImported={(deck) => podDecks.some((podDeck) => isCopyOf(podDeck, deck))}
      busy={importMutation.isPending}
      error={errorText(importMutation.error)}
      onImport={(decks) => importMutation.mutate(decks)}
    />
  );
}
