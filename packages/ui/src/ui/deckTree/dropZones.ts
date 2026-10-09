import type { Anchor, ParentId } from "@solid-memo/domain/deckTree";
import type { VisibleRow } from "./rows";

/**
 * Where a dragged deck or group would land, from how far down the list
 * the pointer is, by the user's rules (the table in dropZones.test.ts
 * states them one by one). Only the height counts, not how
 * far right the pointer is: a finger stays in the middle of a row.
 *
 * Each row has three bands: its top quarter means the gap above it, its
 * bottom quarter the gap below it, and its middle an action on the row
 * itself. On a deck, that is a new group of the two (once the pointer has
 * stayed there a moment, see dragMachine.ts; till then, the gap on the
 * nearer side). On a group's header, a deck goes into the group, at its
 * end, and a group makes a new group of the two, as on a deck; on the
 * header of a group the dragged one is in, there is nothing to do there,
 * so its halves are the gaps above and below.
 *
 * A gap between two rows can mean several places when groups end there:
 * from "last in the innermost group" to "after the outermost one that
 * ends". It is cut into as many slices, top to bottom, the top one
 * staying in the innermost group. Under the list's last row, each
 * `EXIT_STEP_PX` further down is one group further out. Right under an
 * open group's header is its first place; under one folded shut, the
 * place after it, as what it holds is not to be seen.
 */

/** The share of a row's height, at its top and its bottom, that means the gap beside it. */
export const EDGE_BAND = 0.25;

/** How far below the list's last row each group further out begins. */
export const EXIT_STEP_PX = 20;

/** Half the space between rows: where the line goes above the first row or below the last. */
const HALF_GAP_PX = 4;

/** A row where it is on screen, in pixels from the top of the list. */
export interface MeasuredRow extends VisibleRow {
  top: number;
  bottom: number;
}

/**
 * The rows a drop can be aimed at, as measured when the drag began: all
 * but the dragged deck or group and what it holds, whose rows together
 * are the `hole` it left.
 */
export interface Layout {
  rows: readonly MeasuredRow[];
  hole: { top: number; bottom: number };
}

/** Which group a line between rows stands for, as its label says: "in {group}" or "after {group}". */
export interface GapLabel {
  kind: "in" | "after";
  group: string;
}

/** A place between rows, drawn as a line at `y`, indented `depth` levels. */
export interface GapHit {
  kind: "gap";
  to: Anchor;
  depth: number;
  y: number;
  label: GapLabel | null;
}

/** Nothing would change: the deck or group is over its own place. */
export interface NoopHit {
  kind: "noop";
}

export type Hit =
  | GapHit
  | NoopHit
  /** Into a group, at its end. */
  | { kind: "into"; group: string; to: Anchor }
  /** A new group of the two, once armed; till then `fallback`. */
  | { kind: "combine"; target: string; fallback: GapHit | NoopHit };

const NOOP: NoopHit = { kind: "noop" };

function band(row: MeasuredRow): number {
  return (row.bottom - row.top) * EDGE_BAND;
}

/** What a drop of `source` would do with the pointer `y` pixels from the top of the list. */
export function hitTest(layout: Layout, y: number, source: VisibleRow): Hit {
  const { rows, hole } = layout;
  if (rows.length === 0 || (y >= hole.top && y < hole.bottom)) return NOOP;

  /** The place `depth` levels in, right under rows[at] (above the first row when `at` is -1). */
  function gap(at: number): GapHit | NoopHit {
    const a = rows[at];
    if (a === undefined) return place({ parent: null, after: null }, 0, rows[0]!.top - HALF_GAP_PX, null);
    const b = rows[at + 1];
    const deepest = a.kind === "group" && !a.collapsed ? a.depth + 1 : a.depth;
    const shallowest = b?.depth ?? 0;
    let depth: number;
    if (b === undefined) {
      depth = Math.max(shallowest, deepest - Math.floor(Math.max(0, y - a.bottom) / EXIT_STEP_PX));
    } else {
      const top = a.bottom - band(a);
      const levels = deepest - shallowest + 1;
      const slice = Math.floor(((y - top) / (b.top + band(b) - top)) * levels);
      depth = deepest - Math.min(levels - 1, Math.max(0, slice));
    }
    // The places under `a`: after it or a group it is in, or (a level deeper) first in it.
    const chain: (string | null)[] = [...a.ancestors, ...(a.kind === "slot" ? [] : [a.key]), null];
    const parent: ParentId = depth === 0 ? null : chain[depth - 1]!;
    const after = chain[depth]!;
    const label: GapLabel | null =
      after !== null && (after !== a.key || a.kind === "group")
        ? { kind: "after", group: after }
        : parent !== null
          ? { kind: "in", group: parent }
          : null;
    return place({ parent, after }, depth, b === undefined ? a.bottom + HALF_GAP_PX : (a.bottom + b.top) / 2, label);
  }

  function place(to: Anchor, depth: number, lineY: number, label: GapLabel | null): GapHit | NoopHit {
    if (to.parent === source.parent && to.after === source.before) return NOOP;
    return { kind: "gap", to, depth, y: lineY, label };
  }

  const at = rows.findIndex((row) => y < row.bottom);
  if (at === -1) return gap(rows.length - 1);
  const row = rows[at]!;
  if (y < row.top + band(row)) return gap(at - 1);
  if (y >= row.bottom - band(row)) return gap(at);
  // An empty group's slot means its first place, all but its bottom band.
  if (row.kind === "slot") return gap(at - 1);
  const nearer = y < (row.top + row.bottom) / 2 ? gap(at - 1) : gap(at);
  if (row.kind === "group" && source.ancestors.includes(row.key)) return nearer;
  if (row.kind === "group" && source.kind === "deck") {
    return { kind: "into", group: row.key, to: { parent: row.key, after: row.last } };
  }
  return { kind: "combine", target: row.key, fallback: nearer };
}

/** How near the viewport's top or bottom the list scrolls by itself while dragging. */
export const SCROLL_EDGE_PX = 56;

/** How far it scrolls in a frame at most, with the pointer at the very edge. */
export const SCROLL_MAX_PX = 18;

/**
 * How far to scroll the page this frame with the pointer at `clientY` in
 * a viewport `height` pixels tall: up (negative) near its top, down near
 * its bottom, faster the nearer the edge, and not at all elsewhere.
 */
export function scrollStep(clientY: number, height: number): number {
  const push = (into: number) => SCROLL_MAX_PX * Math.min(Math.max(into, 0) / SCROLL_EDGE_PX, 1) ** 2;
  return push(clientY - (height - SCROLL_EDGE_PX)) - push(SCROLL_EDGE_PX - clientY);
}
