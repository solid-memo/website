import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, rememberPrefs, studioPrefs } from "./prefs";

const KEY = "solid-memo:studioLayout.v1";

describe("the Studio's layout preferences", () => {
  beforeEach(() => localStorage.clear());

  it("are compact at first", () => {
    expect(studioPrefs()).toEqual({ density: "compact" });
    expect(DEFAULT_PREFS.density).toBe("compact");
  });

  it("are kept on this device", () => {
    rememberPrefs({ density: "comfortable" });
    expect(studioPrefs()).toEqual({ density: "comfortable" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ density: "comfortable" });
  });

  it("take the default for what the app does not store", () => {
    localStorage.setItem(KEY, JSON.stringify({ density: "roomy" }));
    expect(studioPrefs()).toEqual(DEFAULT_PREFS);
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
    expect(() => rememberPrefs({ density: "comfortable" }, refusing)).not.toThrow();
  });
});
