// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Where an instance graph's nodes are drawn, and the path each edge is
 * drawn along: a radial tree, its links bundled along it (hierarchical
 * edge bundling, as Holten's of 2006). Plain arithmetic, with no library,
 * linear in the nodes and edges, and the same picture for the same graph:
 * the nodes and edges go in sorted, and nothing is random.
 *
 * 1. A tree over every node. Its backbone is what holds what (a folder
 *    its documents, a document its resources); a node is hung instead
 *    under what it is about, by the first of these it has: a link up
 *    (UP: a review state under its card, an answer under its card, a
 *    cards document under its deck), a link down to it (DOWN: a wrong
 *    option under its card, a deck under the catalog). A leaf hangs under
 *    the first node that links to it. A choice that would make a cycle
 *    falls back, at the first node of the cycle in order that can, to
 *    the folder or document that holds it, else to the first node that
 *    links to it; if none can, the first goes under the middle. No node
 *    hangs deeper than MAX_DEPTH: one a chain of links (each part of the
 *    next, say) would hang deeper hangs beside its parent, so a route,
 *    up the tree and down, is never longer than that.
 * 2. Hubs and units. The folders, the documents and every subtree of more
 *    than UNIT_MAX nodes are hubs; any other subtree under a hub is a
 *    unit (a card with its review state, answers and wrong options),
 *    drawn as a run of slots side by side. A band of rows round the
 *    outside holds every unit, filled a column at a time outwards, a unit
 *    split only when it is longer than a column. Each hub's angle is as
 *    wide as the columns of what it holds, and it sits in the middle of
 *    it, on a ring by its depth; one that holds no hub on the outermost.
 * 3. The core. A folder or document of the instance's own that holds next
 *    to nothing once its resources hang elsewhere (the meta, the answer
 *    log's months, the digest, a folder whose documents moved) would take
 *    a slice of the band for no slots: such are drawn on a ring of their
 *    own round the middle, spread out, with what little they hold.
 * 4. The rim. The vocabulary terms, linked from a great many nodes, are
 *    spread on a ring outside the band, each as near as there is room for
 *    to the middle of the angles of what links to it.
 * 5. The routes. An edge of the tree goes a step at a time up it: from a
 *    unit to its column's routing point, to its block's (one per
 *    BLOCK_COLS columns; past TRUNKS blocks, under rings of fewer
 *    further in), to its hub, each step a curve out of one end along its
 *    angle and into the other along its own. Any other is bundled: up
 *    the tree from each end to its block or hub, as the tree's edges go,
 *    and between those along the tree path, through the hubs and the
 *    routing points, as a cubic B-spline drawn BETA of the way toward
 *    them from a straight line, the same for all that join the same
 *    two; never through a hub as wide as half the drawing, the middle
 *    above all, which is far from most of what it holds and where every
 *    bundle would knot, nor one it would turn back at. An edge to a term
 *    goes up the tree to the hub under the widest, and on to the term.
 *    A link between two nodes of a column is drawn, for a node selected,
 *    bowed aside (`focus`). Every path is worked out here, ROUTE_BATCH
 *    edges a step, the nodes to a tenth of a unit and the curves' other
 *    points to a unit, so that drawing them is joining text.
 *
 * It runs a step at a time (step), so the page can draw between batches
 * of them (useLayout).
 */

import type { GraphEdge, GraphNode, InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { DCAT_NS, DCTERMS_NS } from "@solid-memo/domain/release/releaseModel";
import { SM } from "@solid-memo/vocab/vocab.generated";

/** A point of the drawing, in its own units. */
export interface Point {
  x: number;
  y: number;
}

/** Each node's place, by its id. */
export type Positions = ReadonlyMap<string, Point>;

/**
 * How an edge is drawn: the SVG path data of its parts, and whether it
 * joins a node to its parent in the tree, not bundled along it. An edge of
 * the tree is drawn a part for each step along it, through the routing
 * points: those of a document's cards meet in the same parts, which are
 * drawn once.
 */
export interface Route {
  parts: readonly string[];
  tree: boolean;
  /** How it is drawn for a node selected or pointed at, when not as `parts`: a link between two nodes of a column bowed aside, for a card's links to its own to be told apart. */
  focus?: readonly string[];
}

/** The routes of a layout's edges. */
export interface Routes {
  of(edge: GraphEdge): Route;
}

/** A layout under way: `step` runs steps and says how far it is (0 to 1); once `done`, where the nodes are and how the edges go. */
export interface Layout {
  step(steps: number): number;
  readonly done: boolean;
  positions(): Positions;
  routes(): Routes;
}

/** Links that hang their subject under their object. */
const UP = [`${DCTERMS_NS}isPartOf`, SM.reviewOf, SM.answeredCard, SM.receiptOf, SM.scheduleOf];
/** Links that hang their object under their subject. */
const DOWN = [
  SM.cardsDocument,
  SM.reviewsDocument,
  SM.distractor,
  `${DCAT_NS}distribution`,
  `${DCAT_NS}dataset`,
];
/** How strongly a link hangs one end under the other, the lowest first, and whether it is its subject that hangs. */
const HANGS = new Map<string, { rank: number; up: boolean }>([
  ...UP.map((predicate, rank) => [predicate, { rank, up: true }] as const),
  ...DOWN.map((predicate, rank) => [predicate, { rank: UP.length + rank, up: false }] as const),
]);

/** The deepest a node hangs in the tree: one a chain of links would hang deeper hangs beside its parent, so every route is as long as this, not as the chain (see boundDepth). */
const MAX_DEPTH = 16;
/** A slot's size, in the drawing's units: how far apart the nodes of the band are. */
const SLOT = 12;
/** The most nodes a subtree under a hub has to be a unit, a run of slots, not a hub. */
const UNIT_MAX = 64;
/** The most rows the longest unit makes the band: a longer one is split. */
const ROWS_FOR_UNITS = 12;
/** The most slots a folder or document of the instance's own holds to be drawn in the core, not in the band. */
const CORE_SLOTS = 2;
/** Columns of the band under one routing point, and routing points under one a ring further in. */
const BLOCK_COLS = 6;
/** The most routing points a run of units has on its innermost ring: past it, another ring of them further in gathers them, for a few trunks to leave the hub. */
const TRUNKS = 12;
/** How far a link between two nodes of a column bows aside, drawn for a node selected: its control points this share of its length off the line, sides taking turns unit by unit. */
const BOW = 0.2;
/** How far bundled routes are drawn toward the tree: 1 along it, 0 a straight line. */
const BETA = 0.85;
/** Columns between siblings, by their hub's depth: the instance's own folders and documents the widest apart. */
const GAPS = [3, 2, 1];
/** The fewest columns a hub's angle is. */
const MIN_HUB = 2;
/** The core's ring, and the most it may be, as a share of the band's inner radius. */
const CORE = 0.4;
const CORE_MOST = 0.45;
/** How far apart the core's nodes are at the least. */
const CORE_SPACING = 4 * SLOT;
/** The innermost and the outermost ring of hubs, as a share of the band's inner radius. */
const RING_IN = 0.55;
const RING_OUT = 0.8;
/** How far out of the band the rim is, and how far apart its terms are at the least, in slots. */
const RIM_GAP = 3;
const TERM_GAP = 2;
/** How sharply a bundle may turn back at a hub, as the cosine of the turn past a right angle: one sharper goes straight past it. */
const TURN_MOST = 0.5;
/** How many edges are routed a step. */
export const ROUTE_BATCH = 4000;

/** A node's index, in the order sorted by id; a middle of its own, and the routing points, after them. */
type Index = number;

interface Tree {
  nodes: readonly GraphNode[];
  index: ReadonlyMap<string, Index>;
  /** The middle: the instance's folder, or a node of its own (index `nodes.length`). */
  root: Index;
  /** Each node's parent; -1 at the middle. */
  parent: Int32Array;
  /** Each node's children, in order; none of the terms. */
  children: Index[][];
  /** The vocabulary terms, and what links to each. */
  terms: Index[];
  linkers: ReadonlyMap<Index, Index[]>;
}

interface Placed {
  /** Where each node and routing point is. */
  x: number[];
  y: number[];
  /** Its parent along which routes go: a unit's is its column's routing point; -1 at the middle. */
  up: number[];
  depth: number[];
  /** Whether a hub's angle is half the drawing or more: the middle's, the catalog's, say. */
  wide: Uint8Array;
  /** The side a unit's links bow to (1 or -1, taking turns in a run); 0 off the band. */
  side: number[];
  /** Whether a node or routing point is a hub or a block's routing point, between which bundles run: 1 if so. */
  trunk: number[];
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const noop = () => {};

/** Adds `value` to the list kept under `key`. */
function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** `graph`'s nodes and edges in order, whatever order they came in. */
function sortedOf(graph: InstanceGraph): InstanceGraph {
  return {
    nodes: [...graph.nodes].sort((a, b) => order(a.id, b.id)),
    edges: [...graph.edges].sort(
      (a, b) => order(a.from, b.from) || order(a.to, b.to) || order(a.predicate, b.predicate),
    ),
  };
}

/** What each node of a graph in order hangs under, by its edges: its holder, its first linker and its chosen parent; and what links to each term. */
function hangsOf(
  { nodes, edges }: InstanceGraph,
  index: ReadonlyMap<string, Index>,
  term: (at: Index) => boolean,
) {
  const n = nodes.length;
  const holder = new Int32Array(n).fill(-1);
  const linker = new Int32Array(n).fill(-1);
  const chosen = new Int32Array(n).fill(-1);
  const rank = new Int32Array(n).fill(HANGS.size);
  const linkers = new Map<Index, Index[]>();
  for (const edge of edges) {
    const from = index.get(edge.from)!;
    const to = index.get(edge.to)!;
    if (from === to) continue;
    if (term(from) || term(to)) {
      if (!term(from)) append(linkers, to, from);
      continue;
    }
    if (edge.kind === "containment") {
      if (holder[to] === -1) holder[to] = from;
      continue;
    }
    if (linker[to] === -1) linker[to] = from;
    const hangs = HANGS.get(edge.predicate);
    if (hangs === undefined) continue;
    const [child, parent] = hangs.up ? [from, to] : [to, from];
    if (hangs.rank < rank[child]!) {
      rank[child] = hangs.rank;
      chosen[child] = parent;
    }
  }
  return { holder, linker, chosen, linkers };
}

/** The tree over the nodes of `sorted`, a graph in order: see the module's comment, 1. */
function treeOf(sorted: InstanceGraph): Tree {
  const { nodes } = sorted;
  const n = nodes.length;
  const index = new Map(nodes.map((node, at) => [node.id, at]));
  const term = (at: Index) => nodes[at]!.kind === "vocabularyLeaf";
  const { holder, linker, chosen, linkers } = hangsOf(sorted, index, term);
  const tops = nodes.flatMap((node, at) =>
    (node.kind === "container" || node.kind === "document") && holder[at] === -1 ? [at] : [],
  );
  const root = tops.length === 1 && nodes[tops[0]!]!.kind === "container" ? tops[0]! : n;
  const fallback = (at: Index) => {
    if (holder[at] !== -1) return holder[at]!;
    return linker[at] !== -1 ? linker[at]! : root;
  };
  const parent = new Int32Array(root === n ? n + 1 : n);
  const terms: Index[] = [];
  for (let at = 0; at < n; at++) {
    if (term(at)) terms.push(at);
    parent[at] = term(at) ? root : chosen[at] !== -1 ? chosen[at]! : fallback(at);
  }
  parent[root] = -1;
  breakCycles(parent, root, fallback);
  const childrenOf = () => {
    const children: Index[][] = Array.from({ length: parent.length }, () => []);
    for (let at = 0; at < n; at++) {
      if (at !== root && !term(at)) children[parent[at]!]!.push(at);
    }
    return children;
  };
  const children = childrenOf();
  const tree = { nodes, index, root, parent, children, terms, linkers };
  return boundDepth(parent, preorder(children, root)) ? { ...tree, children: childrenOf() } : tree;
}

/**
 * Hangs every node deeper than MAX_DEPTH beside its parent instead, in one
 * pass down from the root (`pre`): the rest of a chain past it fans out
 * under its node a step above the bound. Returns whether any moved.
 */
function boundDepth(parent: Int32Array, pre: readonly Index[]): boolean {
  const depth = new Int32Array(parent.length);
  let moved = false;
  for (let p = 1; p < pre.length; p++) {
    const at = pre[p]!;
    if (depth[parent[at]!] === MAX_DEPTH) {
      parent[at] = parent[parent[at]!]!;
      moved = true;
    }
    depth[at] = depth[parent[at]!]! + 1;
  }
  return moved;
}

const UNSEEN = 0;
const ON_PATH = 1;
const REACHES = 2;

/**
 * Makes every chain of parents end at `root`, in one pass: of the nodes
 * of a chain that comes back to itself, the first in order whose
 * `fallback` reaches the root hangs under it instead, else the first
 * under the root. Where the walk came into the cycle changes nothing.
 */
function breakCycles(parent: Int32Array, root: Index, fallback: (at: Index) => Index): void {
  const state = new Uint8Array(parent.length);
  const seen = new Int32Array(parent.length).fill(-1);
  state[root] = REACHES;
  const path: Index[] = [];
  let marks = 0;
  /** Whether the chain from `from` reaches the root, past neither the path walked now nor a cycle of its own. */
  const reaches = (from: Index) => {
    const mark = marks++;
    let at = from;
    while (state[at] !== REACHES) {
      if (state[at] === ON_PATH || seen[at] === mark) return false;
      seen[at] = mark;
      at = parent[at]!;
    }
    return true;
  };
  for (let start = 0; start < parent.length; start++) {
    path.length = 0;
    let at = start;
    while (state[at] === UNSEEN) {
      state[at] = ON_PATH;
      path.push(at);
      at = parent[at]!;
    }
    if (state[at] === ON_PATH) {
      const cycle = [at];
      for (let next = parent[at]!; next !== at; next = parent[next]!) cycle.push(next);
      cycle.sort((a, b) => a - b);
      const breaks = cycle.find((member) => reaches(fallback(member)));
      if (breaks === undefined) parent[cycle[0]!] = root;
      else parent[breaks] = fallback(breaks);
    }
    for (const each of path) state[each] = REACHES;
  }
}

/** Calls `visit` with the column and row of each slot of a run of units of `sizes`, `rows` to a column; returns how many columns it takes. */
function fill(
  sizes: readonly number[],
  rows: number,
  visit: (column: number, row: number) => void,
): number {
  let column = 0;
  let row = 0;
  for (const size of sizes) {
    if (row > 0 && row + size > rows) {
      column++;
      row = 0;
    }
    for (let slot = 0; slot < size; slot++) {
      if (row === rows) {
        column++;
        row = 0;
      }
      visit(column, row++);
    }
  }
  return column + 1;
}

/** What a hub holds, in order: a hub, or a run of units side by side. */
type Part = { hub: Index } | { units: Index[] };

/** The nodes in order down from the root, each before what it holds. */
function preorder(children: readonly Index[][], root: Index): Index[] {
  const pre: Index[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const at = stack.pop()!;
    pre.push(at);
    const kids = children[at]!;
    for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k]!);
  }
  return pre;
}

/** Each node's subtree size, whether it is a hub, and how many slots of the band a hub holds. */
function measure(tree: Tree, pre: readonly Index[]) {
  const { nodes, children } = tree;
  const total = tree.parent.length;
  const size = new Int32Array(total);
  const hub = new Uint8Array(total);
  const slots = new Int32Array(total);
  for (let p = pre.length - 1; p >= 0; p--) {
    const at = pre[p]!;
    let own = at < nodes.length ? 1 : 0;
    let held = 0;
    let hubBelow = false;
    for (const child of children[at]!) {
      own += size[child]!;
      held += hub[child] ? slots[child]! : size[child]!;
      hubBelow ||= hub[child] === 1;
    }
    size[at] = own;
    slots[at] = held;
    const kind = at < nodes.length ? nodes[at]!.kind : "container";
    hub[at] = kind === "container" || kind === "document" || own > UNIT_MAX || hubBelow ? 1 : 0;
  }
  // The core: the root's hubs holding next to nothing, and all under them.
  const core = new Uint8Array(total);
  for (const at of pre) {
    if (at === tree.root) continue;
    const up = tree.parent[at]!;
    core[at] = core[up] || (up === tree.root && hub[at] && slots[at]! <= CORE_SLOTS) ? 1 : 0;
  }
  return { size, hub, core };
}

/** As many rows as the band is about an eighth as deep as it is round, and a unit is long. */
function bandRows(
  tree: Tree,
  pre: readonly Index[],
  size: Int32Array,
  hub: Uint8Array,
  core: Uint8Array,
  band: Uint8Array,
): number {
  let bandSlots = 0;
  let longest = 1;
  for (const at of pre) {
    if (hub[at] || core[at]) continue;
    bandSlots++;
    if (band[tree.parent[at]!]) longest = Math.max(longest, Math.min(ROWS_FOR_UNITS, size[at]!));
  }
  return Math.max(longest, Math.round(Math.sqrt(bandSlots / (8 * Math.PI))));
}

/** A band hub's children outside the core: each band hub alone, each run of units together. */
function partsOf(children: readonly Index[], core: Uint8Array, band: Uint8Array): Part[] {
  const list: Part[] = [];
  let run: Index[] | null = null;
  for (const child of children) {
    if (core[child]) continue;
    if (band[child]) {
      run = null;
      list.push({ hub: child });
    } else if (run === null) {
      run = [child];
      list.push({ units: run });
    } else run.push(child);
  }
  return list;
}

/** Each band hub's parts, its depth among hubs, and its width in columns, bottom up. */
function hubParts(
  tree: Tree,
  pre: readonly Index[],
  core: Uint8Array,
  band: Uint8Array,
  columnsOf: (units: readonly Index[]) => number,
) {
  const { root, children } = tree;
  const total = tree.parent.length;
  const parts: Part[][] = [];
  const hubDepth = new Int32Array(total);
  const width = new Float64Array(total);
  const outer = new Uint8Array(total);
  let deepest = 1;
  for (const at of pre) {
    if (!band[at] || at === root) continue;
    hubDepth[at] = hubDepth[tree.parent[at]!]! + 1;
    deepest = Math.max(deepest, hubDepth[at]!);
  }
  for (let p = pre.length - 1; p >= 0; p--) {
    const at = pre[p]!;
    if (!band[at]) continue;
    const list = partsOf(children[at]!, core, band);
    parts[at] = list;
    outer[at] = list.every((part) => "units" in part) ? 1 : 0;
    let columns = (GAPS[hubDepth[at]!] ?? 0) * Math.max(0, list.length - 1);
    for (const part of list) columns += "hub" in part ? width[part.hub]! : columnsOf(part.units);
    width[at] = Math.max(at === root ? 1 : MIN_HUB, columns);
  }
  return { parts, hubDepth, width, outer, deepest };
}

/** Where the nodes go, and the routing points: see the module's comment, 2 to 4. */
function place(tree: Tree): Placed & { positions: Map<string, Point> } {
  const { nodes, root, children } = tree;
  const n = nodes.length;
  const total = tree.parent.length;
  const pre = preorder(children, root);
  const { size, hub, core } = measure(tree, pre);
  const band = hub.map((isHub, at) => (isHub && !core[at] ? 1 : 0));
  const rows = bandRows(tree, pre, size, hub, core, band);
  const columnsOf = (units: readonly Index[]) =>
    fill(
      units.map((unit) => size[unit]!),
      rows,
      noop,
    );

  const { parts, hubDepth, width, outer, deepest } = hubParts(tree, pre, core, band, columnsOf);
  const coreNodes = pre.filter((at) => core[at]);
  const coreSeats = coreNodes.length + coreNodes.filter((at) => !core[tree.parent[at]!]).length;
  const coreNeeds = (coreSeats * CORE_SPACING) / (2 * Math.PI);
  const columns = width[root]! + GAPS[0]!;
  const r0 = Math.max(SLOT * 8, (SLOT * columns) / (2 * Math.PI), coreNeeds / CORE_MOST);
  const step = (2 * Math.PI) / columns;
  const wide = band.map((isHub, at) => (isHub && width[at]! * step >= Math.PI ? 1 : 0));
  wide[root] = 1;
  let deepestWide = 0;
  for (const at of pre) if (wide[at]) deepestWide = Math.max(deepestWide, hubDepth[at]!);
  // A hub as wide as half the drawing, a step out from the middle at a time, inside the core: from the middle of its angle, what it holds would be far.
  const ringOf = (at: Index) => {
    if (wide[at]) return (CORE * r0 * hubDepth[at]!) / (deepestWide + 1);
    if (deepest === 1) return RING_OUT * r0;
    const depth = outer[at] ? deepest : hubDepth[at]!;
    return r0 * (RING_IN + ((RING_OUT - RING_IN) * (depth - 1)) / (deepest - 1));
  };

  const x: number[] = new Array(total).fill(0);
  const y: number[] = new Array(total).fill(0);
  const up: number[] = Array.from(tree.parent);
  const depth: number[] = new Array(total).fill(0);
  const side: number[] = new Array(total).fill(0);
  const trunk: number[] = Array.from(hub);
  const polar = (at: number, radius: number, angle: number) => {
    x[at] = radius * Math.sin(angle);
    y[at] = -radius * Math.cos(angle);
  };
  /** A routing point under `parent`, at `radius` and `angle`. */
  const routing = (parent: number, radius: number, angle: number) => {
    const at = x.length;
    up.push(parent);
    depth.push(depth[parent]! + 1);
    side.push(0);
    trunk.push(0);
    polar(at, radius, angle);
    return at;
  };
  const blockRadius = Math.max(r0 - 4 * SLOT, ((1 + RING_OUT) / 2) * r0);
  /**
   * A run of units from column `from` of hub `owner`: each in its slots,
   * depth first, under its column's routing point, under its block's;
   * more than TRUNKS blocks under rings of fewer further in.
   */
  const layoutRun = (owner: Index, units: readonly Index[], from: number) => {
    const cols = columnsOf(units);
    const counts = [Math.max(1, Math.round(cols / BLOCK_COLS))];
    while (counts[0]! > TRUNKS) counts.unshift(Math.ceil(counts[0]! / BLOCK_COLS));
    const inner = Math.hypot(x[owner]!, y[owner]!);
    let blockAt = [owner];
    counts.forEach((count, ring) => {
      const radius = inner + ((blockRadius - inner) * (ring + 1)) / counts.length;
      const above = blockAt;
      blockAt = [];
      for (let b = 0; b < count; b++) {
        const parent = above[Math.floor((b * above.length) / count)]!;
        const point = routing(parent, radius, (from + ((b + 0.5) * cols) / count) * step);
        trunk[point] = 1;
        blockAt.push(point);
      }
    });
    const blocks = blockAt.length;
    const columnAt: number[] = [];
    for (let c = 0; c < cols; c++) {
      const block = blockAt[Math.floor((c * blocks) / cols)]!;
      columnAt.push(routing(block, r0 - 0.8 * SLOT, (from + c + 0.5) * step));
    }
    const first = new Set(units);
    const slotted = units.flatMap((unit, k) => {
      const own = preorder(children, unit);
      for (const at of own) side[at] = k % 2 === 0 ? 1 : -1;
      return own;
    });
    let slot = 0;
    fill(
      units.map((unit) => size[unit]!),
      rows,
      (column, row) => {
        const at = slotted[slot++]!;
        polar(at, r0 + row * SLOT, (from + column + 0.5) * step);
        if (first.has(at)) up[at] = columnAt[column]!;
        depth[at] = depth[up[at]!]! + 1;
      },
    );
    return from + cols;
  };
  const start = new Float64Array(total);
  for (const at of pre) {
    if (!band[at]) continue;
    if (at !== root) {
      depth[at] = depth[up[at]!]! + 1;
      polar(at, ringOf(at), (start[at]! + width[at]! / 2) * step);
    }
    const gap = GAPS[hubDepth[at]!] ?? 0;
    let column = at === root ? GAPS[0]! / 2 : start[at]!;
    for (const part of parts[at]!) {
      if ("hub" in part) {
        start[part.hub] = column;
        column += width[part.hub]!;
      } else column = layoutRun(at, part.units, column);
      column += gap;
    }
  }
  // The core, in order round its ring, a seat left empty before each group.
  const coreRadius = Math.max(CORE * r0, coreNeeds);
  let seat = 0;
  for (const at of coreNodes) {
    if (!core[tree.parent[at]!]) seat++;
    polar(at, coreRadius, ((seat++ + 0.5) * 2 * Math.PI) / coreSeats);
    depth[at] = depth[up[at]!]! + 1;
  }
  placeTerms(tree, { x, y, up, depth, wide, side, trunk }, r0 + (rows + RIM_GAP) * SLOT);

  const positions = new Map<string, Point>();
  for (let at = 0; at < x.length; at++) {
    x[at] = Math.round(x[at]! * 10) / 10;
    y[at] = Math.round(y[at]! * 10) / 10;
    if (at < n) positions.set(nodes[at]!.id, { x: x[at]!, y: y[at]! });
  }
  return { x, y, up, depth, wide, side, trunk, positions };
}

/** The vocabulary terms on the rim, at `radius`, each as near the middle of the angles of what links to it as there is room for. */
function placeTerms(tree: Tree, placed: Placed, radius: number): void {
  const { x, y, depth } = placed;
  const count = tree.terms.length;
  if (count === 0) return;
  const wanted = tree.terms.map((term) => {
    let sx = 0;
    let sy = 0;
    for (const from of tree.linkers.get(term) ?? []) {
      const length = Math.max(1, Math.hypot(x[from]!, y[from]!));
      sx += x[from]! / length;
      sy += y[from]! / length;
    }
    const angle = Math.atan2(sx, -sy);
    return { term, angle: angle < 0 ? angle + 2 * Math.PI : angle };
  });
  wanted.sort((a, b) => a.angle - b.angle || a.term - b.term);
  const gap = Math.min((TERM_GAP * SLOT) / radius, (2 * Math.PI) / count);
  const angles = wanted.map(({ angle }) => angle);
  for (let k = 1; k < count; k++) angles[k] = Math.max(angles[k]!, angles[k - 1]! + gap);
  // Pushed on as little as they must, and as much back; all evenly round, when they would come round to the first.
  const shift = (angles[count - 1]! - wanted[count - 1]!.angle) / 2;
  const round = angles[count - 1]! - angles[0]! > 2 * Math.PI - gap;
  wanted.forEach(({ term }, k) => {
    const angle = round ? angles[0]! + (k * 2 * Math.PI) / count : angles[k]! - shift;
    x[term] = radius * Math.sin(angle);
    y[term] = -radius * Math.cos(angle);
    depth[term] = 1;
  });
}

/** A uniform cubic B-spline through `px`, `py`, drawn BETA of the way to them from a line, clamped at its ends (as d3's curveBundle). */
function spline(px: number[], py: number[]): string {
  const m = px.length - 1;
  const x0 = px[0]!;
  const y0 = py[0]!;
  const dx = px[m]! - x0;
  const dy = py[m]! - y0;
  for (let k = 1; k < m; k++) {
    px[k] = BETA * px[k]! + (1 - BETA) * (x0 + (k / m) * dx);
    py[k] = BETA * py[k]! + (1 - BETA) * (y0 + (k / m) * dy);
  }
  const path = new PathText(x0, y0);
  path.line((5 * x0 + px[1]!) / 6, (5 * y0 + py[1]!) / 6);
  for (let k = 2; k <= m + 1; k++) {
    const [xa, ya, xb, yb] = [px[k - 2]!, py[k - 2]!, px[k - 1]!, py[k - 1]!];
    const xc = k <= m ? px[k]! : xb;
    const yc = k <= m ? py[k]! : yb;
    path.curve(
      (2 * xa + xb) / 3,
      (2 * ya + yb) / 3,
      (xa + 2 * xb) / 3,
      (ya + 2 * yb) / 3,
      (xa + 4 * xb + xc) / 6,
      (ya + 4 * yb + yc) / 6,
    );
  }
  return path.line(px[m]!, py[m]!, true);
}

/**
 * SVG path data written short: from its start, each point relative to the
 * one before, to a unit, but the last, a node's own point, to a tenth, as
 * the nodes are placed.
 */
class PathText {
  text: string;
  private x: number;
  private y: number;
  constructor(x: number, y: number) {
    this.text = `M${x} ${y}`;
    this.x = x;
    this.y = y;
  }
  /** `x`, `y` from the point reached, to a unit, or to a tenth. */
  private step(x: number, y: number, scale = 1): string {
    return `${Math.round((x - this.x) * scale) / scale} ${Math.round((y - this.y) * scale) / scale}`;
  }
  /** As `step`, and the point reached is then that. */
  private reach(x: number, y: number, scale: number): string {
    const dx = Math.round((x - this.x) * scale) / scale;
    const dy = Math.round((y - this.y) * scale) / scale;
    this.x += dx;
    this.y += dy;
    return `${dx} ${dy}`;
  }
  line(x: number, y: number, last = false): string {
    this.text += `l${this.reach(x, y, last ? 10 : 1)}`;
    return this.text;
  }
  curve(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number,
    last = false,
  ): string {
    this.text += `c${this.step(x1, y1)} ${this.step(x2, y2)} ${this.reach(x, y, last ? 10 : 1)}`;
    return this.text;
  }
}

/** The route of each edge along `placed`'s tree: see the module's comment, 5. */
function router(tree: Tree, placed: Placed): (edge: GraphEdge) => Route {
  const { nodes, index, parent } = tree;
  const { x, y, up, depth, wide, side, trunk } = placed;
  const head: number[] = [];
  const tail: number[] = [];
  const term = (at: Index) => nodes[at]!.kind === "vocabularyLeaf";
  /** How far `b` is aside from the line out of the middle through `a`, or the other way round. */
  const asideOf = (a: number, b: number) =>
    Math.abs(x[a]! * y[b]! - y[a]! * x[b]!) /
    Math.max(1, Math.hypot(x[a]!, y[a]!), Math.hypot(x[b]!, y[b]!));
  /** Out of the inner end along its angle, and into the outer along its own (as d3's linkRadial); a line, when the two are about as far out, or one is straight out from the other. */
  const linked = (a: number, b: number) => {
    const ra = Math.hypot(x[a]!, y[a]!);
    const rb = Math.hypot(x[b]!, y[b]!);
    const path = new PathText(x[a]!, y[a]!);
    if (Math.abs(ra - rb) < SLOT || asideOf(a, b) < 1) return path.line(x[b]!, y[b]!, true);
    const mid = (ra + rb) / 2;
    let [sa, sb] = [mid / Math.max(1, ra), mid / Math.max(1, rb)];
    // More than a right angle round from each other: out of the inner end along its angle would loop back; it leaves toward the other.
    if (x[a]! * x[b]! + y[a]! * y[b]! < 0) [sa, sb] = ra < rb ? [1, sb] : [sa, 1];
    return path.curve(x[a]! * sa, y[a]! * sa, x[b]! * sb, y[b]! * sb, x[b]!, y[b]!, true);
  };
  /** Whether a path from `a` through `b` to `c` turns back at `b`, by more than TURN_MOST. */
  const turnsBack = (a: number, b: number, c: number) => {
    const [ux, uy, vx, vy] = [x[b]! - x[a]!, y[b]! - y[a]!, x[c]! - x[b]!, y[c]! - y[b]!];
    return ux * vx + uy * vy < -TURN_MOST * Math.hypot(ux, uy) * Math.hypot(vx, vy);
  };
  /** Between two nodes of a column of the band, a curve bowed to the side of `a`'s unit; else none. */
  const bowed = (a: number, b: number) => {
    if (side[a] === 0 || side[b] === 0 || asideOf(a, b) >= 1) return undefined;
    const [dx, dy] = [x[b]! - x[a]!, y[b]! - y[a]!];
    const [ax, ay] = [x[a]! - dy * BOW * side[a]!, y[a]! + dx * BOW * side[a]!];
    const path = new PathText(x[a]!, y[a]!);
    return [
      path.curve(
        ax + dx / 3,
        ay + dy / 3,
        ax + (2 * dx) / 3,
        ay + (2 * dy) / 3,
        x[b]!,
        y[b]!,
        true,
      ),
    ];
  };
  /** A route, and how it is drawn for a node selected, if not the same. */
  const routed = (parts: string[], tree: boolean, a: number, b: number): Route => {
    const focus = bowed(a, b);
    return focus === undefined ? { parts, tree } : { parts, tree, focus };
  };
  /** The steps from `child` up to its parent `parent`, through its routing points, after `parts`. */
  const chain = (parent: number, child: number, parts: string[] = []) => {
    for (let at = child; at !== parent; at = up[at]!) parts.push(linked(up[at]!, at));
    return parts;
  };
  /** Into `head`, the path up the tree from `from` to where it meets the one from `to`, and down that to `to`. */
  const walk = (from: number, to: number) => {
    let [a, b] = [from, to];
    head.length = 0;
    tail.length = 0;
    while (depth[a]! > depth[b]!) {
      head.push(a);
      a = up[a]!;
    }
    while (depth[b]! > depth[a]!) {
      tail.push(b);
      b = up[b]!;
    }
    while (a !== b) {
      head.push(a);
      tail.push(b);
      a = up[a]!;
      b = up[b]!;
    }
    head.push(a, ...tail.reverse());
  };
  /** The points of `between` a bundle's curve goes through: past a hub as wide as half the drawing or more, the middle above all: it is far from most of what it holds; and past one it would turn back at, the curve looping. */
  const throughOf = (between: number[]) => {
    const through = [between[0]!];
    for (let k = 1; k < between.length; k++) {
      const at = between[k]!;
      if (k < between.length - 1 && (wide[at] || turnsBack(through.at(-1)!, at, between[k + 1]!)))
        continue;
      through.push(at);
    }
    return through;
  };
  return (edge) => {
    const a = index.get(edge.from)!;
    const b = index.get(edge.to)!;
    if (parent[b] === a) return routed(chain(a, b), true, a, b);
    if (parent[a] === b) return routed(chain(b, a), true, b, a);
    if (a === b) return { parts: [linked(a, b)], tree: false };
    // To a term, of thousands perhaps: up the tree to the hub under the widest, and on from it, those of a document's nodes in the same few parts.
    if (term(a) !== term(b)) {
      let at = term(a) ? b : a;
      const parts: string[] = [];
      for (; up[at] !== -1 && !wide[up[at]!]; at = up[at]!) parts.push(linked(up[at]!, at));
      parts.push(linked(term(a) ? a : b, at));
      return { parts, tree: false };
    }
    walk(a, b);
    // Up the tree from each end to its block or hub, as the tree's edges go; bundled between those, the same curve for all that join the same two.
    let first = 0;
    while (first < head.length - 1 && !trunk[head[first]!]) first++;
    let last = head.length - 1;
    while (last > first && !trunk[head[last]!]) last--;
    if (last === first) [first, last] = [0, head.length - 1];
    const parts = chain(head[first]!, a);
    const between = head.slice(first, last + 1);
    if (between[0]! > between.at(-1)!) between.reverse();
    const through = throughOf(between);
    parts.push(
      spline(
        through.map((at) => x[at]!),
        through.map((at) => y[at]!),
      ),
    );
    return routed(chain(head[last]!, b, parts), false, a, b);
  };
}

/** The layout of `graph`: see the module's comment. */
export function createLayout(graph: InstanceGraph): Layout {
  const steps = 3 + Math.ceil(graph.edges.length / ROUTE_BATCH);
  let done = 0;
  let sorted: InstanceGraph;
  let tree: Tree;
  let placed: ReturnType<typeof place>;
  let route: (edge: GraphEdge) => Route;
  const routes = new Map<GraphEdge, Route>();
  const run = () => {
    if (done === 0) sorted = sortedOf(graph);
    else if (done === 1) tree = treeOf(sorted);
    else if (done === 2) {
      placed = place(tree);
      route = router(tree, placed);
    } else {
      const from = (done - 3) * ROUTE_BATCH;
      for (const edge of graph.edges.slice(from, from + ROUTE_BATCH)) routes.set(edge, route(edge));
    }
    done++;
  };
  return {
    step(count) {
      for (let k = 0; k < count && done < steps; k++) run();
      return done / steps;
    },
    get done() {
      return done === steps;
    },
    positions: () => placed.positions,
    // An edge of a graph of the same nodes and edges, not the same objects, is routed as it is asked for.
    routes: () => ({
      of(edge) {
        let known = routes.get(edge);
        if (known === undefined) {
          known = route(edge);
          routes.set(edge, known);
        }
        return known;
      },
    }),
  };
}

/**
 * A short mark of a graph, the same for the same nodes and edges: so a
 * layout kept from before is used only for the graph it was made of
 * (FNV-1a over every id and edge).
 */
export function graphFingerprint(graph: InstanceGraph): string {
  let hash = 0x811c9dc5;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const node of graph.nodes) mix(`${node.id}\u0000${node.kind}\u0000`);
  for (const edge of graph.edges) mix(`${edge.from}\u0000${edge.predicate}\u0000${edge.to}\u0000`);
  return `${graph.nodes.length}.${graph.edges.length}.${(hash >>> 0).toString(16)}`;
}
