// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { GraphNode } from "@solid-memo/domain/instanceGraph";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { instanceA } from "../../test/fixtures";
import {
  ANSWER,
  CARD,
  CARDS,
  CATALOG,
  CC0,
  DECK,
  DISTRACTOR,
  GONE,
  largeGraph,
  RELEASE,
  REVIEW,
  smallGraph,
  WEBID,
} from "../../test/graph";
import {
  DEFAULT_FILTERS,
  DIRECTIONS,
  distinctLabels,
  drawnLabel,
  groupOf,
  labelOf,
  LABEL_LENGTH,
  labelOrder,
  labelRank,
  nearestInDirection,
  nodeIndexOf,
  placeLabels,
  NODE_GROUPS,
  shortName,
  shownGraph,
  tooLarge,
} from "./graphModel";

const graph = smallGraph();
const nodeOf = (id: string): GraphNode => graph.nodes.find((node) => node.id === id)!;
const ids = (nodes: readonly GraphNode[]) => nodes.map((node) => node.id).sort();

describe("groupOf", () => {
  it("puts cards, wrong options, review states, answers, leaves and terms under their filters", () => {
    expect(groupOf(nodeOf(CARD))).toBe("cards");
    expect(groupOf(nodeOf(DISTRACTOR))).toBe("distractors");
    expect(groupOf(nodeOf(REVIEW))).toBe("reviewStates");
    expect(groupOf(nodeOf(ANSWER))).toBe("answers");
    expect(groupOf(nodeOf(WEBID))).toBe("leaves");
    expect(groupOf(nodeOf(RELEASE))).toBe("leaves");
    expect(groupOf(nodeOf(GONE))).toBe("leaves");
    expect(groupOf(nodeOf(SM.Card))).toBe("vocabulary");
  });

  it("puts no folder, document or other resource under a filter", () => {
    expect(groupOf(nodeOf(instanceA.url))).toBeNull();
    expect(groupOf(nodeOf(CATALOG))).toBeNull();
    expect(groupOf(nodeOf(DECK))).toBeNull();
  });

  it("lists every filter once, the vocabulary terms' apart, last", () => {
    expect(NODE_GROUPS).not.toContain("vocabulary");
    expect(new Set([...NODE_GROUPS, "vocabulary"]).size).toBe(6);
  });
});

describe("shownGraph", () => {
  it("shows everything but the vocabulary terms by default, and everything with no group hidden", () => {
    const shown = shownGraph(graph, DEFAULT_FILTERS, null);
    expect(shown.nodes).toEqual(graph.nodes.filter((node) => node.kind !== "vocabularyLeaf"));
    expect(shown.edges).toEqual(graph.edges.filter((edge) => edge.kind !== "vocabulary"));
    expect(shownGraph(graph, { ...DEFAULT_FILTERS, hidden: [] }, null)).toEqual(graph);
  });

  it("hides the nodes of a hidden group, and their edges", () => {
    const shown = shownGraph(graph, { ...DEFAULT_FILTERS, hidden: ["vocabulary", "cards"] }, null);
    expect(shown.nodes.some((node) => node.id === CARD || node.id === SM.Card)).toBe(false);
    expect(shown.nodes.length).toBe(
      graph.nodes.filter((node) => node.kind !== "vocabularyLeaf").length - 1,
    );
    expect(shown.edges.every((edge) => edge.kind !== "vocabulary")).toBe(true);
    expect(shown.edges.some((edge) => edge.from === CARD || edge.to === CARD)).toBe(false);
  });

  it("shows only the selected node and its neighbors, when asked", () => {
    const filters = { ...DEFAULT_FILTERS, hidden: [], neighborsOnly: true };
    const shown = shownGraph(graph, filters, CARD);
    expect(ids(shown.nodes)).toEqual([CARD, CARDS, DISTRACTOR, REVIEW, SM.Card].sort());
    const near = new Set(ids(shown.nodes));
    expect(shown.edges).toEqual(
      graph.edges.filter((edge) => near.has(edge.from) && near.has(edge.to)),
    );
    // With none selected, or one the graph has not, the filters alone.
    expect(shownGraph(graph, filters, null)).toEqual(graph);
    expect(shownGraph(graph, filters, `${CARDS}#nowhere`)).toEqual(graph);
    // One of a hidden group is still shown, with its neighbors that are not hidden.
    expect(
      ids(shownGraph(graph, { ...filters, hidden: ["cards", "vocabulary"] }, CARD).nodes),
    ).toEqual([CARD, CARDS, DISTRACTOR, REVIEW].sort());
  });
});

describe("tooLarge", () => {
  it("says a graph past the limit of nodes or edges is too large to draw unasked", () => {
    expect(tooLarge(graph)).toBe(false);
    expect(tooLarge(largeGraph(7000))).toBe(true);
    expect(tooLarge({ nodes: [], edges: new Array(60_001) })).toBe(true);
  });
});

describe("labelOf and shortName", () => {
  const label = (id: string) => labelOf(nodeOf(id), instanceA.url, instanceA.name);

  it("names the instance's folder by its name, and folders and documents by their path", () => {
    expect(label(instanceA.url)).toBe(instanceA.name);
    expect(label(CARDS)).toBe("decks/capitals.ttl");
    expect(label(`${instanceA.url}decks/`)).toBe("decks/");
  });

  it("names a resource by its fragment, a blank node by its label, a term in short", () => {
    expect(label(CARD)).toBe("sweden");
    expect(label(`_:b0@${CATALOG}`)).toBe("_:b0");
    const blank: GraphNode = {
      id: "_:b0@https://pod.example/al@ice/solid-memo/main/meta.ttl",
      kind: "resource",
      blank: true,
      types: [],
      literals: [],
    };
    expect(labelOf(blank, instanceA.url, instanceA.name)).toBe("_:b0");
    expect(label(SM.Card)).toBe("sm:Card");
  });

  it("names any other by the last part of its path, else by its IRI", () => {
    expect(label(RELEASE)).toBe("v1.ttl");
    expect(label(CC0)).toBe("1.0");
    const mail: GraphNode = {
      id: "mailto:a@b.example",
      kind: "outsideLeaf",
      types: [],
      literals: [],
    };
    expect(labelOf(mail, instanceA.url, instanceA.name)).toBe("mailto:a@b.example");
    const term: GraphNode = { id: "urn:x:y", kind: "vocabularyLeaf", types: [], literals: [] };
    expect(labelOf(term, instanceA.url, instanceA.name)).toBe("urn:x:y");
    const empty: GraphNode = {
      id: "https://elsewhere.example/a#",
      kind: "outsideLeaf",
      types: [],
      literals: [],
    };
    expect(labelOf(empty, instanceA.url, instanceA.name)).toBe("a");
    const outside: GraphNode = {
      id: "https://elsewhere.example/folder/",
      kind: "document",
      types: [],
      literals: [],
    };
    expect(labelOf(outside, instanceA.url, instanceA.name)).toBe("folder");
  });

  it("names a term of a known vocabulary by its prefix, and leaves another as it is", () => {
    expect(shortName("http://purl.org/dc/terms/title")).toBe("dcterms:title");
    expect(shortName("http://schema.org/name")).toBe("schema:name");
    expect(shortName("https://elsewhere.example/x")).toBe("https://elsewhere.example/x");
  });
});

describe("distinctLabels", () => {
  const root = instanceA.url;
  const of = (id: string, kind: GraphNode["kind"], document?: string): GraphNode => ({
    id,
    kind,
    types: [],
    literals: [],
    ...(document === undefined ? {} : { document }),
  });

  it("names a node of a document named as another after its document's file, else its path in the instance", () => {
    const verbs = `${root}decks/verbs.ttl`;
    const nouns = `${root}decks/nouns.ttl`;
    const reviews = `${root}reviews/verbs.ttl`;
    const outside = "https://elsewhere.example/a/nouns.ttl";
    const nodes = [
      of(`${verbs}#card-0`, "resource", verbs),
      of(`${nouns}#card-0`, "resource", nouns),
      of(`${verbs}#card-7`, "resource", verbs),
      of(`${reviews}#card-7`, "resource", reviews),
      of(`${outside}#card-9`, "outsideLeaf", outside),
      of(`${root}decks/nouns.ttl#card-9`, "resource", nouns),
      of(`${root}decks/`, "container"),
      of(`${root}reviews/`, "container"),
      of("urn:a:x", "vocabularyLeaf"),
      of("urn:b:x", "vocabularyLeaf"),
      of(`${verbs}#only`, "resource", verbs),
    ];
    const labels = new Map(
      nodes.map((node) => [node.id, labelOf(node, root, instanceA.name).replace(/\/$/, "")]),
    );
    labels.set(`${root}reviews/`, "decks");
    labels.set("urn:b:x", "x");
    labels.set("urn:a:x", "x");
    expect([...distinctLabels(nodes, labels, root).values()]).toEqual([
      "verbs#card-0",
      "nouns#card-0",
      "decks/verbs#card-7",
      "reviews/verbs#card-7",
      "nouns#card-9",
      "decks/nouns#card-9",
      "decks",
      "decks",
      "x",
      "x",
      "only",
    ]);
  });
});

describe("drawnLabel", () => {
  it("cuts a long label short in the middle, by characters", () => {
    expect(drawnLabel("short")).toBe("short");
    const long = "あ".repeat(LABEL_LENGTH + 5);
    expect([...drawnLabel(long)]).toHaveLength(LABEL_LENGTH);
    expect(drawnLabel("reviews/korean-verbs#card-7")).toBe("reviews/kor…verbs#card-7");
    expect(drawnLabel("x".repeat(LABEL_LENGTH))).toBe("x".repeat(LABEL_LENGTH));
  });
});

describe("nearestInDirection", () => {
  const positions = new Map([
    ["o", { x: 0, y: 0 }],
    ["right", { x: 10, y: 1 }],
    ["farRight", { x: 30, y: 0 }],
    ["slant", { x: 6, y: 5 }],
    ["up", { x: 0, y: -10 }],
    ["down", { x: 2, y: 8 }],
  ]);
  const all = [...positions.keys()];

  it("goes to the nearest node that way, straight ahead counting more than off to the side", () => {
    expect(nearestInDirection("o", all, positions, DIRECTIONS.ArrowRight!)).toBe("right");
    expect(nearestInDirection("o", all, positions, DIRECTIONS.ArrowUp!)).toBe("up");
    expect(nearestInDirection("o", all, positions, DIRECTIONS.ArrowDown!)).toBe("down");
  });

  it("goes nowhere when there is no node that way", () => {
    expect(nearestInDirection("o", all, positions, DIRECTIONS.ArrowLeft!)).toBeNull();
  });
});

describe("nodeIndexOf", () => {
  it("finds each node by its id, with its edges from it and to it", () => {
    const index = nodeIndexOf(graph);
    expect(index.size).toBe(graph.nodes.length);
    const { node, outgoing, incoming } = index.get(CARD)!;
    expect(node).toBe(nodeOf(CARD));
    expect(outgoing.length).toBeGreaterThan(0);
    expect(outgoing.every((edge) => edge.from === CARD)).toBe(true);
    expect(incoming.map((edge) => edge.from).sort()).toEqual([CARDS, REVIEW]);
    expect(index.get("https://elsewhere.example/x")).toBeUndefined();
  });
});

describe("labelRank and labelOrder", () => {
  it("ranks folders and documents first, then decks, then every other", () => {
    expect(labelRank(nodeOf(CATALOG))).toBe(0);
    expect(labelRank(nodeOf(DECK))).toBe(1);
    expect(labelRank(nodeOf(CARD))).toBe(2);
  });

  it("orders a group after another, each by rank, and an id once", () => {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const folder = graph.nodes.find((node) => node.kind === "container")!.id;
    expect(labelOrder([[CARD], [ANSWER, DECK, CARD], [CARD, folder, ANSWER]], nodes)).toEqual([
      CARD,
      DECK,
      ANSWER,
      folder,
    ]);
  });
});

describe("placeLabels", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 30, y: 5 }],
    ["c", { x: 0, y: 14 }],
    ["d", { x: -300, y: -300 }],
    ["e", { x: 120, y: 0 }],
  ]);
  const labels = new Map([
    ["a", "abcdefghij"],
    ["b", "b"],
    ["c", "c"],
    ["d", "d"],
    ["e", "e"],
  ]);

  it("places each label in turn unless it overlaps one placed, by its characters counted", () => {
    // At size 10, "abcdefghij" spans 7 to 70 across with its gap, and -6 to 7.5 down: b overlaps it, c sits just below.
    expect(placeLabels(["a", "b", "c", "d", "e"], positions, labels, 10)).toEqual([
      "a",
      "c",
      "d",
      "e",
    ]);
    expect(placeLabels(["b", "a", "c"], positions, labels, 10)).toEqual(["b", "c"]);
  });

  it("places as many as asked at most", () => {
    expect(placeLabels(["a", "c", "d", "e"], positions, labels, 10, 2)).toEqual(["a", "c"]);
  });

  it("counts a label cut short as drawn", () => {
    const long = new Map([
      ["a", "x".repeat(100)],
      ["e", "e"],
    ]);
    // Cut at 24 characters, it ends at 7 + 24 × 6 + 3 = 154, past e's start at 127.
    expect(placeLabels(["a", "e"], positions, long, 10)).toEqual(["a"]);
    expect(
      placeLabels(["a", "e"], new Map([...positions, ["e", { x: 160, y: 0 }]]), long, 10),
    ).toEqual(["a", "e"]);
  });
});
