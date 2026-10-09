import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { UpdateOutcome, UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { isPlanEmpty } from "@solid-memo/domain/migration";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { InstanceUpdateConfirm, InstanceUpdateProgress, InstanceUpdateResult } from "./InstanceUpdate";
import { MigrationNotice } from "./MigrationNotice";
import { usePanelFocus } from "./panelFocus";

/**
 * Checks an instance for documents in an older format and, when there
 * are any, offers the update (docs/migrations.md): a confirmation of how
 * it keeps the data safe, then its progress, document by document, then
 * either word that the data is up to date or the documents it could not
 * update now, each with why, to try again. The check reads every document
 * once per session; a failed check shows nothing, since the app works on
 * the old format and the deck list reports pod trouble on its own. The
 * partial copy of the instance a run cut off by a closed tab left (the
 * guest's study moving into the user's Pod, or an update by an earlier
 * version of the app) is offered for removal. Each step takes the focus
 * from the one it replaces; Cancel gives it back to the notice.
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

  const interruptedQuery = useQuery({
    queryKey: ["interruptedUpdate", instance.url],
    queryFn: () => useCases.findInterruptedUpdate(instance),
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

  const cleanupMutation = useMutation({
    mutationFn: () => useCases.removeInterruptedUpdate(instance),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["interruptedUpdate", instance.url] });
    },
  });

  const interrupted = interruptedQuery.data ?? null;
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
  if (interrupted !== null) {
    return (
      <InterruptedUpdate
        message={t("migration.interrupted", { name: instance.name, url: interrupted })}
        busy={cleanupMutation.isPending}
        onRemove={() => cleanupMutation.mutate()}
      >
        <ErrorMessage error={errorText(cleanupMutation.error)} />
      </InterruptedUpdate>
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

/**
 * The partial copy a run cut off by a closed tab left, and the button
 * that removes it. Once removed, the panel goes and the focus moves to
 * the screen; while it works, the button keeps the focus (aria-disabled).
 */
function InterruptedUpdate({
  message,
  busy,
  onRemove,
  children,
}: {
  message: string;
  busy: boolean;
  onRemove: () => void;
  /** The cleanup's error, if any. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>(false);
  return (
    <div ref={ref} class="warning migration" role="region" aria-label={t("migration.interruptedRegion")} tabIndex={-1}>
      <p>{message}</p>
      <button
        onClick={() => {
          if (!busy) onRemove();
        }}
        aria-disabled={busy}
      >
        {busy ? t("migration.removing") : t("migration.removeIt")}
      </button>
      {children}
    </div>
  );
}
