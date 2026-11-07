// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { isGuestUrl } from "@solid-memo/domain/guest";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import { isInStorages } from "@solid-memo/domain/instanceLayout";
import type { Session } from "@solid-memo/domain/session";
import { useI18n } from "./i18n";
import { InstancePicker } from "./InstancePicker";
import { queryKeys } from "./queryKeys";

/**
 * The instance picker over the use cases: where the user may register an
 * instance they attach, attaching one by its URL, removing one from their
 * list, and deleting one in their own storages; until those are known,
 * or if they cannot be read, none is offered to delete. A guest's own
 * instance is on no other server, and a guest has no way to learn its
 * address to attach it again, so it is only offered to delete. Each app
 * that lets the user pick an instance shows it (Solid Memo, the Studio);
 * `onOpen` opens the one picked or attached.
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
    queryKey: queryKeys.registrationOptions(webId),
    queryFn: () => useCases.getRegistrationOptions(session),
  });

  const storagesQuery = useQuery({
    queryKey: queryKeys.storages(webId),
    queryFn: () => useCases.listStorages(session),
  });

  const attachInstanceMutation = useMutation({
    mutationFn: (args: { url: string; target: RegistrationTarget }) =>
      useCases.attachInstanceByUrl(session, args.url, args.target),
    onSuccess: async (instance) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.instances(webId) });
      onOpen(instance);
    },
  });

  /**
   * The instance is off the list: every key of what was read of it goes,
   * and with them the list the login's choice holds, which would seed the
   * instance back.
   */
  async function forget(instance: Instance) {
    queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey.includes(instance.url) });
    queryClient.removeQueries({ queryKey: queryKeys.connectedScreen(webId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.instances(webId) });
  }

  const deleteInstanceMutation = useMutation({
    mutationFn: (instance: Instance) => useCases.deleteInstance(session, instance),
    onSuccess: (_, instance) => forget(instance),
  });

  const detachInstanceMutation = useMutation({
    mutationFn: (instance: Instance) => useCases.detachInstance(session, instance),
    // One index may have let it go although the other failed: the list says which.
    onSettled: (_, _error, instance) => forget(instance),
  });

  /** A new removal starts clean: what failed before it, or a folder a delete kept, says nothing of it. */
  function clearOutcomes() {
    attachInstanceMutation.reset();
    deleteInstanceMutation.reset();
    detachInstanceMutation.reset();
  }

  return (
    <InstancePicker
      instances={instances}
      purpose={purpose}
      options={registrationOptionsQuery.data ?? null}
      removable={(instance) => !(session.guest === true && isGuestUrl(instance.url))}
      deletable={(instance) => isInStorages(instance.url, storagesQuery.data ?? [])}
      outsidePod={(instance) =>
        storagesQuery.data !== undefined && !isInStorages(instance.url, storagesQuery.data)
      }
      busy={
        attachInstanceMutation.isPending ||
        deleteInstanceMutation.isPending ||
        detachInstanceMutation.isPending
      }
      error={
        errorText(attachInstanceMutation.error) ??
        errorText(deleteInstanceMutation.error) ??
        errorText(detachInstanceMutation.error)
      }
      onSelect={onOpen}
      newInstanceHref={newInstanceHref}
      onAttach={(url, target) => attachInstanceMutation.mutate({ url, target })}
      onDelete={(instance) => {
        clearOutcomes();
        deleteInstanceMutation.mutate(instance);
      }}
      onDetach={(instance) => {
        clearOutcomes();
        detachInstanceMutation.mutate(instance);
      }}
      keptFolder={deleteInstanceMutation.data?.keptFolder ?? null}
      keptReleases={deleteInstanceMutation.data?.keptReleases ?? false}
      keptDocuments={deleteInstanceMutation.data?.keptDocuments.length ?? 0}
    />
  );
}
