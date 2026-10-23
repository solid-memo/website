// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Scheduler } from "@solid-memo/domain/fsrs";
import type { Instance } from "@solid-memo/domain/instance";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import type { SwitchOutcome, SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { PreferencesScreen } from "./PreferencesScreen";
import { SchedulerSwitchProgress, SchedulerSwitchResult } from "./SchedulerSwitch";
import { useI18n } from "./i18n";
import { queryKeys } from "./queryKeys";

/**
 * Owns the preferences query/mutation for one instance. Saved with the
 * scheduler they hold, the preferences go back to the deck list. A
 * change of scheduler is saved by switchScheduler: back to SM-2 at once;
 * to FSRS-6 with its progress, deck by deck, then how it ended, which
 * the learner closes, or, when a deck could not be switched, tries
 * again. The form shows again with what was last saved, so a switch that
 * failed or did not finish keeps the learner's choices.
 */
export function PreferencesContainer({
  useCases,
  instance,
  onBack,
}: {
  useCases: UseCases;
  instance: Instance;
  onBack: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SwitchProgress | null>(null);
  /** How a switch to FSRS-6 ended, said until the learner closes it, with what to try again. */
  const [ended, setEnded] = useState<{
    outcome: SwitchOutcome;
    save: { preferences: StudyPreferences; stored: Scheduler };
  } | null>(null);
  /** The preferences last submitted, which the form starts from when it shows again. */
  const [submitted, setSubmitted] = useState<StudyPreferences | null>(null);

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  // The palettes the user designed: none offered while they cannot be read.
  const palettesQuery = useQuery({
    queryKey: queryKeys.palettes(instance.url),
    queryFn: () => useCases.listPalettes(instance.url),
  });

  const saveMutation = useMutation({
    /** The preferences to save, and the scheduler they replace. */
    mutationFn: ({
      preferences,
      stored,
    }: {
      preferences: StudyPreferences;
      stored: Scheduler;
    }): Promise<SwitchOutcome | null> => {
      if (preferences.scheduler === stored)
        return useCases.savePreferences(instance.url, preferences).then(() => null);
      // Only a switch to FSRS-6 writes the decks, and takes long enough to show how far it is.
      if (preferences.scheduler === "sm2")
        return useCases.switchScheduler(instance.url, preferences);
      setEnded(null);
      setProgress({ step: "read", done: 0, total: 0 });
      return useCases.switchScheduler(instance.url, preferences, setProgress);
    },
    onSuccess: async (outcome, { preferences, stored }) => {
      // A switch changes the due days, which every view of the decks shows: all of it is read again.
      if (outcome !== null) await queryClient.invalidateQueries();
      else {
        await queryClient.invalidateQueries({ queryKey: ["preferences", instance.url] });
        // The first save puts the theme, the palette and the text size into the instance's preferences.
        await queryClient.invalidateQueries({
          queryKey: queryKeys.instanceAppearance(instance.url),
        });
      }
      queryClient.removeQueries({ queryKey: queryKeys.allStudyQueues() });
      setProgress(null);
      if (outcome === null || preferences.scheduler === "sm2") onBack();
      else setEnded({ outcome, save: { preferences, stored } });
    },
    onError: () => setProgress(null),
  });

  if (progress !== null) return <SchedulerSwitchProgress progress={progress} />;
  if (ended !== null) {
    return (
      <SchedulerSwitchResult
        outcome={ended.outcome}
        onRetry={() => saveMutation.mutate(ended.save)}
        onClose={() => {
          if (ended.outcome.switched) onBack();
          else setEnded(null);
        }}
      />
    );
  }
  if (preferencesQuery.error) {
    return <ErrorMessage error={errorText(preferencesQuery.error)} />;
  }
  if (preferencesQuery.data === undefined) {
    return <Loading label={t("preferences.loading")} />;
  }

  return (
    <PreferencesScreen
      instanceUrl={instance.url}
      preferences={submitted ?? preferencesQuery.data}
      palettes={palettesQuery.data}
      busy={saveMutation.isPending}
      error={errorText(saveMutation.error)}
      onSave={(preferences) => {
        setSubmitted(preferences);
        saveMutation.mutate({ preferences, stored: preferencesQuery.data!.scheduler });
      }}
    />
  );
}
