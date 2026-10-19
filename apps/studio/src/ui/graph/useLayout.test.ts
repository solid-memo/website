// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forget } from "@solid-memo/ui/remembered";
import { largeGraph, smallGraph } from "../../test/graph";
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
    const { result } = renderHook(() => useLayout("a", smallGraph(), true));
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
