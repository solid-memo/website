// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { HASHED_CHARACTERS } from "@solid-memo/domain/pathKeys";
import { beforeEach, describe, expect, it } from "vitest";
import { UNKEPT_VALUES } from "@solid-memo/ui/deviceValues";
import { makeDeviceValuesFake } from "@solid-memo/ui/test/fakes/deviceValues";
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

let device = makeDeviceValuesFake();
beforeEach(() => {
  device = makeDeviceValuesFake();
});

describe("the Studio's layout preferences", () => {
  it("are compact at first, the sidebar and the aside shown, the dock hidden, single-key shortcuts on", () => {
    const first = {
      density: "compact",
      sidebar: true,
      aside: true,
      asideWidth: ASIDE_WIDTH.initial,
      detailWidth: DETAIL_WIDTH.initial,
      dock: false,
      dockHeight: DOCK_HEIGHT.initial,
      hiddenColumns: {},
      characterKeys: true,
    };
    expect(studioPrefs(device)).toEqual(first);
    expect(DEFAULT_PREFS).toEqual(first);
  });

  it("are kept on this device", () => {
    const prefs = {
      density: "comfortable",
      sidebar: false,
      aside: false,
      asideWidth: 400,
      detailWidth: 600,
      dock: true,
      dockHeight: 300,
      hiddenColumns: { cards: ["ease", "id"] },
      characterKeys: false,
    } as const;
    rememberPrefs(prefs, device);
    expect(studioPrefs(device)).toEqual(prefs);
    expect(JSON.parse(device.stored.get(KEY)!)).toEqual(prefs);
  });

  it("take the default for what the app does not store, each preference on its own", () => {
    device.stored.set(
      KEY,
      JSON.stringify({
        density: "roomy",
        sidebar: "no",
        aside: 1,
        asideWidth: "wide",
        detailWidth: "wider",
        dock: null,
        dockHeight: Infinity,
        characterKeys: "off",
      }),
    );
    expect(studioPrefs(device)).toEqual(DEFAULT_PREFS);
    device.stored.set(KEY, JSON.stringify({ density: "comfortable" }));
    expect(studioPrefs(device)).toEqual({ ...DEFAULT_PREFS, density: "comfortable" });
    device.stored.set(KEY, JSON.stringify({ density: "roomy", sidebar: false }));
    expect(studioPrefs(device)).toEqual({ ...DEFAULT_PREFS, sidebar: false });
    device.stored.set(KEY, "{not json");
    expect(studioPrefs(device)).toEqual(DEFAULT_PREFS);
    device.stored.set(KEY, JSON.stringify(["comfortable"]));
    expect(studioPrefs(device)).toEqual(DEFAULT_PREFS);
    device.stored.set(KEY, "null");
    expect(studioPrefs(device)).toEqual(DEFAULT_PREFS);
  });

  it("keep only lists of columns' names, by their tables' names", () => {
    device.stored.set(
      KEY,
      JSON.stringify({ hiddenColumns: { cards: ["ease", 2, null, "id"], decks: "due", home: {} } }),
    );
    expect(studioPrefs(device).hiddenColumns).toEqual({ cards: ["ease", "id"] });
    for (const stored of [["cards"], "cards", null]) {
      device.stored.set(KEY, JSON.stringify({ hiddenColumns: stored }));
      expect(studioPrefs(device).hiddenColumns).toEqual({});
    }
  });

  it("keep the panes' sizes within their bounds", () => {
    device.stored.set(
      KEY,
      JSON.stringify({ asideWidth: 10, detailWidth: 10_000, dockHeight: 10_000 }),
    );
    expect(studioPrefs(device)).toEqual({
      ...DEFAULT_PREFS,
      asideWidth: ASIDE_WIDTH.min,
      detailWidth: DETAIL_WIDTH.max,
      dockHeight: DOCK_HEIGHT.max,
    });
  });

  it("keep a pane's size past its bounds at the browser's own text size, in larger text", () => {
    device.stored.set(KEY, JSON.stringify({ asideWidth: 900 }));
    document.documentElement.style.fontSize = "150%";
    try {
      expect(studioPrefs(device).asideWidth).toBe(900);
    } finally {
      document.documentElement.style.fontSize = "";
    }
  });

  it("are the defaults, and are not kept, where the device keeps nothing", () => {
    rememberPrefs({ ...DEFAULT_PREFS, density: "comfortable" }, UNKEPT_VALUES);
    expect(studioPrefs(UNKEPT_VALUES)).toEqual(DEFAULT_PREFS);
  });

  it("are kept as none when they are the defaults", () => {
    rememberPrefs({ ...DEFAULT_PREFS, density: "comfortable" }, device);
    rememberPrefs(DEFAULT_PREFS, device);
    expect(device.stored.has(KEY)).toBe(false);
  });
});

describe("the palette's entries used last", () => {
  const RECENT = "solid-memo:studioRecent.v1";
  it("are none at first, then the last used first, each once, as many as the device keeps", () => {
    expect(recentCommands(device)).toEqual([]);
    rememberCommand("a", device);
    rememberCommand("b", device);
    rememberCommand("a", device);
    expect(recentCommands(device)).toEqual(["a", "b"]);
    for (let n = 0; n < RECENT_LIMIT + 2; n++) rememberCommand(`#${n}`, device);
    expect(recentCommands(device)).toHaveLength(RECENT_LIMIT);
    expect(recentCommands(device)[0]).toBe(`#${RECENT_LIMIT + 1}`);
  });

  it("are none, or only the ids, when the storage holds something else", () => {
    device.stored.set(RECENT, "{not json");
    expect(recentCommands(device)).toEqual([]);
    device.stored.set(RECENT, JSON.stringify({ a: 1 }));
    expect(recentCommands(device)).toEqual([]);
    device.stored.set(RECENT, JSON.stringify(["a", 2, null, "b"]));
    expect(recentCommands(device)).toEqual(["a", "b"]);
  });

  it("are none, and are not kept, where the device keeps nothing", () => {
    rememberCommand("a", UNKEPT_VALUES);
    expect(recentCommands(UNKEPT_VALUES)).toEqual([]);
  });
});

describe("what the device keeps of an instance", () => {
  const INSTANCES = "solid-memo:studioInstances.v1";
  const a = "https://pod.example/a/";
  const b = "https://pod.example/b/";
  const kanji: WorkItem = { kind: "deck", url: `${a}decks/kanji.ttl` };
  const solid: WorkItem = { kind: "draft", url: `${a}drafts/solid/v1/release.ttl` };
  const kept: InstancePrefs = {
    views: {
      home: [{ name: "Due", params: "show=due" }],
      cards: [{ name: "Leeches", params: "state=leech" }],
    },
    pinned: [kanji],
    recent: [solid, kanji],
  };
  it("is nothing at first, then what was kept, for each instance on its own", () => {
    expect(instancePrefs(a, device)).toEqual(NO_INSTANCE_PREFS);
    rememberInstancePrefs(a, kept, device);
    rememberInstancePrefs(b, { ...NO_INSTANCE_PREFS, pinned: [solid] }, device);
    expect(instancePrefs(a, device)).toEqual(kept);
    expect(instancePrefs(b, device)).toEqual({ ...NO_INSTANCE_PREFS, pinned: [solid] });
  });

  it("keeps only the views and the items that are, each part on its own", () => {
    device.stored.set(
      INSTANCES,
      JSON.stringify({
        [a]: {
          views: {
            home: [
              { name: "Due", params: "show=due" },
              { name: "", params: "q=x" },
              { name: "No query" },
              null,
              "Due",
            ],
            cards: "Leeches",
          },
          pinned: [kanji, { kind: "card", url: "x" }, { kind: "deck" }, 3],
          recent: Array.from({ length: RECENT_ITEMS + 2 }, (_, n) => ({
            kind: "deck",
            url: `${a}decks/${n}.ttl`,
          })),
        },
        [b]: { views: null, pinned: {}, recent: "kanji" },
      }),
    );
    const read = instancePrefs(a, device);
    expect(read.views).toEqual({ home: [{ name: "Due", params: "show=due" }], cards: [] });
    expect(read.pinned).toEqual([kanji]);
    expect(read.recent).toHaveLength(RECENT_ITEMS);
    expect(instancePrefs(b, device)).toEqual(NO_INSTANCE_PREFS);
    for (const stored of ["{not json", "[]", JSON.stringify({ [a]: "kept" })]) {
      device.stored.set(INSTANCES, stored);
      expect(instancePrefs(a, device)).toEqual(NO_INSTANCE_PREFS);
    }
  });

  it("is nothing, and is not kept, where the device keeps nothing", () => {
    rememberInstancePrefs(a, kept, UNKEPT_VALUES);
    expect(instancePrefs(a, UNKEPT_VALUES)).toEqual(NO_INSTANCE_PREFS);
  });

  describe("keeps no URL longer than a term may be", () => {
    const long: WorkItem = {
      kind: "deck",
      url: `${a}catalog.ttl#${"a".repeat(HASHED_CHARACTERS)}`,
    };
    const longest: WorkItem = {
      kind: "deck",
      url: `${a}${"a".repeat(HASHED_CHARACTERS - a.length)}`,
    };

    it("neither lists it as opened nor pins it", () => {
      expect(openedNow([kanji], long)).toEqual([kanji]);
      expect(togglePin([kanji], long)).toEqual([kanji]);
      expect(openedNow([kanji], longest)).toEqual([longest, kanji]);
      expect(togglePin([kanji], longest)).toEqual([kanji, longest]);
    });

    it("leaves it out as it notes an instance's", () => {
      rememberInstancePrefs(
        a,
        {
          ...NO_INSTANCE_PREFS,
          pinned: [long, kanji],
          recent: [long, solid],
        },
        device,
      );
      expect(JSON.parse(device.stored.get(INSTANCES)!)).toEqual({
        [a]: { ...NO_INSTANCE_PREFS, pinned: [kanji], recent: [solid] },
      });
    });

    it("leaves out one kept before as it reads", () => {
      device.stored.set(
        INSTANCES,
        JSON.stringify({
          [a]: { ...kept, pinned: [long, kanji], recent: [long, solid, kanji] },
          [b]: { ...NO_INSTANCE_PREFS, recent: [long] },
        }),
      );
      expect(instancePrefs(a, device)).toEqual(kept);
      expect(instancePrefs(b, device)).toEqual(NO_INSTANCE_PREFS);
    });

    it("keeps no saved view whose name or query is longer", () => {
      const longText = "a".repeat(HASHED_CHARACTERS + 1);
      const longestText = "a".repeat(HASHED_CHARACTERS);
      const views = {
        home: [
          { name: longText, params: "show=due" },
          { name: "Due", params: "show=due" },
          { name: longestText, params: longestText },
        ],
        cards: [
          { name: "Leeches", params: `q=${longText}` },
          { name: "Leeches", params: "state=leech" },
        ],
      };
      const keptViews = {
        home: [
          { name: "Due", params: "show=due" },
          { name: longestText, params: longestText },
        ],
        cards: [{ name: "Leeches", params: "state=leech" }],
      };
      rememberInstancePrefs(a, { ...NO_INSTANCE_PREFS, views }, device);
      expect(JSON.parse(device.stored.get(INSTANCES)!)[a].views).toEqual(keptViews);
      device.stored.set(INSTANCES, JSON.stringify({ [a]: { ...NO_INSTANCE_PREFS, views } }));
      expect(instancePrefs(a, device).views).toEqual(keptViews);
    });
  });

  describe("keeps a bounded number of pins and views", () => {
    it("keeps no more pins and saved views than it keeps of each", () => {
      const items = Array.from(
        { length: 105 },
        (_, n): WorkItem => ({ kind: "deck", url: `${a}decks/${n}.ttl` }),
      );
      const views = Array.from({ length: 55 }, (_, n) => ({ name: `${n}`, params: "" }));
      rememberInstancePrefs(
        a,
        {
          views: { home: views, cards: views },
          pinned: items,
          recent: [],
        },
        device,
      );
      const read = instancePrefs(a, device);
      expect(read.pinned).toEqual(items.slice(0, 100));
      expect(read.views).toEqual({ home: views.slice(0, 50), cards: views.slice(0, 50) });
      expect(togglePin(items.slice(0, 100), kanji)).toEqual(items.slice(0, 100));
      expect(togglePin(items.slice(0, 99), kanji)).toEqual([...items.slice(0, 99), kanji]);
    });
  });

  it("pins an item at the end, and unpins it", () => {
    expect(togglePin([kanji], solid)).toEqual([kanji, solid]);
    expect(togglePin([kanji, solid], { ...kanji })).toEqual([solid]);
  });

  it("lists the item opened now first, once, as many as it keeps", () => {
    expect(openedNow([kanji, solid], solid)).toEqual([solid, kanji]);
    expect(openedNow([kanji], { kind: "draft", url: kanji.url })).toEqual([
      { kind: "draft", url: kanji.url },
      kanji,
    ]);
    const many = Array.from(
      { length: RECENT_ITEMS },
      (_, n): WorkItem => ({ kind: "deck", url: `${a}decks/${n}.ttl` }),
    );
    expect(openedNow(many, kanji)).toEqual([kanji, ...many.slice(0, RECENT_ITEMS - 1)]);
  });
});
