import { describe, expect, it } from "vitest";
import { CHORD_TIMEOUT, isTyping, keyOf, nextRegion, pressKey, sectionRoute, SHORTCUTS, shortcutOf, type Section } from "./shortcuts";

const press = (key: string, held: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) =>
  keyOf({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...held });

const STUDIO = SHORTCUTS.filter((shortcut) => shortcut.scope === "studio");

describe("the Studio's keymap", () => {
  it("gives every shortcut its own keys in its scope", () => {
    for (const scope of ["studio", "cards"]) {
      const keys = SHORTCUTS.filter((shortcut) => shortcut.scope === scope).map((shortcut) => shortcut.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(STUDIO.filter((shortcut) => shortcut.keys.startsWith("g ")).map((shortcut) => shortcut.keys)).toEqual([
      "g d",
      "g g",
      "g r",
      "g p",
      "g h",
      "g l",
      "g t",
      "g i",
    ]);
  });

  it.each([
    ["?", { shiftKey: true }, "?"],
    ["J", { shiftKey: true }, "J"],
    ["F6", { shiftKey: true }, "Shift+F6"],
    ["F6", {}, "F6"],
    ["k", { ctrlKey: true }, "Ctrl+k"],
    ["k", { metaKey: true, altKey: true }, "Meta+Alt+k"],
    ["Enter", {}, "Enter"],
  ])("names %s as the keymap does", (key, held, named) => {
    expect(press(key, held)).toBe(named);
  });

  it("finds a key's shortcut in one scope", () => {
    expect(shortcutOf("j", "cards")).toBe("down");
    expect(shortcutOf("Enter", "cards")).toBe("open");
    expect(shortcutOf("j", "studio")).toBeNull();
    expect(shortcutOf("Ctrl+j", "cards")).toBeNull();
  });

  it("toggles the sidebar with Ctrl+B, and changes the context tab with [ and ] or by its number", () => {
    expect(pressKey(null, press("b", { ctrlKey: true }), 0, STUDIO).shortcut).toBe("toggleSidebar");
    expect(pressKey(null, "[", 0, STUDIO).shortcut).toBe("previousTab");
    expect(pressKey(null, "]", 0, STUDIO).shortcut).toBe("nextTab");
    expect(pressKey(null, "1", 0, STUDIO).shortcut).toBe("tab.1");
    expect(pressKey(null, "9", 0, STUDIO).shortcut).toBe("tab.9");
    expect(pressKey(null, "0", 0, STUDIO).shortcut).toBeNull();
    // The key help lists the nine as one.
    expect(STUDIO.filter((shortcut) => shortcut.id.startsWith("tab.")).map((shortcut) => shortcut.help)).toEqual(["1–9", ...Array(8).fill(null)]);
  });

  it("toggles the aside with Ctrl+\\ and the dock with Ctrl+J, and goes from problem to problem with F8, a field's keys aside", () => {
    expect(pressKey(null, press("\\", { ctrlKey: true }), 0, STUDIO).shortcut).toBe("toggleAside");
    expect(pressKey(null, press("j", { ctrlKey: true }), 0, STUDIO).shortcut).toBe("toggleDock");
    expect(pressKey(null, press("F8"), 0, STUDIO).shortcut).toBe("nextProblem");
    expect(pressKey(null, press("F8", { shiftKey: true }), 0, STUDIO).shortcut).toBe("previousProblem");
    expect(STUDIO.filter((shortcut) => shortcut.whileTyping).map((shortcut) => shortcut.id)).toEqual([
      "palette",
      "palette",
      "nextRegion",
      "previousRegion",
      "nextProblem",
      "previousProblem",
    ]);
  });

  it("does a single key's shortcut at once, and ignores a key that is none", () => {
    expect(pressKey(null, "?", 0, STUDIO)).toEqual({ chord: null, shortcut: "help" });
    expect(pressKey(null, "q", 0, STUDIO)).toEqual({ chord: null, shortcut: null });
  });

  it("waits after the first key of a chord for its second", () => {
    const first = pressKey(null, "g", 1000, STUDIO);
    expect(first).toEqual({ chord: { keys: "g", at: 1000 }, shortcut: null });
    expect(pressKey(first.chord, "d", 1000 + CHORD_TIMEOUT, STUDIO)).toEqual({ chord: null, shortcut: "go.decks" });
    expect(pressKey(first.chord, "g", 1200, STUDIO)).toEqual({ chord: null, shortcut: "go.groups" });
  });

  it("drops a chord left too long, or followed by a key that ends none, the key counting on its own", () => {
    const chord = { keys: "g", at: 1000 };
    const late = 1001 + CHORD_TIMEOUT;
    expect(pressKey(chord, "d", late, STUDIO)).toEqual({ chord: null, shortcut: null });
    expect(pressKey(chord, "g", late, STUDIO)).toEqual({ chord: { keys: "g", at: late }, shortcut: null });
    expect(pressKey(chord, "?", 1200, STUDIO)).toEqual({ chord: null, shortcut: "help" });
    expect(pressKey(chord, "q", 1200, STUDIO)).toEqual({ chord: null, shortcut: null });
  });

  it.each<[Section, unknown]>([
    ["decks", { screen: "home", instanceUrl: "https://pod.example/a/" }],
    ["groups", { screen: "groups", instanceUrl: "https://pod.example/a/" }],
    ["transfer", { screen: "transfer", instanceUrl: "https://pod.example/a/" }],
    ["instances", { screen: "instances" }],
  ])("goes to the %s of the open instance", (section, route) => {
    expect(sectionRoute(section, "https://pod.example/a/")).toEqual(route);
  });

  it("goes to no section but the instances without an instance open", () => {
    expect(sectionRoute("drafts", null)).toBeNull();
    expect(sectionRoute("instances", null)).toEqual({ screen: "instances" });
  });
});

describe("isTyping", () => {
  const element = (html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild;
  };

  it("leaves its keys to a field the user types or chooses in", () => {
    expect(isTyping(element('<input type="search">'))).toBe(true);
    expect(isTyping(element("<input>"))).toBe(true);
    expect(isTyping(element("<textarea></textarea>"))).toBe(true);
    expect(isTyping(element("<select></select>"))).toBe(true);
    expect(isTyping(element('<div contenteditable="true"></div>'))).toBe(true);
  });

  it("takes the keys of what is pressed or ticked, and of the rest of the page", () => {
    expect(isTyping(element('<input type="checkbox">'))).toBe(false);
    expect(isTyping(element('<input type="radio">'))).toBe(false);
    expect(isTyping(element("<button></button>"))).toBe(false);
    expect(isTyping(element('<a href="#">a</a>'))).toBe(false);
    expect(isTyping(document)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("nextRegion", () => {
  const regions = ["header", "main", "status"].map((name) => ({ name, contains: (other: Node | null) => other === (name as unknown) }));
  const at = (name: string) => name as unknown as Node;

  it("goes to the next region with F6 and the one before with Shift+F6, round", () => {
    expect(nextRegion(regions, at("header"), 1)?.name).toBe("main");
    expect(nextRegion(regions, at("status"), 1)?.name).toBe("header");
    expect(nextRegion(regions, at("header"), -1)?.name).toBe("status");
    expect(nextRegion(regions, at("main"), -1)?.name).toBe("header");
  });

  it("goes from outside every region to the first, or back to the last", () => {
    expect(nextRegion(regions, null, 1)?.name).toBe("header");
    expect(nextRegion(regions, null, -1)?.name).toBe("status");
  });
});
