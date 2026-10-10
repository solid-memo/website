import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT_URL, instanceA, makeDeck } from "../../test/fixtures";
import type { DraftRoute, StudioRoute } from "../router";
import {
  asideOf,
  contextTabsOf,
  currentOutlineKey,
  deckOf,
  deckTabs,
  draftTabs,
  sectionHome,
  sectionOf,
  SIDEBAR_SECTIONS,
  stepProblem,
  stepTab,
  type ContextTab,
} from "./workspaceLayout";

const instanceUrl = instanceA.url;
const deckUrl = makeDeck("deck-1", { en: "Kanji N5" }).url;
const draftUrl = DRAFT_URL;
const draft = courseDraft();

/** The tabs as their keys, the one shown starred, the one the page shown is under marked ^. */
const keys = (tabs: readonly ContextTab[]) => tabs.map((tab) => ({ page: "*", true: "^", false: "" })[`${tab.current}`] + tab.key);

describe("the sidebar's sections", () => {
  it("open where their links go: the decks at Home, each other at its screen", () => {
    expect(SIDEBAR_SECTIONS.map((section) => sectionHome(section, instanceUrl))).toEqual([
      { screen: "home", instanceUrl },
      { screen: "groups", instanceUrl },
      { screen: "drafts", instanceUrl },
      { screen: "releases", instanceUrl },
      { screen: "health", instanceUrl },
      { screen: "library", instanceUrl },
      { screen: "transfer", instanceUrl },
      { screen: "instance", instanceUrl },
    ]);
  });

  it.each<[StudioRoute, ReturnType<typeof sectionOf>]>([
    [{ screen: "instances" }, null],
    [{ screen: "home", instanceUrl, view: { filter: "kanji" } }, "decks"],
    [{ screen: "groups", instanceUrl }, "groups"],
    [{ screen: "drafts", instanceUrl }, "drafts"],
    [{ screen: "releases", instanceUrl }, "releases"],
    [{ screen: "health", instanceUrl }, "health"],
    [{ screen: "health", instanceUrl, deckUrl }, null],
    [{ screen: "library", instanceUrl }, "library"],
    [{ screen: "transfer", instanceUrl, deckUrls: [deckUrl] }, "transfer"],
    [{ screen: "instance", instanceUrl }, "instance"],
    [{ screen: "cards", deckUrl }, null],
    [{ screen: "draft", draftUrl }, null],
  ])("mark the one %j is in: %s", (route, section) => {
    expect(sectionOf(route)).toBe(section);
  });
});

describe("deckOf", () => {
  it.each<[StudioRoute, string | null]>([
    [{ screen: "cards", deckUrl }, deckUrl],
    [{ screen: "card", deckUrl, cardUrl: `${deckUrl}#water` }, deckUrl],
    [{ screen: "schedule", deckUrl }, deckUrl],
    [{ screen: "about", deckUrl }, deckUrl],
    [{ screen: "health", instanceUrl, deckUrl }, deckUrl],
    [{ screen: "health", instanceUrl }, null],
    [{ screen: "transfer", instanceUrl, deckUrls: [deckUrl] }, null],
    [{ screen: "home", instanceUrl }, null],
  ])("names the deck %j is about", (route, deck) => {
    expect(deckOf(route)).toBe(deck);
  });
});

describe("deckTabs", () => {
  it("goes to the deck's cards, schedule, health, about screen and export", () => {
    expect(deckTabs({ screen: "about", deckUrl }, deckUrl).map((tab) => tab.route)).toEqual([
      { screen: "cards", deckUrl },
      { screen: "schedule", deckUrl },
      { screen: "health", instanceUrl, deckUrl },
      { screen: "about", deckUrl },
      { screen: "transfer", instanceUrl, deckUrls: [deckUrl] },
    ]);
  });

  it.each<[StudioRoute, string[]]>([
    [{ screen: "cards", deckUrl }, ["*cards", "schedule", "health", "about", "export"]],
    [{ screen: "card", deckUrl, cardUrl: `${deckUrl}#water`, tab: "history" }, ["^cards", "schedule", "health", "about", "export"]],
    [{ screen: "schedule", deckUrl }, ["cards", "*schedule", "health", "about", "export"]],
    [{ screen: "health", instanceUrl, deckUrl }, ["cards", "schedule", "*health", "about", "export"]],
    [{ screen: "about", deckUrl }, ["cards", "schedule", "health", "*about", "export"]],
  ])("marks the tab %j is on", (route, tabs) => {
    expect(keys(deckTabs(route, deckUrl))).toEqual(tabs);
  });
});

describe("draftTabs", () => {
  it("goes to the draft's overview, cards, check, preview, trial, changes and release", () => {
    expect(draftTabs({ screen: "release", draftUrl }, true).map((tab) => tab.route)).toEqual([
      { screen: "draft", draftUrl },
      { screen: "draftCards", draftUrl },
      { screen: "check", draftUrl },
      { screen: "preview", draftUrl },
      { screen: "trial", draftUrl },
      { screen: "diff", draftUrl },
      { screen: "release", draftUrl },
    ]);
  });

  it.each<[DraftRoute, string[]]>([
    [{ screen: "draft", draftUrl, field: "title" }, ["*overview", "cards", "check", "preview", "trial", "diff", "release"]],
    [{ screen: "chapter", draftUrl, chapter: "basics" }, ["^overview", "cards", "check", "preview", "trial", "diff", "release"]],
    [{ screen: "step", draftUrl, step: "basics-1" }, ["^overview", "cards", "check", "preview", "trial", "diff", "release"]],
    [{ screen: "draftCards", draftUrl, page: 2 }, ["overview", "*cards", "check", "preview", "trial", "diff", "release"]],
    [{ screen: "question", draftUrl, card: "q1" }, ["overview", "^cards", "check", "preview", "trial", "diff", "release"]],
    [{ screen: "check", draftUrl, policy: "library" }, ["overview", "cards", "*check", "preview", "trial", "diff", "release"]],
    [{ screen: "preview", draftUrl }, ["overview", "cards", "check", "*preview", "trial", "diff", "release"]],
    [{ screen: "trial", draftUrl, chapter: "basics" }, ["overview", "cards", "check", "preview", "*trial", "diff", "release"]],
    [{ screen: "diff", draftUrl }, ["overview", "cards", "check", "preview", "trial", "*diff", "release"]],
    [{ screen: "release", draftUrl, field: "authors" }, ["overview", "cards", "check", "preview", "trial", "diff", "*release"]],
  ])("marks the tab %j is on", (route, tabs) => {
    expect(keys(draftTabs(route, true))).toEqual(tabs);
  });

  it("has no Changes for a first version, nor any current tab on its comparison", () => {
    expect(keys(draftTabs({ screen: "diff", draftUrl }, false))).toEqual(["overview", "cards", "check", "preview", "trial", "release"]);
  });
});

describe("contextTabsOf", () => {
  it("gives a deck's screens the deck's tabs", () => {
    expect(contextTabsOf({ screen: "schedule", deckUrl }, null)).toEqual({ of: "deck", tabs: deckTabs({ screen: "schedule", deckUrl }, deckUrl) });
  });

  it("gives a draft's screens the draft's tabs, Changes as the draft follows a release", () => {
    expect(contextTabsOf({ screen: "check", draftUrl }, draft)).toEqual({ of: "draft", tabs: draftTabs({ screen: "check", draftUrl }, false) });
    const next = { ...draft, root: { ...draft.root, prev: "https://pod.example/releases/solid/v1.ttl" } };
    expect(keys(contextTabsOf({ screen: "check", draftUrl }, next)!.tabs)).toContain("diff");
  });

  it("gives the instance's screens none", () => {
    expect(contextTabsOf({ screen: "home", instanceUrl }, null)).toBeNull();
    expect(contextTabsOf({ screen: "instances" }, null)).toBeNull();
  });
});

describe("stepTab", () => {
  const tabs = [
    { key: "a", current: false },
    { key: "b", current: true },
    { key: "c", current: false },
  ];

  it("goes to the next tab or the one before, round from either end", () => {
    expect(stepTab(tabs, 1)!.key).toBe("c");
    expect(stepTab(tabs, -1)!.key).toBe("a");
    const last = tabs.map((tab) => ({ ...tab, current: tab.key === "c" }));
    expect(stepTab(last, 1)!.key).toBe("a");
    const first = tabs.map((tab) => ({ ...tab, current: tab.key === "a" }));
    expect(stepTab(first, -1)!.key).toBe("c");
  });

  it("goes from no current tab to the first or the last, and nowhere without tabs", () => {
    const none = tabs.map((tab) => ({ ...tab, current: false }));
    expect(stepTab(none, 1)!.key).toBe("a");
    expect(stepTab(none, -1)!.key).toBe("c");
    expect(stepTab([], 1)).toBeUndefined();
  });
});

describe("asideOf", () => {
  const deck = { ...draft, course: false };

  it.each<[StudioRoute, ReturnType<typeof asideOf>]>([
    [{ screen: "chapter", draftUrl, chapter: "basics" }, "outline"],
    [{ screen: "check", draftUrl }, "outline"],
    [{ screen: "draft", draftUrl }, null],
  ])("shows a course's outline on %j: %s", (route, aside) => {
    expect(asideOf(route, draft)).toBe(aside);
  });

  it("shows the deck at Home's cursor, and the plan of the library copy at theirs", () => {
    expect(asideOf({ screen: "home", instanceUrl, deckUrl }, null)).toBe("peek");
    expect(asideOf({ screen: "library", instanceUrl }, null)).toBe("plan");
  });

  it("shows nothing for a deck's draft, nor on another screen", () => {
    expect(asideOf({ screen: "check", draftUrl }, deck)).toBeNull();
    expect(asideOf({ screen: "cards", deckUrl }, null)).toBeNull();
  });
});

describe("currentOutlineKey", () => {
  it.each<[StudioRoute, string | null]>([
    [{ screen: "chapter", draftUrl, chapter: "basics" }, "basics"],
    [{ screen: "step", draftUrl, step: "basics-1" }, "basics-1"],
    [{ screen: "question", draftUrl, card: "q1", field: "back" }, "q1"],
    [{ screen: "draft", draftUrl }, null],
    [{ screen: "cards", deckUrl }, null],
  ])("marks what %j edits: %s", (route, key) => {
    expect(currentOutlineKey(route)).toBe(key);
  });
});

describe("stepProblem", () => {
  const hrefs = ["#/a", "#/b", "#/b", "#/c"];

  it("goes from the page shown to the problem after it, or before it, round from either end", () => {
    expect(stepProblem(hrefs, "#/a", null, 1)).toBe(1);
    expect(stepProblem(hrefs, "#/a", null, -1)).toBe(3);
    expect(stepProblem(hrefs, "#/c", null, 1)).toBe(0);
  });

  it("goes on from the problem gone to last while its page is shown, so two of one page are each gone to", () => {
    expect(stepProblem(hrefs, "#/b", 1, 1)).toBe(2);
    expect(stepProblem(hrefs, "#/b", 2, 1)).toBe(3);
    expect(stepProblem(hrefs, "#/b", 2, -1)).toBe(1);
    // The page shown is no longer that problem's: from the page's own.
    expect(stepProblem(hrefs, "#/c", 1, -1)).toBe(2);
  });

  it("goes from a page without problems to the first or the last, and nowhere without problems", () => {
    expect(stepProblem(hrefs, "#/elsewhere", null, 1)).toBe(0);
    expect(stepProblem(hrefs, "#/elsewhere", null, -1)).toBe(3);
    expect(stepProblem([], "#/a", null, 1)).toBeNull();
  });
});
