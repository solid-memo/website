import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Backup, BackupRestore } from "@solid-memo/domain/backup";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { KeptFolderNotice } from "./KeptFolderNotice";
import { RestoreResult } from "./InstanceUpdate";
import { useI18n } from "./i18n";

/**
 * The instance's previous versions (docs/migrations.md "The backup"):
 * each backup an update made of the documents it changed in place, which
 * can be restored — every document still as the update left it is put
 * back, any changed since kept — or deleted; and the copy of the whole
 * instance an update by an earlier version of the app left, which is
 * restored by switching back to it. Each is confirmed first. Renders
 * nothing when there is no backup (any more), unless deleting one kept
 * its folder, which holds another app's files: then a notice says so.
 * What restoring or deleting a backup did is said above the list, as the
 * backup may leave it.
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
   * Switched back to an earlier version's copy: the instance lives at the
   * copy's address again; the updated instance's folder, when it was kept
   * for another app's files.
   */
  onRestored: (instance: Instance, keptFolder: string | null) => void;
}) {
  const { t } = useI18n();
  const backupsQuery = useQuery({
    queryKey: ["backups", instance.url],
    queryFn: () => useCases.listBackups(instance),
  });
  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const backups = backupsQuery.data ?? [];
  const [restored, setRestored] = useState<BackupRestore | null>(null);
  const [keptFolder, setKeptFolder] = useState<string | null>(null);
  return (
    <>
      {restored !== null && <RestoreResult restored={restored} />}
      <KeptFolderNotice url={keptFolder} />
      {backups.length > 0 && (
        <section class="backup" aria-label={t("backup.heading")}>
          <h3>{t("backup.heading")}</h3>
          <ul class="backups">
            {backups.map((backup) => (
              <InPlaceBackup
                key={backup.url}
                useCases={useCases}
                instance={instance}
                backup={backup}
                decks={decksQuery.data ?? []}
                onRestored={(result) => {
                  setKeptFolder(null);
                  setRestored(result);
                }}
                onDeleted={(folder) => {
                  setRestored(null);
                  setKeptFolder(folder);
                }}
              />
            ))}
          </ul>
        </section>
      )}
      <LegacyBackup useCases={useCases} session={session} instance={instance} onRestored={onRestored} />
    </>
  );
}

/** One backup an update made in place: what it was made for and when, and its buttons. */
function InPlaceBackup({
  useCases,
  instance,
  backup,
  decks,
  onRestored,
  onDeleted,
}: {
  useCases: UseCases;
  instance: Instance;
  backup: Backup;
  decks: readonly Deck[];
  onRestored: (restored: BackupRestore) => void;
  /** Deleted: the backup's folder, when it was kept for another app's files. */
  onDeleted: (keptFolder: string | null) => void;
}) {
  const { t, tx, formatDate, readerText, errorText } = useI18n();
  const queryClient = useQueryClient();
  const restoreMutation = useMutation({
    mutationFn: () => useCases.restoreBackup(instance, backup),
    // Documents were put back: everything shown of them is read again.
    onSuccess: (restored) => {
      onRestored(restored);
      return queryClient.invalidateQueries();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => useCases.deleteBackup(backup),
    onSuccess: ({ keptFolder }) => {
      onDeleted(keptFolder);
      return queryClient.invalidateQueries({ queryKey: ["backups", instance.url] });
    },
  });
  const busy = restoreMutation.isPending || deleteMutation.isPending;
  const date = formatDate(backup.createdAt);
  const folder = <ExternalLink url={backup.url}>{t("backup.folder")}</ExternalLink>;
  const deck = decks.find((candidate) => candidate.url === backup.of);
  const of =
    backup.of === instance.url
      ? tx("backup.ofUpdate", { date, count: backup.entries.length, link: folder })
      : deck === undefined
        ? tx("backup.ofSomeDeck", { date, link: folder })
        : tx("backup.ofDeck", { date, deck: readerText(deck.title), link: folder });
  return (
    <li>
      <p>{of}</p>
      <div class="edit-actions">
        <button
          onClick={() => {
            if (window.confirm(t("backup.restoreConfirm", { name: instance.name }))) restoreMutation.mutate();
          }}
          disabled={busy}
        >
          {restoreMutation.isPending ? t("backup.restoring") : t("backup.restore")}
        </button>
        <button
          class="danger"
          onClick={() => {
            if (window.confirm(t("backup.deleteConfirm"))) deleteMutation.mutate();
          }}
          disabled={busy}
        >
          {deleteMutation.isPending ? t("backup.deleting") : t("backup.delete")}
        </button>
      </div>
      <ErrorMessage error={errorText(restoreMutation.error ?? deleteMutation.error)} />
    </li>
  );
}

/**
 * The copy of the whole instance an update by an earlier version of the
 * app left as its backup, at another address: restore it — switch back to
 * it and delete the updated instance's data — or delete it.
 */
function LegacyBackup({
  useCases,
  session,
  instance,
  onRestored,
}: {
  useCases: UseCases;
  session: Session;
  instance: Instance;
  onRestored: (instance: Instance, keptFolder: string | null) => void;
}) {
  const { t, tx, formatDate, errorText } = useI18n();
  const queryClient = useQueryClient();
  const backupQuery = useQuery({
    queryKey: ["legacyBackup", instance.url],
    queryFn: () => useCases.readLegacyBackup(instance),
  });

  const restoreMutation = useMutation({
    mutationFn: () => useCases.restoreLegacyBackup(session, instance),
    onSuccess: async (restored) => {
      await queryClient.invalidateQueries({ queryKey: ["instances"] });
      onRestored(restored.instance, restored.keptFolder);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => useCases.deleteLegacyBackup(instance),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legacyBackup", instance.url] }),
  });

  const backup = backupQuery.data;
  if (backup === undefined || backup === null) {
    return <KeptFolderNotice url={deleteMutation.data?.keptFolder ?? null} />;
  }
  const busy = restoreMutation.isPending || deleteMutation.isPending;
  const folder = <ExternalLink url={backup.url}>{t("backup.legacy.folder")}</ExternalLink>;
  return (
    <section class="backup" aria-label={t("backup.legacy.heading")}>
      <h3>{t("backup.legacy.heading")}</h3>
      <p>
        {backup.replacedAt === undefined
          ? tx("backup.legacy.kept", { link: folder })
          : tx("backup.legacy.keptOn", { date: formatDate(backup.replacedAt), link: folder })}
      </p>
      <div class="edit-actions">
        <button
          onClick={() => {
            if (window.confirm(t("backup.legacy.restoreConfirm", { name: instance.name }))) restoreMutation.mutate();
          }}
          disabled={busy}
        >
          {restoreMutation.isPending ? t("backup.restoring") : t("backup.legacy.restore")}
        </button>
        <button
          class="danger"
          onClick={() => {
            if (window.confirm(t("backup.legacy.deleteConfirm"))) deleteMutation.mutate();
          }}
          disabled={busy}
        >
          {deleteMutation.isPending ? t("backup.deleting") : t("backup.legacy.delete")}
        </button>
      </div>
      <ErrorMessage error={errorText(restoreMutation.error ?? deleteMutation.error)} />
    </section>
  );
}
