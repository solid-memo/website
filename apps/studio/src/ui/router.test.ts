import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import { parseStudioHash, studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

describe("the Studio's routes", () => {
  const routes: StudioRoute[] = [{ screen: "instances" }, { screen: "home", instanceUrl: "https://pod.example/solid-memo/a/" }];

  it("round-trip through the hash", () => {
    for (const route of routes) expect(parseStudioHash(studioRouteToHash(route))).toEqual(route);
  });

  it("put Home at the root, its instance in the query", () => {
    expect(studioRouteToHash(routes[1]!)).toBe("#/?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
    expect(studioRouteToHash(routes[0]!)).toBe("#/instances");
  });

  it("leave the root without an instance, and anything unknown, to the default route", () => {
    expect(parseStudioHash("")).toBeNull();
    expect(parseStudioHash("#/")).toBeNull();
    expect(parseStudioHash("#/decks?instance=x")).toBeNull();
  });
});

describe("useStudioRoute", () => {
  it("keeps the route in the hash", () => {
    window.history.replaceState(null, "", "#/instances");
    const { result } = renderHook(() => useStudioRoute());
    expect(result.current.route).toEqual({ screen: "instances" });
    act(() => result.current.navigate({ screen: "home", instanceUrl: "https://pod.example/a/" }));
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: "https://pod.example/a/" });
  });
});
