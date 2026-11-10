// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Dataset } from "./client/rdf";
import type { Since } from "@solid-memo/application/ports";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import { getSolidDatasetOrNull, readDatasetSince, UNCHANGED, versionOf } from "./datasets";

/**
 * The longest stored version that goes in a request. Servers refuse a
 * request whose headers are too long, and a read they refuse fails on
 * every visit. A pod's own ETags are far shorter.
 */
const MAX_SENT_VERSION_LENGTH = 512;

/** One entity tag (RFC 9110, entity-tag): optionally weak, quoted, of etagc characters. */
const ENTITY_TAG = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/;

/**
 * Whether a version can go in a request's If-None-Match: one entity tag
 * of a bounded length. A version read back from a digest, which anyone
 * may have written, need not be one: Headers throws on some values, a
 * server refuses a long one, and `*` matches any document there is.
 */
function isSendable(version: string | undefined): version is string {
  return (
    version !== undefined && version.length <= MAX_SENT_VERSION_LENGTH && ENTITY_TAG.test(version)
  );
}

/**
 * A document's dataset unless it is still at `version` (see Since): a
 * conditional read with the version known, a plain one without. A version
 * that cannot be sent (see isSendable), ABSENT_VERSION among them, counts
 * as none, so what the read gives replaces it.
 * A document there is none of is at ABSENT_VERSION, with a null dataset.
 */
export async function readSince(
  url: string,
  version: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<Since<Dataset | null>> {
  const read = isSendable(version)
    ? await readDatasetSince(url, version, fetch)
    : await getSolidDatasetOrNull(url, fetch);
  const unchanged = read === UNCHANGED || (read === null && version === ABSENT_VERSION);
  if (unchanged) return { unchanged: true };
  if (read === null) return { unchanged: false, value: null, version: ABSENT_VERSION };
  return { unchanged: false, value: read, version: versionOf(read) ?? null };
}

/** The values of a Since, mapped. */
export function mapSince<T, U>(since: Since<T>, map: (value: T) => U): Since<U> {
  return since.unchanged ? since : { ...since, value: map(since.value) };
}
