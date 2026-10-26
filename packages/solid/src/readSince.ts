// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Dataset } from "./client/rdf";
import type { Since } from "@solid-memo/application/ports";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import { getSolidDatasetOrNull, readDatasetSince, UNCHANGED, versionOf } from "./datasets";

/**
 * A document's dataset unless it is still at `version` (see Since): a
 * conditional read with the version known, a plain one without. A
 * document there is none of is at ABSENT_VERSION, with a null dataset.
 */
export async function readSince(
  url: string,
  version: string | undefined,
  fetch: typeof globalThis.fetch,
): Promise<Since<Dataset | null>> {
  const read =
    version === undefined || version === ABSENT_VERSION
      ? await getSolidDatasetOrNull(url, fetch)
      : await readDatasetSince(url, version, fetch);
  const unchanged = read === UNCHANGED || (read === null && version === ABSENT_VERSION);
  if (unchanged) return { unchanged: true };
  if (read === null) return { unchanged: false, value: null, version: ABSENT_VERSION };
  return { unchanged: false, value: read, version: versionOf(read) ?? null };
}

/** The values of a Since, mapped. */
export function mapSince<T, U>(since: Since<T>, map: (value: T) => U): Since<U> {
  return since.unchanged ? since : { ...since, value: map(since.value) };
}
