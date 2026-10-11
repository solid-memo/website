// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  allSelected,
  nextSort,
  onlyAllowed,
  NO_SELECTION,
  rangeToggled,
  sortedRows,
  sortOf,
  stepCursor,
  toggled,
  visibleColumns,
  withColumn,
} from "./tableModel";

const keys = ["a", "b", "c", "d"];

describe("toggled", () => {
  it("selects rows, and selects none twice", () => {
    const one = toggled(NO_SELECTION, ["a"], true);
    expect([...one]).toEqual(["a"]);
    expect([...toggled(one, ["a", "b"], true)]).toEqual(["a", "b"]);
  });

  it("unselects rows, leaving the others selected", () => {
    expect([...toggled(new Set(keys), ["b", "d"], false)]).toEqual(["a", "c"]);
    expect([...toggled(NO_SELECTION, ["a"], false)]).toEqual([]);
  });
});

describe("rangeToggled", () => {
  it.each([
    [1, 3, ["b", "c", "d"]],
    [3, 1, ["b", "c", "d"]],
    [2, 2, ["c"]],
  ])("selects the rows from %s to %s, both in, either way round", (from, to, selected) => {
    expect([...rangeToggled(NO_SELECTION, keys, from, to, true)]).toEqual(selected);
  });

  it("unselects a range, keeping the rest", () => {
    expect([...rangeToggled(new Set(keys), keys, 0, 1, false)]).toEqual(["c", "d"]);
  });
});

describe("allSelected", () => {
  it.each([
    [["a", "b"], true],
    [["a", "c"], false],
    [[], false],
  ])("says whether %j are all selected: %s", (rows, all) => {
    expect(allSelected(new Set(["a", "b"]), rows)).toBe(all);
  });
});

describe("nextSort", () => {
  it("sorts by a column ascending, then descending, then not", () => {
    const up = nextSort(undefined, "due");
    expect(up).toEqual({ key: "due", descending: false });
    const down = nextSort(up, "due");
    expect(down).toEqual({ key: "due", descending: true });
    expect(nextSort(down, "due")).toBeUndefined();
  });

  it("sorts by another column ascending, from any sort", () => {
    expect(nextSort({ key: "due", descending: true }, "ease")).toEqual({
      key: "ease",
      descending: false,
    });
  });
});

describe("sortOf", () => {
  it.each([
    [undefined, "due", undefined],
    [{ key: "ease", descending: false }, "due", undefined],
    [{ key: "due", descending: false }, "due", "ascending"],
    [{ key: "due", descending: true }, "due", "descending"],
  ] as const)("says how %j sorts by %s: %s", (sort, key, said) => {
    expect(sortOf(sort, key)).toBe(said);
  });
});

describe("stepCursor", () => {
  it.each([
    [-1, 1, 0],
    [-1, -1, 0],
    [0, 1, 1],
    [3, 1, 3],
    [2, -1, 1],
    [0, -1, 0],
  ] as const)("goes from row %s a step of %s to %s, of four", (at, step, to) => {
    expect(stepCursor(at, 4, step)).toBe(to);
  });

  it("goes nowhere without rows", () => {
    expect(stepCursor(-1, 0, 1)).toBe(-1);
  });
});

describe("visibleColumns and withColumn", () => {
  const columns = [{ key: "front" }, { key: "back" }, { key: "due" }];

  it("shows every column but those hidden", () => {
    const hidden = withColumn(new Set(), "back", false);
    expect(visibleColumns(columns, hidden).map((column) => column.key)).toEqual(["front", "due"]);
    expect(visibleColumns(columns, withColumn(hidden, "back", true))).toEqual(columns);
  });
});

describe("onlyAllowed", () => {
  it("adds only the rows that can be selected, keeping those selected already", () => {
    const allowed = (key: string) => key !== "b" && key !== "d";
    expect([...onlyAllowed(new Set(["d"]), new Set(["a", "b", "c", "d"]), allowed)]).toEqual([
      "a",
      "c",
      "d",
    ]);
    expect([...onlyAllowed(new Set(["a", "d"]), new Set(["d"]), allowed)]).toEqual(["d"]);
  });
});

describe("sortedRows", () => {
  const rows = [
    { name: "Kanji 10", due: 3 },
    { name: "kanji 2", due: undefined },
    { name: "Basics", due: 3 },
    { name: "Ärende", due: 1 },
  ];
  const cellValue = (row: (typeof rows)[number], key: "name" | "due") => row[key];
  const names = (sorted: typeof rows) => sorted.map((row) => row.name);

  it("keeps the rows' own order without a sort", () => {
    const sorted = sortedRows(rows, undefined, cellValue, "en");
    expect(sorted).toEqual(rows);
    expect(sorted).not.toBe(rows);
  });

  it("sorts text as the reader's language does, case aside and numbers by value", () => {
    expect(names(sortedRows(rows, { key: "name", descending: false }, cellValue, "en"))).toEqual([
      "Ärende",
      "Basics",
      "kanji 2",
      "Kanji 10",
    ]);
    expect(names(sortedRows(rows, { key: "name", descending: false }, cellValue, "sv"))).toEqual([
      "Basics",
      "kanji 2",
      "Kanji 10",
      "Ärende",
    ]);
  });

  it("sorts numbers either way, ties in their own order and rows without a value last", () => {
    expect(names(sortedRows(rows, { key: "due", descending: false }, cellValue, "en"))).toEqual([
      "Ärende",
      "Kanji 10",
      "Basics",
      "kanji 2",
    ]);
    expect(names(sortedRows(rows, { key: "due", descending: true }, cellValue, "en"))).toEqual([
      "Kanji 10",
      "Basics",
      "Ärende",
      "kanji 2",
    ]);
    const none = [
      { name: "a", due: undefined },
      { name: "b", due: undefined },
    ];
    expect(names(sortedRows(none, { key: "due", descending: false }, cellValue, "en"))).toEqual([
      "a",
      "b",
    ]);
  });
});
