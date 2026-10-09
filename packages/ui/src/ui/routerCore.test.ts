import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import { hashParams, parsePage, useHashRouter } from "./routerCore";

/** An app's routes of its own, as the Studio has them. */
type Route = { page: string };
const parse = (hash: string): Route | null => (hash.startsWith("#/") && hash.length > 2 ? { page: hash.slice(2) } : null);
const toHash = (route: Route) => `#/${route.page}`;

describe("hashParams", () => {
  it("encodes each value", () => {
    expect(hashParams({ instance: "https://pod.example/a b/" })).toBe("?instance=https%3A%2F%2Fpod.example%2Fa+b%2F");
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
});
