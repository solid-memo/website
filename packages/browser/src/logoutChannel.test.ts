// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNEL, createLogoutChannel, KEY } from "./logoutChannel";

/** A tick for the BroadcastChannel to deliver, and a little more. */
const delivered = () => new Promise((resolve) => setTimeout(resolve, 20));

function noChannel(): BroadcastChannel {
  throw new DOMException("The operation is insecure.", "SecurityError");
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** A storage that fires, on the other pages' `events`, what a browser's `storage` events say. */
function sharedStorage(...others: EventTarget[]): Storage {
  const storage = memoryStorage();
  const fire = (key: string, newValue: string | null) => {
    for (const events of others) {
      events.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
    }
  };
  return {
    ...storage,
    removeItem(key) {
      storage.removeItem(key);
      fire(key, null);
    },
    setItem(key, value) {
      storage.setItem(key, value);
      fire(key, value);
    },
  };
}

describe("createLogoutChannel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("on a BroadcastChannel", () => {
    /** Two pages of the origin, each with a channel of its own; closed after the test. */
    function twoPages() {
      const opened: BroadcastChannel[] = [];
      const open = () => {
        const channel = new BroadcastChannel(CHANNEL);
        opened.push(channel);
        return channel;
      };
      return {
        here: createLogoutChannel(open),
        there: createLogoutChannel(open),
        close: () => {
          for (const channel of opened) channel.close();
        },
      };
    }

    it("tells the other pages of a logout, and not the page that announced it", async () => {
      const { here, there, close } = twoPages();
      const heardHere = vi.fn();
      const heardThere = vi.fn();
      here.listen(heardHere);
      there.listen(heardThere);

      here.announce();
      await delivered();

      expect(heardThere).toHaveBeenCalledOnce();
      expect(heardHere).not.toHaveBeenCalled();
      close();
    });

    it("stops telling a listener once it unsubscribes", async () => {
      const { here, there, close } = twoPages();
      const heard = vi.fn();
      const stop = there.listen(heard);
      stop();

      here.announce();
      await delivered();

      expect(heard).not.toHaveBeenCalled();
      close();
    });

    it("opens one channel, and that only once it is needed", () => {
      const close = vi.fn();
      const open = vi.fn(
        () =>
          ({
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            postMessage: vi.fn(),
            close,
          }) as unknown as BroadcastChannel,
      );
      const channel = createLogoutChannel(open);
      expect(open).not.toHaveBeenCalled();
      channel.listen(() => undefined);
      channel.announce();
      expect(open).toHaveBeenCalledOnce();
    });

    it("needs nothing but the browser's channel by default", async () => {
      const here = createLogoutChannel();
      const there = createLogoutChannel();
      const heard = vi.fn();
      const stop = there.listen(heard);
      here.announce();
      await delivered();
      expect(heard).toHaveBeenCalledOnce();
      stop();
    });
  });

  describe("on a localStorage key, where the browser refuses a channel", () => {
    it("tells the other pages once for each logout, leaving nothing stored", () => {
      const events = new EventTarget();
      const storage = sharedStorage(events);
      const here = createLogoutChannel(noChannel, () => storage, new EventTarget());
      const there = createLogoutChannel(noChannel, () => storage, events);
      const heard = vi.fn();
      there.listen(heard);

      here.announce();
      expect(heard).toHaveBeenCalledOnce();
      here.announce();
      expect(heard).toHaveBeenCalledTimes(2);
      expect(storage.getItem(KEY)).toBeNull();
    });

    it("falls back the same where the browser has no channel at all", () => {
      vi.stubGlobal("BroadcastChannel", undefined);
      const events = new EventTarget();
      const storage = sharedStorage(events);
      const heard = vi.fn();
      createLogoutChannel(undefined, () => storage, events).listen(heard);

      createLogoutChannel(undefined, () => storage, new EventTarget()).announce();

      expect(heard).toHaveBeenCalledOnce();
    });

    it("uses the browser's localStorage by default", () => {
      const storage = sharedStorage();
      const setItem = vi.spyOn(storage, "setItem");
      vi.stubGlobal("localStorage", storage);
      createLogoutChannel(noChannel).announce();
      expect(setItem).toHaveBeenCalledWith(KEY, "logout");
      expect(storage.getItem(KEY)).toBeNull();
    });

    it("ignores other keys and a cleared storage", () => {
      const events = new EventTarget();
      const heard = vi.fn();
      createLogoutChannel(noChannel, memoryStorage, events).listen(heard);

      for (const key of ["solid-memo:theme", null]) {
        events.dispatchEvent(Object.assign(new Event("storage"), { key, newValue: "x" }));
      }

      expect(heard).not.toHaveBeenCalled();
    });

    it("stops telling a listener once it unsubscribes", () => {
      const events = new EventTarget();
      const heard = vi.fn();
      const stop = createLogoutChannel(noChannel, memoryStorage, events).listen(heard);
      stop();

      events.dispatchEvent(Object.assign(new Event("storage"), { key: KEY, newValue: "logout" }));

      expect(heard).not.toHaveBeenCalled();
    });

    it("announces nothing, without failing, where storage refuses too", () => {
      const refusing = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
      expect(() => createLogoutChannel(noChannel, refusing).announce()).not.toThrow();
    });
  });
});
