import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { routeToHash } from "@solid-memo/ui/router";
import { InstanceAboutScreen } from "./InstanceAboutScreen";

/**
 * The instance screen's data: the instance's catalogue (UseCases.readCatalog).
 * Renaming the instance (renameInstance) reads the user's instances
 * afresh, so every screen names it anew; describing the catalogue
 * (describeCatalog) reads the catalogue afresh. Both write the
 * catalogue, so neither can be made until the instance's data check is
 * done, nor while the catalogue or a group is set aside (useDataCheck).
 */
export function InstanceAboutContainer({
  useCases,
  session,
  instance,
  healthHref,
}: {
  useCases: UseCases;
  session: Session;
  instance: Instance;
  /** The instance's health, where data set aside is repaired. */
  healthHref: string;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const check = useDataCheck(useCases, instance.url);
  const catalogQuery = useQuery({
    queryKey: ["catalog", instance.url],
    queryFn: () => useCases.readCatalog(instance.url),
  });
  const save = useMutation({
    mutationFn: (write: () => Promise<unknown>) => write(),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["instances"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog", instance.url] }),
      ]),
  });

  if (catalogQuery.error) return <ErrorMessage error={errorText(catalogQuery.error)} />;
  if (catalogQuery.data === undefined) return <Loading label={t("studio.instance.loading")} />;

  return (
    <InstanceAboutScreen
      instance={instance}
      catalog={catalogQuery.data}
      preferencesHref={routeToHash({ screen: "preferences", instanceUrl: instance.url })}
      readOnly={check.readOnly() ?? (check.arrangementSetAside ? "setAside" : null)}
      healthHref={healthHref}
      busy={save.isPending}
      saved={save.isSuccess}
      error={errorText(save.error)}
      onRename={(name) => save.mutate(() => useCases.renameInstance(session, instance, name))}
      onDescribe={(about) => save.mutate(() => useCases.describeCatalog(instance.url, about))}
    />
  );
}
