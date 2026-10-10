import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, RECENT_LIMIT, recentCommands, rememberCommand, rememberPrefs, studioPrefs } from "./prefs";
import { ASIDE_WIDTH, DETAIL_WIDTH, DOCK_HEIGHT } from "./splitter";

const KEY = "solid-memo:studioLayout.v1";

describe("the Studio's layout preferences", () => {
  beforeEach(() => localStorage.clear());

  it("are compact at first, the sidebar and the aside shown, the dock hidden", () => {
    const first = {
      density: "compact",
      sidebar: true,
      aside: true,
      asideWidth: ASIDE_WIDTH.initial,
      detailWidth: DETAIL_WIDTH.initial,
      dock: false,
      dockHeight: DOCK_HEIGHT.initial,
      hiddenColumns: {},
    };
    expect(studioPrefs()).toEqual(first);
    expect(DEFAULT_PREFS).toEqual(first);
  });

  it("are kept on this device", () => {
    const prefs = { density: "comfortable", sidebar: false, aside: false, asideWidth: 400, detailWidth: 600, dock: true, dockHeight: 300, hiddenColumns: { cards: ["ease", "id"] } } as const;
    rememberPrefs(prefs);
    expect(studioPrefs()).toEqual(prefs);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(prefs);
  });

  it("take the default for what the app does not store, each preference on its own", () => {
    localStorage.setItem(KEY, JSON.stringify({ density: "roomy", sidebar: "no", aside: 1, asideWidth: "wide", detailWidth: "wider", dock: null, dockHeight: Infinity }));
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, JSON.stringify({ density: "comfortable" }));
    expect(studioPrefs()).toEqual({ ...DEFAULT_PREFS, density: "comfortable" });
    localStorage.setItem(KEY, JSON.stringify({ density: "roomy", sidebar: false }));
    expect(studioPrefs()).toEqual({ ...DEFAULT_PREFS, sidebar: false });
    localStorage.setItem(KEY, "{not json");
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, JSON.stringify(["comfortable"]));
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, "null");
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("keep only lists of columns' names, by their tables' names", () => {
    localStorage.setItem(KEY, JSON.stringify({ hiddenColumns: { cards: ["ease", 2, null, "id"], decks: "due", home: {} } }));
    expect(studioPrefs().hiddenColumns).toEqual({ cards: ["ease", "id"] });
    for (const stored of [["cards"], "cards", null]) {
      localStorage.setItem(KEY, JSON.stringify({ hiddenColumns: stored }));
      expect(studioPrefs().hiddenColumns).toEqual({});
    }
  });

  it("keep the panes' sizes within their bounds", () => {
    localStorage.setItem(KEY, JSON.stringify({ asideWidth: 10, detailWidth: 10_000, dockHeight: 10_000 }));
    expect(studioPrefs()).toEqual({ ...DEFAULT_PREFS, asideWidth: ASIDE_WIDTH.min, detailWidth: DETAIL_WIDTH.max, dockHeight: DOCK_HEIGHT.max });
  });

  it("are the defaults, and are not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(studioPrefs(refusing)).toEqual(DEFAULT_PREFS);
    expect(() => rememberPrefs({ ...DEFAULT_PREFS, density: "comfortable" }, refusing)).not.toThrow();
  });
});

describe("the palette's entries used last", () => {
  const RECENT = "solid-memo:studioRecent.v1";
  beforeEach(() => localStorage.clear());

  it("are none at first, then the last used first, each once, as many as the device keeps", () => {
    expect(recentCommands()).toEqual([]);
    rememberCommand("a");
    rememberCommand("b");
    rememberCommand("a");
    expect(recentCommands()).toEqual(["a", "b"]);
    for (let n = 0; n < RECENT_LIMIT + 2; n++) rememberCommand(`#${n}`);
    expect(recentCommands()).toHaveLength(RECENT_LIMIT);
    expect(recentCommands()[0]).toBe(`#${RECENT_LIMIT + 1}`);
  });

  it("are none, or only the ids, when the storage holds something else", () => {
    localStorage.setItem(RECENT, "{not json");
    expect(recentCommands()).toEqual([]);
    localStorage.setItem(RECENT, JSON.stringify({ a: 1 }));
    expect(recentCommands()).toEqual([]);
    localStorage.setItem(RECENT, JSON.stringify(["a", 2, null, "b"]));
    expect(recentCommands()).toEqual(["a", "b"]);
  });

  it("are none, and are not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(recentCommands(refusing)).toEqual([]);
    expect(() => rememberCommand("a", refusing)).not.toThrow();
  });
});
