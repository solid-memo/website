// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createSolidDataset } from "./client/rdf";
import type { PaletteRepository } from "@solid-memo/application/ports/pod";
import { isPaletteOf, palettesUrlOf } from "@solid-memo/domain/instanceLayout";
import { editDocument, getSolidDatasetOrNull } from "./datasets";
import { toPalettes, withPalette } from "./mappers/paletteMapper";
import { noWriteCheck, type WriteCheck } from "./writeCheck";

export interface SolidPaletteRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

/** The palettes the user designed, in each instance's `palettes.ttl` (docs/data-model.md). */
export function createSolidPaletteRepository({
  fetch,
  checkWrite = noWriteCheck,
}: SolidPaletteRepositoryDeps): PaletteRepository {
  return {
    async listPalettes(instanceUrl) {
      const documentUrl = palettesUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(documentUrl, fetch);
      return dataset === null ? [] : toPalettes(dataset, documentUrl);
    },

    async savePalette(instanceUrl, palette) {
      const documentUrl = palettesUrlOf(instanceUrl);
      // A palette is written in its instance's palettes document and nowhere else.
      if (!isPaletteOf(instanceUrl, palette.url))
        throw new Error(`Not a palette of ${instanceUrl}: ${palette.url}`);
      // An edit made once (editDocument): a palette as shown is not written again over what changed elsewhere.
      await editDocument(
        documentUrl,
        fetch,
        (read) => {
          const { dataset, subjects } = withPalette(
            read ?? createSolidDataset(),
            documentUrl,
            palette,
          );
          // One PUT of the whole document, If-Match the read: a name may hold characters beyond
          // ASCII, which Community Solid Server's in-memory store cuts short in a PATCH (datasets.ts).
          return { dataset, subjects, whole: true, result: undefined };
        },
        { checkWrite, attempts: 1 },
      );
    },
  };
}
