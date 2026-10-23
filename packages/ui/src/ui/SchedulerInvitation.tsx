// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { invitesToFsrs, type StudyPreferences } from "@solid-memo/domain/preferences";
import type { SwitchOutcome, SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { SchedulerSwitchProgress, SchedulerSwitchResult } from "./SchedulerSwitch";
import { useTheme } from "./theme";
import { queryKeys } from "./queryKeys";

/**
 * The invitation to switch from SM-2 to FSRS-6, above the deck list:
 * what FSRS-6 gives, in a sentence or two, a button that switches and
 * one that declines. A landmark named by its title, as the newcomer's
 * course offer is, so the Decks heading stays the screen's first; it
 * takes no focus. While "Not now" is saved, both buttons are only
 * aria-disabled, so focus stays where it is.
 */
export function SchedulerInvitation({
  busy,
  error,
  onSwitch,
  onDismiss,
}: {
  busy: boolean;
  error: ErrorText | null;
  onSwitch: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <aside class="scheduler-invitation" aria-labelledby={titleId}>
      <p id={titleId} class="scheduler-invitation-title">
        {t("schedulerInvitation.title")}
      </p>
      <p>{t("schedulerInvitation.pitch")}</p>
      <div class="edit-actions">
        <button
          class="primary"
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onSwitch();
          }}
        >
          {t("schedulerInvitation.switch")}
        </button>
        <button
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onDismiss();
          }}
        >
          {t("schedulerInvitation.notNow")}
        </button>
      </div>
      <ErrorMessage error={error} />
    </aside>
  );
}

/**
 * Invites a learner whose instance is on SM-2 to switch to FSRS-6
 * (invitesToFsrs), a guest among them: nothing while FSRS-6 sets the due
 * days, once "Not now" was answered (it is kept in the preferences, so
 * on every device), or while the preferences load or cannot be read; the
 * deck list works without it. "Switch to FSRS-6" runs switchScheduler
 * with the preferences as they are but for the scheduler, and the theme
 * this device shows (with none stored, the defaults' "system" is not the
 * learner's choice), its progress
 * and then how it ended in the invitation's place, as the preferences
 * screen shows them (SchedulerSwitch), with Try again when a deck could
 * not be switched. Then everything the decks show is read again, as the
 * due days may have changed. An error said is that of the answer tried
 * last.
 */
export function SchedulerInvitationContainer({
  useCases,
  instance,
}: {
  useCases: UseCases;
  instance: Instance;
}) {
  const { errorText } = useI18n();
  const { choice: themeChoice } = useTheme();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SwitchProgress | null>(null);
  /** How the switch ended, said until the learner closes it, with the preferences to try again with. */
  const [ended, setEnded] = useState<{
    outcome: SwitchOutcome;
    preferences: StudyPreferences;
  } | null>(null);
  // The preferences screen's key: a save there, or this switch, shows here at once.
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
    refetchOnWindowFocus: false,
  });

  const switchMutation = useMutation({
    mutationFn: (preferences: StudyPreferences) => {
      setEnded(null);
      setProgress({ step: "read", done: 0, total: 0 });
      return useCases.switchScheduler(
        instance.url,
        { ...preferences, scheduler: "fsrs6", theme: themeChoice },
        setProgress,
      );
    },
    onSuccess: async (outcome, preferences) => {
      await queryClient.invalidateQueries();
      queryClient.removeQueries({ queryKey: queryKeys.allStudyQueues() });
      setProgress(null);
      setEnded({ outcome, preferences });
    },
    onError: () => setProgress(null),
  });
  const dismissMutation = useMutation({
    mutationFn: () => useCases.dismissSchedulerInvitation(instance.url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["preferences", instance.url] }),
  });

  if (progress !== null) return <SchedulerSwitchProgress progress={progress} />;
  if (ended !== null) {
    return (
      <SchedulerSwitchResult
        outcome={ended.outcome}
        onRetry={() => switchMutation.mutate(ended.preferences)}
        onClose={() => setEnded(null)}
      />
    );
  }
  const preferences = preferencesQuery.data;
  if (preferences === undefined || !invitesToFsrs(preferences) || dismissMutation.isSuccess)
    return null;
  return (
    <SchedulerInvitation
      busy={dismissMutation.isPending}
      error={errorText(switchMutation.error ?? dismissMutation.error)}
      onSwitch={() => {
        dismissMutation.reset();
        switchMutation.mutate(preferences);
      }}
      onDismiss={() => {
        switchMutation.reset();
        dismissMutation.mutate();
      }}
    />
  );
}
