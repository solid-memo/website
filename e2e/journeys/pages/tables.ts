// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Locator } from "@playwright/test";

/**
 * A row's cell under a column of its table, the column found by its
 * header's text (as written, not as CSS draws it: neither upper case nor
 * a sort's arrow), not by where it stands, so a column added or moved
 * leaves the lookup alone. The row's own header counts among its cells,
 * as its column's header does.
 */
export async function cellOf(table: Locator, row: Locator, column: string): Promise<Locator> {
  const headers = table.getByRole("columnheader");
  await headers.first().waitFor();
  const read = (await headers.allTextContents()).map((text) => text.trim());
  const at = read.indexOf(column);
  if (at === -1) throw new Error(`No column ${column} among ${read.join(", ")}`);
  return row.getByRole("rowheader").or(row.getByRole("cell")).nth(at);
}
