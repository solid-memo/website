// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { MIGRATIONS } from "./index";

/**
 * The formats this app writes and reads, part of its public API
 * (docs/releasing.md#the-public-api): for each kind, the format version
 * it writes, and the oldest it still reads. A line that goes, a format
 * written that rises or one no longer read, is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/formats.txt to the formats written and read", async () => {
  const lines = (Object.keys(LATEST_VERSION) as ShapeName[]).flatMap((kind) => {
    const oldest = Math.min(
      LATEST_VERSION[kind],
      ...MIGRATIONS.filter((step) => step.shape === kind).map((step) => step.from),
    );
    return [
      `${kind}: written in format ${LATEST_VERSION[kind]}`,
      `${kind}: read from format ${oldest}`,
    ];
  });
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../../api/formats.txt",
  );
});
