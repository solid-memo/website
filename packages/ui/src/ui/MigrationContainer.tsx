import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { UpdateOutcome, UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { isPlanEmpty } from "@solid-memo/domain/migration";
import type { Session } from "@solid-memo/domain/session";
import { useI18n } from "./i18n";
import { InstanceUpdateConfirm, InstanceUpdateProgress, InstanceUpdateResult } from "./InstanceUpdate";
import { MigrationNotice } from "./MigrationNotice";

/**
 * Checks an instance for documents in an older format and, when there
 * are any, offers the update (docs/migrations.md): a confirmation of how
 * it keeps the data safe, then its progress, document by document, then
 * either word that the data is up to date or the documents it could not
 * update now, each with why, to try again. The check reads every document
 * once per session; a failed check shows nothing, since the app works on
 * the old format and the deck list reports pod trouble on its own. Each
 * step takes the focus from the one it replaces; Cancel gives it back to
 * the notice.
 */
export function MigrationContainer({
  useCases,
  session,
  instance,
}: {
  useCases: UseCases;
  /** Whose pod it is: the publisher of a catalogue the update writes. */
  session: Session;
  instance: Instance;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  /** The user came back to the notice, from the confirmation or a result: it takes the focus. */
  const [returned, setReturned] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  /** An update that left documents it could not update now, said until the user tries again or closes it. */
  const [unfinished, setUnfinished] = useState<UpdateOutcome | null>(null);

  const planQuery = useQuery({
    queryKey: ["migration", instance.url],
    queryFn: () => useCases.planMigration(instance.url),
    staleTime: Infinity,
  });

  const updateMutation = useMutation({
    mutationFn: () => useCases.updateInstance(session, instance, setProgress),
    onSuccess: async (outcome) => {
      // The documents are where they were, some in newer formats: everything shown of them is read again,
      // while the progress still shows, so the offer comes back only as what is still outdated.
      await queryClient.invalidateQueries();
      setProgress(null);
      setUnfinished(outcome.failed.length > 0 ? outcome : null);
    },
    onError: () => setProgress(null),
  });

  const start = () => {
    setUnfinished(null);
    setProgress({ step: "read", done: 0, total: 0 });
    updateMutation.mutate();
  };

  const plan = planQuery.data;

  if (progress !== null) return <InstanceUpdateProgress progress={progress} />;
  if (unfinished !== null) {
    return (
      <InstanceUpdateResult
        outcome={unfinished}
        onRetry={start}
        onDismiss={() => {
          setUnfinished(null);
          setReturned(true);
        }}
      />
    );
  }
  if (plan === undefined || isPlanEmpty(plan)) {
    return updateMutation.isSuccess ? (
      <p class="hint" role="status">
        {t("instanceUpdate.done")}
      </p>
    ) : null;
  }
  if (confirming) {
    return (
      <InstanceUpdateConfirm
        instanceName={instance.name}
        onStart={() => {
          setConfirming(false);
          start();
        }}
        onCancel={() => {
          setConfirming(false);
          setReturned(true);
        }}
      />
    );
  }
  return (
    <MigrationNotice
      plan={plan}
      busy={updateMutation.isPending}
      error={errorText(updateMutation.error)}
      focus={returned}
      onMigrate={() => setConfirming(true)}
    />
  );
}
