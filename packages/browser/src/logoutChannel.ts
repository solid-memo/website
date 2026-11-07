// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LogoutChannel } from "@solid-memo/application/ports";

/** The BroadcastChannel a logout is announced on, and the localStorage key where there is none. */
export const CHANNEL = "solid-memo:logout";
export const KEY = "solid-memo:logout";

/**
 * The LogoutChannel in the browser: a BroadcastChannel, which every page
 * of the origin shares and which leaves nothing behind. Where the browser
 * has none or refuses one, a localStorage key, set and taken off at once
 * so that each announcement fires other pages' `storage` events. Neither
 * tells the page that announced. The BroadcastChannel is opened once it
 * is needed, and stays open for as long as the page lives, since a page
 * hears only on a channel of its own.
 */
export function createLogoutChannel(
  open: () => BroadcastChannel = () => new BroadcastChannel(CHANNEL),
  storage: () => Storage = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener" | "removeEventListener"> = globalThis,
): LogoutChannel {
  let opened: BroadcastChannel | null | undefined;
  const channel = () => {
    if (opened === undefined) {
      try {
        opened = open();
      } catch {
        opened = null;
      }
    }
    return opened;
  };
  return {
    announce() {
      const broadcast = channel();
      if (broadcast !== null) {
        broadcast.postMessage("logout");
        return;
      }
      try {
        storage().setItem(KEY, "logout");
        storage().removeItem(KEY);
      } catch {
        // Without storage either, other pages keep their session until its token ends.
      }
    },
    listen(listener) {
      const broadcast = channel();
      if (broadcast !== null) {
        const heard = () => listener();
        broadcast.addEventListener("message", heard);
        return () => broadcast.removeEventListener("message", heard);
      }
      const heard = (event: Event) => {
        const { key, newValue } = event as StorageEvent;
        // The key taken off again is the same announcement; a cleared storage (a null key) is none.
        if (key === KEY && newValue !== null) listener();
      };
      events.addEventListener("storage", heard);
      return () => events.removeEventListener("storage", heard);
    },
  };
}
