// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { copiedTest } from "@solid-memo/domain/libraryCopy";
import { libraryIndexQuery } from "./deckTreeEditor";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { forgetLibrarySelection, LibraryScreen } from "./LibraryScreen";
import { Loading } from "./Loading";
import { importUrlHref, libraryDeckHref, libraryPreviewHref } from "./router";
import { queryKeys } from "./queryKeys";
import { changes, useWrite } from "./writeEffects";

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
  // Per instance: another instance's library is a fresh list.
  const memoryKey = `library:${instance.url}`;

  const libraryQuery = useQuery(libraryIndexQuery(useCases));

  const decksQuery = useQuery({
    queryKey: queryKeys.decks(instance.url),
    queryFn: () => useCases.listDecks(instance.url),
  });
  // Worked out once for each read of the decks, not on each render: the
  // screen renders again on each keystroke in the search.
  const isImported = useMemo(() => copiedTest(decksQuery.data ?? []), [decksQuery.data]);

  // An import that stops part-way may have added some of the decks already.
  const importMutation = useWrite({
    mutationFn: async (decks: LibraryDeck[]) => {
      for (const deck of decks) {
        await useCases.importLibraryDeck(instance.url, deck);
      }
    },
    changes: () => [changes.decks(instance.url)],
    onSuccess: () => {
      // The checked decks are in now; the next visit starts with none.
      forgetLibrarySelection(memoryKey);
      onDone();
    },
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
      importUrlHref={importUrlHref(instance.url)}
      isImported={isImported}
      busy={importMutation.isPending}
      error={errorText(importMutation.error)}
      onImport={(decks) => importMutation.mutate(decks)}
    />
  );
}
