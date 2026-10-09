import type { UpdateJournal } from "@solid-memo/application/ports";

const PREFIX = "solid-memo:update:";

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
 */
export function createLocalStorageUpdateJournal(
  storage: () => Storage = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener"> = globalThis,
  locks: () => Locks | null = () => globalThis.navigator.locks ?? null,
): UpdateJournal {
  const key = (sourceUrl: string) => `${PREFIX}${sourceUrl}`;
  return {
    begin(sourceUrl, stagingUrl) {
      try {
        storage().setItem(key(sourceUrl), JSON.stringify({ stagingUrl, startedAt: new Date().toISOString() }));
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

/** The journal's entries that name a copy, as key and copy; none when storage cannot be read. */
function entries(storage: () => Storage): [string, string][] {
  try {
    const store = storage();
    return Array.from({ length: store.length }, (_, index) => store.key(index)!).flatMap((entryKey) => {
      const staging = entryKey.startsWith(PREFIX) ? stagingOf(store.getItem(entryKey)!) : null;
      return staging === null ? [] : [[entryKey, staging] as [string, string]];
    });
  } catch {
    return [];
  }
}

/** The copy an entry names; null when it names none it can read. */
function stagingOf(entry: string): string | null {
  try {
    const stagingUrl = (JSON.parse(entry) as { stagingUrl?: unknown }).stagingUrl;
    return typeof stagingUrl === "string" ? stagingUrl : null;
  } catch {
    return null;
  }
}
