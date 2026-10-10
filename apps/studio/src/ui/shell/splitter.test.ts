import { describe, expect, it } from "vitest";
import { ASIDE_WIDTH, clampSize, DETAIL_WIDTH, DOCK_HEIGHT, draggedSize, SPLITTER_STEP, splitterKey } from "./splitter";

const size = { min: 100, max: 300, initial: 200 };

describe("clampSize", () => {
  it.each([
    [50, 100],
    [100, 100],
    [150.4, 150],
    [300, 300],
    [900, 300],
  ])("keeps %s within the bounds as %s", (value, kept) => {
    expect(clampSize(value, size)).toBe(kept);
  });

  it("starts each pane within its bounds", () => {
    for (const pane of [ASIDE_WIDTH, DETAIL_WIDTH, DOCK_HEIGHT]) expect(clampSize(pane.initial, pane)).toBe(pane.initial);
  });
});

describe("splitterKey", () => {
  it.each([
    ["ArrowLeft", "vertical", 200 + SPLITTER_STEP],
    ["ArrowRight", "vertical", 200 - SPLITTER_STEP],
    ["ArrowUp", "horizontal", 200 + SPLITTER_STEP],
    ["ArrowDown", "horizontal", 200 - SPLITTER_STEP],
    ["Home", "vertical", 100],
    ["End", "horizontal", 300],
    ["ArrowUp", "vertical", null],
    ["ArrowLeft", "horizontal", null],
    ["Enter", "vertical", null],
  ] as const)("gives %s on a %s splitter the size %s", (key, orientation, sized) => {
    expect(splitterKey(key, orientation, 200, size)).toBe(sized);
  });

  it("goes no further than the bounds", () => {
    expect(splitterKey("ArrowLeft", "vertical", 295, size)).toBe(300);
    expect(splitterKey("ArrowDown", "horizontal", 105, size)).toBe(100);
  });
});

describe("draggedSize", () => {
  it("grows as the pointer moves towards the start, and shrinks as it moves away, within the bounds", () => {
    expect(draggedSize(200, 500, 450, size)).toBe(250);
    expect(draggedSize(200, 500, 560, size)).toBe(140);
    expect(draggedSize(200, 500, 0, size)).toBe(300);
    expect(draggedSize(200, 500, 900, size)).toBe(100);
  });
});
