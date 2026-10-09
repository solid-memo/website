import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { useI18n } from "./i18n";
import { InstancePicker } from "./InstancePicker";

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
  newInstanceHref,
  onOpen,
}: {
  useCases: UseCases;
  session: Session;
  instances: Instance[];
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
      queryClient.removeQueries({ queryKey: ["decks", instance.url] });
      queryClient.removeQueries({ queryKey: ["preferences", instance.url] });
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
    },
  });

  return (
    <InstancePicker
      instances={instances}
      options={registrationOptionsQuery.data ?? null}
      busy={attachInstanceMutation.isPending || deleteInstanceMutation.isPending}
      error={errorText(attachInstanceMutation.error) ?? errorText(deleteInstanceMutation.error)}
      onSelect={onOpen}
      newInstanceHref={newInstanceHref}
      onAttach={(url, target) => attachInstanceMutation.mutate({ url, target })}
      onDelete={(instance) => deleteInstanceMutation.mutate(instance)}
      keptFolder={deleteInstanceMutation.data?.keptFolder ?? null}
    />
  );
}
