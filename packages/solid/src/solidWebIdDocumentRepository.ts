// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset } from "@inrupt/solid-client";
import type { WebIdDocumentRepository } from "@solid-memo/application/ports";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { toWebIdDocument } from "./mappers/webIdDocumentMapper";

export interface SolidWebIdDocumentRepositoryDeps {
  fetch: typeof globalThis.fetch;
}

export function createSolidWebIdDocumentRepository({
  fetch,
}: SolidWebIdDocumentRepositoryDeps): WebIdDocumentRepository {
  return {
    async fetchWebIdDocument(webId): Promise<WebIdDocument> {
      const dataset = await getSolidDataset(webId, { fetch });
      return toWebIdDocument(dataset);
    },
  };
}
