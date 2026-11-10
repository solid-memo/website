// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { forget } from "@solid-memo/ui/remembered";
import { collidingGraphs, largeGraph, smallGraph } from "../../test/graph";
import { createLayout } from "./layout";
import { useLayout } from "./useLayout";

/** The timers due `ms` from now run. */
const later = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** A clock that moves on 20 ms each time it is read: a step a batch. */
function slowClock() {
  let now = 0;
  return () => (now += 20);
}

/** A clock that never moves: every step fits in a batch, however slow the machine. */
const stoppedClock = () => 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  forget("studio.graphLayout.a");
  forget("studio.graphLayout.b");
});

describe("useLayout", () => {
  it("lays the graph out a batch at a time, saying how far it is, then gives where its nodes are and how its edges go", async () => {
    const graph = smallGraph();
    const { result } = renderHook(() => useLayout("a", graph, true, slowClock()));
    expect(result.current).toEqual({ laid: null, progress: 0 });
    // The layout is made in a batch of its own, stepped from the next.
    await later(0);
    expect(result.current.progress).toBe(0);
    const steps = createLayout(graph);
    // A timer set while one runs is due a millisecond later.
    await later(1);
    expect(result.current.progress).toBe(steps.step(1));
    await later(1);
    expect(result.current.progress).toBe(steps.step(1));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const finished = createLayout(graph);
    finished.step(Infinity);
    expect(result.current.laid!.positions).toEqual(finished.positions());
    const edge = graph.edges[0]!;
    expect(result.current.laid!.routes.of(edge)).toEqual(finished.routes().of(edge));
  });

  it("runs as many steps a batch as fit in its time, and hands the layout over in one more", async () => {
    const { result } = renderHook(() => useLayout("a", smallGraph(), true, stoppedClock));
    await later(1);
    expect(result.current).toEqual({ laid: null, progress: 1 });
    await later(1);
    expect(result.current.laid).not.toBeNull();
  });

  it("keeps a finished layout for the page's life, for the same graph only", async () => {
    const first = renderHook(() => useLayout("a", smallGraph(), true));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    const laid = first.result.current.laid;
    first.unmount();
    const again = renderHook(() => useLayout("a", smallGraph(), true));
    expect(again.result.current.laid).toBe(laid);
    again.unmount();
    const changed = renderHook(() => useLayout("a", largeGraph(3), true));
    expect(changed.result.current.laid).toBeNull();
  });

  it("lays out afresh a graph a short hash of it would have matched to the one kept", async () => {
    const [first, second] = collidingGraphs();
    const before = renderHook(() => useLayout("a", first, true));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(before.result.current.laid).not.toBeNull();
    before.unmount();
    const after = renderHook(() => useLayout("a", second, true));
    expect(after.result.current.laid).toBeNull();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect([...after.result.current.laid!.positions.keys()].sort()).toEqual(
      second.nodes.map((node) => node.id).sort(),
    );
  });

  it("goes on with a layout under way when the same graph comes as a new object", async () => {
    const { result, rerender } = renderHook(
      ({ graph }) => useLayout("a", graph, true, slowClock()),
      { initialProps: { graph: smallGraph() } },
    );
    await later(0);
    await later(1);
    const progress = result.current.progress;
    expect(progress).toBeGreaterThan(0);
    rerender({ graph: smallGraph() });
    expect(result.current.progress).toBe(progress);
    await later(1);
    expect(result.current.progress).toBeGreaterThan(progress);
  });

  it("lays out afresh when the graph changes under it", async () => {
    const { result, rerender } = renderHook(
      ({ graph }) => useLayout("a", graph, true, slowClock()),
      { initialProps: { graph: smallGraph() } },
    );
    await later(0);
    await later(1);
    expect(result.current.progress).toBeGreaterThan(0);
    rerender({ graph: largeGraph(3) });
    await later(0);
    expect(result.current.progress).toBe(0);
  });

  it("does not throw on a graph whose terms together are longer than a string can be", () => {
    const long = "x".repeat(2 ** 28);
    const node: InstanceGraph["nodes"][number] = {
      id: long,
      kind: "resource",
      types: [],
      literals: [],
    };
    const graph: InstanceGraph = { nodes: [node, node, node], edges: [] };
    const { result } = renderHook(() => useLayout("b", graph, false));
    expect(result.current).toEqual({ laid: null, progress: 0 });
  });

  it("does not run while the graph is not to be drawn", async () => {
    const { result } = renderHook(() => useLayout("b", smallGraph(), false));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current).toEqual({ laid: null, progress: 0 });
  });

  it("stops when its screen is left", async () => {
    const { result, unmount } = renderHook(() => useLayout("b", smallGraph(), true, slowClock()));
    await later(0);
    unmount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.laid).toBeNull();
    const back = renderHook(() => useLayout("b", smallGraph(), true));
    expect(back.result.current.laid).toBeNull();
  });
});
