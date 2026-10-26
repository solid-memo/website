// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createSolidDataset } from "./client/rdf";
import type { PaletteRepository } from "@solid-memo/application/ports";
import { isPaletteOf, palettesUrlOf } from "@solid-memo/domain/instanceLayout";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
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
      const dataset = (await getSolidDatasetOrNull(documentUrl, fetch)) ?? createSolidDataset();
      const { dataset: updated, subjects } = withPalette(dataset, documentUrl, palette);
      await checkWrite(updated, subjects, "pod");
      // One PUT of the whole document, If-Match the read above: a name may hold characters beyond
      // ASCII, which Community Solid Server's in-memory store cuts short in a PATCH (datasets.ts).
      await saveDataset(documentUrl, updated, fetch, { whole: true });
    },
  };
}
