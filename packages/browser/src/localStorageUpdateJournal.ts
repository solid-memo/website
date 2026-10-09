import type { UpdateJournal } from "@solid-memo/application/ports";

/**
 * The UpdateJournal in the browser's localStorage, one key per guest's
 * instance being moved, or guest's deck or deck group being added.
 * Browser storage may be missing or refuse (a private window, blocked
 * site data), so every access is guarded: the journal is a convenience,
 * never needed for a move to succeed.
 */
export function createLocalStorageUpdateJournal(
  storage: () => Storage = () => globalThis.localStorage,
): UpdateJournal {
  const key = (sourceUrl: string) => `solid-memo:update:${sourceUrl}`;
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
        if (entry === null) return null;
        const stagingUrl = (JSON.parse(entry) as { stagingUrl?: unknown }).stagingUrl;
        return typeof stagingUrl === "string" ? stagingUrl : null;
      } catch {
        return null;
      }
    },
  };
}
