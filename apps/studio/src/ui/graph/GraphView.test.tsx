// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { options, type VNode } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphEdge, GraphNode, GraphNodeKind } from "@solid-memo/domain/instanceGraph";
import {
  GraphView,
  LABEL_PIXELS,
  LABEL_SPAN,
  LABELS_AT_MOST,
  NODE_PIXELS,
  SETTLE_MS,
} from "./GraphView";
import type { Point, Positions, Route, Routes } from "./layout";

/** Every edge a straight line, as one of the tree's. */
const straight = (positions: Positions): Routes => ({
  of: ({ from, to }) => {
    const a = positions.get(from)!;
    const b = positions.get(to)!;
    return { parts: [`M${a.x} ${a.y}L${b.x} ${b.y}`], tree: true };
  },
});

const node = (id: string, kind: GraphNodeKind, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind,
  types: [],
  literals: [],
  ...extra,
});

const NODES: GraphNode[] = [
  node("folder", "container"),
  node("doc", "document", { document: "doc", found: true }),
  node("gone", "document", { document: "gone", found: false }),
  node("res", "resource", { document: "doc" }),
  node("term", "vocabularyLeaf"),
  node("pod", "podLeaf"),
  node("out", "outsideLeaf"),
  node("lost", "missing"),
];
const EDGES: GraphEdge[] = [
  { from: "folder", to: "doc", predicate: "ldp", kind: "containment" },
  { from: "doc", to: "res", predicate: "", kind: "containment" },
  { from: "res", to: "term", predicate: "type", kind: "vocabulary" },
  { from: "res", to: "out", predicate: "link", kind: "link" },
  { from: "res", to: "pod", predicate: "link", kind: "link" },
];
/** The nodes on a line, `gap` apart, from the folder at 0 rightwards. */
const along = (gap: number) =>
  new Map<string, Point>(NODES.map((each, at) => [each.id, { x: at * gap, y: at % 2 }]));
const LABELS = new Map(NODES.map((each) => [each.id, `${each.id} label`]));

function draw(gap: number, props: { selected?: string | null; nodes?: GraphNode[] } = {}) {
  const onSelect = vi.fn();
  const nodes = props.nodes ?? NODES;
  const view = (selected: string | null) => (
    <GraphView
      nodes={nodes}
      edges={nodes === NODES ? EDGES : []}
      positions={nodes === NODES ? along(gap) : new Map()}
      routes={straight(nodes === NODES ? along(gap) : new Map())}
      labels={LABELS}
      selected={selected}
      onSelect={onSelect}
      label="Graph of A"
      describe={(each) => `${each.id}, described`}
    />
  );
  const result = render(view(props.selected ?? null));
  const svg = screen.getByRole("img", { name: "Graph of A" }) as unknown as SVGSVGElement;
  const group = svg.querySelector("g")!;
  return {
    ...result,
    onSelect,
    svg,
    group,
    rerender: (selected: string | null) => result.rerender(view(selected)),
  };
}

const key = (svg: Element, name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(svg, { key: name, ...init });

/** Counts the node shapes Preact draws (again) while `run` runs. */
function shapesDrawn(run: () => void): number {
  let drawn = 0;
  const before = options.diffed;
  options.diffed = (vnode: VNode) => {
    if ((vnode.props as Record<string, unknown>)["data-node"] !== undefined) drawn++;
    before?.(vnode);
  };
  try {
    run();
  } finally {
    options.diffed = before;
  }
  return drawn;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Lets a move or a zoom settle, as the labels wait for. */
const settle = () =>
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS);
  });
const labelled = (svg: Element) =>
  [...svg.querySelectorAll(".graph-labels text")].map((text) => text.textContent);

describe("GraphView", () => {
  it("draws each node in its kind's shape, and the edges but those to terms a path for each kind", () => {
    const { svg } = draw(10);
    const shapes = [...svg.querySelectorAll("[data-node]")];
    expect(
      shapes.map((shape) => [shape.tagName.toLowerCase(), shape.getAttribute("class")]),
    ).toEqual([
      ["rect", "graph-node kind-container"],
      ["rect", "graph-node kind-document"],
      ["rect", "graph-node kind-document absent"],
      ["circle", "graph-node kind-resource"],
      ["rect", "graph-node kind-vocabularyLeaf"],
      ["path", "graph-node kind-podLeaf"],
      ["circle", "graph-node kind-outsideLeaf"],
      ["path", "graph-node kind-missing"],
    ]);
    const edges = [...svg.querySelectorAll(".graph-edges")];
    expect(edges.map((edge) => edge.getAttribute("class"))).toEqual([
      "graph-edges edges-link",
      "graph-edges edges-containment",
    ]);
    expect(edges[0]!.getAttribute("d")).toBe("M30 1L60 0M30 1L50 1");
  });

  it("draws the edges to terms of the node pointed at, unless it is a term, and of the node selected, a term's all plain", () => {
    const { svg, rerender } = draw(10);
    const vocabulary = () => [...svg.querySelectorAll(".edges-vocabulary")];
    expect(vocabulary()).toEqual([]);
    fireEvent.pointerOver(svg.querySelector('[data-node="res"]')!);
    expect(vocabulary().map((path) => path.getAttribute("d"))).toEqual(["M30 1L40 0"]);
    fireEvent.pointerOver(svg.querySelector('[data-node="out"]')!);
    expect(vocabulary()).toEqual([]);
    fireEvent.pointerOver(svg.querySelector('[data-node="term"]')!);
    expect(vocabulary()).toEqual([]);
    fireEvent.pointerLeave(svg);
    rerender("res");
    expect(svg.querySelector(".graph-focus")!.getAttribute("class")).toBe("graph-focus");
    expect(svg.querySelectorAll(".graph-focus .edges-vocabulary")).toHaveLength(1);
    rerender("term");
    expect(svg.querySelector(".graph-focus")!.getAttribute("class")).toBe("graph-focus graph-hub");
    expect(vocabulary().map((path) => path.getAttribute("d"))).toEqual(["M30 1L40 0"]);
  });

  it("draws a term's own edges under the nodes, and any other node's over them", () => {
    const { svg, rerender } = draw(10, { selected: "term" });
    const firstNode = svg.querySelector("[data-node]")!;
    const before = (element: Element) =>
      Boolean(element.compareDocumentPosition(firstNode) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(svg.querySelector(".graph-hub .edges-vocabulary")!)).toBe(true);
    // As few as it has, its edges are drawn in their full color.
    expect(
      (svg.querySelector(".graph-hub") as SVGElement).style.getPropertyValue("--graph-hub-ink"),
    ).toBe("1");
    expect(before(svg.querySelector(".graph-selected")!)).toBe(false);
    rerender("res");
    expect(svg.querySelector(".graph-hub")).toBeNull();
    expect(before(svg.querySelector(".graph-focus .edges-vocabulary")!)).toBe(false);
  });

  it("draws a term's own edges the paler the more it has, to a least", () => {
    // Twenty times as many as are drawn in their full color.
    const many = 6000;
    const nodes = [
      node("term", "vocabularyLeaf"),
      ...Array.from({ length: many }, (_, at) => node(`n${at}`, "resource")),
    ];
    render(
      <GraphView
        nodes={nodes}
        edges={nodes.slice(1).map((each) => ({
          from: each.id,
          to: "term",
          predicate: "type",
          kind: "vocabulary" as const,
        }))}
        positions={new Map(nodes.map((each, at) => [each.id, { x: at, y: 0 }]))}
        routes={straight(new Map(nodes.map((each, at) => [each.id, { x: at, y: 0 }])))}
        labels={new Map(nodes.map((each) => [each.id, each.id]))}
        selected="term"
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => each.id}
      />,
    );
    const hub = screen.getByRole("img", { name: "Graph of A" }).querySelector(".graph-hub");
    expect((hub as SVGElement).style.getPropertyValue("--graph-hub-ink")).toBe("0.3");
  });

  it("rings the node pointed at, and draws the edges to terms of the node gone to by the keyboard too", () => {
    const nodes = [node("res", "resource"), node("term", "vocabularyLeaf")];
    const view = (shown: GraphNode[]) => (
      <GraphView
        nodes={shown}
        edges={
          shown.length === 2
            ? [{ from: "res", to: "term", predicate: "type", kind: "vocabulary" }]
            : []
        }
        positions={new Map(nodes.map((each, at) => [each.id, { x: at * 10, y: 0 }]))}
        routes={straight(new Map(nodes.map((each, at) => [each.id, { x: at * 10, y: 0 }])))}
        labels={new Map(nodes.map((each) => [each.id, each.id]))}
        selected={null}
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => `${each.id}, described`}
      />
    );
    const { rerender } = render(view(nodes));
    const svg = screen.getByRole("img", { name: "Graph of A" });
    const vocabulary = () => svg.querySelectorAll(".edges-vocabulary").length;
    key(svg, "Home");
    expect(svg.querySelector(".graph-pointed")).not.toBeNull();
    expect(vocabulary()).toBe(1);
    key(svg, "Escape");
    expect(vocabulary()).toBe(0);
    fireEvent.pointerOver(svg.querySelector('[data-node="term"]')!);
    expect(svg.querySelector(".graph-hovered")).not.toBeNull();
    expect(vocabulary()).toBe(0);
    // The node pointed at hidden, as a filter or a search may hide it while the pointer rests on it: as if it were not.
    rerender(view([nodes[0]!]));
    expect(svg.querySelector(".graph-hovered")).toBeNull();
    expect(screen.getByText(/^Point at a node, or use the arrow keys/)).toBeInTheDocument();
  });

  it("draws the edges bundled along the tree under its own, paler the further in and the more there are, a part many share once and the wider, and those of the node pointed at in full over them", () => {
    vi.useFakeTimers();
    const nodes = [node("doc", "document"), node("a", "resource"), node("b", "resource")];
    const parts: Record<string, Route> = {
      "doc a": { parts: ["M0 0l1 0", "M1 0l1 0"], tree: true, focus: ["M0 0c0 1 1 1 1 0"] },
      "doc b": { parts: ["M0 0l2 0", "M1 0l1 0"], tree: true },
      "a b": { parts: ["M1 0c1 1 1 1 1 0"], tree: false },
      // Its first part the tree's edges draw already.
      "b doc": { parts: ["M0 0l2 0", "M2 0l-2 0"], tree: false },
    };
    const edges = (bundled: number): GraphEdge[] => [
      { from: "doc", to: "a", predicate: "", kind: "containment" },
      { from: "doc", to: "b", predicate: "", kind: "containment" },
      { from: "b", to: "doc", predicate: "", kind: "containment" },
      ...Array.from({ length: bundled }, () => ({
        from: "a",
        to: "b",
        predicate: "sees",
        kind: "link" as const,
      })),
    ];
    const view = (bundled: number, selected: string | null = null) => (
      <GraphView
        nodes={nodes}
        edges={edges(bundled)}
        positions={new Map(nodes.map((each, at) => [each.id, { x: at, y: 0 }]))}
        routes={{ of: ({ from, to }) => parts[`${from} ${to}`]! }}
        labels={new Map(nodes.map((each) => [each.id, each.id]))}
        selected={selected}
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => each.id}
      />
    );
    const { rerender } = render(view(1));
    const svg = screen.getByRole("img", { name: "Graph of A" }) as unknown as SVGSVGElement;
    const always = () =>
      [...svg.querySelectorAll(".graph-always path")].map((path) => [
        path.getAttribute("class"),
        path.getAttribute("d"),
      ]);
    expect(always()).toEqual([
      ["graph-edges edges-link edges-bundled edges-rope0", "M1 0c1 1 1 1 1 0"],
      ["graph-edges edges-containment edges-bundled edges-rope0", "M2 0l-2 0"],
      ["graph-edges edges-containment", "M0 0l1 0M1 0l1 0M0 0l2 0"],
    ]);
    const layer = svg.querySelector<SVGGElement>(".graph-always")!;
    const ink = () => Number(layer.style.getPropertyValue("--graph-bundle-ink"));
    const line = (group: Element) =>
      Number((group as SVGGElement).style.getPropertyValue("--graph-line"));
    expect(ink()).toBe(0.4);
    expect(line(layer.parentElement!)).toBe(1);
    key(svg, "+");
    // The edges stay a pixel wide as it zooms, before it settles.
    expect(line(layer.parentElement!)).toBeCloseTo(1 / 1.5);
    settle();
    // In steps of 0.04.
    expect(ink()).toBe(0.28);
    for (let zoom = 0; zoom < 10; zoom++) key(svg, "+");
    settle();
    expect(ink()).toBe(0.12);
    key(svg, "0");
    settle();
    // Twenty thousand bundled: half as pale.
    rerender(view(20000));
    expect(ink()).toBeCloseTo(0.2);
    // The thinnest first.
    expect(always().map(([name]) => name)).toEqual([
      "graph-edges edges-containment edges-bundled edges-rope0",
      "graph-edges edges-link edges-bundled edges-rope2",
      "graph-edges edges-containment",
    ]);
    rerender(view(8));
    expect(always()[1]).toEqual([
      "graph-edges edges-link edges-bundled edges-rope1",
      "M1 0c1 1 1 1 1 0",
    ]);
    rerender(view(1));
    fireEvent.pointerOver(svg.querySelector('[data-node="a"]')!);
    const over = () =>
      [...svg.querySelectorAll(".graph-edges")]
        .filter((path) => path.closest(".graph-always") === null)
        .map((path) => [path.getAttribute("class"), path.getAttribute("d")]);
    // As the route says for a node pointed at.
    expect(over()).toEqual([
      ["graph-edges edges-link edges-bundled edges-rope0", "M1 0c1 1 1 1 1 0"],
      ["graph-edges edges-containment", "M0 0c0 1 1 1 1 0"],
    ]);
    fireEvent.pointerLeave(svg);
    rerender(view(1, "a"));
    const focus = svg.querySelector(".graph-focus")!;
    key(svg, "+");
    expect(line(focus)).toBeCloseTo(1 / 1.5);
  });

  it("draws a node's edge to itself once, and names the node its neighbor", () => {
    const self = [node("res", "resource")];
    render(
      <GraphView
        nodes={self}
        edges={[{ from: "res", to: "res", predicate: "sameAs", kind: "link" }]}
        positions={new Map([["res", { x: 5, y: 5 }]])}
        routes={straight(new Map([["res", { x: 5, y: 5 }]]))}
        labels={new Map([["res", "res"]])}
        selected="res"
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => each.id}
      />,
    );
    const svg = screen.getByRole("img", { name: "Graph of A" });
    expect(svg.querySelector(".graph-focus .edges-link")!.getAttribute("d")).toBe("M5 5L5 5");
    expect(labelled(svg)).toEqual(["res"]);
  });

  it("measures its pixels again as the plot is resized, once it is still", () => {
    vi.useFakeTimers();
    let resized = () => undefined as void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );
    const { svg, unmount } = draw(100);
    const shape = () => Number(svg.style.getPropertyValue("--graph-shape"));
    act(resized);
    settle();
    expect(shape()).toBe(NODE_PIXELS);
    // The box is 748 units wide, drawn 374 pixels wide: two units a pixel.
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 374,
      height: 374,
    } as DOMRect);
    act(resized);
    expect(shape()).toBe(NODE_PIXELS);
    settle();
    expect(shape()).toBe(NODE_PIXELS * 2);
    act(() => {
      unmount();
    });
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("measures nothing once it is gone, though it went just before a zoom settled", () => {
    vi.useFakeTimers();
    const { svg } = draw(100);
    key(svg, "+");
    vi.advanceTimersByTime(SETTLE_MS - 1);
    // Gone outside act, as a page leaves: its passive effects' cleanups wait for the next frame.
    cleanup();
    expect(() => vi.advanceTimersByTime(SETTLE_MS)).not.toThrow();
  });

  it("labels the nodes in sight while the part in sight is narrow enough, once a zoom settles, and the folders and documents alone past it", () => {
    vi.useFakeTimers();
    // A label is 12 units large unzoomed, "folder label" about 86 wide.
    const near = draw(100);
    expect(labelled(near.svg)).toHaveLength(NODES.length);
    near.unmount();
    // 1,448 units wide: zoomed in twice, 644 are in sight, from 378 to 1,022.
    const wide = draw(LABEL_SPAN / 4);
    const framed = ["folder label", "doc label", "gone label"];
    expect(labelled(wide.svg)).toEqual(framed);
    key(wide.svg, "+");
    key(wide.svg, "+");
    expect(labelled(wide.svg)).toEqual(framed);
    settle();
    expect(labelled(wide.svg)).toEqual(["gone label", "res label", "term label", "pod label"]);
    key(wide.svg, "0");
    settle();
    expect(labelled(wide.svg)).toEqual(framed);
  });

  it("labels no node while more are in sight than can be read", () => {
    const many = Array.from({ length: LABELS_AT_MOST + 1 }, (_, at) => node(`n${at}`, "resource"));
    render(
      <GraphView
        nodes={many}
        edges={[]}
        positions={new Map(many.map((each, at) => [each.id, { x: at, y: 0 }]))}
        routes={straight(new Map(many.map((each, at) => [each.id, { x: at, y: 0 }])))}
        labels={new Map(many.map((each) => [each.id, each.id]))}
        selected={null}
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => each.id}
      />,
    );
    expect(labelled(screen.getByRole("img", { name: "Graph of A" }))).toEqual([]);
  });

  it("moves and zooms by one transform, drawing no node again", () => {
    const { svg, group } = draw(LABEL_SPAN);
    const start = group.getAttribute("transform");
    expect(start).toBe("translate(0 0) scale(1)");
    expect(
      shapesDrawn(() => {
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(svg, { clientX: 150, clientY: 120, pointerId: 1 });
        fireEvent.pointerUp(svg, { pointerId: 1 });
      }),
    ).toBe(0);
    expect(group.getAttribute("transform")).toBe("translate(50 20) scale(1)");
    expect(shapesDrawn(() => fireEvent.wheel(svg, { deltaY: -100 }))).toBe(0);
    expect(group.getAttribute("transform")).not.toContain("scale(1)");
    expect(shapesDrawn(() => key(svg, "-"))).toBe(0);
  });

  it("moves by the drawing's own units for each pixel, and zooms about the pointer, once it has a size", () => {
    const { svg, group } = draw(10);
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 236,
      height: 236,
    } as DOMRect);
    // The box is 118 units wide (the nodes and a margin), in 236 pixels: half a unit a pixel.
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 1 });
    expect(group.getAttribute("transform")).toBe("translate(10 5) scale(1)");
    key(svg, "0");
    // The test DOM's wheel events have no pointer's place: one with it.
    fireEvent(
      svg,
      Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), {
        deltaY: -100,
        clientX: 0,
        clientY: 118,
      }),
    );
    const [x, , k] = group
      .getAttribute("transform")!
      .match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!
      .map(Number);
    // The point under the pointer, the box's left edge, stays put.
    expect(x).toBeCloseTo(-24 - -24 * k!);
  });

  it("selects a node clicked, but not at the end of a drag, nor where there is none", () => {
    const { svg, onSelect } = draw(10);
    fireEvent.click(svg.querySelector('[data-node="res"]')!);
    expect(onSelect).toHaveBeenLastCalledWith("res");
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 1, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 31, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.click(svg.querySelector('[data-node="doc"]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(svg.querySelector('[data-node="doc"]')!);
    expect(onSelect).toHaveBeenLastCalledWith("doc");
    // The background, with no node selected, lets go of none.
    fireEvent.click(svg);
    expect(onSelect).toHaveBeenCalledTimes(2);
    // A release with no press held, or a move, does nothing.
    fireEvent.pointerUp(svg, { pointerId: 1 });
    const after = svg.querySelector("g")!.getAttribute("transform");
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 0, pointerId: 1 });
    expect(svg.querySelector("g")!.getAttribute("transform")).toBe(after);
  });

  it("lets go of the node selected on a click on the background, an edge or where a label is, but not at the end of a drag, nor of a zoom", () => {
    const { svg, onSelect, rerender } = draw(10, { selected: "res" });
    fireEvent.click(svg);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(svg.querySelector(".graph-edges")!);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    // A drag from the background, ending in a click there, moves the view alone.
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.click(svg);
    // A wheel zooms.
    fireEvent.wheel(svg, { deltaY: -100, clientX: 5, clientY: 5 });
    expect(onSelect).toHaveBeenCalledTimes(2);
    // A press held still is a click, and lets go.
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.click(svg);
    expect(onSelect).toHaveBeenCalledTimes(3);
    // A node clicked is selected, the one selected or another.
    rerender("res");
    fireEvent.click(svg.querySelector('[data-node="doc"]')!);
    expect(onSelect).toHaveBeenLastCalledWith("doc");
  });

  it("says what the node pointed at is, quietly, and how to point at one", () => {
    const { svg } = draw(10);
    expect(svg).toHaveAccessibleDescription(/Point at a node/);
    fireEvent.pointerOver(svg.querySelector('[data-node="term"]')!);
    expect(screen.getByText("term, described")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.pointerOver(svg);
    expect(screen.queryByText("term, described")).toBeNull();
    fireEvent.pointerOver(svg.querySelector('[data-node="term"]')!);
    fireEvent.pointerLeave(svg);
    expect(screen.queryByText("term, described")).toBeNull();
  });

  it("goes from node to node by the arrow keys, reading each out, and opens one with Enter", () => {
    const { svg, onSelect } = draw(10);
    const status = screen.getByRole("status");
    key(svg, "ArrowLeft");
    expect(status).toHaveTextContent("folder, described");
    key(svg, "ArrowRight");
    expect(status).toHaveTextContent("doc, described");
    key(svg, "ArrowUp");
    expect(status).toHaveTextContent("doc, described");
    key(svg, "End");
    expect(status).toHaveTextContent("lost, described");
    expect(svg.querySelector(".graph-pointed")).not.toBeNull();
    key(svg, "Home");
    expect(status).toHaveTextContent("folder, described");
    key(svg, "Enter");
    expect(onSelect).toHaveBeenLastCalledWith("folder");
    key(svg, "Escape");
    expect(status).toBeEmptyDOMElement();
    expect(svg.querySelector(".graph-pointed")).toBeNull();
    key(svg, "Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    // Once the pointer points, the node gone to is not read out again as it leaves.
    key(svg, "Home");
    fireEvent.pointerOver(svg.querySelector('[data-node="term"]')!);
    fireEvent.pointerLeave(svg);
    expect(status).toBeEmptyDOMElement();
  });

  it("starts from the node selected, and leaves keys with a modifier, or of its own, to the page", () => {
    const { svg } = draw(10, { selected: "res" });
    expect(svg.querySelector(".graph-selected")).not.toBeNull();
    key(svg, "ArrowRight");
    expect(screen.getByRole("status")).toHaveTextContent("term, described");
    expect(key(svg, "ArrowRight", { altKey: true })).toBe(true);
    expect(key(svg, "x")).toBe(true);
    expect(key(svg, "Escape")).toBe(false);
    expect(key(svg, "Escape")).toBe(true);
  });

  it("labels no label over another, the node selected and its neighbors first, then folders and documents", () => {
    expect(labelled(draw(10).svg)).toEqual(["folder label"]);
    cleanup();
    expect(labelled(draw(10, { selected: "res" }).svg)).toEqual(["res label"]);
  });

  it("keeps the nodes, their rings and their labels as large on the screen at any zoom, once it settles", () => {
    vi.useFakeTimers();
    const { svg } = draw(100, { selected: "res" });
    const shape = () => Number(svg.style.getPropertyValue("--graph-shape"));
    const size = () => Number(svg.querySelector(".graph-labels")!.getAttribute("font-size"));
    expect(shape()).toBe(NODE_PIXELS);
    expect(size()).toBe(LABEL_PIXELS);
    expect(svg.querySelector(".graph-selected")!.getAttribute("r")).toBe("9");
    key(svg, "+");
    expect(shape()).toBe(NODE_PIXELS);
    expect(shapesDrawn(settle)).toBe(0);
    expect(shape()).toBeCloseTo(NODE_PIXELS / 1.5);
    expect(size()).toBeCloseTo(LABEL_PIXELS / 1.5);
    expect(svg.querySelector(".graph-labels")!.getAttribute("stroke-width")).toBe(
      String(size() / 4),
    );
  });

  it("measures its pixels as it settles, and labels what is in sight beside the nodes' box", () => {
    vi.useFakeTimers();
    const nodes = [node("a", "resource"), node("b", "resource"), node("c", "resource")];
    const at = new Map<string, Point>([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 0, y: 1000 }],
      ["c", { x: 20, y: 500 }],
    ]);
    render(
      <GraphView
        nodes={nodes}
        edges={[]}
        positions={at}
        routes={straight(at)}
        labels={new Map(nodes.map((each) => [each.id, each.id]))}
        selected={null}
        onSelect={() => undefined}
        label="Graph of A"
        describe={(each) => each.id}
      />,
    );
    const svg = screen.getByRole("img", { name: "Graph of A" }) as unknown as SVGSVGElement;
    // The box is 48 units wide and 1,048 high, in a square of 2,096 pixels: half a unit a pixel, 1,048 units in sight either way.
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 2096,
      height: 2096,
    } as DOMRect);
    key(svg, "+");
    settle();
    // At ×1.5, 20 units off the middle is past the box's sides, still in sight.
    expect(labelled(svg)).toEqual(["c"]);
    expect(Number(svg.style.getPropertyValue("--graph-shape"))).toBeCloseTo(
      (NODE_PIXELS * 0.5) / 1.5,
    );
  });

  it("names the node selected and its neighbors, however far out it is zoomed, and the folders and documents", () => {
    const { svg } = draw(LABEL_SPAN, { selected: "res" });
    const named = labelled(svg);
    expect(named.slice(0, 5).sort()).toEqual([
      "doc label",
      "out label",
      "pod label",
      "res label",
      "term label",
    ]);
    expect(named.slice(5).sort()).toEqual(["folder label", "gone label"]);
  });

  it("brings the node selected, or reached by the keyboard, into sight", () => {
    const { svg, group, rerender } = draw(LABEL_SPAN);
    for (let n = 0; n < 4; n++) key(svg, "+");
    const zoomed = group.getAttribute("transform");
    rerender("lost");
    expect(group.getAttribute("transform")).not.toBe(zoomed);
    const moved = group.getAttribute("transform");
    rerender("lost");
    expect(group.getAttribute("transform")).toBe(moved);
    key(svg, "Home");
    expect(group.getAttribute("transform")).not.toBe(moved);
  });

  it("zooms with its buttons as with the keys", () => {
    const { group } = draw(10);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(group.getAttribute("transform")).toContain("scale(1.5)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(group.getAttribute("transform")).toContain("scale(0.6666");
    fireEvent.click(screen.getByRole("button", { name: "Whole graph" }));
    expect(group.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    // Only so far out.
    for (let n = 0; n < 5; n++) fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(group.getAttribute("transform")).toContain("scale(0.5)");
  });

  it("draws a graph of nothing, its keys doing nothing", () => {
    const { svg } = draw(10, { nodes: [] });
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(key(svg, "ArrowRight")).toBe(true);
    expect(key(svg, "+")).toBe(false);
  });
});
