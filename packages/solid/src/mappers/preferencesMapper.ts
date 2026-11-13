// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type NamedSubject, type Subject, asUrl, getInteger, getTermAll } from "../client/rdf";
import type { StoredPreferences, StudyPreferences } from "@solid-memo/domain/preferences";
import { preferencesFromRecord, preferencesToRecord } from "@solid-memo/domain/preferencesRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { PREFERENCES_V6, SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { readVersioned, recordThing } from "../records";
import { SM } from "../vocab";

/**
 * Map a preferences subject to what it stores; null when it is not an
 * sm:Preferences that fits its format's shape. A format-1 document may
 * lack any field: the migration fills in the defaults. So null too
 * when its format version is there but not an integer, or when it
 * holds a value only a later format has: read as the older format, the
 * migration would put the defaults in that value's place.
 */
export function toPreferences(thing: Subject): StoredPreferences | null {
  const formatVersions = getTermAll(thing, SM.formatVersion);
  if (formatVersions.length > 0 && getInteger(thing, SM.formatVersion) === null) return null;
  const read = readVersioned(thing, "preferences");
  if (read === null || hasValuesOfALaterFormat(thing, read.record.version)) return null;
  return {
    preferences: preferencesFromRecord(
      migrate("preferences", read.record, { subject: asUrl(thing) }),
    ),
    formatVersion: read.storedVersion,
  };
}

/** Whether the subject holds a value for a field the latest format has and the given one does not. */
function hasValuesOfALaterFormat(thing: Subject, version: number): boolean {
  const shapes: Record<number, ShapeDescriptor> = SHAPES.preferences;
  const own = new Set(shapes[version].fields.map((field) => field.predicate));
  return PREFERENCES_V6.fields.some(
    (field) => !own.has(field.predicate) && getTermAll(thing, field.predicate).length > 0,
  );
}

/**
 * The preferences subject as this app writes it, in place when it
 * exists: what no shape owns, sm:connectedScreenSkipped among it, is
 * kept as stored.
 */
export function toPreferencesThing(
  url: string,
  preferences: StudyPreferences,
  existing: NamedSubject | null,
): NamedSubject {
  return recordThing(url, PREFERENCES_V6, preferencesToRecord(preferences), existing);
}
