// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { useI18n } from "./i18n";
import { InstancePicker } from "./InstancePicker";
import { queryKeys } from "./queryKeys";

/**
 * The instance picker over the use cases: where the user may register an
 * instance they attach, attaching one by its URL and deleting one. Each
 * app that lets the user pick an instance shows it (Solid Memo, the
 * Studio); `onOpen` opens the one picked or attached.
 */
export function InstancePickerContainer({
  useCases,
  session,
  instances,
  purpose,
  newInstanceHref,
  onOpen,
}: {
  useCases: UseCases;
  session: Session;
  instances: Instance[];
  /** What the instance is picked for, when more than to open it. */
  purpose?: ComponentChildren;
  /** URL of the storage picker, where a new instance starts. */
  newInstanceHref: string;
  onOpen: (instance: Instance) => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const webId = session.webId;

  const registrationOptionsQuery = useQuery({
    queryKey: ["registrationOptions", webId],
    queryFn: () => useCases.getRegistrationOptions(session),
  });

  const attachInstanceMutation = useMutation({
    mutationFn: (args: { url: string; target: RegistrationTarget }) =>
      useCases.attachInstanceByUrl(session, args.url, args.target),
    onSuccess: async (instance) => {
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
      onOpen(instance);
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instance: Instance) => useCases.deleteInstance(session, instance),
    onSuccess: async (_, instance) => {
      queryClient.removeQueries({ queryKey: queryKeys.decks(instance.url) });
      queryClient.removeQueries({ queryKey: queryKeys.preferences(instance.url) });
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
    },
  });

  return (
    <InstancePicker
      instances={instances}
      purpose={purpose}
      options={registrationOptionsQuery.data ?? null}
      busy={attachInstanceMutation.isPending || deleteInstanceMutation.isPending}
      error={errorText(attachInstanceMutation.error) ?? errorText(deleteInstanceMutation.error)}
      onSelect={onOpen}
      newInstanceHref={newInstanceHref}
      onAttach={(url, target) => attachInstanceMutation.mutate({ url, target })}
      onDelete={(instance) => deleteInstanceMutation.mutate(instance)}
      keptFolder={deleteInstanceMutation.data?.keptFolder ?? null}
      keptReleases={deleteInstanceMutation.data?.keptReleases ?? false}
      keptDocuments={deleteInstanceMutation.data?.keptDocuments.length ?? 0}
    />
  );
}
