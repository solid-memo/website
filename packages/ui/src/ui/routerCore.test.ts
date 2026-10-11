import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import { hashParams, historyPosition, parsePage, shownPosition, useHashRouter } from "./routerCore";

/** An app's routes of its own, as the Studio has them. */
type Route = { page: string };
const parse = (hash: string): Route | null =>
  hash.startsWith("#/") && hash.length > 2 ? { page: hash.slice(2) } : null;
const toHash = (route: Route) => `#/${route.page}`;

describe("hashParams", () => {
  it("encodes each value", () => {
    expect(hashParams({ instance: "https://pod.example/a b/" })).toBe(
      "?instance=https%3A%2F%2Fpod.example%2Fa+b%2F",
    );
  });
});

describe("parsePage", () => {
  it("reads a page beyond the first, and nothing else", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("1")).toBeNull();
    expect(parsePage("x")).toBeNull();
    expect(parsePage(null)).toBeNull();
  });
});

describe("useHashRouter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#/start");
  });

  it("keeps any app's routes in the hash", () => {
    const { result } = renderHook(() => useHashRouter(parse, toHash));
    expect(result.current.route).toEqual({ page: "start" });
    act(() => result.current.navigate({ page: "next" }));
    expect(window.location.hash).toBe("#/next");
    expect(result.current).toMatchObject({ route: { page: "next" }, change: "push" });
  });

  it("numbers the entries of the history it sees, one more for each after another, so that a move can be told how far it went", () => {
    const { result } = renderHook(() => useHashRouter(parse, toHash));
    const start = historyPosition()!;
    expect(shownPosition()).toBe(start);
    act(() => result.current.navigate({ page: "next" }));
    expect(historyPosition()).toBe(start + 1);
    act(() => result.current.replace({ page: "again" }));
    expect(historyPosition()).toBe(start + 1);
    // A link followed, or a hash typed in: a new entry, numbered once heard of.
    act(() => {
      window.history.pushState(null, "", "#/typed");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(historyPosition()).toBe(start + 2);
    expect(result.current).toMatchObject({
      route: { page: "typed" },
      change: "pop",
    });
    // Back to an entry numbered before.
    act(() => {
      window.history.replaceState({ position: start }, "", "#/start");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(shownPosition()).toBe(start);
    // An entry numbered already keeps its number as the router starts.
    renderHook(() => useHashRouter(parse, toHash));
    expect(historyPosition()).toBe(start);
    // Something other than a number in an entry's state is no number.
    window.history.replaceState({ position: "first" }, "");
    expect(historyPosition()).toBeNull();
    window.history.replaceState("first", "");
    expect(historyPosition()).toBeNull();
  });
});
