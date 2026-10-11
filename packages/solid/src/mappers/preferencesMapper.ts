// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { asUrl, type Thing, type ThingPersisted } from "@inrupt/solid-client";
import type { StoredPreferences, StudyPreferences } from "@solid-memo/domain/preferences";
import { preferencesFromRecord, preferencesToRecord } from "@solid-memo/domain/preferencesRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { PREFERENCES_V4 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/**
 * Map a preferences subject to what it stores; null when it is not an
 * sm:Preferences that fits its format's shape. A format-1 document may
 * lack any field: the migration fills in the defaults.
 */
export function toPreferences(thing: Thing): StoredPreferences | null {
  const read = readVersioned(thing, "preferences");
  if (read === null) return null;
  return {
    preferences: preferencesFromRecord(
      migrate("preferences", read.record, { subject: asUrl(thing) }),
    ),
    formatVersion: read.storedVersion,
  };
}

/** The preferences subject as this app writes it, in place when it exists. */
export function toPreferencesThing(
  url: string,
  preferences: StudyPreferences,
  existing: ThingPersisted | null,
): ThingPersisted {
  return recordThing(url, PREFERENCES_V4, preferencesToRecord(preferences), existing);
}
