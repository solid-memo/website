import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  instancePrefs,
  NO_INSTANCE_PREFS,
  openedNow,
  RECENT_ITEMS,
  RECENT_LIMIT,
  recentCommands,
  rememberCommand,
  rememberInstancePrefs,
  rememberPrefs,
  studioPrefs,
  togglePin,
  type InstancePrefs,
  type WorkItem,
} from "./prefs";
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

describe("what the device keeps of an instance", () => {
  const INSTANCES = "solid-memo:studioInstances.v1";
  const a = "https://pod.example/a/";
  const b = "https://pod.example/b/";
  const kanji: WorkItem = { kind: "deck", url: `${a}decks/kanji.ttl` };
  const solid: WorkItem = { kind: "draft", url: `${a}drafts/solid/v1/release.ttl` };
  const kept: InstancePrefs = {
    views: { home: [{ name: "Due", params: "show=due" }], cards: [{ name: "Leeches", params: "state=leech" }] },
    pinned: [kanji],
    recent: [solid, kanji],
  };
  beforeEach(() => localStorage.clear());

  it("is nothing at first, then what was kept, for each instance on its own", () => {
    expect(instancePrefs(a)).toEqual(NO_INSTANCE_PREFS);
    rememberInstancePrefs(a, kept);
    rememberInstancePrefs(b, { ...NO_INSTANCE_PREFS, pinned: [solid] });
    expect(instancePrefs(a)).toEqual(kept);
    expect(instancePrefs(b)).toEqual({ ...NO_INSTANCE_PREFS, pinned: [solid] });
  });

  it("keeps only the views and the items that are, each part on its own", () => {
    localStorage.setItem(
      INSTANCES,
      JSON.stringify({
        [a]: {
          views: { home: [{ name: "Due", params: "show=due" }, { name: "", params: "q=x" }, { name: "No query" }, null, "Due"], cards: "Leeches" },
          pinned: [kanji, { kind: "card", url: "x" }, { kind: "deck" }, 3],
          recent: Array.from({ length: RECENT_ITEMS + 2 }, (_, n) => ({ kind: "deck", url: `${a}decks/${n}.ttl` })),
        },
        [b]: { views: null, pinned: {}, recent: "kanji" },
      }),
    );
    const read = instancePrefs(a);
    expect(read.views).toEqual({ home: [{ name: "Due", params: "show=due" }], cards: [] });
    expect(read.pinned).toEqual([kanji]);
    expect(read.recent).toHaveLength(RECENT_ITEMS);
    expect(instancePrefs(b)).toEqual(NO_INSTANCE_PREFS);
    for (const stored of ["{not json", "[]", JSON.stringify({ [a]: "kept" })]) {
      localStorage.setItem(INSTANCES, stored);
      expect(instancePrefs(a)).toEqual(NO_INSTANCE_PREFS);
    }
  });

  it("is nothing, and is not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(instancePrefs(a, refusing)).toEqual(NO_INSTANCE_PREFS);
    expect(() => rememberInstancePrefs(a, kept, refusing)).not.toThrow();
  });

  it("pins an item at the end, and unpins it", () => {
    expect(togglePin([kanji], solid)).toEqual([kanji, solid]);
    expect(togglePin([kanji, solid], { ...kanji })).toEqual([solid]);
  });

  it("lists the item opened now first, once, as many as it keeps", () => {
    expect(openedNow([kanji, solid], solid)).toEqual([solid, kanji]);
    expect(openedNow([kanji], { kind: "draft", url: kanji.url })).toEqual([{ kind: "draft", url: kanji.url }, kanji]);
    const many = Array.from({ length: RECENT_ITEMS }, (_, n): WorkItem => ({ kind: "deck", url: `${a}decks/${n}.ttl` }));
    expect(openedNow(many, kanji)).toEqual([kanji, ...many.slice(0, RECENT_ITEMS - 1)]);
  });
});
