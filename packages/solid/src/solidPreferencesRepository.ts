import {
  createSolidDataset,
  getThing,
  setThing,
} from "@inrupt/solid-client";
import type { PreferencesRepository } from "@solid-memo/application/ports";
import { preferencesUrlOf } from "@solid-memo/domain/instanceLayout";
import { isPreferencesOutdated } from "@solid-memo/domain/migration";
import type { StoredPreferences } from "@solid-memo/domain/preferences";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { toPreferences, toPreferencesThing } from "./mappers/preferencesMapper";

export interface SolidPreferencesRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

export function createSolidPreferencesRepository({
  fetch,
  checkWrite = noWriteCheck,
}: SolidPreferencesRepositoryDeps): PreferencesRepository {
  return {
    async getPreferences(instanceUrl): Promise<StoredPreferences | null> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      if (dataset === null) return null;
      const subject = getThing(dataset, `${documentUrl}#it`);
      if (subject === null) return null;
      return toPreferences(subject);
    },

    /** Rewrites the subject in place, so triples this app does not know survive. */
    async savePreferences(instanceUrl, preferences): Promise<void> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset =
        (await getSolidDatasetOrNull(documentUrl, fetch)) ??
        createSolidDataset();
      const url = `${documentUrl}#it`;
      const updated = setThing(
        dataset,
        toPreferencesThing(url, preferences, getThing(dataset, url)),
      );
      await checkWrite(updated, [url]);
      await saveDataset(documentUrl, updated, fetch);
    },

    async upgradePreferences(instanceUrl): Promise<boolean> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      const url = `${documentUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      // The preferences as read, brought up to date in memory, written in this app's format.
      const stored = existing === null ? null : toPreferences(existing);
      if (stored === null || !isPreferencesOutdated(stored)) return false;
      const updated = setThing(dataset!, toPreferencesThing(url, stored.preferences, existing));
      await checkWrite(updated, [url]);
      // If-Match the read above.
      await saveDataset(documentUrl, updated, fetch);
      return true;
    },
  };
}
