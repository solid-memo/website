// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset, toRdfJsDataset } from "@inrupt/solid-client";
import type { DatasetCore } from "@rdfjs/types";

/**
 * The Turtle document at `url`, read through `fetch` and parsed as the
 * app parses pod documents (@solid-memo/solid's client/resources.ts, on
 * the same library): the one place this package names a Solid client
 * library, which it may not reach through @solid-memo/solid.
 */
export async function readTurtleDocument(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<DatasetCore> {
  return toRdfJsDataset(await getSolidDataset(url, { fetch }));
}
