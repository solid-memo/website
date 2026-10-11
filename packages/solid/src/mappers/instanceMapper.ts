// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { asUrl, type Thing, type ThingPersisted } from "@inrupt/solid-client";
import type { Instance, InstanceMeta } from "@solid-memo/domain/instance";
import { ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";
import { instanceMetaFromRecord, instanceMetaToRecord } from "@solid-memo/domain/instanceRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { INSTANCE_V2 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";
import type { InstanceRegistration } from "../typeIndex";
import { lastPathSegment } from "../urls";

/**
 * A registration's display name is its dcterms:title, falling back to the
 * container's last path segment.
 */
export function toInstance(registration: InstanceRegistration): Instance {
  const url = ensureTrailingSlash(registration.containerUrl);
  return {
    url,
    name: registration.title ?? lastPathSegment(url),
  };
}

/** The meta document's subject as an InstanceMeta; null when it does not fit. */
export function toInstanceMeta(thing: Thing): InstanceMeta | null {
  const read = readVersioned(thing, "instance");
  if (read === null) return null;
  return instanceMetaFromRecord(
    read.storedVersion,
    migrate("instance", read.record, { subject: asUrl(thing) }),
  );
}

/** The meta subject as this app writes it, in place when it exists. */
export function toInstanceMetaThing(
  url: string,
  meta: InstanceMeta,
  existing: ThingPersisted | null,
): ThingPersisted {
  return recordThing(url, INSTANCE_V2, instanceMetaToRecord(meta), existing);
}
