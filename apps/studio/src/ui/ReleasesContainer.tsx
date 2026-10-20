// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { draftsKey } from "./DraftsContainer";
import { publishedKey, useMakePublic, useStartNextVersion } from "./releaseActions";
import { ReleasesScreen } from "./ReleasesScreen";

/**
 * The releases screen's data: the releases the instance published, each
 * with whether it is public (listPublishedReleases), and the drafts each
 * was published from (the drafts screen's query: a draft says what it
 * was released as), each a link (`draftHref`); making one public again;
 * and starting the next version of one, which then opens (`onStarted`).
 */
export function ReleasesContainer({
  useCases,
  instance,
  webId,
  healthHref,
  draftsHref,
  draftHref,
  onStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  /** Who makes a release public again (useMakePublic). */
  webId: string;
  healthHref: string;
  draftsHref: string;
  /** A draft's overview. */
  draftHref: (draft: ReleaseDraftSummary) => string;
  onStarted: (created: CreatedDraft) => void;
}) {
  const { t, errorText } = useI18n();
  const check = useDataCheck(useCases, instance.url);
  const releasesQuery = useQuery({
    queryKey: publishedKey(instance.url),
    queryFn: () => useCases.listPublishedReleases(instance.url),
  });
  // Drafts that cannot be read say nothing of their release: they are no source of one.
  const draftsQuery = useQuery({
    queryKey: draftsKey(instance.url),
    queryFn: () => useCases.listReleaseDrafts(instance.url),
  });
  const publicMutation = useMakePublic(useCases, instance.url, webId);
  const nextMutation = useStartNextVersion(useCases, instance.url, onStarted);

  if (releasesQuery.error) return <ErrorMessage error={errorText(releasesQuery.error)} />;
  if (releasesQuery.data === undefined) return <Loading label={t("studio.releases.loading")} />;
  return (
    <ReleasesScreen
      instance={instance}
      releases={releasesQuery.data}
      hold={check.readOnly() ?? (check.arrangementSetAside ? "setAside" : null)}
      healthHref={healthHref}
      draftsHref={draftsHref}
      draftOf={(url) => {
        const draft = draftsQuery.data?.find((each) => each.releasedAs === url);
        return draft === undefined ? null : { draft, href: draftHref(draft) };
      }}
      makingPublic={publicMutation.isPending ? publicMutation.variables! : null}
      publicError={errorText(publicMutation.error)}
      onMakePublic={(url) => publicMutation.mutate(url)}
      starting={nextMutation.isPending ? nextMutation.variables! : null}
      startError={errorText(nextMutation.error)}
      onStartNext={(url) => nextMutation.mutate(url)}
    />
  );
}
