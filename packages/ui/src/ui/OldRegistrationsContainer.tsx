// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { queryKeys } from "./queryKeys";

/**
 * "Old registrations" in Preferences (docs/data-model.md
 * "Registrations"): the type index registrations earlier versions wrote
 * for the instance's data, by class and index, any index that could not
 * be read said to be so, and a button that removes them. Nothing is
 * removed unless the user asks. With none to show, and while reading,
 * it shows nothing at all: most users never had any. Once removed, it
 * says so, and that note takes the focus, as the button that had it is
 * gone.
 */
export function OldRegistrationsContainer({
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
  const queryKey = queryKeys.oldRegistrations(session.webId, instance.url);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const { data } = useQuery({
    queryKey,
    queryFn: () => useCases.oldRegistrations(session, instance),
  });
  const removeMutation = useMutation({
    mutationFn: () => useCases.removeOldRegistrations(session, instance),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const removed = removeMutation.isSuccess;
  useEffect(() => {
    if (removed) statusRef.current?.focus();
  }, [removed]);
  const anything =
    data !== undefined && (data.registrations.length > 0 || data.unreadableIndexes.length > 0);
  // Nothing read, or nothing to say: no section, so a user who never had any sees nothing.
  if (!anything && !removed) return null;
  return (
    <section class="old-registrations" aria-labelledby="old-registrations-heading">
      <h3 id="old-registrations-heading">{t("oldRegistrations.heading")}</h3>
      {anything && <p class="hint">{t("oldRegistrations.intro")}</p>}
      {data !== undefined && data.registrations.length > 0 && (
        <ul>
          {data.registrations.map((registration) => (
            <li key={`${registration.dataClass}-${registration.index}`}>
              {t(`oldRegistrations.class.${registration.dataClass}`)}:{" "}
              {t("oldRegistrations.in", {
                index: t(`oldRegistrations.index.${registration.index}`),
              })}
            </li>
          ))}
        </ul>
      )}
      {data?.unreadableIndexes.map((index) => (
        <p key={index} class="hint">
          {t("oldRegistrations.unreadable", { index: t(`oldRegistrations.index.${index}`) })}
        </p>
      ))}
      {data !== undefined && data.registrations.length > 0 && (
        <button onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
          {removeMutation.isPending ? t("oldRegistrations.removing") : t("oldRegistrations.remove")}
        </button>
      )}
      <p ref={statusRef} class="hint" role="status" tabIndex={-1}>
        {removed ? t("oldRegistrations.removed") : ""}
      </p>
      <ErrorMessage error={errorText(removeMutation.error)} />
    </section>
  );
}
