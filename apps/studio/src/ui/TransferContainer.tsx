import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckFile, DeckFileOptions } from "@solid-memo/domain/deckFile";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { catalogScope, deckTreeKey } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { TransferScreen, type ExportRun } from "./TransferScreen";

/**
 * The import and export screen's data: the instance's decks as the user
 * arranged them (Home's query). An export saves the decks one after
 * another (UseCases.exportDeckFile), saying which it is at. Opening a
 * file reads it (openDeckFile); importing it (importDeckFile) writes the
 * catalog, so it waits its turn with the other writes of the catalog
 * (catalogScope), and every query of the instance's decks is read afresh
 * after it.
 */
export function TransferContainer({
  useCases,
  instance,
  chosen,
  onChoose,
  cardsHref,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The URLs of the decks ticked to export (the route's). */
  chosen: readonly string[];
  onChoose: (urls: readonly string[]) => void;
  cardsHref: (deck: Deck) => string;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState<ExportRun | null>(null);
  const [file, setFile] = useState<DeckFile | null>(null);
  const treeQuery = useQuery({
    queryKey: deckTreeKey(instance.url),
    queryFn: () => useCases.listDeckTree(instance.url),
  });

  const exportMutation = useMutation({
    mutationFn: async ({ decks, options }: { decks: readonly Deck[]; options: DeckFileOptions }) => {
      try {
        for (const [index, deck] of decks.entries()) {
          setExporting({ deck, index, total: decks.length });
          await useCases.exportDeckFile(deck, options);
        }
      } finally {
        setExporting(null);
      }
      return decks.length;
    },
  });
  const openMutation = useMutation({
    mutationFn: () => useCases.openDeckFile(),
    onMutate: () => importMutation.reset(),
    // No file picked: the one picked before stays.
    onSuccess: (opened) => setFile((before) => opened ?? before),
  });
  const importMutation = useMutation({
    scope: { id: catalogScope(instance.url) },
    mutationFn: (withProgress: boolean) => useCases.importDeckFile(instance.url, file!, { withProgress }),
    onSuccess: () => setFile(null),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["decks", instance.url] }),
        queryClient.invalidateQueries({ queryKey: ["studyQueue"] }),
      ]),
  });

  if (treeQuery.error) return <ErrorMessage error={errorText(treeQuery.error)} />;
  if (treeQuery.data === undefined) return <Loading label={t("studio.decks.loading")} />;

  return (
    <TransferScreen
      instance={instance}
      decks={decksOf(treeQuery.data.children)}
      chosen={chosen}
      onChoose={onChoose}
      exporting={exporting}
      exported={exportMutation.data ?? null}
      exportError={errorText(exportMutation.error)}
      onExport={(decks, options) => exportMutation.mutate({ decks, options })}
      file={file}
      opening={openMutation.isPending}
      openError={errorText(openMutation.error)}
      onOpen={() => openMutation.mutate()}
      importing={importMutation.isPending}
      imported={importMutation.data ?? null}
      importError={errorText(importMutation.error)}
      onImport={(withProgress) => importMutation.mutate(withProgress)}
      cardsHref={cardsHref}
    />
  );
}
