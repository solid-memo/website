// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/**
 * Says that deleting an instance's data kept its folder, and why: it
 * holds files another app put there, or the releases published from the
 * instance (`releases`), which others may read; and links the folder
 * (docs/data-model.md "Deleting an instance"). Says too how many
 * documents (`documents`) were kept because they also hold another
 * app's data, of which only Solid Memo's own was removed. Nothing when
 * neither a folder nor a document was kept.
 */
export function KeptFolderNotice({
  url,
  releases = false,
  documents = 0,
}: {
  url: string | null;
  releases?: boolean;
  documents?: number;
}) {
  const { t, tx } = useI18n();
  if (url === null && documents === 0) return null;
  return (
    <p class="warning" role="status">
      {url !== null &&
        tx(releases ? "keptFolder.releases" : "keptFolder.text", {
          link: <ExternalLink url={url}>{t("keptFolder.folder")}</ExternalLink>,
        })}
      {url !== null && documents > 0 && " "}
      {documents > 0 && t("keptFolder.documents", { count: documents })}
    </p>
  );
}
