import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/**
 * Says that deleting an instance's data (the instance, its backup or the
 * copy a restore replaced) kept its folder, which holds files another
 * app put there, and links the folder (docs/data-model.md "Deleting an
 * instance"). Nothing when no folder was kept.
 */
export function KeptFolderNotice({ url }: { url: string | null }) {
  const { t, tx } = useI18n();
  if (url === null) return null;
  return (
    <p class="warning" role="status">
      {tx("keptFolder.text", { link: <ExternalLink url={url}>{t("keptFolder.folder")}</ExternalLink> })}
    </p>
  );
}
