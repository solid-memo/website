import { describe, expect, it, vi } from "vitest";
import { createLocalStorageUpdateJournal } from "./localStorageUpdateJournal";
import { fakeLocks } from "./testing/fakeLocks";

const SOURCE = "https://guest.solid-memo.invalid/solid-memo/";
const STAGING = "https://pod.example/solid-memo/main/";

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

describe("createLocalStorageUpdateJournal", () => {
  it("remembers the copy a move of a guest's study is writing until it ends", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(journal.staging(SOURCE)).toBeNull();
    journal.begin(SOURCE, STAGING);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    expect(JSON.parse(storage.getItem(`solid-memo:update:${SOURCE}`)!)).toMatchObject({ stagingUrl: STAGING });
    journal.end(SOURCE);
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("ignores an entry it cannot read", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    storage.setItem(`solid-memo:update:${SOURCE}`, JSON.stringify({ stagingUrl: 3 }));
    expect(journal.staging(SOURCE)).toBeNull();
    storage.setItem(`solid-memo:update:${SOURCE}`, "{");
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("does without storage that is missing or refuses", () => {
    const journal = createLocalStorageUpdateJournal(() => {
      throw new Error("SecurityError");
    });
    expect(() => journal.begin(SOURCE, STAGING)).not.toThrow();
    expect(() => journal.end(SOURCE)).not.toThrow();
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("uses the browser's localStorage by default", () => {
    const journal = createLocalStorageUpdateJournal();
    journal.begin(SOURCE, STAGING);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    journal.end(SOURCE);
  });

  it("tells another page of each update it begins, and again when the update stops running", async () => {
    const locks = fakeLocks();
    const storage = memoryStorage();
    const events = new EventTarget();
    const updating = createLocalStorageUpdateJournal(() => storage, new EventTarget(), () => locks);
    const watching = createLocalStorageUpdateJournal(() => storage, events, () => locks);
    const changed = vi.fn();
    watching.watch(changed);
    const stop = updating.run(SOURCE);
    await settled();
    updating.begin(SOURCE, STAGING);
    events.dispatchEvent(storageEvent(storage.getItem(KEY)));
    await settled();
    expect(changed.mock.calls).toEqual([[SOURCE, STAGING]]);
    // The update failed and kept its entry, to be resumed: it runs no more all the same.
    stop();
    stop();
    await settled();
    expect(changed.mock.calls).toEqual([[SOURCE, STAGING], [SOURCE, null]]);
    expect(watching.staging(SOURCE)).toBe(STAGING);
  });

  it("tells a page that starts of the updates running already, not of entries left behind", async () => {
    const locks = fakeLocks();
    const storage = memoryStorage();
    const updating = createLocalStorageUpdateJournal(() => storage, new EventTarget(), () => locks);
    const left = "https://pod.example/solid-memo/old/";
    updating.begin(left, `${left.slice(0, -1)}-0f3a/`);
    storage.setItem(`solid-memo:update:${"https://pod.example/solid-memo/broken/"}`, "{");
    storage.setItem("solid-memo:language", "sv");
    const stop = updating.run(SOURCE);
    updating.begin(SOURCE, STAGING);
    await settled();
    const changed = vi.fn();
    createLocalStorageUpdateJournal(() => storage, new EventTarget(), () => locks).watch(changed);
    await settled();
    expect(changed.mock.calls).toEqual([[SOURCE, STAGING]]);
    stop();
    await settled();
    expect(changed.mock.calls).toEqual([[SOURCE, STAGING], [SOURCE, null]]);
  });

  it("tells of an entry that ends, or that names no copy, at once", () => {
    const events = new EventTarget();
    const changed = vi.fn();
    createLocalStorageUpdateJournal(memoryStorage, events, fakeLocks).watch(changed);
    events.dispatchEvent(storageEvent("{"));
    events.dispatchEvent(storageEvent(null));
    // Another key, and a cleared storage, name no update.
    events.dispatchEvent(new StorageEvent("storage", { key: "solid-memo:language", newValue: "sv" }));
    events.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(changed.mock.calls).toEqual([
      [SOURCE, null],
      [SOURCE, null],
    ]);
  });

  it("lets go at once of a run stopped before its lock is granted", async () => {
    const locks = fakeLocks();
    const journal = createLocalStorageUpdateJournal(memoryStorage, new EventTarget(), () => locks);
    const first = journal.run(SOURCE);
    journal.run(SOURCE)();
    first();
    await settled();
    const changed = vi.fn();
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ stagingUrl: STAGING }));
    createLocalStorageUpdateJournal(() => storage, new EventTarget(), () => locks).watch(changed);
    await settled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("tells of no other page's updates without Web Locks", () => {
    const events = new EventTarget();
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage, events, () => null);
    const changed = vi.fn();
    journal.watch(changed);
    expect(() => journal.run(SOURCE)()).not.toThrow();
    storage.setItem(KEY, JSON.stringify({ stagingUrl: STAGING }));
    events.dispatchEvent(storageEvent(storage.getItem(KEY)));
    expect(changed).not.toHaveBeenCalled();
  });

  it("finds no entries in storage that refuses", () => {
    const changed = vi.fn();
    createLocalStorageUpdateJournal(
      () => {
        throw new Error("SecurityError");
      },
      new EventTarget(),
      fakeLocks,
    ).watch(changed);
    expect(changed).not.toHaveBeenCalled();
  });

  it("listens to the window's storage events, with the browser's Web Locks, by default", async () => {
    const changed = vi.fn();
    createLocalStorageUpdateJournal(undefined, undefined, fakeLocks).watch(changed);
    window.dispatchEvent(storageEvent(null));
    expect(changed).toHaveBeenCalledWith(SOURCE, null);
    // The test browser has no Web Locks.
    const journal = createLocalStorageUpdateJournal();
    journal.watch(changed);
    journal.run(SOURCE)();
  });
});

const KEY = `solid-memo:update:${SOURCE}`;

function storageEvent(newValue: string | null): StorageEvent {
  return new StorageEvent("storage", { key: KEY, newValue });
}

/** Lets granted locks run their callbacks, and released ones pass on. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}
