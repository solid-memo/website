import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, rememberPrefs, studioPrefs } from "./prefs";

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
