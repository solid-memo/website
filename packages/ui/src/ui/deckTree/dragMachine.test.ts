import { describe, expect, it } from "vitest";
import {
  COMBINE_DWELL_MS,
  LONG_PRESS_MS,
  MOUSE_SLOP_PX,
  TOUCH_SLOP_PX,
  dragReducer,
  dropTarget,
  type DragInput,
  type DragState,
} from "./dragMachine";
import type { Layout, MeasuredRow } from "./dropZones";
import type { VisibleRow } from "./rows";

const row = (key: string, kind: VisibleRow["kind"], before: string | null): VisibleRow => ({
  key,
  kind,
  depth: 0,
  parent: null,
  ancestors: [],
  before,
  collapsed: false,
  last: null,
});
const measured = (visible: VisibleRow, top: number): MeasuredRow => ({ ...visible, top, bottom: top + 40 });

/** A 0-40; G 48-88 (an empty group, folded shut); S 96-136, dragged. */
const source = row("S", "deck", "G");
const layout: Layout = {
  rows: [measured(row("A", "deck", null), 0), measured({ ...row("G", "group", "A"), collapsed: true }, 48)],
  hole: { top: 96, bottom: 136 },
};

const run = (...events: DragInput[]) => events.reduce(dragReducer, { phase: "idle" } as DragState);
const press = (pointerType: string, pointerId = 1): DragInput => ({
  type: "press",
  source,
  pointerId,
  pointerType,
  point: { x: 100, y: 100 },
});
const move = (x: number, y: number, pointerId = 1): DragInput => ({ type: "move", pointerId, point: { x, y }, y });
const lifted = (...events: DragInput[]) => run(press("touch"), { type: "hold" }, { type: "measured", layout }, ...events);

describe("dragReducer", () => {
  it("lifts a finger's or pen's row after a long press, where it was pressed", () => {
    expect(LONG_PRESS_MS).toBe(400);
    const pending = run(press("touch"));
    expect(pending).toEqual({ phase: "pending", source, pointerId: 1, touch: true, origin: { x: 100, y: 100 } });
    expect(run(press("pen"), move(100 + TOUCH_SLOP_PX, 100), { type: "hold" })).toMatchObject({
      phase: "dragging",
      pointer: { x: 100, y: 100 },
      layout: null,
      hit: null,
    });
  });

  it("gives a finger's press up when it moves first: that is a scroll", () => {
    expect(run(press("touch"), move(100, 100 + TOUCH_SLOP_PX + 1))).toEqual({ phase: "idle" });
    expect(run(press("touch"), move(100, 109), { type: "hold" })).toEqual({ phase: "idle" });
  });

  it("lifts a mouse's row once it moves far enough with the button down, and never by holding", () => {
    expect(run(press("mouse"), move(100, 100 + MOUSE_SLOP_PX - 1))).toMatchObject({ phase: "pending", touch: false });
    expect(run(press("mouse"), move(103, 104))).toMatchObject({ phase: "dragging", pointer: { x: 103, y: 104 } });
  });

  it("ignores another pointer, and a second press", () => {
    const pending = run(press("touch"));
    expect(dragReducer(pending, move(300, 300, 2))).toBe(pending);
    expect(dragReducer(pending, press("touch", 2))).toBe(pending);
    expect(dragReducer(pending, { type: "release", pointerId: 2 })).toBe(pending);
    const dragging = lifted();
    expect(dragReducer(dragging, move(300, 300, 2))).toBe(dragging);
  });

  it("does nothing while idle, nor measures or arms before it drags", () => {
    const idle = run();
    for (const event of [move(1, 1), { type: "hold" }, { type: "measured", layout }, { type: "release", pointerId: 1 }] as DragInput[]) {
      expect(dragReducer(idle, event)).toBe(idle);
    }
    const pending = run(press("touch"));
    expect(dragReducer(pending, { type: "measured", layout })).toBe(pending);
    expect(dragReducer(pending, { type: "dwell", target: "A" })).toBe(pending);
    expect(dragReducer(lifted(), { type: "hold" })).toEqual(lifted());
  });

  it("follows the pointer before the list is measured, aiming nowhere yet", () => {
    expect(run(press("touch"), { type: "hold" }, move(5, 6))).toMatchObject({ pointer: { x: 5, y: 6 }, hit: null });
  });

  it("aims at where a drop would land once measured", () => {
    expect(lifted(move(0, 44))).toMatchObject({
      hit: { kind: "gap", to: { parent: null, after: "A" } },
      dwell: null,
    });
    expect(dropTarget(lifted(move(0, 44)))).toMatchObject({ kind: "gap", to: { parent: null, after: "A" } });
  });

  it("makes a new group only once the pointer has stayed on the row", () => {
    expect(COMBINE_DWELL_MS).toBe(300);
    const over = lifted(move(0, 25));
    expect(over).toMatchObject({ hit: { kind: "combine", target: "A" }, dwell: { target: "A", armed: false } });
    // Till then, the gap on the nearer side.
    expect(dropTarget(over)).toMatchObject({ kind: "gap", to: { parent: null, after: "A" } });
    const armed = dragReducer(over, { type: "dwell", target: "A" });
    expect(dropTarget(armed)).toEqual({ kind: "combine", target: "A" });
    // Still on the row: still armed.
    expect(dragReducer(armed, move(0, 22))).toMatchObject({ dwell: { target: "A", armed: true } });
    // Off it and back: from the start again.
    expect(dragReducer(dragReducer(armed, move(0, 44)), move(0, 22))).toMatchObject({ dwell: { target: "A", armed: false } });
  });

  it("does not arm a row the pointer has left", () => {
    const left = lifted(move(0, 25), move(0, 44));
    expect(dragReducer(left, { type: "dwell", target: "A" })).toBe(left);
  });

  it("aims at nothing over the row's own place, or over a row's half by it", () => {
    expect(dropTarget(lifted(move(0, 100)))).toBeNull();
    // G folded shut, with S right after it: under G is where S is.
    expect(dropTarget(lifted(move(0, 80)))).toBeNull();
  });

  it("drops into a group by its header", () => {
    const header = lifted(move(0, 64));
    expect(dropTarget(header)).toEqual({ kind: "into", group: "G", to: { parent: "G", after: null } });
  });

  it("ends on a release or a cancel", () => {
    expect(dragReducer(lifted(), { type: "release", pointerId: 1 })).toEqual({ phase: "idle" });
    expect(dragReducer(run(press("mouse")), { type: "cancel" })).toEqual({ phase: "idle" });
    expect(dropTarget(run())).toBeNull();
    expect(dropTarget(run(press("touch")))).toBeNull();
    expect(dropTarget(lifted())).toBeNull();
  });
});
