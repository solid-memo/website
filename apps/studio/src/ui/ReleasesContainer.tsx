import { useQuery } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { publishedKey, useMakePublic, useStartNextVersion } from "./releaseActions";
import { ReleasesScreen } from "./ReleasesScreen";

/**
 * The releases screen's data: the releases the instance published, each
 * with whether it is public (listPublishedReleases); making one public
 * again; and starting the next version of one, which then opens
 * (`onStarted`).
 */
export function ReleasesContainer({
  useCases,
  instance,
  healthHref,
  draftsHref,
  onStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  healthHref: string;
  draftsHref: string;
  onStarted: (created: CreatedDraft) => void;
}) {
  const { t, errorText } = useI18n();
  const check = useDataCheck(useCases, instance.url);
  const releasesQuery = useQuery({
    queryKey: publishedKey(instance.url),
    queryFn: () => useCases.listPublishedReleases(instance.url),
  });
  const publicMutation = useMakePublic(useCases, instance.url);
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
      makingPublic={publicMutation.isPending ? publicMutation.variables! : null}
      publicError={errorText(publicMutation.error)}
      onMakePublic={(url) => publicMutation.mutate(url)}
      starting={nextMutation.isPending ? nextMutation.variables! : null}
      startError={errorText(nextMutation.error)}
      onStartNext={(url) => nextMutation.mutate(url)}
    />
  );
}
