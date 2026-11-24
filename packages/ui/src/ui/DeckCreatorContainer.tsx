// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { DeckCreatorScreen } from "./DeckCreatorScreen";
import { useI18n } from "./i18n";
import { changes, useWrite } from "./writeEffects";

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

  const createDeckMutation = useWrite({
    mutationFn: (title: LangText) => useCases.createDeck(instance.url, title),
    changes: () => [changes.decks(instance.url)],
    onSuccess: () => onDone(),
  });

  return (
    <DeckCreatorScreen
      busy={createDeckMutation.isPending}
      error={errorText(createDeckMutation.error)}
      onCreate={(title) => createDeckMutation.mutate(title)}
    />
  );
}
