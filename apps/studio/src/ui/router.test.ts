import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import { studioHref } from "@solid-memo/ui/router";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import { instanceOfRoute, parseStudioHash, studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

describe("the Studio's routes", () => {
  const routes: StudioRoute[] = [
    { screen: "instances" },
    { screen: "home", instanceUrl: "https://pod.example/solid-memo/a/" },
    { screen: "home", instanceUrl: "https://pod.example/solid-memo/a/", view: { filter: "kanji", sort: { column: "due", descending: true } } },
    { screen: "groups", instanceUrl: "https://pod.example/solid-memo/a/" },
    { screen: "cards", deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1" },
    {
      screen: "cards",
      deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
      query: { ...DEFAULT_CARD_QUERY, text: "hus", state: "due", sort: { key: "due", descending: false }, page: 2 },
    },
  ];

  it("round-trip through the hash", () => {
    for (const route of routes) expect(parseStudioHash(studioRouteToHash(route))).toEqual(route);
  });

  it("include Home as Solid Memo links to it", () => {
    expect(`studio/${studioRouteToHash(routes[1]!)}`).toBe(studioHref("https://pod.example/solid-memo/a/"));
  });

  it("put Home at the root, its instance in the query", () => {
    expect(studioRouteToHash(routes[1]!)).toBe("#/?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
    expect(studioRouteToHash(routes[0]!)).toBe("#/instances");
  });

  it("keep Home's filter and sort in its query, and leave out a view that is the default", () => {
    expect(studioRouteToHash(routes[2]!)).toBe(
      "#/?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F&q=kanji&sort=due&order=desc",
    );
    expect(studioRouteToHash({ ...routes[1]!, view: { filter: "" } } as StudioRoute)).toBe(studioRouteToHash(routes[1]!));
    expect(parseStudioHash("#/?instance=a&sort=colour")).toEqual({ screen: "home", instanceUrl: "a" });
    expect(studioRouteToHash(routes[3]!)).toBe("#/groups?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
  });

  it("keep the workbench's deck and query in its query, and leave out a query that is the default", () => {
    expect(studioRouteToHash(routes[5]!)).toBe(
      "#/cards?deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1&q=hus&state=due&sort=due&page=2",
    );
    expect(studioRouteToHash({ ...routes[4]!, query: DEFAULT_CARD_QUERY } as StudioRoute)).toBe(studioRouteToHash(routes[4]!));
    expect(parseStudioHash("#/cards")).toBeNull();
  });

  it("name the instance a route is in, the deck's for the workbench", () => {
    expect(routes.map(instanceOfRoute)).toEqual([null, ...Array(5).fill("https://pod.example/solid-memo/a/")]);
  });

  it("leave the root without an instance, and anything unknown, to the default route", () => {
    expect(parseStudioHash("")).toBeNull();
    expect(parseStudioHash("#/")).toBeNull();
    expect(parseStudioHash("#/groups")).toBeNull();
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
