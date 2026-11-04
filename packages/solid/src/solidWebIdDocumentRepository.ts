// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { limitedFetch, PROFILE_LIMITS } from "./client/readLimits";
import { getSolidDataset } from "./client/resources";
import type { WebIdDocumentRepository } from "@solid-memo/application/ports";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { toWebIdDocument } from "./mappers/webIdDocumentMapper";

export interface SolidWebIdDocumentRepositoryDeps {
  fetch: typeof globalThis.fetch;
}

export function createSolidWebIdDocumentRepository({
  fetch,
}: SolidWebIdDocumentRepositoryDeps): WebIdDocumentRepository {
  // The WebID document is read under PROFILE_LIMITS, as the storage lookup reads it (solidStorageGateway.ts).
  const profileFetch = limitedFetch(fetch, PROFILE_LIMITS);
  return {
    async fetchWebIdDocument(webId): Promise<WebIdDocument> {
      const dataset = await getSolidDataset(webId, { fetch: profileFetch });
      return toWebIdDocument(dataset);
    },
  };
}
