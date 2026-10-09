import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Instance } from "@solid-memo/domain/instance";
import type { UpdateOutcome, UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { isPlanEmpty } from "@solid-memo/domain/migration";
import type { Session } from "@solid-memo/domain/session";
import type { Backup, BackupRestore } from "@solid-memo/domain/backup";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { InstanceUpdateConfirm, InstanceUpdateFailure, InstanceUpdateProgress, RestoreResult } from "./InstanceUpdate";
import { MigrationNotice } from "./MigrationNotice";
import { usePanelFocus } from "./panelFocus";

/**
 * Checks an instance for documents in an older format and, when there
 * are any, offers the update (docs/migrations.md): a confirmation of how
 * it keeps the data safe, then its progress, then either nothing (every
 * document is up to date, at its address) or what stopped it and what
 * became of the documents, with "Try restoring again" when putting them
 * back failed. The check reads every document once per session; a failed
 * check shows nothing, since the app works on the old format and the deck
 * list reports pod trouble on its own. An update this browser noted that
 * did not finish (a closed tab, or one that could not put back what it
 * changed) is offered to put back; the partial copy an earlier version's
 * update left, to remove. Each step takes the focus from the one it
 * replaces; Cancel gives it back to the notice.
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
  const { t, tx, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  /** The user came back to the notice, from the confirmation or a failure: it takes the focus. */
  const [returned, setReturned] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [failure, setFailure] = useState<Extract<UpdateOutcome, { ok: false }> | null>(null);
  /** What putting back an update that did not finish did, said until the screen goes. */
  const [putBack, setPutBack] = useState<BackupRestore | null>(null);

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
      setProgress(null);
      if (!outcome.ok) setFailure(outcome);
      // The documents are where they were, in newer formats (or not quite as they were): everything shown of them is read again.
      if (outcome.ok || outcome.undo !== null) await queryClient.invalidateQueries();
    },
    onError: () => setProgress(null),
  });

  /** Putting back what an update changed: the failed update's, by its folder, or an unfinished one's backup. */
  const restoreMutation = useMutation({
    mutationFn: async (which: string | Backup) => {
      const backup =
        typeof which === "string" ? (await useCases.listBackups(instance)).find((candidate) => candidate.url === which) : which;
      if (backup === undefined) throw new AppError("noBackup", { instance: instance.name });
      return useCases.restoreBackup(instance, backup);
    },
    onSuccess: (restored, which) => {
      if (typeof which !== "string") setPutBack(restored);
      return queryClient.invalidateQueries();
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => useCases.removeInterruptedUpdate(instance),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["interruptedUpdate", instance.url] });
    },
  });

  const interrupted = interruptedQuery.data ?? null;
  const plan = planQuery.data;

  if (progress !== null) return <InstanceUpdateProgress progress={progress} />;
  if (failure !== null) {
    return (
      <InstanceUpdateFailure
        outcome={failure}
        busy={restoreMutation.isPending}
        restored={restoreMutation.data}
        onRestore={() => restoreMutation.mutate(failure.backupUrl!)}
        onDismiss={() => {
          setFailure(null);
          restoreMutation.reset();
          setReturned(true);
        }}
      >
        <ErrorMessage error={errorText(restoreMutation.error)} />
      </InstanceUpdateFailure>
    );
  }
  if (interrupted?.kind === "copy") {
    return (
      <InterruptedUpdate
        message={t("migration.interrupted", { name: instance.name, url: interrupted.folder })}
        action={t("migration.removeIt")}
        working={t("migration.removing")}
        busy={cleanupMutation.isPending}
        onRemove={() => cleanupMutation.mutate()}
      >
        <ErrorMessage error={errorText(cleanupMutation.error)} />
      </InterruptedUpdate>
    );
  }
  if (interrupted?.kind === "run") {
    const folder = <ExternalLink url={interrupted.backup.url}>{t("instanceUpdate.backupFolder")}</ExternalLink>;
    return (
      <InterruptedUpdate
        message={tx("migration.interruptedRun", { name: instance.name, link: folder })}
        action={t("instanceUpdate.tryRestoring")}
        working={t("instanceUpdate.restoring")}
        busy={restoreMutation.isPending}
        onRemove={() => restoreMutation.mutate(interrupted.backup)}
      >
        <ErrorMessage error={errorText(restoreMutation.error)} />
      </InterruptedUpdate>
    );
  }
  const result = putBack === null ? null : <RestoreResult restored={putBack} />;
  if (plan === undefined || isPlanEmpty(plan)) return result;
  if (confirming) {
    return (
      <InstanceUpdateConfirm
        instanceName={instance.name}
        onStart={() => {
          setConfirming(false);
          setProgress({ step: "stage", done: 0, total: 0 });
          updateMutation.mutate();
        }}
        onCancel={() => {
          setConfirming(false);
          setReturned(true);
        }}
      />
    );
  }
  return (
    <>
      {result}
      <MigrationNotice
        plan={plan}
        busy={updateMutation.isPending}
        error={errorText(updateMutation.error)}
        focus={returned}
        onMigrate={() => setConfirming(true)}
      />
    </>
  );
}

/**
 * An update that did not finish, and the button that puts back what it
 * changed, or removes what an earlier version's left. Once done, the
 * panel goes and the focus moves to the screen; while it works, the
 * button keeps the focus (aria-disabled).
 */
function InterruptedUpdate({
  message,
  action,
  working,
  busy,
  onRemove,
  children,
}: {
  message: ComponentChildren;
  /** What the button does, and says while it does it. */
  action: string;
  working: string;
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
        {busy ? working : action}
      </button>
      {children}
    </div>
  );
}
