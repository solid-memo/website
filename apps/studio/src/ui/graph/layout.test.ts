// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  instanceGraphOf,
  LDP_CONTAINS,
  type GraphDocument,
  type GraphEdgeKind,
  type GraphNode,
  type GraphNodeKind,
  type InstanceGraph,
} from "@solid-memo/domain/instanceGraph";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import { growth } from "@solid-memo/domain/testing/growth";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { instanceA } from "../../test/fixtures";
import {
  ANSWER,
  CARD,
  CARDS,
  CATALOG,
  DECK,
  DISTRACTOR,
  GONE,
  largeGraph,
  PREFERENCES,
  REVIEW,
  smallGraph,
} from "../../test/graph";
import { createLayout, graphFingerprint, ROUTE_BATCH, type Point } from "./layout";

const INSTANCE = instanceA.url;
const TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
const SEES = "https://example.org/sees";

/** A layout of `graph` run to the end. */
function laidOut(graph: InstanceGraph) {
  const layout = createLayout(graph);
  layout.step(Infinity);
  return { positions: layout.positions(), routes: layout.routes() };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const ORIGIN = { x: 0, y: 0 };
const pointsOf = (positions: ReadonlyMap<string, Point>) =>
  new Set([...positions.values()].map(({ x, y }) => `${x} ${y}`));

/** Where the path data `d` starts, and where it ends: it is written with M, then l and c alone. */
function endsOf(d: string): { start: Point; end: Point } {
  const tokens = d.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g)!;
  const at = { x: 0, y: 0 };
  let start = at;
  let k = 0;
  const numbers = (count: number) => tokens.slice(k, (k += count)).map(Number);
  while (k < tokens.length) {
    const command = tokens[k++];
    if (command === "M") {
      [at.x, at.y] = numbers(2) as [number, number];
      start = { ...at };
    } else if (command === "l" || command === "c") {
      const moved = numbers(command === "l" ? 2 : 6);
      at.x += moved.at(-2)!;
      at.y += moved.at(-1)!;
    } else throw new Error(`${command} in ${d}`);
  }
  return { start, end: { ...at } };
}

/**
 * Each edge's route joins its ends: its parts, each a line or a curve
 * from one point to another, make a way from one end to the other; as
 * does how it is drawn for a node selected, when it is drawn otherwise.
 */
function expectRoutesJoinEnds(graph: InstanceGraph) {
  const { positions, routes } = laidOut(graph);
  const key = ({ x, y }: Point) => `${Math.round(x * 10)} ${Math.round(y * 10)}`;
  const joins = (parts: readonly string[], from: Point, to: Point) => {
    const next = new Map<string, string[]>();
    for (const { start, end } of parts.map(endsOf)) {
      next.set(key(start), [...(next.get(key(start)) ?? []), key(end)]);
      next.set(key(end), [...(next.get(key(end)) ?? []), key(start)]);
    }
    const seen = new Set([key(from)]);
    const queue = [key(from)];
    while (queue.length > 0)
      for (const each of next.get(queue.pop()!) ?? [])
        if (!seen.has(each)) {
          seen.add(each);
          queue.push(each);
        }
    return seen.has(key(to));
  };
  for (const each of graph.edges) {
    const { parts, focus } = routes.of(each);
    const [from, to] = [positions.get(each.from)!, positions.get(each.to)!];
    expect(joins(parts, from, to)).toBe(true);
    if (focus !== undefined) expect(joins(focus, from, to)).toBe(true);
  }
}

const node = (id: string, kind: GraphNodeKind, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind,
  types: [],
  literals: [],
  ...extra,
});
const edge = (from: string, to: string, predicate: string, kind: GraphEdgeKind = "link") => ({
  from,
  to,
  predicate,
  kind,
});
const triple = (subject: string, predicate: string, object: string): DraftTriple => ({
  subject,
  predicate,
  object: { kind: "iri", value: object },
});
const found = (url: string, triples: DraftTriple[]): GraphDocument => ({
  url,
  found: true,
  triples,
});

/** An instance of decks, each of its name, how many cards, and how many times each was answered, the answers in one month. */
function decks(sizes: readonly [string, number, number][]): InstanceGraph {
  const month = `${INSTANCE}history/2026-10.ttl`;
  const answers: DraftTriple[] = [];
  const documents: GraphDocument[] = [];
  const catalog: DraftTriple[] = [];
  for (const [name, cards, times] of sizes) {
    const deck = `${CATALOG}#${name}`;
    const cardsUrl = `${INSTANCE}decks/${name}.ttl`;
    catalog.push(triple(deck, TYPE, SM.Deck), triple(deck, SM.cardsDocument, cardsUrl));
    const triples: DraftTriple[] = [];
    for (let at = 0; at < cards; at++) {
      const card = `${cardsUrl}#card-${at}`;
      triples.push(triple(card, TYPE, SM.Card));
      for (let time = 0; time < times; time++) {
        const answer = `${month}#${name}-${at}-${time}`;
        answers.push(triple(answer, SM.answeredCard, card), triple(answer, SM.answeredDeck, deck));
      }
    }
    documents.push(found(cardsUrl, triples));
  }
  return instanceGraphOf({
    instanceUrl: INSTANCE,
    storages: ["https://pod.example/"],
    documents: [found(CATALOG, catalog), ...documents, found(month, answers)],
  });
}

/** An instance of `cards` cards (largeGraph), and a document of `links` resources each part of the next, each a card and each linking to the first. */
function chained(links: number, cards = 100): InstanceGraph {
  const base = largeGraph(cards);
  const doc = `${INSTANCE}chain.ttl`;
  const at = (k: number) => `${doc}#r${k}`;
  const triples = Array.from({ length: links }, (_, k) => [
    triple(at(k), IS_PART_OF, at(k + 1)),
    triple(at(k + 1), SEES, at(0)),
    triple(at(k), TYPE, SM.Card),
  ]).flat();
  const chain = instanceGraphOf({
    instanceUrl: INSTANCE,
    storages: ["https://pod.example/"],
    documents: [found(doc, triples)],
  });
  const ids = new Set(base.nodes.map((each) => each.id));
  return {
    nodes: [...base.nodes, ...chain.nodes.filter((each) => !ids.has(each.id))],
    edges: [...base.edges, ...chain.edges],
  };
}

describe("createLayout", () => {
  it.each([
    ["a small instance", smallGraph()],
    ["a deck of 300 cards", largeGraph(300)],
    [
      "decks with answers",
      decks([
        ["a", 120, 2],
        ["b", 80, 1],
        ["c", 3, 0],
      ]),
    ],
  ])(
    "places every node of %s at a point of its own, and routes every edge from one end to the other",
    (_, graph) => {
      const { positions } = laidOut(graph);
      expect([...positions.keys()].sort()).toEqual(graph.nodes.map((each) => each.id).sort());
      expect(pointsOf(positions).size).toBe(graph.nodes.length);
      for (const { x, y } of positions.values()) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
      expectRoutesJoinEnds(graph);
    },
  );

  it("lays the same graph out the same way, whatever order its nodes and edges come in", () => {
    const graph = decks([
      ["a", 40, 1],
      ["b", 30, 2],
    ]);
    const shuffled: InstanceGraph = {
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    };
    const drawn = (laid: ReturnType<typeof laidOut>) => ({
      positions: [...laid.positions].sort(),
      routes: graph.edges.map((each) => laid.routes.of(each)),
    });
    expect(drawn(laidOut(shuffled))).toEqual(drawn(laidOut(graph)));
  });

  it("hangs a review state and a wrong option by their card, a cards document under its deck, and draws those edges as the tree's", () => {
    const graph = smallGraph();
    const { positions, routes } = laidOut(graph);
    const of = (from: string, to: string) =>
      routes.of(graph.edges.find((each) => each.from === from && each.to === to)!);
    expect(of(REVIEW, CARD).tree).toBe(true);
    expect(of(CARD, DISTRACTOR).tree).toBe(true);
    expect(of(DECK, CARDS).tree).toBe(true);
    expect(of(CARDS, CARD).tree).toBe(true);
    // The review state's document holds it, but it hangs by its card: bundled.
    expect(of(`${INSTANCE}reviews/capitals.ttl`, REVIEW).tree).toBe(false);
    expect(distance(positions.get(REVIEW)!, positions.get(CARD)!)).toBeLessThanOrEqual(24);
    expect(distance(positions.get(DISTRACTOR)!, positions.get(CARD)!)).toBeLessThanOrEqual(24);
  });

  it("draws the instance's documents that hold next to nothing round the middle, the cards in a band outside them, and the terms outside it", () => {
    const graph = decks([["a", 200, 1]]);
    const { positions } = laidOut(graph);
    const radius = (id: string) => distance(positions.get(id)!, ORIGIN);
    const month = `${INSTANCE}history/2026-10.ttl`;
    const card = `${INSTANCE}decks/a.ttl#card-7`;
    expect(radius(month)).toBeLessThan(radius(card) / 2);
    expect(radius(`${INSTANCE}history/`)).toBeLessThan(radius(card) / 2);
    const terms = graph.nodes.filter((each) => each.kind === "vocabularyLeaf");
    const others = graph.nodes.filter((each) => each.kind !== "vocabularyLeaf");
    expect(terms.length).toBeGreaterThan(0);
    const inner = Math.min(...terms.map((each) => radius(each.id)));
    expect(Math.max(...others.map((each) => radius(each.id)))).toBeLessThan(inner);
    // Its answers hang by their cards, in the band too.
    expect(radius(`${month}#a-7-0`)).toBeGreaterThan(radius(month));
  });

  it("spreads many terms linked from the same node round the rim, each at a point of its own", () => {
    const terms = Array.from({ length: 400 }, (_, at) => `${SM.Card}${at}`);
    const graph: InstanceGraph = {
      nodes: [
        node(INSTANCE, "container"),
        node(`${INSTANCE}a.ttl`, "document", { document: `${INSTANCE}a.ttl`, found: true }),
        node(`${INSTANCE}a.ttl#it`, "resource", { document: `${INSTANCE}a.ttl` }),
        ...terms.map((term) => node(term, "vocabularyLeaf")),
      ],
      edges: [
        edge(INSTANCE, `${INSTANCE}a.ttl`, LDP_CONTAINS, "containment"),
        edge(`${INSTANCE}a.ttl`, `${INSTANCE}a.ttl#it`, "", "containment"),
        ...terms.map((term) => edge(`${INSTANCE}a.ttl#it`, term, TYPE, "vocabulary")),
      ],
    };
    expect(pointsOf(laidOut(graph).positions).size).toBe(graph.nodes.length);
  });

  it("falls back to what holds a node when hanging it by what it is about makes a cycle, else to the middle", () => {
    const doc = `${INSTANCE}decks/d.ttl`;
    const card = `${doc}#c`;
    const [a, b, c, m, z] = ["a", "b", "c", "m", "z"].map(
      (name) => `https://elsewhere.example/${name}`,
    );
    const linked = `${INSTANCE}l.ttl#linked`;
    const graph: InstanceGraph = {
      nodes: [
        node(INSTANCE, "container"),
        node(`${INSTANCE}decks/`, "container"),
        node(doc, "document", { document: doc, found: true }),
        node(card, "resource", { document: doc }),
        node(`${INSTANCE}l.ttl`, "document", { document: `${INSTANCE}l.ttl`, found: true }),
        node(linked, "resource", { document: `${INSTANCE}l.ttl` }),
        ...[a, b, c, m, z].map((id) => node(id, "outsideLeaf")),
      ],
      edges: [
        edge(INSTANCE, `${INSTANCE}decks/`, LDP_CONTAINS, "containment"),
        edge(`${INSTANCE}decks/`, doc, LDP_CONTAINS, "containment"),
        edge(INSTANCE, `${INSTANCE}l.ttl`, LDP_CONTAINS, "containment"),
        edge(doc, card, "", "containment"),
        edge(`${INSTANCE}l.ttl`, linked, "", "containment"),
        // A card naming its own document as a deck's cards: the document falls back to its folder.
        edge(card, doc, SM.cardsDocument),
        // Two leaves each part of the other, one linked first from a leaf a resource links to: it falls back to that.
        edge(a, z, IS_PART_OF),
        edge(z, a, IS_PART_OF),
        edge(m, a, SEES),
        edge(linked, m, SEES),
        // Two more, each linked first from the other: both to the middle.
        edge(b, c, IS_PART_OF),
        edge(c, b, IS_PART_OF),
        edge(z, b, SEES),
      ],
    };
    const { positions, routes } = laidOut(graph);
    const of = (from: string, to: string) =>
      routes.of(graph.edges.find((each) => each.from === from && each.to === to)!);
    expect(of(`${INSTANCE}decks/`, doc).tree).toBe(true);
    expect(of(card, doc).tree).toBe(true);
    expect(of(m, a).tree).toBe(true);
    expect(of(linked, m).tree).toBe(true);
    expect(of(z, a).tree).toBe(true);
    expect(of(c, b).tree).toBe(true);
    expect(of(z, b).tree).toBe(false);
    expect(pointsOf(positions).size).toBe(graph.nodes.length);
    expectRoutesJoinEnds(graph);
  });

  it("breaks a cycle at the same node, whatever unrelated node sorts before it", () => {
    const decksFolder = `${INSTANCE}decks/`;
    const doc = `${decksFolder}d.ttl`;
    const card = `${doc}#c`;
    const other = `${INSTANCE}a.ttl`;
    const graph = (unrelated: boolean): InstanceGraph => ({
      nodes: [
        node(INSTANCE, "container"),
        node(decksFolder, "container"),
        node(doc, "document", { document: doc, found: true }),
        node(card, "resource", { document: doc }),
        ...(unrelated
          ? [
              node(other, "document", { document: other, found: true }),
              node(`${other}#x`, "resource", { document: other }),
            ]
          : []),
      ],
      edges: [
        edge(INSTANCE, decksFolder, LDP_CONTAINS, "containment"),
        edge(decksFolder, doc, LDP_CONTAINS, "containment"),
        edge(doc, card, "", "containment"),
        edge(card, doc, SM.cardsDocument),
        ...(unrelated
          ? [
              edge(INSTANCE, other, LDP_CONTAINS, "containment"),
              edge(other, `${other}#x`, "", "containment"),
              // Hangs under the card, so the walk comes into the cycle at it.
              edge(`${other}#x`, card, SM.answeredCard),
            ]
          : []),
      ],
    });
    for (const unrelated of [false, true]) {
      const { routes } = laidOut(graph(unrelated));
      const of = (from: string, to: string) =>
        routes.of(graph(unrelated).edges.find((each) => each.from === from && each.to === to)!);
      // The document hangs in its folder, the card in its document.
      expect(of(decksFolder, doc).tree).toBe(true);
      expect(of(doc, card).tree).toBe(true);
    }
  });

  it("routes the edges to a term up the tree, those of a document's nodes meeting in the same parts", () => {
    const graph = largeGraph(40);
    const { routes } = laidOut(graph);
    const toCard = graph.edges.filter((each) => each.to === SM.Card);
    expect(toCard.length).toBe(40);
    // Up to the hub, or to its blocks when it is as wide as half the drawing: a few curves to the term, not one for each card.
    const last = new Set(toCard.map((each) => routes.of(each).parts.at(-1)));
    expect(last.size).toBeLessThan(toCard.length / 4);
    for (const each of toCard) expect(routes.of(each).parts.length).toBeGreaterThan(1);
    expectRoutesJoinEnds(graph);
  });

  it("bundles the edges between the same two blocks in one curve, up the tree at each end as its edges go", () => {
    const graph = largeGraph(60);
    const { routes } = laidOut(graph);
    const reviews = REVIEW.split("#")[0]!;
    // A review state hangs by its card: its document's edge to it is bundled.
    const held = graph.edges.filter((each) => each.from === reviews && each.kind === "containment");
    expect(held).toHaveLength(60);
    const curves = held.map((each) => {
      const route = routes.of(each);
      expect(route.tree).toBe(false);
      // From the document to the block, then up the tree, as the card's own edges go, to the review state.
      expect(route.parts.length).toBeGreaterThan(1);
      return route.parts[0];
    });
    expect(new Set(curves).size).toBeLessThan(held.length / 4);
    expectRoutesJoinEnds(graph);
  });

  it("draws a card's links to the nodes of its own column bowed aside for it selected, each its own curve", () => {
    const graph = smallGraph();
    const { routes } = laidOut(graph);
    const route = routes.of(
      graph.edges.find((each) => each.from === CARD && each.to === DISTRACTOR)!,
    );
    expect(route.focus).toHaveLength(1);
    expect(route.focus![0]).toMatch(/c/);
    expect(route.focus).not.toEqual(route.parts);
  });

  it("gathers the routes of a document of very many cards into a few trunks", () => {
    const graph = largeGraph(3000);
    const { routes } = laidOut(graph);
    const held = graph.edges.filter(
      (each) => each.from === CARDS && each.kind === "containment" && !each.to.endsWith("-d1"),
    );
    expect(held.length).toBeGreaterThan(2000);
    const trunks = new Set(held.map((each) => routes.of(each).parts.at(-1)));
    expect(trunks.size).toBeLessThanOrEqual(12);
    expectRoutesJoinEnds(graph);
  });

  it("puts a middle of its own over documents in no one folder, hangs a node by its strongest link, and draws an edge to itself", () => {
    const [one, two] = [`${INSTANCE}one.ttl`, `${INSTANCE}two.ttl`];
    const graph: InstanceGraph = {
      nodes: [
        node(one, "document", { document: one, found: true }),
        node(`${one}#x`, "resource", { document: one }),
        node(two, "document", { document: two, found: false }),
        node(`${two}#y`, "resource", { document: two }),
        node(SM.Card, "vocabularyLeaf"),
        node(SM.Deck, "vocabularyLeaf"),
      ],
      edges: [
        edge(one, `${one}#x`, "", "containment"),
        // Defined in two documents: the first holds it.
        edge(two, `${one}#x`, "", "containment"),
        edge(two, `${two}#y`, "", "containment"),
        // Part of one, and the review of another: the first is the stronger.
        edge(`${one}#x`, one, IS_PART_OF),
        edge(`${one}#x`, one, SEES),
        edge(`${one}#x`, `${two}#y`, SM.reviewOf),
        edge(`${two}#y`, `${two}#y`, "https://example.org/same"),
        edge(`${one}#x`, SM.Card, TYPE, "vocabulary"),
        edge(SM.Card, SM.Deck, "https://example.org/broader", "vocabulary"),
        // From a term, to a node: up the tree from the node all the same.
        edge(SM.Deck, `${two}#y`, "https://example.org/about"),
      ],
    };
    const { positions, routes } = laidOut(graph);
    expect(pointsOf(positions).size).toBe(graph.nodes.length);
    const of = (from: string, to: string) =>
      routes.of(graph.edges.find((each) => each.from === from && each.to === to)!);
    expect(of(`${one}#x`, one).tree).toBe(true);
    expect(of(`${one}#x`, `${two}#y`).tree).toBe(false);
    expect(of(`${two}#y`, `${two}#y`).tree).toBe(false);
    expectRoutesJoinEnds(graph);
  });

  it("makes a card of very many answers a hub of its own, and splits a unit longer than a column", () => {
    const graph = decks([
      ["a", 2, 70],
      ["b", 1, 20],
      ["c", 6, 0],
    ]);
    expect(pointsOf(laidOut(graph).positions).size).toBe(graph.nodes.length);
    expectRoutesJoinEnds(graph);
  });

  it("runs as many steps as asked, routing its edges a batch a step, says how far it is, and stops at the end", () => {
    const graph = largeGraph(ROUTE_BATCH);
    const steps = 3 + Math.ceil(graph.edges.length / ROUTE_BATCH);
    expect(steps).toBeGreaterThan(4);
    const layout = createLayout(graph);
    expect(layout.done).toBe(false);
    expect(layout.step(1)).toBe(1 / steps);
    expect(layout.step(2)).toBe(3 / steps);
    expect(layout.step(Infinity)).toBe(1);
    expect(layout.done).toBe(true);
    const end = layout.positions();
    expect(layout.step(10)).toBe(1);
    expect(layout.positions()).toBe(end);
  });

  it("routes an edge of the same graph read again as it is asked for, once", () => {
    const graph = smallGraph();
    const { routes } = laidOut(graph);
    const first = graph.edges.find((each) => each.from === ANSWER && each.to === GONE)!;
    const again = { ...first };
    const route = routes.of(again);
    expect(route).toEqual(routes.of(first));
    expect(routes.of(again)).toBe(route);
  });

  it("lays out a graph of none", () => {
    const layout = createLayout({ nodes: [], edges: [] });
    expect(layout.step(Infinity)).toBe(1);
    expect(layout.positions().size).toBe(0);
  });

  it("places a document there was none of, and a term nothing links to", () => {
    const graph: InstanceGraph = {
      nodes: [
        node(INSTANCE, "container"),
        node(PREFERENCES, "document"),
        node(SM.Card, "vocabularyLeaf"),
      ],
      edges: [edge(INSTANCE, PREFERENCES, LDP_CONTAINS, "containment")],
    };
    const { positions } = laidOut(graph);
    expect(positions.get(INSTANCE)).toEqual(ORIGIN);
    const radius = (id: string) => distance(positions.get(id)!, ORIGIN);
    expect(radius(PREFERENCES)).toBeGreaterThan(0);
    expect(radius(SM.Card)).toBeGreaterThan(radius(PREFERENCES));
  });

  // Eight times the cards must take less than four times as long as the small instance done eight times over (testing.md).
  it("lays out and routes in time linear in the instance", () => {
    const ratio = growth(
      (cards) => {
        const graph = largeGraph(cards);
        return () => createLayout(graph).step(Infinity);
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("lays out a long chain of parts, each linking to the far end, its routes no longer for it", () => {
    const graph = chained(2000);
    const { positions, routes } = laidOut(graph);
    const longest = Math.max(...graph.edges.map((each) => routes.of(each).parts.join("").length));
    // Along the tree, a route through every link between would be tens of thousands of characters.
    expect(longest).toBeLessThan(1000);
    expect(pointsOf(positions).size).toBe(graph.nodes.length);
    expectRoutesJoinEnds(graph);
  });

  // A chain of 5,000 links eight times as long as one of 625, beside a few hundred other nodes.
  it("lays out and routes a long chain of parts in time linear in it", () => {
    const ratio = growth(
      (links) => {
        const graph = chained(links);
        return () => createLayout(graph).step(Infinity);
      },
      625,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("graphFingerprint", () => {
  it("is the same for the same graph, and differs for another", () => {
    expect(graphFingerprint(smallGraph())).toBe(graphFingerprint(smallGraph()));
    expect(graphFingerprint(smallGraph())).not.toBe(graphFingerprint(largeGraph(1)));
    const graph = smallGraph();
    const relinked: InstanceGraph = {
      nodes: graph.nodes,
      edges: graph.edges.map((each, at) => (at === 0 ? { ...each, predicate: "x" } : each)),
    };
    expect(graphFingerprint(relinked)).not.toBe(graphFingerprint(graph));
    expect(graphFingerprint(graph)).toMatch(/^\d+\.\d+\.[0-9a-f]+$/);
  });
});
