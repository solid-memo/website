// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { routeToHash } from "@solid-memo/ui/router";
import { InstanceAboutScreen } from "./InstanceAboutScreen";
import { changes, useWrite } from "@solid-memo/ui/writeEffects";
import { queryKeys } from "./queryKeys";
import { queries } from "./queries";

/**
 * The instance screen's data: the instance's catalog (UseCases.readCatalog).
 * Renaming the instance (renameInstance) reads the user's instances
 * afresh, so every screen names it anew; describing the catalog
 * (describeCatalog) reads the catalog afresh. Both write the
 * catalog, so neither can be made until the instance's data check is
 * done, nor while the catalog or a group is set aside (useDataCheck).
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
  /** The instance's health, which names what does not conform. */
  healthHref: string;
}) {
  const { t, errorText } = useI18n();
  const check = useDataCheck(useCases, instance.url);
  const catalogQuery = useQuery(queries.catalog(useCases, instance.url));
  const save = useWrite({
    mutationFn: (write: () => Promise<unknown>) => write(),
    changes: () => [changes.reads(queryKeys.allInstances(), queryKeys.catalog(instance.url))],
  });

  if (catalogQuery.error) return <ErrorMessage error={errorText(catalogQuery.error)} />;
  if (catalogQuery.data === undefined) return <Loading label={t("studio.instance.loading")} />;

  return (
    <InstanceAboutScreen
      instance={instance}
      catalog={catalogQuery.data}
      preferencesHref={routeToHash({ screen: "preferences", instanceUrl: instance.url })}
      readOnly={check.hold({ kind: "catalogue" })}
      healthHref={healthHref}
      busy={save.isPending}
      saved={save.isSuccess}
      error={errorText(save.error)}
      onRename={(name) => save.mutate(() => useCases.renameInstance(session, instance, name))}
      onDescribe={(about) => save.mutate(() => useCases.describeCatalog(instance.url, about))}
    />
  );
}
