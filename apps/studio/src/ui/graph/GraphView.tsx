// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An instance graph drawn: Preact's own SVG, its nodes where the layout
 * put them and its edges along the routes it gave (layout.ts), and moved
 * and zoomed by hand, never with a library's DOM code (d3-zoom writes
 * HTML, which the build refuses). It is drawn to be quick at thousands of
 * nodes: the edges are a path for each kind, the routes worked out by the
 * layout and a part many share drawn once, the nodes an element each,
 * and both layers are made once for what is shown. Moving or zooming
 * changes one transform, on the group that holds them, and one CSS
 * property on the edges' groups (--graph-line), for their lines to stay
 * a pixel wide, and draws neither again: non-scaling-stroke would keep
 * them so, but thousands of curves drawn so are slow at every frame in
 * some browsers. The nodes, their rings
 * and their names stay the same size on the screen at any zoom, zooming
 * in spreading them apart: once a move or a zoom has settled, one CSS
 * property on the drawing (--graph-shape) scales every shape about its
 * own middle, and the names are drawn again at their size. The nodes are
 * named then, those in sight alone, and only while there are few enough
 * of them to read (LABELS_AT_MOST): the node selected and its neighbors
 * first, then folders and documents, decks and the rest, each name left
 * out that would overlap one before (placeLabels). A label's length is
 * counted in characters, never measured.
 *
 * The edges bundled along the tree, not its own, are drawn under it and
 * paler (--graph-bundle-ink, on their layer alone, in a few steps, for a
 * zoom to restyle them seldom), the more so the further in, as they
 * spread apart, and the more of them there are (BUNDLES_FULL); a part
 * of many the wider (ROPES). The edges to
 * vocabulary terms are not drawn all together: there are thousands, to a
 * few terms, and they would cover the drawing. Those of the node selected
 * are, and all of those of the node pointed at or gone to by the
 * keyboard, in full over the bundles, unless it is a term itself; a term
 * selected has all of its own drawn, in one faint path under the nodes. Each node's edges
 * are looked up, never searched for, so selecting one is as quick as it
 * has edges. Folders and documents in sight are named at any zoom: they
 * are few. A plot resized is measured again, as a zoom is, once it is
 * still.
 *
 * A node's shape says its kind, its color only helps: a folder a rounded
 * square, a document a square (dashed when there was none), a resource a
 * dot, a vocabulary term a small square, a leaf in the pod a diamond, one
 * outside it a hollow dashed ring, an IRI found in no document a crossed
 * ring.
 *
 * The drawing is one tab stop, as a chart is (usePoint): the arrow keys
 * go to the nearest node that way, Home and End to the first and the
 * last, Enter opens the node in the aside (`onSelect`), Escape lets go;
 * a click on a node selects it, and one on the background, not ending a
 * drag, lets go of the node selected;
 * +, − and 0 zoom in, out and back to the whole graph, as the buttons
 * beside it do. A node reached by the keyboard is read out in a status
 * line, and brought into sight.
 */

import type { ComponentChildren } from "preact";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GraphEdge, GraphNode } from "@solid-memo/domain/instanceGraph";
import { Inspector } from "@solid-memo/ui/charts/Inspector";
import { useI18n } from "@solid-memo/ui/i18n";
import {
  DIRECTIONS,
  drawnLabel,
  labelOrder,
  labelRank,
  nearestInDirection,
  placeLabels,
} from "./graphModel";
import type { Point, Positions, Routes } from "./layout";

/** The part of the drawing in sight is at most this wide, in its units, before the nodes in it are labelled. */
export const LABEL_SPAN = 800;
/** The most nodes in sight that are labelled: more would overlap past reading, and slow every zoom. */
export const LABELS_AT_MOST = 400;
/** How long a move or a zoom is still before the labels in sight follow it, in milliseconds. */
export const SETTLE_MS = 120;
/** How much a key or a button zooms by. */
const ZOOM_STEP = 1.5;
/** How far the drawing may be zoomed out and in. */
const ZOOM_RANGE = { least: 0.5, most: 400 };
/** How far a pointer moves before a press is a drag, not a click, in pixels. */
const DRAG_PIXELS = 3;
/** The space about the nodes, in the drawing's units. */
const MARGIN = 24;
/** How many pixels a unit of a node's shape is drawn on the screen, at any zoom. */
export const NODE_PIXELS = 0.75;
/** A label's size on the screen, in pixels, at any zoom. */
export const LABEL_PIXELS = 12;
/** How many of a term's own edges are drawn in their full color; past it, the paler, for thousands not to hide the nodes. */
const HUB_EDGES_FULL = 300;
/** How pale a term's own edges are drawn at the most: this much of their color, the rest the background's. */
const HUB_INK_LEAST = 0.3;
/** How much of their color the bundled edges are drawn in, the whole graph in sight, and the least, zoomed far in. */
const BUNDLE_INK = 0.4;
const BUNDLE_INK_LEAST = 0.12;
/** The steps BUNDLE_INK goes down by as the zoom grows: a few, for a zoom to restyle the bundles seldom. */
const BUNDLE_INK_STEP = 0.04;
/** How many bundled edges are drawn in BUNDLE_INK; past it, the paler, for tens of thousands not to fill the drawing. */
const BUNDLES_FULL = 5000;
/** No edges, to draw none. */
const NONE: readonly GraphEdge[] = [];

/** The drawing's own box: all its nodes, and a margin. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How the drawing is moved and zoomed: a point of it at `x`, `y` in its box, `k` times as large. */
interface View {
  x: number;
  y: number;
  k: number;
}

const WHOLE: View = { x: 0, y: 0, k: 1 };

/**
 * A view settled, how many of the drawing's units a pixel was then, and
 * the part of the drawing's units the plot showed, unmoved: the box, and
 * the space beside it where the plot is wider or higher than it (1, and
 * the box, while the plot had no size).
 */
interface Settled {
  view: View;
  units: number;
  sight: Box;
}

/** The box of `positions`; a small one of none. */
function boxOf(positions: Positions): Box {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of positions.values()) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (left === Infinity) return { x: 0, y: 0, width: 100, height: 100 };
  return {
    x: left - MARGIN,
    y: top - MARGIN,
    width: right - left + 2 * MARGIN,
    height: bottom - top + 2 * MARGIN,
  };
}

const transformOf = (view: View) => `translate(${view.x} ${view.y}) scale(${view.k})`;

/** How many of the box's units a pixel of `svg` is, and where its drawing starts on the page; null while it has no size. */
function scaleOf(
  svg: SVGSVGElement,
  box: Box,
): { units: number; left: number; top: number } | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scale = Math.min(rect.width / box.width, rect.height / box.height);
  return {
    units: 1 / scale,
    left: rect.left + (rect.width - box.width * scale) / 2,
    top: rect.top + (rect.height - box.height * scale) / 2,
  };
}

/** Whether two settled views are the same, for a settling that changes nothing to draw nothing again. */
const sameSettled = (a: Settled, b: Settled) =>
  a.view === b.view &&
  a.units === b.units &&
  a.sight.x === b.sight.x &&
  a.sight.y === b.sight.y &&
  a.sight.width === b.sight.width &&
  a.sight.height === b.sight.height;

/** `view`, settled in `svg` showing `box`. */
function settledOf(svg: SVGSVGElement, box: Box, view: View): Settled {
  const scaled = scaleOf(svg, box);
  if (scaled === null) return { view, units: 1, sight: box };
  const rect = svg.getBoundingClientRect();
  const width = rect.width * scaled.units;
  const height = rect.height * scaled.units;
  return {
    view,
    units: scaled.units,
    sight: {
      x: box.x - (width - box.width) / 2,
      y: box.y - (height - box.height) / 2,
      width,
      height,
    },
  };
}

/** Whether an id is one of `ids`. */
function inSet(ids: readonly string[]): (id: string) => boolean {
  const set = new Set(ids);
  return (id) => set.has(id);
}

/** The ids of `ids` at `positions` in sight in `box` as `view` moves and zooms it. */
function inSight(ids: readonly string[], positions: Positions, box: Box, view: View): string[] {
  const left = (box.x - view.x) / view.k;
  const top = (box.y - view.y) / view.k;
  const right = left + box.width / view.k;
  const bottom = top + box.height / view.k;
  return ids.filter((id) => {
    const { x, y } = positions.get(id)!;
    return x >= left && x <= right && y >= top && y <= bottom;
  });
}

/** The shape of a node of `kind` at `at`, its id its `data-node`: hiding nodes before it changes nothing of it. */
function shapeOf(node: GraphNode, at: Point) {
  const kind = `graph-node kind-${node.kind}${node.found === false ? " absent" : ""}`;
  const square = (half: number, round = 0) => (
    <rect
      key={node.id}
      class={kind}
      data-node={node.id}
      x={at.x - half}
      y={at.y - half}
      width={2 * half}
      height={2 * half}
      rx={round}
    />
  );
  const path = (d: string) => <path key={node.id} class={kind} data-node={node.id} d={d} />;
  switch (node.kind) {
    case "container":
      return square(8, 3);
    case "document":
      return square(6);
    case "vocabularyLeaf":
      return square(3);
    case "podLeaf":
      return path(`M${at.x} ${at.y - 6}l6 6l-6 6l-6 -6z`);
    case "missing":
      return path(
        `M${at.x - 5} ${at.y}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M${at.x - 3.5} ${at.y - 3.5}l7 7M${at.x + 3.5} ${at.y - 3.5}l-7 7`,
      );
    default:
      return (
        <circle
          key={node.id}
          class={kind}
          data-node={node.id}
          cx={at.x}
          cy={at.y}
          r={node.kind === "resource" ? 4 : 5}
        />
      );
  }
}

/** How many edges a bundled part is drawn for to be drawn the wider, at each step: as a rope, as thick as how many it is. */
const ROPES = [1, 8, 64];
/** The paths of the edges, in the order drawn: those bundled under those of the tree, lest they cut them, the thinnest first. */
const KINDS = ["link", "containment", "vocabulary"];
const LAYERS = [
  ...ROPES.flatMap((_, rope) => KINDS.map((kind) => `${kind} edges-bundled edges-rope${rope}`)),
  ...KINDS,
];

/**
 * The edges, a path for each kind (a link, a folder or document holding
 * what it does, a link to a vocabulary term), each drawn along its route,
 * those of the tree apart from those bundled along it; a part many share
 * drawn once, a bundled one the wider the more share it (ROPES), where
 * they are all drawn. The edges of a node selected or pointed at
 * (`focus`) are drawn as their routes say for such.
 */
function EdgeLayer({
  edges,
  routes,
  focus = false,
}: {
  edges: readonly GraphEdge[];
  routes: Routes;
  focus?: boolean;
}) {
  const tree = new Map<string, Set<string>>();
  const bundled = new Map<string, Map<string, number>>();
  for (const edge of edges) {
    const route = routes.of(edge);
    const parts = (focus && route.focus) || route.parts;
    if (route.tree) {
      let set = tree.get(edge.kind);
      if (set === undefined) tree.set(edge.kind, (set = new Set()));
      for (const part of parts) set.add(part);
    } else {
      let counts = bundled.get(edge.kind);
      if (counts === undefined) bundled.set(edge.kind, (counts = new Map()));
      for (const part of parts) counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  const paths = new Map<string, string[]>();
  for (const [kind, set] of tree) paths.set(kind, [...set]);
  for (const [kind, counts] of bundled) {
    for (const [part, count] of counts) {
      // A part the tree's edges draw already is drawn once, by them.
      if (tree.get(kind)?.has(part)) continue;
      const rope = ROPES.filter((least) => count >= least).length - 1;
      const layer = `${kind} edges-bundled edges-rope${rope}`;
      const list = paths.get(layer);
      if (list === undefined) paths.set(layer, [part]);
      else list.push(part);
    }
  }
  return (
    <g>
      {LAYERS.map((kind) => {
        const d = paths.get(kind);
        return (
          d !== undefined && <path key={kind} class={`graph-edges edges-${kind}`} d={d.join("")} />
        );
      })}
    </g>
  );
}

function NodeLayer({ nodes, positions }: { nodes: readonly GraphNode[]; positions: Positions }) {
  return <g>{nodes.map((node) => shapeOf(node, positions.get(node.id)!))}</g>;
}

/** A label for each of `ids`, `size` large. */
function Labels({
  ids,
  positions,
  labels,
  size,
  class: className,
}: {
  ids: Iterable<string>;
  positions: Positions;
  labels: ReadonlyMap<string, string>;
  size: number;
  class: string;
}) {
  const texts: ComponentChildren[] = [];
  for (const id of ids) {
    const at = positions.get(id)!;
    texts.push(
      <text key={id} x={at.x + size * 0.7} y={at.y + size * 0.35}>
        {drawnLabel(labels.get(id)!)}
      </text>,
    );
  }
  return (
    <g class={className} font-size={size} stroke-width={size / 4}>
      {texts}
    </g>
  );
}

/**
 * The graph `nodes` and `edges` make, at `positions` (every node's the
 * layout placed, so the box stays the same as the filters change). Each
 * node is named by `labels`, and described in words, for the line under
 * the drawing, by `describe`.
 */
export function GraphView({
  nodes,
  edges,
  positions,
  routes,
  labels,
  selected,
  onSelect,
  label,
  describe,
}: {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  positions: Positions;
  routes: Routes;
  labels: ReadonlyMap<string, string>;
  selected: string | null;
  /** Selects a node, by id; null lets go of the one selected. */
  onSelect: (id: string | null) => void;
  label: string;
  describe: (node: GraphNode) => string;
}) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);
  const edgeGroup = useRef<SVGGElement>(null);
  const focusGroup = useRef<SVGGElement>(null);
  const view = useRef<View>(WHOLE);
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean } | null>(null);
  const dragged = useRef(false);
  // The view once a move or a zoom has settled, which the shapes' size and the labels follow.
  const [settled, setSettled] = useState<Settled>(() => ({
    view: WHOLE,
    units: 1,
    sight: boxOf(positions),
  }));
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pointed, setPointed] = useState<string | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const hintId = useId();

  const box = useMemo(() => boxOf(positions), [positions]);
  const span = Math.max(box.width, box.height);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const ids = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const shownSelected = selected !== null && byId.has(selected) ? selected : null;
  const shownPointed = pointed !== null && byId.has(pointed) ? pointed : null;
  const shownHovered = hovered !== null && byId.has(hovered) ? hovered : null;
  // Each node's edges, looked up as it is selected, and the edges drawn always: all but those to vocabulary terms.
  const { drawn, edgesAt } = useMemo(() => {
    const edgesAt = new Map<string, GraphEdge[]>();
    const drawn: GraphEdge[] = [];
    const add = (end: string, edge: GraphEdge) => {
      const own = edgesAt.get(end);
      if (own === undefined) edgesAt.set(end, [edge]);
      else own.push(edge);
    };
    for (const edge of edges) {
      if (edge.kind !== "vocabulary") drawn.push(edge);
      add(edge.from, edge);
      if (edge.to !== edge.from) add(edge.to, edge);
    }
    return { drawn, edgesAt };
  }, [edges]);
  // The selected node's edges, and the nodes they join it to.
  const { near, ownEdges } = useMemo(() => {
    const ownEdges = shownSelected === null ? NONE : (edgesAt.get(shownSelected) ?? NONE);
    const near = new Set(
      ownEdges.map((edge) => (edge.from === shownSelected ? edge.to : edge.from)),
    );
    return { near, ownEdges };
  }, [edgesAt, shownSelected]);
  const hub = shownSelected !== null && byId.get(shownSelected)!.kind === "vocabularyLeaf";
  // The edges of the node pointed at, or else gone to by the keyboard, unless it is a term: in full, over the bundles.
  const previewed = shownHovered ?? shownPointed;
  const previewEdges = useMemo(
    () =>
      previewed === null || byId.get(previewed)!.kind === "vocabularyLeaf"
        ? NONE
        : (edgesAt.get(previewed) ?? NONE),
    [previewed, byId, edgesAt],
  );
  // The folders and documents, named in sight at any zoom: there are few. Where names would overlap, the folders first, then the documents of the most edges, a deck's cards before its reviews.
  const framed = useMemo(() => {
    const weight = (id: string) =>
      byId.get(id)!.kind === "container" ? Infinity : (edgesAt.get(id)?.length ?? 0);
    return ids
      .filter((id) => labelRank(byId.get(id)!) === 0)
      .sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1));
  }, [ids, byId, edgesAt]);

  // Made once for what is shown: a move or a zoom draws neither again.
  const edgeLayer = useMemo(() => <EdgeLayer edges={drawn} routes={routes} />, [drawn, routes]);
  const previewLayer = useMemo(
    () => <EdgeLayer edges={previewEdges} routes={routes} focus />,
    [previewEdges, routes],
  );
  // A selected node's own edges, a term's thousands perhaps: drawn as it is selected, not as the pointer moves.
  const ownLayer = useMemo(
    () => <EdgeLayer edges={ownEdges} routes={routes} focus />,
    [ownEdges, routes],
  );
  const bundled = useMemo(
    () => drawn.filter((edge) => !routes.of(edge).tree).length,
    [drawn, routes],
  );
  const nodeLayer = useMemo(
    () => <NodeLayer nodes={nodes} positions={positions} />,
    [nodes, positions],
  );
  const sighted = useMemo(() => {
    if (span / settled.view.k > LABEL_SPAN) return null;
    const seen = inSight(ids, positions, settled.sight, settled.view);
    return seen.length <= LABELS_AT_MOST ? seen : null;
  }, [span, settled, ids, positions]);
  // How large a shape is drawn, a label, and an edge's line, in the drawing's units, for them to stay as large on the screen.
  const shapeScale = (NODE_PIXELS * settled.units) / settled.view.k;
  const labelSize = (LABEL_PIXELS * settled.units) / settled.view.k;
  const lineWidth = settled.units / settled.view.k;
  // The paler the bundles, the further in: they spread apart, and would cover what is zoomed in on.
  const bundleInk = Math.max(
    BUNDLE_INK_LEAST,
    Math.round(
      (BUNDLE_INK * Math.min(1, Math.sqrt(BUNDLES_FULL / bundled))) /
        settled.view.k ** 0.75 /
        BUNDLE_INK_STEP,
    ) * BUNDLE_INK_STEP,
  );
  const labelLayer = useMemo(() => {
    const focus = shownSelected === null ? [] : [[shownSelected], [...near]];
    // Those in sight; else, when there are too many, the node selected's and its neighbors', and the folders and documents in sight.
    const tried =
      sighted === null
        ? labelOrder([...focus, inSight(framed, positions, settled.sight, settled.view)], byId)
        : labelOrder([...focus.map((group) => group.filter(inSet(sighted))), sighted], byId);
    return (
      <Labels
        class="graph-labels"
        ids={placeLabels(tried, positions, labels, labelSize, LABELS_AT_MOST)}
        positions={positions}
        labels={labels}
        size={labelSize}
      />
    );
  }, [sighted, shownSelected, near, framed, settled, byId, positions, labels, labelSize]);
  /** Measures the plot again, for the view as it is now. */
  const measure = () => {
    const next = settledOf(svg.current!, box, view.current);
    setSettled((current) => (sameSettled(current, next) ? current : next));
  };
  /** Measures the plot again once it has been still for SETTLE_MS. */
  const settleSoon = () => {
    clearTimeout(settling.current);
    settling.current = setTimeout(measure, SETTLE_MS);
  };
  useLayoutEffect(measure, [box]);
  // A plot resized (the window, the aside) shows more or less of the drawing, at another scale.
  useEffect(() => {
    const observer = new ResizeObserver(settleSoon);
    observer.observe(svg.current!);
    return () => observer.disconnect();
  }, [box]);
  useEffect(() => () => clearTimeout(settling.current), []);

  /** Moves and zooms the drawing to `next`, its layers as they are but the edges' width, for them to stay a pixel wide. */
  const show = (next: View) => {
    view.current = next;
    group.current!.setAttribute("transform", transformOf(next));
    const line = String(settled.units / next.k);
    edgeGroup.current!.style.setProperty("--graph-line", line);
    focusGroup.current?.style.setProperty("--graph-line", line);
    settleSoon();
  };
  /** Zooms by `factor` about `about`, a point of the box; its middle when absent. */
  const zoom = (factor: number, about?: Point) => {
    const at = about ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const { x, y, k } = view.current;
    const next = Math.min(ZOOM_RANGE.most, Math.max(ZOOM_RANGE.least, k * factor));
    show({ x: at.x - (at.x - x) * (next / k), y: at.y - (at.y - y) * (next / k), k: next });
  };
  /** Brings `id` into sight: to the middle, if it is out of sight. */
  const reveal = (id: string) => {
    const at = positions.get(id)!;
    const { x, y, k } = view.current;
    const inSight = (value: number, from: number, size: number, offset: number) =>
      value * k + offset >= from && value * k + offset <= from + size;
    if (inSight(at.x, box.x, box.width, x) && inSight(at.y, box.y, box.height, y)) return;
    show({
      x: box.x + box.width / 2 - at.x * k,
      y: box.y + box.height / 2 - at.y * k,
      k,
    });
  };

  useEffect(() => {
    if (shownSelected !== null) reveal(shownSelected);
  }, [shownSelected]);

  const go = (id: string) => {
    setPointed(id);
    setKeyed(true);
    reveal(id);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const from = shownPointed ?? shownSelected;
    const direction = DIRECTIONS[event.key];
    if (event.key === "+" || event.key === "=") zoom(ZOOM_STEP);
    else if (event.key === "-") zoom(1 / ZOOM_STEP);
    else if (event.key === "0") show(WHOLE);
    else if (event.key === "Escape" && shownPointed !== null) {
      setPointed(null);
      setKeyed(false);
    } else if (event.key === "Enter" && shownPointed !== null) onSelect(shownPointed);
    else if (ids.length === 0) return;
    else if (event.key === "Home") go(ids[0]!);
    else if (event.key === "End") go(ids.at(-1)!);
    else if (direction === undefined) return;
    else if (from === null) go(ids[0]!);
    else go(nearestInDirection(from, ids, positions, direction) ?? from);
    event.preventDefault();
  };

  const pointerDown = (event: PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, from: view.current, moved: false };
    dragged.current = false;
  };
  const pointerMove = (event: PointerEvent) => {
    const held = drag.current;
    if (held === null) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    if (!held.moved) {
      if (Math.hypot(dx, dy) < DRAG_PIXELS) return;
      // Only a drag holds the pointer: a click still goes to the node under it.
      held.moved = true;
      svg.current!.setPointerCapture(event.pointerId);
    }
    const units = scaleOf(svg.current!, box)?.units ?? 1;
    show({ ...held.from, x: held.from.x + dx * units, y: held.from.y + dy * units });
  };
  const pointerUp = () => {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  };
  const click = (event: MouseEvent) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    // A node clicked is selected; a click on the background (an edge, or a label, which the pointer goes through) lets go of the one selected.
    const id = (event.target as Element).getAttribute("data-node");
    if (id !== null || selected !== null) onSelect(id);
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const scaled = scaleOf(svg.current!, box);
    zoom(
      Math.exp(-event.deltaY * 0.002),
      scaled === null
        ? undefined
        : {
            x: box.x + (event.clientX - scaled.left) * scaled.units,
            y: box.y + (event.clientY - scaled.top) * scaled.units,
          },
    );
  };
  const over = (event: PointerEvent) => {
    const id = (event.target as Element).getAttribute("data-node");
    setHovered(id);
    // As usePoint's: once the pointer points, the status line is the keyboard's no more.
    if (id !== null) setKeyed(false);
  };

  const shownText = shownHovered ?? shownPointed;
  const ring = (id: string | null, className: string, size: number) => {
    if (id === null) return null;
    const at = positions.get(id)!;
    return <circle class={className} cx={at.x} cy={at.y} r={size} />;
  };
  return (
    <figure class="graph">
      <div class="graph-zoom">
        <button type="button" onClick={() => zoom(ZOOM_STEP)}>
          {t("studio.graph.zoomIn")}
        </button>
        <button type="button" onClick={() => zoom(1 / ZOOM_STEP)}>
          {t("studio.graph.zoomOut")}
        </button>
        <button type="button" onClick={() => show(WHOLE)}>
          {t("studio.graph.zoomFit")}
        </button>
      </div>
      <svg
        ref={svg}
        class="graph-plot"
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabindex={0}
        style={{ "--graph-shape": String(shapeScale) }}
        onKeyDown={keyDown}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerOver={over}
        onPointerLeave={() => setHovered(null)}
        onClick={click}
        onWheel={wheel}
      >
        <g ref={group} transform={transformOf(view.current)}>
          <g ref={edgeGroup} style={{ "--graph-line": String(lineWidth) }}>
            <g class="graph-always" style={{ "--graph-bundle-ink": bundleInk.toFixed(2) }}>
              {edgeLayer}
            </g>
            {previewLayer}
            {/* A term's own edges, thousands perhaps, faint and under the nodes, for them to show. */}
            {hub && (
              <g
                class="graph-focus graph-hub"
                style={{
                  "--graph-hub-ink": String(
                    Math.min(1, Math.max(HUB_INK_LEAST, HUB_EDGES_FULL / ownEdges.length)),
                  ),
                }}
              >
                {ownLayer}
              </g>
            )}
          </g>
          {nodeLayer}
          {shownSelected !== null && (
            <g ref={focusGroup} class="graph-focus" style={{ "--graph-line": String(lineWidth) }}>
              {!hub && ownLayer}
              {ring(shownSelected, "graph-selected", 9)}
            </g>
          )}
          {ring(shownPointed, "graph-pointed", 12)}
          {ring(shownHovered, "graph-hovered", 12)}
          {labelLayer}
        </g>
      </svg>
      <Inspector
        id={hintId}
        text={shownText === null ? null : describe(byId.get(shownText)!)}
        prompt={t("studio.graph.prompt")}
        keyed={keyed && shownPointed !== null && shownHovered === null}
      />
    </figure>
  );
}
