import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { DeckCreatorScreen } from "./DeckCreatorScreen";
import { useI18n } from "./i18n";

/** Owns the create-deck mutation; returns to the deck list on success. */
export function DeckCreatorContainer({
  useCases,
  instance,
  onDone,
}: {
  useCases: UseCases;
  instance: Instance;
  /** Called after a successful creation. */
  onDone: () => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();

  const createDeckMutation = useMutation({
    mutationFn: (title: LangText) => useCases.createDeck(instance.url, title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["decks", instance.url],
      });
      onDone();
    },
  });

  return (
    <DeckCreatorScreen
      busy={createDeckMutation.isPending}
      error={errorText(createDeckMutation.error)}
      onCreate={(title) => createDeckMutation.mutate(title)}
    />
  );
}
