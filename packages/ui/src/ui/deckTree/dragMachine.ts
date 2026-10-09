import { hitTest, type GapHit, type Hit, type Layout } from "./dropZones";
import type { VisibleRow } from "./rows";

/**
 * A drag in the deck list, from the press to the drop, as plain state
 * the DOM side (useDragReorder.ts) feeds with what the pointer does.
 *
 * A press is only pending at first, so a tap still opens a deck and a
 * swipe still scrolls: a finger or pen lifts the row by holding still
 * for `LONG_PRESS_MS` (moving `TOUCH_SLOP_PX` first is a scroll, which
 * gives the press up); a mouse, which cannot scroll by dragging, lifts it
 * by moving `MOUSE_SLOP_PX` with the button down. Once lifted, each move
 * says where a drop would land (dropZones.ts), and a new group of two
 * waits for the pointer to stay on the other row for `COMBINE_DWELL_MS`,
 * so that passing over a row does not make one. Events of another
 * pointer than the one that pressed change nothing.
 */

export const LONG_PRESS_MS = 400;
export const TOUCH_SLOP_PX = 8;
export const MOUSE_SLOP_PX = 5;
export const COMBINE_DWELL_MS = 300;

/** A pointer's place on screen, in CSS pixels from the viewport's top left. */
export interface Point {
  x: number;
  y: number;
}

export type DragState =
  | { phase: "idle" }
  | { phase: "pending"; source: VisibleRow; pointerId: number; touch: boolean; origin: Point }
  | {
      phase: "dragging";
      source: VisibleRow;
      pointerId: number;
      pointer: Point;
      /** Measured once the list shows the drag; null until then. */
      layout: Layout | null;
      /** Null until the pointer moves with the list measured. */
      hit: Hit | null;
      /** The row a new group would be made with, and whether the pointer stayed on it long enough. */
      dwell: { target: string; armed: boolean } | null;
    };

export type DragInput =
  | { type: "press"; source: VisibleRow; pointerId: number; pointerType: string; point: Point }
  /** `y`: the pointer's distance from the top of the list. */
  | { type: "move"; pointerId: number; point: Point; y: number }
  /** The long press's time is up. */
  | { type: "hold" }
  | { type: "measured"; layout: Layout }
  /** The pointer stayed on `target` for `COMBINE_DWELL_MS`. */
  | { type: "dwell"; target: string }
  | { type: "release"; pointerId: number }
  | { type: "cancel" };

const IDLE: DragState = { phase: "idle" };

export function dragReducer(state: DragState, event: DragInput): DragState {
  switch (event.type) {
    case "press":
      if (state.phase !== "idle") return state;
      return {
        phase: "pending",
        source: event.source,
        pointerId: event.pointerId,
        touch: event.pointerType !== "mouse",
        origin: event.point,
      };
    case "move": {
      if (state.phase === "idle" || event.pointerId !== state.pointerId) return state;
      if (state.phase === "pending") {
        const distance = Math.hypot(event.point.x - state.origin.x, event.point.y - state.origin.y);
        if (state.touch) return distance > TOUCH_SLOP_PX ? IDLE : state;
        return distance >= MOUSE_SLOP_PX ? lifted(state, event.point) : state;
      }
      if (state.layout === null) return { ...state, pointer: event.point };
      const hit = hitTest(state.layout, event.y, state.source);
      const target = hit.kind === "combine" ? hit.target : null;
      const dwell =
        target === null ? null : state.dwell?.target === target ? state.dwell : { target, armed: false };
      return { ...state, pointer: event.point, hit, dwell };
    }
    case "hold":
      return state.phase === "pending" ? lifted(state, state.origin) : state;
    case "measured":
      return state.phase === "dragging" ? { ...state, layout: event.layout } : state;
    case "dwell":
      if (state.phase !== "dragging" || state.dwell?.target !== event.target) return state;
      return { ...state, dwell: { target: event.target, armed: true } };
    case "release":
      return state.phase !== "idle" && event.pointerId === state.pointerId ? IDLE : state;
    case "cancel":
      return IDLE;
  }
}

function lifted(state: Extract<DragState, { phase: "pending" }>, pointer: Point): DragState {
  return {
    phase: "dragging",
    source: state.source,
    pointerId: state.pointerId,
    pointer,
    layout: null,
    hit: null,
    dwell: null,
  };
}

/** What a drop would do: a place, a group to go into, or a new group with a row; null for nothing. */
export type DropTarget = GapHit | Extract<Hit, { kind: "into" }> | { kind: "combine"; target: string };

/** What dropping now would do. */
export function dropTarget(state: DragState): DropTarget | null {
  if (state.phase !== "dragging" || state.hit === null) return null;
  const { hit } = state;
  if (hit.kind === "combine") {
    if (state.dwell!.armed) return { kind: "combine", target: hit.target };
    return hit.fallback.kind === "gap" ? hit.fallback : null;
  }
  return hit.kind === "noop" ? null : hit;
}
