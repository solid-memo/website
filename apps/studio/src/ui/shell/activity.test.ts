// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { ACTIVITY_LIMIT, addActivity, type ActivityEntry } from "./activity";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 11, 9, minute));

describe("addActivity", () => {
  it("puts what was done first, as a line of its own", () => {
    const entries = addActivity(
      addActivity([], "Draft saved", at(0), 0),
      "Moved 3 cards.",
      at(1),
      1,
    );
    expect(entries).toEqual([
      { id: 1, at: at(1), text: "Moved 3 cards.", count: 1 },
      { id: 0, at: at(0), text: "Draft saved", count: 1 },
    ]);
  });

  it("counts what is said again just after itself on the last line, at the time it was said last", () => {
    let entries: ActivityEntry[] = [];
    for (let n = 0; n < 5; n++) entries = addActivity(entries, "Draft saved", at(n), n);
    expect(entries).toEqual([{ id: 0, at: at(4), text: "Draft saved", count: 5 }]);
    // Said again after another line: a line of its own.
    entries = addActivity(
      addActivity(entries, "Moved 3 cards.", at(5), 5),
      "Draft saved",
      at(6),
      6,
    );
    expect(entries.map((entry) => [entry.text, entry.count])).toEqual([
      ["Draft saved", 1],
      ["Moved 3 cards.", 1],
      ["Draft saved", 5],
    ]);
  });

  it("keeps the last lines only", () => {
    let entries: ActivityEntry[] = [];
    for (let n = 0; n <= ACTIVITY_LIMIT; n++) entries = addActivity(entries, `Line ${n}`, at(0), n);
    expect(entries).toHaveLength(ACTIVITY_LIMIT);
    expect(entries[0]!.text).toBe(`Line ${ACTIVITY_LIMIT}`);
    expect(entries.at(-1)!.text).toBe("Line 1");
  });
});
