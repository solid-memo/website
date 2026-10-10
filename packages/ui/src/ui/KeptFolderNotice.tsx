import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/**
 * Says that deleting an instance's data kept its folder, and why: it
 * holds files another app put there, or the releases published from the
 * instance (`releases`), which others may read; and links the folder
 * (docs/data-model.md "Deleting an instance"). Nothing when no folder
 * was kept.
 */
export function KeptFolderNotice({ url, releases = false }: { url: string | null; releases?: boolean }) {
  const { t, tx } = useI18n();
  if (url === null) return null;
  return (
    <p class="warning" role="status">
      {tx(releases ? "keptFolder.releases" : "keptFolder.text", { link: <ExternalLink url={url}>{t("keptFolder.folder")}</ExternalLink> })}
    </p>
  );
}
