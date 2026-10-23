// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { WebIdDocumentView } from "./WebIdDocumentView";
import { queryKeys } from "./queryKeys";

/**
 * Developer tool: the raw WebID document of the logged-in user. Only
 * mounted while developer mode is on, so the profile is not even fetched
 * otherwise.
 */
export function WebIdDocumentContainer({
  useCases,
  session,
}: {
  useCases: UseCases;
  session: Session;
}) {
  const { t, errorText } = useI18n();
  const documentQuery = useQuery({
    queryKey: queryKeys.webIdDocument(session.webId),
    queryFn: () => useCases.viewWebIdDocument(session),
  });

  return (
    <details>
      <summary>{t("webIdDocument.summary")}</summary>
      {documentQuery.isPending && <Loading label={t("webIdDocument.loading")} />}
      <ErrorMessage error={errorText(documentQuery.error)} />
      {documentQuery.data && <WebIdDocumentView document={documentQuery.data} />}
    </details>
  );
}
