import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/preact";
import {
  courseHref,
  deckHref,
  decksHref,
  libraryDeckHref,
  libraryHref,
  parseHash,
  routeToHash,
  statisticsHref,
  type RouteRef,
  useHashRoute,
} from "./router";

const roundTrips: RouteRef[] = [
  { screen: "storagePicker" },
  { screen: "instancePicker" },
  {
    screen: "instanceCreator",
    storageUrl: "https://pod.example/",
    source: "profile",
  },
  { screen: "home", instanceUrl: "https://pod.example/solid-memo/a/" },
  { screen: "deckCreator", instanceUrl: "https://pod.example/solid-memo/a/" },
  { screen: "library", instanceUrl: "https://pod.example/solid-memo/a/" },
  {
    screen: "libraryDeck",
    instanceUrl: "https://pod.example/solid-memo/a/",
    libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
  },
  {
    screen: "libraryBrowser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
  },
  {
    screen: "libraryBrowser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
    page: 2,
  },
  {
    screen: "libraryCard",
    instanceUrl: "https://pod.example/solid-memo/a/",
    libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
    cardId: "sweden",
  },
  {
    screen: "libraryPreview",
    instanceUrl: "https://pod.example/solid-memo/a/",
    libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
  },
  {
    screen: "deckDetail",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "deckPreferences",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "deckPreferences",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    section: "languages",
  },
  {
    screen: "browser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "browser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    page: 3,
  },
  {
    screen: "browser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    languages: "unstated",
  },
  {
    screen: "browser",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    page: 2,
    languages: "unstated",
  },
  {
    screen: "cardCreator",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "card",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    cardUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl#card-1",
  },
  {
    screen: "study",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "course",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
  },
  {
    screen: "courseChapter",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    chapterUrl: "https://solid-memo.com/decks/solid/v1.ttl#ch-linked-data",
  },
  {
    screen: "courseReview",
    instanceUrl: "https://pod.example/solid-memo/a/",
    deckUrl: "https://pod.example/solid-memo/a/decks.ttl#deck-1",
    chapterUrl: "https://solid-memo.com/decks/solid/v1.ttl#ch-linked-data",
  },
  { screen: "preferences", instanceUrl: "https://pod.example/solid-memo/a/" },
  { screen: "statistics", instanceUrl: "https://pod.example/solid-memo/a/" },
  { screen: "validation", instanceUrl: "https://pod.example/solid-memo/a/" },
];

describe("routeToHash / parseHash", () => {
  it.each(roundTrips)("round-trips $screen", (ref) => {
    expect(parseHash(routeToHash(ref))).toEqual(ref);
  });

  it("keeps the first Browser page out of the URL", () => {
    const first = {
      screen: "browser",
      instanceUrl: "https://pod.example/a/",
      deckUrl: "https://pod.example/a/catalog.ttl#deck-1",
    } as const;
    expect(routeToHash({ ...first, page: 1 })).toBe(routeToHash(first));
    expect(routeToHash({ ...first, page: 1 })).not.toContain("page");
    expect(parseHash(routeToHash({ ...first, page: 1 }))).toEqual(first);
  });

  it.each(["0", "1", "-2", "2.5", "abc", ""])(
    "treats Browser page %j as the first page",
    (page) => {
      const hash = `#/browse?instance=a&deck=b&page=${page}`;
      expect(parseHash(hash)).toEqual({
        screen: "browser",
        instanceUrl: "a",
        deckUrl: "b",
      });
    },
  );

  it("lists every card in the Browser for a language filter it does not know", () => {
    expect(parseHash("#/browse?instance=a&deck=b&languages=french")).toEqual({
      screen: "browser",
      instanceUrl: "a",
      deckUrl: "b",
    });
  });

  it("opens a deck's preferences at their start for a section it does not know", () => {
    expect(parseHash("#/deck-preferences?instance=a&deck=b&section=limits")).toEqual({
      screen: "deckPreferences",
      instanceUrl: "a",
      deckUrl: "b",
    });
  });

  it("parses identifiers containing URL metacharacters", () => {
    const ref: RouteRef = {
      screen: "deckDetail",
      instanceUrl: "https://pod.example/a b/?x=1&y=2",
      deckUrl: "https://pod.example/a b/decks.ttl#deck-1",
    };
    expect(parseHash(routeToHash(ref))).toEqual(ref);
  });

  it.each([
    "",
    "#/",
    "#/nope",
    "#/new-instance",
    "#/new-instance?storage=https%3A%2F%2Fpod.example%2F",
    "#/new-instance?storage=https%3A%2F%2Fpod.example%2F&source=guess",
    "#/new-instance?source=profile",
    "#/decks",
    "#/new-deck",
    "#/library",
    "#/library-deck",
    "#/library-deck?instance=https%3A%2F%2Fpod.example%2F",
    "#/library-deck?deck=https%3A%2F%2Fsolid-memo.com%2Fdecks%2Fcapitals%2Fv1.ttl",
    "#/library-browse",
    "#/library-browse?instance=https%3A%2F%2Fpod.example%2F",
    "#/library-browse?deck=https%3A%2F%2Fsolid-memo.com%2Fdecks%2Fcapitals%2Fv1.ttl&page=2",
    "#/library-card?instance=a&deck=b",
    "#/library-card?instance=a&card=c",
    "#/library-card?deck=b&card=c",
    "#/library-preview?instance=https%3A%2F%2Fpod.example%2F",
    "#/library-preview?deck=https%3A%2F%2Fsolid-memo.com%2Fdecks%2Fcapitals%2Fv1.ttl",
    "#/deck",
    "#/deck?instance=https%3A%2F%2Fpod.example%2F",
    "#/deck-preferences?instance=https%3A%2F%2Fpod.example%2F",
    "#/deck-preferences?deck=https%3A%2F%2Fpod.example%2Fd%23deck-1",
    "#/browse?deck=https%3A%2F%2Fpod.example%2Fd%23deck-1",
    "#/new-card?instance=a",
    "#/new-card?deck=b",
    "#/card?instance=a&deck=b",
    "#/card?instance=a&card=c",
    "#/card?deck=b&card=c",
    "#/practice?instance=a&deck=b",
    "#/practice?instance=a&deck=b&mode=cram",
    "#/practice?mode=study",
    "#/study",
    "#/study?instance=a",
    "#/study?deck=b",
    "#/course?instance=a",
    "#/course?deck=b",
    "#/course-chapter?instance=a&deck=b",
    "#/course-chapter?instance=a&chapter=c",
    "#/course-review?deck=b&chapter=c",
    "#/preferences",
    "#/statistics",
    "#/validate",
  ])("rejects invalid hash %j", (hash) => {
    expect(parseHash(hash)).toBeNull();
  });
});

describe("libraryDeckHref", () => {
  it("is the hash URL of a library deck's page in the instance", () => {
    expect(
      libraryDeckHref(
        "https://pod.example/a/",
        "https://solid-memo.com/decks/capitals/v1.ttl",
      ),
    ).toBe(
      "#/library-deck?instance=https%3A%2F%2Fpod.example%2Fa%2F&deck=https%3A%2F%2Fsolid-memo.com%2Fdecks%2Fcapitals%2Fv1.ttl",
    );
  });
});

describe("libraryHref", () => {
  it("is the hash URL of the instance's deck library", () => {
    expect(libraryHref("https://pod.example/a/")).toBe(
      "#/library?instance=https%3A%2F%2Fpod.example%2Fa%2F",
    );
  });
});

describe("deckHref", () => {
  it("is the hash URL of the deck's page", () => {
    const href = deckHref("https://pod.example/a/", "https://pod.example/a/c#d");
    expect(parseHash(href)).toEqual({
      screen: "deckDetail",
      instanceUrl: "https://pod.example/a/",
      deckUrl: "https://pod.example/a/c#d",
    });
  });
});

describe("courseHref", () => {
  it("is the hash URL of the course a deck is the copy of", () => {
    expect(parseHash(courseHref("https://pod.example/a/", "https://pod.example/a/c#d"))).toEqual({
      screen: "course",
      instanceUrl: "https://pod.example/a/",
      deckUrl: "https://pod.example/a/c#d",
    });
  });
});

describe("decksHref", () => {
  it("is the hash URL of the instance's deck list", () => {
    const href = decksHref("https://pod.example/solid-memo/a/");
    expect(parseHash(href)).toEqual({
      screen: "home",
      instanceUrl: "https://pod.example/solid-memo/a/",
    });
  });
});

describe("parseHash legacy links", () => {
  it("ignores the retired return parameter of card-creator links", () => {
    expect(parseHash("#/new-card?instance=a&deck=b&return=deckDetail")).toEqual(
      { screen: "cardCreator", instanceUrl: "a", deckUrl: "b" },
    );
  });
});

describe("useHashRoute", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("reads the initial route from the URL", () => {
    window.history.replaceState(null, "", "#/instances");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toEqual({ screen: "instancePicker" });
    expect(result.current.change).toBe("initial");
  });

  it("is null for a URL without a route", () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBeNull();
  });

  it("navigate updates the URL and the route", () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.navigate({ screen: "storagePicker" }));
    expect(window.location.hash).toBe("#/storages");
    expect(result.current.route).toEqual({ screen: "storagePicker" });
    expect(result.current.change).toBe("push");
  });

  it("replace updates the URL and the route", () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.replace({ screen: "instancePicker" }));
    expect(window.location.hash).toBe("#/instances");
    expect(result.current.route).toEqual({ screen: "instancePicker" });
    expect(result.current.change).toBe("replace");
  });

  it("follows external hash changes (Back/Forward, hand-edited URL)", () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      window.history.replaceState(null, "", "#/storages");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current.route).toEqual({ screen: "storagePicker" });
    expect(result.current.change).toBe("pop");
  });

  it("takes a hashchange to the route already shown for no move", () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.replace({ screen: "storagePicker" }));
    act(() => {
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current.change).toBe("replace");
    act(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current).toMatchObject({ route: null, change: "pop" });
    act(() => {
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(result.current).toMatchObject({ route: null, change: "pop" });
  });

  it("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useHashRoute());
    unmount();
    window.history.replaceState(null, "", "#/storages");
    window.dispatchEvent(new Event("hashchange"));
    expect(result.current.route).toBeNull();
  });
});

describe("statisticsHref", () => {
  it("is the hash URL of the instance's statistics", () => {
    expect(parseHash(statisticsHref("https://pod.example/a/"))).toEqual({
      screen: "statistics",
      instanceUrl: "https://pod.example/a/",
    });
  });
});
