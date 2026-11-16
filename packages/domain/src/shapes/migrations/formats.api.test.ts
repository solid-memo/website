// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { MIGRATIONS } from "./index";

const KINDS = Object.keys(LATEST_VERSION) as ShapeName[];

/**
 * The kinds whose format moved before the formats were held where they
 * are (docs/vocab.md#versioning-policy), each with the format it is
 * written in for good. This list never grows: every other kind, one
 * added later included, is written in format 1.
 */
const MOVED: Partial<Record<ShapeName, number>> = {
  card: 7,
  deck: 6,
  deckSchedule: 2,
  instance: 2,
  libraryDeck: 6,
  libraryDeckSeries: 3,
  preferences: 6,
  reviewState: 2,
};

/**
 * The format this app writes each kind in, part of its public API
 * (docs/releasing.md#the-public-api). A format never moves: an older
 * version refuses to save over a format newer than its own, so a format
 * raised would shut every earlier version out of what a later one saved.
 * A line that goes fails `npm run check:breaking` whatever a commit
 * says, and a kind added starts at 1.
 */
it("keeps api/frozen/formats.txt to the formats written, which never move", async () => {
  expect(Object.fromEntries(KINDS.map((kind) => [kind, LATEST_VERSION[kind]]))).toEqual(
    Object.fromEntries(KINDS.map((kind) => [kind, MOVED[kind] ?? 1])),
  );
  const lines = KINDS.map((kind) => `${kind}: written in format ${LATEST_VERSION[kind]}`);
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../../api/frozen/formats.txt",
  );
});

/**
 * The oldest format of each kind this app still reads, part of its
 * public API too. A line that goes, a format no longer read, is a
 * breaking change, which `npm run check:breaking` holds to a commit that
 * says so.
 */
it("keeps api/formats.txt to the formats read", async () => {
  const lines = KINDS.map((kind) => {
    const oldest = Math.min(
      LATEST_VERSION[kind],
      ...MIGRATIONS.filter((step) => step.shape === kind).map((step) => step.from),
    );
    return `${kind}: read from format ${oldest}`;
  });
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../../api/formats.txt",
  );
});
