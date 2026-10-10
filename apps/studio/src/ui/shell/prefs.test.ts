import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, RECENT_LIMIT, recentCommands, rememberCommand, rememberPrefs, studioPrefs } from "./prefs";

const KEY = "solid-memo:studioLayout.v1";

describe("the Studio's layout preferences", () => {
  beforeEach(() => localStorage.clear());

  it("are compact at first, the sidebar shown", () => {
    expect(studioPrefs()).toEqual({ density: "compact", sidebar: true });
    expect(DEFAULT_PREFS).toEqual({ density: "compact", sidebar: true });
  });

  it("are kept on this device", () => {
    rememberPrefs({ density: "comfortable", sidebar: false });
    expect(studioPrefs()).toEqual({ density: "comfortable", sidebar: false });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ density: "comfortable", sidebar: false });
  });

  it("take the default for what the app does not store, each preference on its own", () => {
    localStorage.setItem(KEY, JSON.stringify({ density: "roomy", sidebar: "no" }));
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, JSON.stringify({ density: "comfortable" }));
    expect(studioPrefs()).toEqual({ density: "comfortable", sidebar: true });
    localStorage.setItem(KEY, JSON.stringify({ density: "roomy", sidebar: false }));
    expect(studioPrefs()).toEqual({ density: "compact", sidebar: false });
    localStorage.setItem(KEY, "{not json");
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, JSON.stringify(["comfortable"]));
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(KEY, "null");
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("are the defaults, and are not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(studioPrefs(refusing)).toEqual(DEFAULT_PREFS);
    expect(() => rememberPrefs({ density: "comfortable", sidebar: true }, refusing)).not.toThrow();
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
