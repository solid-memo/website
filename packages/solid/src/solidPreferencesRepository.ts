// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  buildThing,
  createSolidDataset,
  getThing,
  setThing,
} from "./client/rdf";
import type { PreferencesRepository } from "@solid-memo/application/ports/pod";
import { preferencesUrlOf } from "@solid-memo/domain/instanceLayout";
import { isPreferencesOutdated } from "@solid-memo/domain/migration";
import type { PreferencesRead } from "@solid-memo/domain/preferences";
import { AppError } from "@solid-memo/domain/appError";
import { editDocument, getSolidDatasetOrNull } from "./datasets";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { toPreferences, toPreferencesThing } from "./mappers/preferencesMapper";
import { PREFERENCES_TERMS, PREFERENCES_V6 } from "@solid-memo/vocab/descriptors.generated";
import { readFieldOf, readTerms, unlessNewer, withoutForeignShapedClasses } from "./records";
import { SM } from "./vocab";

export interface SolidPreferencesRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

/**
 * A write of the preferences is made once: one of the preferences as
 * shown is not made again on what changed elsewhere, which its If-Match
 * refuses (changedElsewhere). Only markConnectedScreen, which writes one
 * choice on the preferences as they are, is made again (editDocument).
 */
const ONCE = 1;

export function createSolidPreferencesRepository({
  fetch,
  checkWrite = noWriteCheck,
}: SolidPreferencesRepositoryDeps): PreferencesRepository {
  /**
   * An edit of an instance's preferences document (editDocument): `edit`
   * is given the document and its subject (`#it`) as read, and says what
   * to write, if anything. What is written is checked at the subject and
   * saved as ONE PUT of the whole document, If-Match the read
   * (If-None-Match: * when there was none): node-solid-server stores a
   * boolean a PATCH inserts as false, so "Not now"
   * (schedulerInvitationDismissed) and the developer settings would not
   * hold.
   */
  function editPreferences<R>(
    instanceUrl: string,
    edit: (
      dataset: Dataset | null,
      subject: NamedSubject | null,
      url: string,
    ) => { result: R; dataset?: Dataset },
    madeAgain = false,
  ): Promise<R> {
    const documentUrl = preferencesUrlOf(instanceUrl);
    const url = `${documentUrl}#it`;
    return editDocument(
      documentUrl,
      fetch,
      (dataset) => {
        const { result, dataset: updated } = edit(
          dataset,
          dataset === null ? null : getThing(dataset, url),
          url,
        );
        if (updated === undefined) return { result };
        return { result, dataset: updated, subjects: [url], whole: true };
      },
      // Made again as many times as editDocument makes an edit, or once.
      madeAgain ? { checkWrite } : { checkWrite, attempts: ONCE },
    );
  }

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
    savePreferences(instanceUrl, preferences, { replaceMisfit = false } = {}): Promise<void> {
      return editPreferences(instanceUrl, (dataset, existing, url) => {
        if (existing !== null && !replaceMisfit && toPreferences(existing) === null)
          throw new AppError("preferencesMisfit");
        return {
          result: undefined,
          dataset: setThing(
            dataset ?? createSolidDataset(),
            toPreferencesThing(url, preferences, existing),
          ),
        };
      });
    },

    /**
     * Sets the one triple on the subject as stored, whatever its format,
     * as markConnectedScreen does, so preferences that do not fit their
     * shape are not rewritten with the defaults.
     */
    markSchedulerInvitationDismissed(instanceUrl) {
      return editPreferences(instanceUrl, (dataset, existing) => {
        if (
          existing === null ||
          readFieldOf(existing, PREFERENCES_V6, "schedulerInvitationDismissed") === true
        )
          return { result: undefined };
        return {
          result: undefined,
          dataset: setThing(
            dataset!,
            buildThing(withoutForeignShapedClasses(unlessNewer(existing), PREFERENCES_V6))
              .removeAll(SM.schedulerInvitationDismissed)
              .addBoolean(SM.schedulerInvitationDismissed, true)
              .build(),
          ),
        };
      });
    },

    upgradePreferences(instanceUrl): Promise<boolean> {
      return editPreferences(instanceUrl, (dataset, existing, url) => {
        // The preferences as read, brought up to date in memory, written in this app's format.
        const stored = existing === null ? null : toPreferences(existing);
        if (stored === null || !isPreferencesOutdated(stored)) return { result: false };
        return {
          result: true,
          dataset: setThing(dataset!, toPreferencesThing(url, stored.preferences, existing)),
        };
      });
    },

    async connectedScreenSkipped(instanceUrl): Promise<boolean> {
      const documentUrl = preferencesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      const subject = dataset === null ? null : getThing(dataset, `${documentUrl}#it`);
      // Outside the shape, as a deck's sm:deckCardLanguage is: read whatever the format, and whether or
      // not the preferences fit it, as markConnectedScreen writes it. A value that is not true (none, or
      // "yes") reads as showing the screen.
      return (
        subject !== null && readTerms(subject, PREFERENCES_TERMS).connectedScreenSkipped === true
      );
    },

    /**
     * Sets or removes the one triple on the subject as stored, whatever
     * its format, so the preferences are not rewritten: ones that do not
     * fit their shape gain the choice alone, which connectedScreenSkipped
     * reads all the same. Showing the screen leaves no triple. Made again
     * on the preferences as they are then while they keep changing, or
     * are made, elsewhere (editDocument), so the choice alone is written
     * on them.
     */
    markConnectedScreen(instanceUrl, skipped, created) {
      return editPreferences(
        instanceUrl,
        (dataset, existing, url) => {
          if (existing === null && created === null) return { result: "none" as const };
          if (
            existing !== null &&
            (readTerms(existing, PREFERENCES_TERMS).connectedScreenSkipped === true) === skipped
          )
            return { result: "unchanged" as const };
          const subject = buildThing(
            existing === null
              ? toPreferencesThing(url, created!, null)
              : withoutForeignShapedClasses(unlessNewer(existing), PREFERENCES_V6),
          ).removeAll(SM.connectedScreenSkipped);
          return {
            result: "written" as const,
            dataset: setThing(
              dataset ?? createSolidDataset(),
              (skipped ? subject.addBoolean(SM.connectedScreenSkipped, true) : subject).build(),
            ),
          };
        },
        true,
      );
    },
  };
}
