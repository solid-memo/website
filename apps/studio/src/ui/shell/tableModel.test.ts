import { describe, expect, it } from "vitest";
import {
  allSelected,
  nextSort,
  NO_SELECTION,
  rangeToggled,
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
    expect(nextSort({ key: "due", descending: true }, "ease")).toEqual({ key: "ease", descending: false });
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
