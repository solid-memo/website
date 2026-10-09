import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import { isStudioHash, studioHref } from "@solid-memo/ui/router";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import type { Card } from "@solid-memo/domain/deck";
import { instanceOfRoute, parseStudioHash, spotRoute, studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

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
    { screen: "card", deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1", cardUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl#c1" },
    {
      screen: "card",
      deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
      cardUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl#c1",
      tab: "distractors",
    },
    { screen: "about", deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1" },
    { screen: "instance", instanceUrl: "https://pod.example/solid-memo/a/" },
    { screen: "schedule", deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1" },
    { screen: "health", instanceUrl: "https://pod.example/solid-memo/a/" },
    { screen: "health", instanceUrl: "https://pod.example/solid-memo/a/", deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1" },
    {
      screen: "card",
      deckUrl: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
      cardUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl#c1",
      tab: "distractors",
      field: "c1-d2",
    },
    { screen: "library", instanceUrl: "https://pod.example/solid-memo/a/" },
  ];

  it("round-trip through the hash", () => {
    for (const route of routes) expect(parseStudioHash(studioRouteToHash(route))).toEqual(route);
  });

  it("include Home as Solid Memo links to it, all under /studio", () => {
    expect(studioRouteToHash(routes[1]!)).toBe(studioHref("https://pod.example/solid-memo/a/"));
    for (const route of routes) expect(isStudioHash(studioRouteToHash(route))).toBe(true);
  });

  it("put Home at /studio, its instance in the query, and take /studio/ for it too", () => {
    expect(parseStudioHash("#/studio/?instance=a")).toEqual({ screen: "home", instanceUrl: "a" });
    expect(studioRouteToHash(routes[1]!)).toBe("#/studio?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
    expect(studioRouteToHash(routes[0]!)).toBe("#/studio/instances");
  });

  it("keep Home's filter and sort in its query, and leave out a view that is the default", () => {
    expect(studioRouteToHash(routes[2]!)).toBe(
      "#/studio?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F&q=kanji&sort=due&order=desc",
    );
    expect(studioRouteToHash({ ...routes[1]!, view: { filter: "" } } as StudioRoute)).toBe(studioRouteToHash(routes[1]!));
    expect(parseStudioHash("#/studio?instance=a&sort=colour")).toEqual({ screen: "home", instanceUrl: "a" });
    expect(studioRouteToHash(routes[3]!)).toBe("#/studio/groups?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
  });

  it("keep the workbench's deck and query in its query, and leave out a query that is the default", () => {
    expect(studioRouteToHash(routes[5]!)).toBe(
      "#/studio/cards?deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1&q=hus&state=due&sort=due&page=2",
    );
    expect(studioRouteToHash({ ...routes[4]!, query: DEFAULT_CARD_QUERY } as StudioRoute)).toBe(studioRouteToHash(routes[4]!));
    expect(parseStudioHash("#/studio/cards")).toBeNull();
  });

  it("keep the inspector's deck, card and tab in its query, and leave out the content tab, the default", () => {
    expect(studioRouteToHash(routes[7]!)).toBe(
      "#/studio/card?deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1&card=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fdecks%2Fdeck-1.ttl%23c1&tab=distractors",
    );
    expect(studioRouteToHash({ ...routes[6]!, tab: "content" } as StudioRoute)).toBe(studioRouteToHash(routes[6]!));
    expect(parseStudioHash(`${studioRouteToHash(routes[6]!)}&tab=content`)).toEqual(routes[6]);
    expect(parseStudioHash(`${studioRouteToHash(routes[6]!)}&tab=gossip`)).toEqual(routes[6]);
    const schedule = { ...routes[6]!, tab: "schedule" } as StudioRoute;
    expect(studioRouteToHash(schedule)).toMatch(/&tab=schedule$/);
    expect(parseStudioHash(studioRouteToHash(schedule))).toEqual(schedule);
    const history = { ...routes[6]!, tab: "history" } as StudioRoute;
    expect(parseStudioHash(studioRouteToHash(history))).toEqual(history);
    expect(parseStudioHash("#/studio/card?deck=d")).toBeNull();
    expect(parseStudioHash("#/studio/card?card=c")).toBeNull();
  });

  it("keep a deck's about screen and the instance's screen in their query", () => {
    expect(studioRouteToHash(routes[8]!)).toBe("#/studio/about?deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1");
    expect(studioRouteToHash(routes[9]!)).toBe("#/studio/instance?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
    expect(parseStudioHash("#/studio/about")).toBeNull();
    expect(parseStudioHash("#/studio/instance")).toBeNull();
  });

  it("keep a deck's schedule screen's deck in its query", () => {
    expect(studioRouteToHash(routes[10]!)).toBe("#/studio/schedule?deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1");
    expect(parseStudioHash("#/studio/schedule")).toBeNull();
  });

  it("keep the health screen's instance and deck, and the field the inspector opens at, in their query", () => {
    expect(studioRouteToHash(routes[11]!)).toBe("#/studio/health?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F");
    expect(studioRouteToHash(routes[12]!)).toBe(
      "#/studio/health?instance=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2F&deck=https%3A%2F%2Fpod.example%2Fsolid-memo%2Fa%2Fcatalog.ttl%23deck-1",
    );
    expect(parseStudioHash("#/studio/health?deck=d")).toBeNull();
    expect(studioRouteToHash(routes[13]!)).toMatch(/&tab=distractors&field=c1-d2$/);
    expect(parseStudioHash(`${studioRouteToHash(routes[6]!)}&field=back`)).toEqual({ ...routes[6], field: "back" });
  });

  it("open the card inspector where in a card a problem is", () => {
    const deckUrl = "https://pod.example/solid-memo/a/catalog.ttl#deck-1";
    const card = { id: "c1", url: "https://pod.example/solid-memo/a/decks/deck-1.ttl#c1" } as Card;
    const at = { screen: "card", deckUrl, cardUrl: card.url } as const;
    expect(spotRoute(deckUrl, { card, place: { tab: "content", part: "backNote" } })).toEqual({ ...at, tab: "content", field: "backNote" });
    expect(spotRoute(deckUrl, { card, place: { tab: "content" } })).toEqual({ ...at, tab: "content" });
    expect(spotRoute(deckUrl, { card, place: { tab: "distractors", distractor: "c1-d1", part: "note" } })).toEqual({ ...at, tab: "distractors", field: "c1-d1" });
    expect(spotRoute(deckUrl, { card, place: { tab: "schedule" } })).toEqual({ ...at, tab: "schedule" });
  });

  it("name the instance a route is in, the deck's for the workbench", () => {
    expect(routes.map(instanceOfRoute)).toEqual([null, ...Array(14).fill("https://pod.example/solid-memo/a/")]);
  });

  it("leave the root without an instance, and anything unknown, to the default route", () => {
    expect(parseStudioHash("")).toBeNull();
    expect(parseStudioHash("#/studio")).toBeNull();
    expect(parseStudioHash("#/studio/groups")).toBeNull();
    expect(parseStudioHash("#/studio/library")).toBeNull();
    expect(parseStudioHash("#/studio/decks?instance=x")).toBeNull();
  });

  it("are none of Solid Memo's own", () => {
    expect(parseStudioHash("#/")).toBeNull();
    expect(parseStudioHash("#/?instance=x")).toBeNull();
    expect(parseStudioHash("#/instances")).toBeNull();
  });
});

describe("useStudioRoute", () => {
  it("keeps the route in the hash", () => {
    window.history.replaceState(null, "", "#/studio/instances");
    const { result } = renderHook(() => useStudioRoute());
    expect(result.current.route).toEqual({ screen: "instances" });
    act(() => result.current.navigate({ screen: "home", instanceUrl: "https://pod.example/a/" }));
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: "https://pod.example/a/" });
  });
});
