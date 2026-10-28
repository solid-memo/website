// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { mistakeReportUrl, type ReportPlace } from "@solid-memo/domain/mistakeReport";
import { webLink } from "./DataLink";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { WebLink } from "./Markdown";

/**
 * The web page of the repository the site runs (SiteSource.repoUrl),
 * whose issue tracker is where a mistake in a library release is
 * reported; null where none is known, and no library release is
 * reported then.
 */
export const RepoUrl = createContext<string | null>(null);

/**
 * "Report a mistake": a link that reports a mistake in the release at
 * `releaseUrl`, in its card `cardId` when given, where `place` says
 * (domain/mistakeReport.ts), opened through ExternalLink. A release
 * from a link names its contact page itself, so that page is followed
 * as the release's other links are (DataLink): never with a `user@`
 * before the host, which mistakeReportUrl already refuses, and with its
 * host beside the link. Nothing when there is nowhere to report it.
 */
export function ReportMistake({
  place,
  releaseUrl,
  cardId,
}: {
  place: ReportPlace;
  releaseUrl: string;
  cardId?: string;
}) {
  const { t } = useI18n();
  const url = mistakeReportUrl(place, useContext(RepoUrl), releaseUrl, cardId);
  if (url === null) return null;
  const label = t("common.reportMistake");
  if (place.library)
    return (
      <p class="hint report-mistake">
        <ExternalLink url={url}>{label}</ExternalLink>
      </p>
    );
  const link = webLink(url)!;
  return (
    <p class="hint report-mistake">
      <WebLink link={link} written={url} shown={label}>
        {label}
      </WebLink>
    </p>
  );
}
