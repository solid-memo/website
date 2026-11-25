// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UpdateJournal } from "@solid-memo/application/ports/device";
import {
  decodeGuestMergeNote,
  encodeGuestMergeNote,
  guestMergeSourceOf,
} from "@solid-memo/domain/guest";

export const PREFIX = "solid-memo:update:";

/**
 * The longest entry the journal keeps, key and value together, in
 * characters. A move's copy, or a note of a guest's deck, group or draft
 * added (a URL and a digest), fits many times over. Without a bound one
 * entry could fill the origin's storage, which the login needs too.
 */
export const MAX_ENTRY_LENGTH = 65_536;

/** The part of the browser's Web Locks the journal uses. */
export type Locks = Pick<LockManager, "request">;

/**
 * The UpdateJournal in the browser's localStorage, one key per guest's
 * instance being moved, or guest's deck or deck group being added.
 * Browser storage may be missing or refuse (a private window, blocked
 * site data), so every access is guarded: the journal is a convenience,
 * never needed for a move to succeed. Every page of the origin shares
 * it, and learns of another page's changes from the window's `storage`
 * events.
 *
 * A page running a move holds a Web Lock named after its key, which the
 * browser lets go when the page goes (closed, or crashed). Another page
 * counts an entry as running only while that lock is held: an entry left
 * by a failed move, by a closed tab, or noting a deck added holds
 * nothing. Without Web Locks no page can tell, and none is told of
 * another's moves.
 *
 * No entry is longer than MAX_ENTRY_LENGTH: one that would be is not
 * kept (and the source's earlier entry goes), and one found is read as
 * none.
 *
 * Made, it tidies the entries stored, before anyone signs in: in each
 * entry noting a guest's deck, group or draft added (its key a
 * guestMergeKey), a note an earlier version kept, holding what it was made
 * from whole, is rewritten as its digest (decodeGuestMergeNote), the entry
 * otherwise as it was, the time it was begun too. Then any entry longer
 * than MAX_ENTRY_LENGTH, key and value together, is dropped; an entry it
 * cannot read is otherwise left as it is.
 */
export function createLocalStorageUpdateJournal(
  storage: () => Storage = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener"> = globalThis,
  locks: () => Locks | null = () => globalThis.navigator.locks ?? null,
): UpdateJournal {
  const key = (sourceUrl: string) => `${PREFIX}${sourceUrl}`;
  tidy(storage);
  return {
    begin(sourceUrl, stagingUrl) {
      try {
        const entry = JSON.stringify({ stagingUrl, startedAt: new Date().toISOString() });
        // Too long to keep: as without storage, and no earlier entry speaks for this one.
        if (key(sourceUrl).length + entry.length > MAX_ENTRY_LENGTH)
          storage().removeItem(key(sourceUrl));
        else storage().setItem(key(sourceUrl), entry);
      } catch {
        // Without storage, an interrupted move cannot be found later; nothing else changes.
      }
    },
    end(sourceUrl) {
      try {
        storage().removeItem(key(sourceUrl));
      } catch {
        // As above.
      }
    },
    sources() {
      return entryKeys(storage).map((entryKey) => entryKey.slice(PREFIX.length));
    },
    staging(sourceUrl) {
      try {
        const entry = storage().getItem(key(sourceUrl));
        return entry === null ? null : stagingOf(entry);
      } catch {
        return null;
      }
    },
    run(sourceUrl) {
      let stopped = false;
      let stop: () => void = () => undefined;
      // Granted at once, unless another page runs a move of the same instance.
      void locks()?.request(key(sourceUrl), () =>
        stopped ? undefined : new Promise<void>((resolve) => (stop = resolve)),
      );
      return () => {
        stopped = true;
        stop();
      };
    },
    watch(changed) {
      const lockManager = locks();
      if (lockManager === null) return;
      // An entry runs while its lock is held: told now, and told again when the lock goes.
      const follow = (entryKey: string, staging: string) =>
        lockManager.request(entryKey, { ifAvailable: true }, (free) => {
          if (free !== null) return;
          const sourceUrl = entryKey.slice(PREFIX.length);
          changed(sourceUrl, staging);
          void lockManager.request(entryKey, () => changed(sourceUrl, null));
        });
      for (const [entryKey, staging] of entries(storage)) void follow(entryKey, staging);
      events.addEventListener("storage", (event) => {
        const { key: changedKey, newValue } = event as StorageEvent;
        // A cleared storage (a null key) names no move, so none is known to have ended.
        if (changedKey === null || !changedKey.startsWith(PREFIX)) return;
        const staging = newValue === null ? null : stagingOf(newValue);
        if (staging === null) changed(changedKey.slice(PREFIX.length), null);
        else void follow(changedKey, staging);
      });
    },
  };
}

/** The journal's keys; none when storage cannot be read. */
function entryKeys(storage: () => Storage): string[] {
  try {
    const store = storage();
    return Array.from({ length: store.length }, (_, index) => store.key(index)!).filter(
      (entryKey) => entryKey.startsWith(PREFIX),
    );
  } catch {
    return [];
  }
}

/** The journal's entries that name a copy, as key and copy; none when storage cannot be read. */
function entries(storage: () => Storage): [string, string][] {
  try {
    const store = storage();
    return entryKeys(() => store).flatMap((entryKey) => {
      const staging = stagingOf(store.getItem(entryKey)!);
      return staging === null ? [] : [[entryKey, staging] as [string, string]];
    });
  } catch {
    return [];
  }
}

/**
 * Rewrite each note of a guest's deck, group or draft added as it reads
 * (its stamp a digest), in an entry as begin writes it and with the time
 * it was begun kept, and remove each entry longer than the journal keeps;
 * nothing when storage cannot be changed.
 */
function tidy(storage: () => Storage): void {
  try {
    const store = storage();
    for (const entryKey of entryKeys(() => store)) {
      const entry = store.getItem(entryKey)!;
      const kept =
        guestMergeSourceOf(entryKey.slice(PREFIX.length)) === null ? entry : digested(entry);
      // An entry it cannot read, within the bound, is kept as it is: it may be a move's.
      if (entryKey.length + kept.length > MAX_ENTRY_LENGTH) store.removeItem(entryKey);
      else if (kept !== entry) store.setItem(entryKey, kept);
    }
  } catch {
    // Read as none all the same (stagingOf), and a note as its digest (decodeGuestMergeNote).
  }
}

/** The entry of a note, its note's stamp a digest; the entry as it is when it holds no note. */
function digested(entry: string): string {
  const parsed = parse(entry);
  const note = decodeGuestMergeNote(
    typeof parsed?.stagingUrl === "string" ? parsed.stagingUrl : null,
  );
  return note === null
    ? entry
    : JSON.stringify({ stagingUrl: encodeGuestMergeNote(note), startedAt: parsed!.startedAt });
}

/** An entry's fields; null when it is not an object this journal wrote. */
function parse(entry: string): { stagingUrl?: unknown; startedAt?: unknown } | null {
  try {
    const value: unknown = JSON.parse(entry);
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

/** The copy an entry names; null when it names none it can read, or is longer than the journal keeps. */
function stagingOf(entry: string): string | null {
  if (entry.length > MAX_ENTRY_LENGTH) return null;
  const stagingUrl = parse(entry)?.stagingUrl;
  return typeof stagingUrl === "string" ? stagingUrl : null;
}
