// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What the graph screen shows of an instance graph
 * (domain/instanceGraph.ts), worked out apart from drawing it: which
 * nodes the filters keep, what each is called, what it is linked to, and
 * which node an arrow key goes to. Names are worked out from the IRI
 * alone, never from text measured on the page: the same in a test as in
 * a browser.
 */

import { SM, SM_NS } from "@solid-memo/vocab/vocab.generated";
import type { GraphEdge, GraphNode, InstanceGraph } from "@solid-memo/domain/instanceGraph";
import type { Point, Positions } from "./layout";

/**
 * The nodes a filter of the screen hides or shows: the cards, their
 * wrong options, their review states, the answers, the leaves (what is
 * not read: outside the pod, in it but not Solid Memo's, or named and
 * found in no document) and the vocabulary terms. Folders, documents and
 * every other resource are always shown.
 */
export type NodeGroup =
  | "cards"
  | "distractors"
  | "reviewStates"
  | "answers"
  | "leaves"
  | "vocabulary";

/** The filters the screen lists first, in its order; the vocabulary terms' it lists last, after the others. */
export const NODE_GROUPS: readonly NodeGroup[] = [
  "cards",
  "distractors",
  "reviewStates",
  "answers",
  "leaves",
];

/** How the graph is looked at: the groups hidden, whether only the selected node and its neighbors are, and whether as tables. */
export interface GraphFilters {
  hidden: readonly NodeGroup[];
  neighborsOnly: boolean;
  table: boolean;
}

/** Everything shown but the vocabulary terms, drawn: their thousands of edges, to a few terms, say little until asked for. */
export const DEFAULT_FILTERS: GraphFilters = {
  hidden: ["vocabulary"],
  neighborsOnly: false,
  table: false,
};

/**
 * Past this many nodes or edges shown, the graph is not drawn until asked
 * to: a browser draws an instance of the ten largest library decks
 * (about 14,500 nodes and 48,000 edges) smoothly, and slows beyond.
 */
export const DRAW_LIMIT = { nodes: 20_000, edges: 60_000 };

const CLASS_GROUPS: readonly [string, NodeGroup][] = [
  [SM.Card, "cards"],
  [SM.Distractor, "distractors"],
  [SM.ReviewState, "reviewStates"],
  [SM.Answer, "answers"],
];

/** The filter a node is under; null for one always shown. */
export function groupOf(node: GraphNode): NodeGroup | null {
  switch (node.kind) {
    case "vocabularyLeaf":
      return "vocabulary";
    case "podLeaf":
    case "outsideLeaf":
    case "missing":
      return "leaves";
    case "resource":
      return CLASS_GROUPS.find(([type]) => node.types.includes(type))?.[1] ?? null;
    default:
      return null;
  }
}

/** The nodes and edges a graph shows. */
export interface ShownGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The part of `graph` the filters show: the nodes of no hidden group, and
 * the edges between two of them; with `neighborsOnly` and a node of the
 * graph selected (`selected`), that node, even of a hidden group, and
 * those an edge shown joins it to.
 */
export function shownGraph(
  graph: InstanceGraph,
  filters: GraphFilters,
  selected: string | null,
): ShownGraph {
  const hidden = new Set(filters.hidden);
  const kept = graph.nodes.filter((node) => {
    const group = groupOf(node);
    return group === null || !hidden.has(group) || (filters.neighborsOnly && node.id === selected);
  });
  const ids = new Set(kept.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  if (!filters.neighborsOnly || selected === null || !ids.has(selected)) {
    return { nodes: kept, edges };
  }
  const near = neighborsOf(edges, selected);
  near.add(selected);
  return {
    nodes: kept.filter((node) => near.has(node.id)),
    edges: edges.filter((edge) => near.has(edge.from) && near.has(edge.to)),
  };
}

/** The nodes an edge joins `id` to, either way. */
function neighborsOf(edges: readonly GraphEdge[], id: string): Set<string> {
  const near = new Set<string>();
  for (const edge of edges) {
    if (edge.from === id) near.add(edge.to);
    if (edge.to === id) near.add(edge.from);
  }
  return near;
}

/** Whether a graph is too large to draw without being asked (DRAW_LIMIT). */
export function tooLarge(shown: ShownGraph): boolean {
  return shown.nodes.length > DRAW_LIMIT.nodes || shown.edges.length > DRAW_LIMIT.edges;
}

/** The namespaces a term is named by in short ("sm:Card"), the vocabularies the documents use. */
const PREFIXES: readonly [string, string][] = [
  ["sm", SM_NS],
  ["rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs", "http://www.w3.org/2000/01/rdf-schema#"],
  ["xsd", "http://www.w3.org/2001/XMLSchema#"],
  ["owl", "http://www.w3.org/2002/07/owl#"],
  ["skos", "http://www.w3.org/2004/02/skos/core#"],
  ["ldp", "http://www.w3.org/ns/ldp#"],
  ["dcat", "http://www.w3.org/ns/dcat#"],
  ["prov", "http://www.w3.org/ns/prov#"],
  ["solid", "http://www.w3.org/ns/solid/terms#"],
  ["pim", "http://www.w3.org/ns/pim/space#"],
  ["vcard", "http://www.w3.org/2006/vcard/ns#"],
  ["adms", "http://www.w3.org/ns/adms#"],
  ["dcterms", "http://purl.org/dc/terms/"],
  ["foaf", "http://xmlns.com/foaf/0.1/"],
  ["schema", "https://schema.org/"],
  ["schema", "http://schema.org/"],
];

/** A term in short, by its vocabulary's prefix ("dcat:Dataset"); its IRI when no prefix is known for it. */
export function shortName(iri: string): string {
  const known = PREFIXES.find(([, namespace]) => iri.startsWith(namespace));
  return known === undefined ? iri : `${known[0]}:${iri.slice(known[1].length)}`;
}

/**
 * What a node is called in the graph: the instance's folder by the
 * instance's name; a folder or a document by its path in the instance; a
 * blank node by its label; a vocabulary term in short; any other by its
 * fragment, else the last part of its path, else its IRI.
 */
export function labelOf(node: GraphNode, instanceUrl: string, instanceName: string): string {
  if (node.id === instanceUrl) return instanceName;
  if ((node.kind === "container" || node.kind === "document") && node.id.startsWith(instanceUrl))
    return node.id.slice(instanceUrl.length);
  // A blank node's label holds no "@", its document's address may.
  if (node.blank === true) return node.id.slice(0, node.id.indexOf("@"));
  if (node.kind === "vocabularyLeaf" && shortName(node.id) !== node.id) return shortName(node.id);
  const hash = node.id.indexOf("#");
  if (hash !== -1 && hash < node.id.length - 1) return node.id.slice(hash + 1);
  const segment = node.id.split(/[/?#]/).filter((part) => part !== "");
  return segment.length > 1 ? segment.at(-1)! : node.id;
}

/** A document's name in a label: its path in the instance, else its last part; no extension. */
function documentName(document: string, instanceUrl: string): string {
  const path = document.startsWith(instanceUrl)
    ? document.slice(instanceUrl.length)
    : document.split("/").at(-1)!;
  return path.replace(/\.[^./]*$/, "");
}

/**
 * `labels` with no two the same that can be told apart: a node of a
 * document named as another node is is named after its document's file
 * too ("korean-verbs#card-7"), and when that is still another's, after the
 * document's path in the instance ("reviews/korean-verbs#card-7"). A
 * folder, a document, and a node of no document keep their names.
 */
export function distinctLabels(
  nodes: readonly GraphNode[],
  labels: ReadonlyMap<string, string>,
  instanceUrl: string,
): Map<string, string> {
  const named = (each: GraphNode) =>
    each.document !== undefined && each.kind !== "container" && each.kind !== "document";
  const counted = (texts: Iterable<string>) => {
    const counts = new Map<string, number>();
    for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
    return counts;
  };
  const counts = counted(labels.values());
  const shared = nodes.filter((each) => named(each) && counts.get(labels.get(each.id)!)! > 1);
  const shortOf = (each: GraphNode) =>
    `${documentName(each.document!, instanceUrl).split("/").at(-1)}#${labels.get(each.id)}`;
  const shortCounts = counted(shared.map(shortOf));
  const distinct = new Map(labels);
  for (const each of shared) {
    const short = shortOf(each);
    distinct.set(
      each.id,
      shortCounts.get(short)! > 1
        ? `${documentName(each.document!, instanceUrl)}#${labels.get(each.id)}`
        : short,
    );
  }
  return distinct;
}

/** How long a label is drawn, in characters, before it is cut short. */
export const LABEL_LENGTH = 24;

/**
 * A label as drawn: cut short past LABEL_LENGTH characters, in the
 * middle, with an ellipsis, for its end (a fragment, often) to tell it
 * from another as long.
 */
export function drawnLabel(label: string): string {
  const characters = [...label];
  if (characters.length <= LABEL_LENGTH) return label;
  const head = Math.floor((LABEL_LENGTH - 1) / 2);
  return `${characters.slice(0, head).join("")}…${characters.slice(head - LABEL_LENGTH + 1).join("")}`;
}

/** An arrow key's direction, as a step across the drawing (y down). */
export const DIRECTIONS: Readonly<Record<string, Point>> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
};

/**
 * The node an arrow key goes to from `from`: the nearest of `ids` within
 * 45 degrees either side of `direction`, a node straight ahead counting
 * as nearer than one as far off to the side; null for none there.
 */
export function nearestInDirection(
  from: string,
  ids: readonly string[],
  positions: Positions,
  direction: Point,
): string | null {
  const at = positions.get(from)!;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const id of ids) {
    if (id === from) continue;
    const to = positions.get(id)!;
    const dx = to.x - at.x;
    const dy = to.y - at.y;
    const along = dx * direction.x + dy * direction.y;
    const across = Math.abs(dx * direction.y - dy * direction.x);
    if (along <= 0 || across > along) continue;
    const score = along + 2 * across;
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** A node of a graph with its edges, those from it and those to it. */
export interface IndexedNode {
  node: GraphNode;
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
}

/**
 * Every node of `graph` by its id, with its edges: built once for a
 * graph, so a node and its links are found without a scan of all.
 */
export function nodeIndexOf(graph: InstanceGraph): ReadonlyMap<string, IndexedNode> {
  const index = new Map<string, IndexedNode>(
    graph.nodes.map((node) => [node.id, { node, outgoing: [], incoming: [] }]),
  );
  for (const edge of graph.edges) {
    index.get(edge.from)!.outgoing.push(edge);
    index.get(edge.to)!.incoming.push(edge);
  }
  return index;
}

/** How soon a node is labelled, lowest first: folders and documents, then decks, then every other. */
export function labelRank(node: GraphNode): number {
  if (node.kind === "container" || node.kind === "document") return 0;
  return node.types.includes(SM.Deck) ? 1 : 2;
}

/**
 * The ids of `groups`, a group after another, each by its nodes' rank
 * (labelRank), the first of each id alone: the order labels are placed
 * in, the node selected and its neighbors before the rest.
 */
export function labelOrder(
  groups: readonly (readonly string[])[],
  nodes: ReadonlyMap<string, GraphNode>,
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const group of groups) {
    const ranked = group
      .filter((id) => !seen.has(id))
      .map((id) => ({ id, rank: labelRank(nodes.get(id)!) }))
      .sort((a, b) => a.rank - b.rank);
    for (const { id } of ranked) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

/** A label's box, in its sizes: a character this wide, and a line this high, as an estimate, and a gap after it, for the next not to touch it. */
const LABEL_BOX = { character: 0.6, line: 1.35, gap: 0.3 };

/**
 * Of `ids`, in their order, those whose labels can be drawn without
 * overlapping one drawn before, `most` of them at most: each label `size`
 * large (in the drawing's units), to the right of its node, as wide as
 * its characters (drawnLabel) are counted to be, never measured, and a
 * little higher and wider, for labels not to touch. Each
 * box placed is kept in the cells, a line high and as wide, of a grid it
 * covers, and a label is tried against those in its own cells alone: the
 * time is linear in the labels tried.
 */
export function placeLabels(
  ids: readonly string[],
  positions: Positions,
  labels: ReadonlyMap<string, string>,
  size: number,
  most = Infinity,
): string[] {
  const cell = LABEL_BOX.line * size;
  const grid = new Map<string, { left: number; top: number; right: number; bottom: number }[]>();
  const placed: string[] = [];
  for (const id of ids) {
    if (placed.length >= most) break;
    const at = positions.get(id)!;
    const left = at.x + size * 0.7;
    const top = at.y - size * 0.6;
    const box = {
      left,
      top,
      right:
        left +
        ([...drawnLabel(labels.get(id)!)].length * LABEL_BOX.character + LABEL_BOX.gap) * size,
      bottom: top + cell,
    };
    const cells: string[] = [];
    for (let column = Math.floor(left / cell); column <= Math.floor(box.right / cell); column++)
      for (let row = Math.floor(top / cell); row <= Math.floor(box.bottom / cell); row++)
        cells.push(`${column} ${row}`);
    const overlaps = cells.some((key) =>
      grid
        .get(key)
        ?.some(
          (other) =>
            box.left < other.right &&
            other.left < box.right &&
            box.top < other.bottom &&
            other.top < box.bottom,
        ),
    );
    if (overlaps) continue;
    for (const key of cells) {
      const here = grid.get(key);
      if (here === undefined) grid.set(key, [box]);
      else here.push(box);
    }
    placed.push(id);
  }
  return placed;
}
