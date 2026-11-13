// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { buildThing, createSolidDataset, getBoolean, getThing, setThing } from "./client/rdf";
import type { PreferencesRepository } from "@solid-memo/application/ports";
import { preferencesUrlOf } from "@solid-memo/domain/instanceLayout";
import { isPreferencesOutdated } from "@solid-memo/domain/migration";
import type { PreferencesRead } from "@solid-memo/domain/preferences";
import { AppError } from "@solid-memo/domain/appError";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { toPreferences, toPreferencesThing } from "./mappers/preferencesMapper";
import { PREFERENCES_V6 } from "@solid-memo/vocab/descriptors.generated";
import { unlessNewer, withoutForeignShapedClasses } from "./records";
import { SM } from "./vocab";

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
    async getPreferences(instanceUrl): Promise<PreferencesRead> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      if (dataset === null) return null;
      const subject = getThing(dataset, `${documentUrl}#it`);
      if (subject === null) return null;
      return toPreferences(subject) ?? "misfit";
    },

    /**
     * Rewrites the subject in place, so triples this app does not know
     * survive. One that does not fit its shape is refused unless the
     * user said to replace it: read as none, it would be overwritten
     * with what was shown in its place, the defaults.
     */
    async savePreferences(instanceUrl, preferences, { replaceMisfit = false } = {}): Promise<void> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = (await getSolidDatasetOrNull(documentUrl, fetch)) ?? createSolidDataset();
      const url = `${documentUrl}#it`;
      const existing = getThing(dataset, url);
      if (existing !== null && !replaceMisfit && toPreferences(existing) === null)
        throw new AppError("preferencesMisfit");
      const updated = setThing(dataset, toPreferencesThing(url, preferences, existing));
      await checkWrite(updated, [url], "pod");
      // One PUT of the whole document, If-Match the read above: node-solid-server stores a boolean a PATCH
      // inserts as false, so "Not now" (schedulerInvitationDismissed) and the developer settings would not hold.
      await saveDataset(documentUrl, updated, fetch, { whole: true });
    },

    /**
     * Sets the one triple on the subject as stored, whatever its format,
     * as markConnectedScreen does, so preferences that do not fit their
     * shape are not rewritten with the defaults.
     */
    async markSchedulerInvitationDismissed(instanceUrl) {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      const url = `${documentUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      if (existing === null || getBoolean(existing, SM.schedulerInvitationDismissed) === true)
        return;
      const updated = setThing(
        dataset!,
        buildThing(withoutForeignShapedClasses(unlessNewer(existing), PREFERENCES_V6))
          .removeAll(SM.schedulerInvitationDismissed)
          .addBoolean(SM.schedulerInvitationDismissed, true)
          .build(),
      );
      await checkWrite(updated, [url], "pod");
      // One PUT of the whole document, If-Match the read above, as savePreferences writes it.
      await saveDataset(documentUrl, updated, fetch, { whole: true });
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
      await checkWrite(updated, [url], "pod");
      // One PUT of the whole document, If-Match the read above, as savePreferences writes it.
      await saveDataset(documentUrl, updated, fetch, { whole: true });
      return true;
    },

    async connectedScreenSkipped(instanceUrl): Promise<boolean> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      const subject = dataset === null ? null : getThing(dataset, `${documentUrl}#it`);
      // Outside the shape, as a deck's sm:deckCardLanguage is: read whatever the format, and whether or
      // not the preferences fit it, as markConnectedScreen writes it. A value that is not true (none, or
      // "yes") reads as showing the screen.
      return subject !== null && getBoolean(subject, SM.connectedScreenSkipped) === true;
    },

    /**
     * Sets or removes the one triple on the subject as stored, whatever
     * its format, so the preferences are not rewritten: ones that do not
     * fit their shape gain the choice alone, which connectedScreenSkipped
     * reads all the same. Showing the screen leaves no triple.
     */
    async markConnectedScreen(instanceUrl, skipped, created) {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      const url = `${documentUrl}#it`;
      const existing = dataset === null ? null : getThing(dataset, url);
      if (existing === null && created === null) return "none";
      if (
        existing !== null &&
        (getBoolean(existing, SM.connectedScreenSkipped) === true) === skipped
      )
        return "unchanged";
      const subject = buildThing(
        existing === null
          ? toPreferencesThing(url, created!, null)
          : withoutForeignShapedClasses(unlessNewer(existing), PREFERENCES_V6),
      ).removeAll(SM.connectedScreenSkipped);
      const updated = setThing(
        dataset ?? createSolidDataset(),
        (skipped ? subject.addBoolean(SM.connectedScreenSkipped, true) : subject).build(),
      );
      await checkWrite(updated, [url], "pod");
      // One PUT of the whole document, If-Match the read above (If-None-Match when there was none),
      // as savePreferences writes it: node-solid-server stores a boolean a PATCH inserts as false.
      await saveDataset(documentUrl, updated, fetch, { whole: true });
      return "written";
    },
  };
}
