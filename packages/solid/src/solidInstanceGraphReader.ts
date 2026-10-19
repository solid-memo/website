// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { InstanceGraphReader } from "@solid-memo/application/ports";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import { getSolidDatasetOrNull } from "./datasets";
import { keyOf, quadsOf, termOf } from "./mappers/releaseDraftMapper";

/**
 * The InstanceGraphReader port over a Solid pod: a document's statements
 * as they are, read as every other pod read is (datasets.ts), so a
 * document the page read already is asked for with its ETag, and costs
 * a 304. It reads the document it is handed, and no other.
 */
export function createSolidInstanceGraphReader({
  fetch,
}: {
  fetch: typeof globalThis.fetch;
}): InstanceGraphReader {
  return {
    async readDocument(url) {
      const dataset = await getSolidDatasetOrNull(url, fetch);
      if (dataset === null) return null;
      return quadsOf(dataset).map(
        (quad): DraftTriple => ({
          subject: keyOf(quad.subject),
          predicate: quad.predicate.value,
          object: termOf(quad.object),
        }),
      );
    },
  };
}
