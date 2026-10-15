// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { readTurtleTree } from "@solid-memo/turtle/rdf";
import { expect, it } from "vitest";
import { NS_ROOT, VOCAB_ROOT } from "./root.ts";
import { SHAPES_BASE, SITE, SITE_VENDOR } from "./sources.ts";

/**
 * Every document the site publishes from ns/ and vendor/, part of the
 * public API (docs/releasing.md#the-public-api): a published address
 * keeps answering, so none of these lines ever goes, whatever a commit
 * says (`npm run check:breaking`). A shape's line holds its hash as
 * well, since a published shape is never edited: a change to it is the
 * shape's next version. The vocabulary's own documents only grow, as
 * api/frozen/vocab.txt holds them to; the vendored ones are replaced with
 * upstream's, byte for byte (vendor/README.md). The library's decks are
 * held by `npm run library:check -- --base` (docs/deck-library.md).
 */
it("keeps api/frozen/published.txt to the documents published", async () => {
  const folders = [
    [`${SITE}ns/`, NS_ROOT],
    [SITE_VENDOR, `${VOCAB_ROOT}vendor/`],
  ] as const;
  const lines = (
    await Promise.all(
      folders.map(async ([address, dir]) =>
        (
          await readTurtleTree(dir)
        ).map(({ path, turtle }) => {
          const iri = `${address}${path}`;
          return iri.startsWith(SHAPES_BASE)
            ? `${iri} sha256:${createHash("sha256").update(turtle).digest("hex")}`
            : iri;
        }),
      ),
    )
  ).flat();
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../api/frozen/published.txt",
  );
});
