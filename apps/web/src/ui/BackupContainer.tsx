import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { KeptFolderNotice } from "./KeptFolderNotice";
import { useI18n } from "./i18n";

/**
 * The previous version of an instance, kept by its last update as a
 * backup (docs/migrations.md): restore it — switch back to it and delete
 * the updated instance's data — or delete it. Each is confirmed first.
 * Renders nothing when there is no backup (any more), unless deleting it
 * kept its folder, which holds another app's files: then a notice says so.
 */
export function BackupContainer({
  useCases,
  session,
  instance,
  onRestored,
}: {
  useCases: UseCases;
  session: Session;
  instance: Instance;
  /**
   * Switched back: the instance lives at the backup's address again; the
   * updated instance's folder, when it was kept for another app's files.
   */
  onRestored: (instance: Instance, keptFolder: string | null) => void;
}) {
  const { t, tx, formatDate, errorText } = useI18n();
  const queryClient = useQueryClient();
  const backupQuery = useQuery({
    queryKey: ["backup", instance.url],
    queryFn: () => useCases.readBackup(instance),
  });

  const restoreMutation = useMutation({
    mutationFn: () => useCases.restoreBackup(session, instance),
    onSuccess: async (restored) => {
      await queryClient.invalidateQueries({ queryKey: ["instances"] });
      onRestored(restored.instance, restored.keptFolder);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => useCases.deleteBackup(instance),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backup", instance.url] }),
  });

  const backup = backupQuery.data;
  if (backup === undefined || backup === null) {
    return <KeptFolderNotice url={deleteMutation.data?.keptFolder ?? null} />;
  }
  const busy = restoreMutation.isPending || deleteMutation.isPending;
  const folder = <ExternalLink url={backup.url}>{t("backup.folder")}</ExternalLink>;
  return (
    <section class="backup" aria-label={t("backup.heading")}>
      <h3>{t("backup.heading")}</h3>
      <p>
        {backup.replacedAt === undefined
          ? tx("backup.kept", { link: folder })
          : tx("backup.keptOn", { date: formatDate(backup.replacedAt), link: folder })}
      </p>
      <div class="edit-actions">
        <button
          onClick={() => {
            if (
              window.confirm(
                t("backup.restoreConfirm", { name: instance.name }),
              )
            ) {
              restoreMutation.mutate();
            }
          }}
          disabled={busy}
        >
          {restoreMutation.isPending ? t("backup.restoring") : t("backup.restore")}
        </button>
        <button
          class="danger"
          onClick={() => {
            if (window.confirm(t("backup.deleteConfirm"))) {
              deleteMutation.mutate();
            }
          }}
          disabled={busy}
        >
          {deleteMutation.isPending ? t("backup.deleting") : t("backup.delete")}
        </button>
      </div>
      <ErrorMessage error={errorText(restoreMutation.error ?? deleteMutation.error)} />
    </section>
  );
}
