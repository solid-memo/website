import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { useI18n } from "./i18n";

/**
 * "Findable by other apps" in Preferences (docs/data-model.md "Discovery
 * chain"): the type index registrations of the instance's data, one per
 * class and index, each said to be there or missing (an index that
 * cannot be read said to be so), and a button that
 * adds the missing ones. Nothing is added unless the user asks: the user,
 * or another app, may have removed a registration on purpose.
 */
export function FindableContainer({
  useCases,
  session,
  instance,
}: {
  useCases: UseCases;
  session: Session;
  instance: Instance;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ["dataClassRegistrations", instance.url];
  const registrationsQuery = useQuery({
    queryKey,
    queryFn: () => useCases.dataClassRegistrations(session, instance),
  });
  const registerMutation = useMutation({
    mutationFn: () => useCases.registerDataClasses(session, instance),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const data = registrationsQuery.data;
  const missing = data?.registrations.some((registration) => !registration.registered) ?? false;
  return (
    <section class="findable" aria-labelledby="findable-heading">
      <h3 id="findable-heading">{t("findable.heading")}</h3>
      <p class="hint">{t("findable.intro")}</p>
      {data === undefined ? (
        registrationsQuery.error === null && <Loading label={t("findable.loading")} />
      ) : (
        <>
          <ul class="registrations">
            {data.registrations.map((registration) => (
              <li key={`${registration.dataClass}-${registration.index}`}>
                {t(`findable.class.${registration.dataClass}`)}:{" "}
                {t(registration.registered ? "findable.registered" : "findable.missing", {
                  index: t(`findable.index.${registration.index}`),
                })}
              </li>
            ))}
          </ul>
          {data.privateIndexMissing && <p class="hint">{t("findable.noPrivateIndex")}</p>}
          {data.unreadableIndexes.map((index) => (
            <p key={index} class="hint">
              {t("findable.unreadable", { index: t(`findable.index.${index}`) })}
            </p>
          ))}
          {missing ? (
            <button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending}>
              {registerMutation.isPending ? t("findable.adding") : t("findable.add")}
            </button>
          ) : (
            <p>{t("findable.complete")}</p>
          )}
        </>
      )}
      <ErrorMessage error={errorText(registrationsQuery.error ?? registerMutation.error)} />
    </section>
  );
}
