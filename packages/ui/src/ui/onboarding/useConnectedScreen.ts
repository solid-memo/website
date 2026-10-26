// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PreferenceUseCases } from "@solid-memo/application/preferences";
import type { SolidAccount } from "@solid-memo/domain/account";
import type { Session } from "@solid-memo/domain/session";
import { queryKeys } from "../queryKeys";

/** How long Discovering waits for the choice once the account is found, before showing the Connected screen. */
export const CONNECTED_SCREEN_WAIT_MS = 3000;

/** What the Connected screen needs to know of the choice to skip it. */
export interface ConnectedScreen {
  /** Discovering stays on screen: the choice is still read, or the app is about to be entered. */
  waiting: boolean;
  /** "Don't show this screen after logging in" is offered: the learner has instances to keep it in. */
  offerSkip: boolean;
  /** "Try again": the choice is read again, and waited for again. */
  retry(): void;
  /** Continue: the app is entered at once, and the choice to skip the screen saved afterwards. */
  enter(skip: boolean): void;
}

/**
 * Whether the Connected screen shows after a login (docs/onboarding.md,
 * Skipping the Connected screen): read beside the account, waited for
 * only once storage is found, and at most CONNECTED_SCREEN_WAIT_MS then.
 * Once the screen shows it stays.
 */
export function useConnectedScreen({
  useCases,
  session,
  connecting,
  account,
  onEnter,
}: {
  useCases: Pick<PreferenceUseCases, "connectedScreenChoice" | "skipConnectedScreen">;
  session: Session | null;
  connecting: boolean;
  /** The account query, as discoverAccount answers it. */
  account: { data: SolidAccount | undefined; error: unknown; isFetching: boolean };
  /** Enter the app. */
  onEnter: () => void;
}): ConnectedScreen {
  const queryClient = useQueryClient();
  const choice = useQuery({
    queryKey: queryKeys.connectedScreen(session?.webId),
    queryFn: () => useCases.connectedScreenChoice(session!),
    enabled: session !== null && connecting,
    // Read once: a slow retry would hold up the login, and the screen shows on any failure.
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [waitedOut, setWaitedOut] = useState(false);
  // Neither a missing Pod nor an error waits for the choice: those always show.
  const storageFound =
    account.data?.podUrl !== undefined && account.error === null && !account.isFetching;
  const choosing = storageFound && choice.isFetching && !waitedOut;
  const skipping = connecting && storageFound && !waitedOut && choice.data?.skipped === true;

  useEffect(() => {
    if (!choosing) return;
    const timer = setTimeout(() => setWaitedOut(true), CONNECTED_SCREEN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [choosing]);

  /** The instances the choice listed, for the workspace not to list them again. */
  function seedInstances() {
    if (choice.data === undefined) return;
    queryClient.setQueryData(queryKeys.instances(session!.webId), [...choice.data.instances]);
  }

  useEffect(() => {
    if (!skipping) return;
    seedInstances();
    onEnter();
  }, [skipping]);

  return {
    waiting: choosing || skipping,
    offerSkip: choice.data !== undefined && choice.data.instances.length > 0,
    retry() {
      setWaitedOut(false);
      void choice.refetch();
    },
    enter(skip) {
      seedInstances();
      onEnter();
      if (!skip) return;
      // Saved after the app is entered: an instance where it fails keeps showing the screen.
      void useCases
        .skipConnectedScreen(choice.data?.instances ?? [])
        .catch(() => undefined)
        .finally(() => queryClient.invalidateQueries({ queryKey: queryKeys.allPreferences() }));
    },
  };
}
