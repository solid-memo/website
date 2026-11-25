// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  decodeGuestMergeNote,
  encodeGuestMergeNote,
  guestMergeStamp,
} from "@solid-memo/domain/guest";
import { describe, expect, it, vi } from "vitest";
import {
  createLocalStorageUpdateJournal,
  MAX_ENTRY_LENGTH,
  PREFIX,
} from "./localStorageUpdateJournal";
import { fakeLocks } from "./testing/fakeLocks";
import { memoryStorage } from "./testing/memoryStorage";

const SOURCE = "https://guest.solid-memo.invalid/solid-memo/";
const STAGING = "https://pod.example/solid-memo/main/";

describe("createLocalStorageUpdateJournal", () => {
  it("remembers the copy a move of a guest's study is writing until it ends", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(journal.staging(SOURCE)).toBeNull();
    journal.begin(SOURCE, STAGING);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    expect(JSON.parse(storage.getItem(`solid-memo:update:${SOURCE}`)!)).toMatchObject({
      stagingUrl: STAGING,
    });
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
    expect(journal.sources()).toEqual([]);
  });

  it("lists the source of each entry it keeps, and no other key", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    storage.setItem("solid-memo:language", "sv");
    journal.begin(SOURCE, STAGING);
    journal.begin(`${SOURCE}catalog.ttl#deck-1 added to ${STAGING}`, "{}");
    expect(journal.sources()).toEqual([SOURCE, `${SOURCE}catalog.ttl#deck-1 added to ${STAGING}`]);
  });

  it("keeps no entry longer than its bound, forgetting the source's earlier one, and reads one as none", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    journal.begin(SOURCE, STAGING);
    journal.begin(SOURCE, "x".repeat(MAX_ENTRY_LENGTH));
    expect(storage.getItem(KEY)).toBeNull();
    expect(journal.staging(SOURCE)).toBeNull();
    storage.setItem(KEY, JSON.stringify({ stagingUrl: "x".repeat(MAX_ENTRY_LENGTH) }));
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("drops, as it is made, each entry longer than its bound that an earlier version kept", () => {
    const storage = memoryStorage();
    const long = JSON.stringify({ stagingUrl: "x".repeat(MAX_ENTRY_LENGTH) });
    storage.setItem(`${KEY}catalog.ttl#deck-1 added to ${STAGING}`, long);
    storage.setItem(KEY, JSON.stringify({ stagingUrl: STAGING }));
    storage.setItem("solid-memo:other", long);
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(journal.sources()).toEqual([SOURCE]);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    // Not the journal's: left as it is.
    expect(storage.getItem("solid-memo:other")).toBe(long);
  });

  it("keeps no entry whose key and value together are longer than its bound", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    const source = `${SOURCE}${"x".repeat(MAX_ENTRY_LENGTH)}`;
    journal.begin(source, STAGING);
    expect(journal.sources()).toEqual([]);
  });

  it("rewrites, as it is made, each note an earlier version kept whole as its digest", () => {
    const storage = memoryStorage();
    const noteKey = (index: number) => `${KEY}catalog.ttl#deck-${index} added to ${STAGING}`;
    const madeFrom = (index: number) => `${index}${"x".repeat(60_000)}`;
    const startedAt = "2026-01-02T03:04:05.000Z";
    // An entry as an earlier version's begin wrote it, its note holding what it was made from whole.
    const legacy = (index: number, stamp: string) =>
      storage.setItem(
        noteKey(index),
        JSON.stringify({
          stagingUrl: JSON.stringify({ url: `${STAGING}catalog.ttl#deck-${index}`, stamp }),
          startedAt,
        }),
      );
    // Many notes, each under the bound, that together would fill a device's storage.
    for (let index = 0; index < 80; index++) legacy(index, madeFrom(index));
    // One longer than the bound, too: rewritten, not dropped, so a resumed merge still finds it.
    legacy(80, "y".repeat(MAX_ENTRY_LENGTH));
    const digested = JSON.stringify({
      stagingUrl: encodeGuestMergeNote({
        url: `${STAGING}catalog.ttl#deck-81`,
        stamp: guestMergeStamp("z"),
      }),
      startedAt,
    });
    storage.setItem(noteKey(81), digested);
    // A move's entry, and entries under a note's key that hold no note: left as they are.
    const move = JSON.stringify({ stagingUrl: STAGING, startedAt });
    storage.setItem(KEY, move);
    const noNotes = [
      JSON.stringify({ stagingUrl: STAGING }),
      JSON.stringify({ stagingUrl: 3 }),
      "3",
    ];
    noNotes.forEach((entry, index) => storage.setItem(noteKey(82 + index), entry));
    const size = () =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index)!).reduce(
        (total, key) => total + key.length + storage.getItem(key)!.length,
        0,
      );
    const before = size();
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(size()).toBeLessThan(before / 100);
    expect(journal.sources()).toHaveLength(86);
    for (let index = 0; index < 80; index++) {
      expect(decodeGuestMergeNote(journal.staging(noteKey(index).slice(PREFIX.length)))).toEqual({
        url: `${STAGING}catalog.ttl#deck-${index}`,
        stamp: guestMergeStamp(madeFrom(index)),
      });
      expect(JSON.parse(storage.getItem(noteKey(index))!).startedAt).toBe(startedAt);
    }
    expect(decodeGuestMergeNote(journal.staging(noteKey(80).slice(PREFIX.length)))).toEqual({
      url: `${STAGING}catalog.ttl#deck-80`,
      stamp: guestMergeStamp("y".repeat(MAX_ENTRY_LENGTH)),
    });
    expect(storage.getItem(noteKey(81))).toBe(digested);
    expect(storage.getItem(KEY)).toBe(move);
    noNotes.forEach((entry, index) => expect(storage.getItem(noteKey(82 + index))).toBe(entry));
  });

  it("rewrites, as it is made, a note an earlier version's begin kept", () => {
    const storage = memoryStorage();
    const source = `${SOURCE}catalog.ttl#deck-1 added to ${STAGING}`;
    createLocalStorageUpdateJournal(() => storage).begin(
      source,
      JSON.stringify({ url: `${STAGING}catalog.ttl#deck-1`, stamp: "made from" }),
    );
    const { startedAt } = JSON.parse(storage.getItem(`${PREFIX}${source}`)!);
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(decodeGuestMergeNote(journal.staging(source))).toEqual({
      url: `${STAGING}catalog.ttl#deck-1`,
      stamp: guestMergeStamp("made from"),
    });
    expect(JSON.parse(storage.getItem(`${PREFIX}${source}`)!)).toEqual({
      stagingUrl: encodeGuestMergeNote({
        url: `${STAGING}catalog.ttl#deck-1`,
        stamp: guestMergeStamp("made from"),
      }),
      startedAt,
    });
  });

  it("drops, as it is made, a note still longer than its bound as a digest", () => {
    const storage = memoryStorage();
    const noteKey = `${KEY}catalog.ttl#deck-1 added to ${STAGING}`;
    storage.setItem(
      noteKey,
      JSON.stringify({
        stagingUrl: JSON.stringify({
          url: `${STAGING}${"x".repeat(MAX_ENTRY_LENGTH)}`,
          stamp: "made from",
        }),
        startedAt: "2026-01-02T03:04:05.000Z",
      }),
    );
    createLocalStorageUpdateJournal(() => storage);
    expect(storage.getItem(noteKey)).toBeNull();
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
    const updating = createLocalStorageUpdateJournal(
      () => storage,
      new EventTarget(),
      () => locks,
    );
    const watching = createLocalStorageUpdateJournal(
      () => storage,
      events,
      () => locks,
    );
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
    expect(changed.mock.calls).toEqual([
      [SOURCE, STAGING],
      [SOURCE, null],
    ]);
    expect(watching.staging(SOURCE)).toBe(STAGING);
  });

  it("tells a page that starts of the updates running already, not of entries left behind", async () => {
    const locks = fakeLocks();
    const storage = memoryStorage();
    const updating = createLocalStorageUpdateJournal(
      () => storage,
      new EventTarget(),
      () => locks,
    );
    const left = "https://pod.example/solid-memo/old/";
    updating.begin(left, `${left.slice(0, -1)}-0f3a/`);
    storage.setItem(`solid-memo:update:${"https://pod.example/solid-memo/broken/"}`, "{");
    storage.setItem("solid-memo:language", "sv");
    const stop = updating.run(SOURCE);
    updating.begin(SOURCE, STAGING);
    await settled();
    const changed = vi.fn();
    createLocalStorageUpdateJournal(
      () => storage,
      new EventTarget(),
      () => locks,
    ).watch(changed);
    await settled();
    expect(changed.mock.calls).toEqual([[SOURCE, STAGING]]);
    stop();
    await settled();
    expect(changed.mock.calls).toEqual([
      [SOURCE, STAGING],
      [SOURCE, null],
    ]);
  });

  it("tells of an entry that ends, or that names no copy, at once", () => {
    const events = new EventTarget();
    const changed = vi.fn();
    createLocalStorageUpdateJournal(memoryStorage, events, fakeLocks).watch(changed);
    events.dispatchEvent(storageEvent("{"));
    events.dispatchEvent(storageEvent(null));
    // Another key, and a cleared storage, name no update.
    events.dispatchEvent(
      new StorageEvent("storage", { key: "solid-memo:language", newValue: "sv" }),
    );
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
    createLocalStorageUpdateJournal(
      () => storage,
      new EventTarget(),
      () => locks,
    ).watch(changed);
    await settled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("tells of no other page's updates without Web Locks", () => {
    const events = new EventTarget();
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(
      () => storage,
      events,
      () => null,
    );
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
