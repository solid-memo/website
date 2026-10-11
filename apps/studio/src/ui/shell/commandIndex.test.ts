// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createI18n } from "@solid-memo/ui/i18n";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { DRAFT_URL, instanceA, instanceB, makeCard, makeDeck } from "../../test/fixtures";
import { studioRouteToHash, type StudioRoute } from "../router";
import {
  buildCommands,
  itemCommandId,
  matchScore,
  MAX_SHOWN,
  rankCommands,
  type Command,
  type CommandSources,
} from "./commandIndex";
import { deckTabs } from "./workspaceLayout";

const en = createI18n("en");
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const water = makeCard(kanji, "water");
const summary = (name: string, extra: Partial<ReleaseDraftSummary> = {}): ReleaseDraftSummary => ({
  url: `${instanceA.url}drafts/${name}/v1/release.ttl`,
  instanceUrl: instanceA.url,
  name,
  version: 1,
  readable: true,
  title: { en: "Solid" },
  course: true,
  ...extra,
});
const cardsRoute: StudioRoute = { screen: "cards", deckUrl: kanji.url };
const run = vi.fn();

const sources: CommandSources = {
  instances: [instanceA, instanceB],
  instanceUrl: instanceA.url,
  tabs: deckTabs(cardsRoute, kanji.url),
  decks: [kanji, verbs],
  drafts: [
    summary("solid"),
    summary("capitals", { title: {} }),
    summary("broken", { readable: false, title: {} }),
  ],
  cards: { deckUrl: kanji.url, cards: [water] },
  commands: [{ id: "checkAgain", label: "Check again", run }],
};

/** Each entry as its group, its name, where it goes (or "run") and its keys. */
const entries = (commands: readonly Command[]) =>
  commands.map((command) => [
    command.group,
    command.label,
    "route" in command ? studioRouteToHash(command.route) : "run",
    command.keys ?? "",
  ]);
const hash = studioRouteToHash;

describe("the palette's entries", () => {
  it("are the screen's commands, the tabs, the sections, the instances, the decks, the drafts and the deck's cards", () => {
    expect(entries(buildCommands(sources, en))).toEqual([
      ["commands", "Check again", "run", ""],
      ["tabs", "Cards", hash(cardsRoute), "1"],
      ["tabs", "Schedule", hash({ screen: "schedule", deckUrl: kanji.url }), "2"],
      [
        "tabs",
        "Health",
        hash({ screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url }),
        "3",
      ],
      ["tabs", "About", hash({ screen: "about", deckUrl: kanji.url }), "4"],
      [
        "tabs",
        "Export",
        hash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [kanji.url] }),
        "5",
      ],
      ["sections", "Decks", hash({ screen: "home", instanceUrl: instanceA.url }), "g d"],
      ["sections", "Groups", hash({ screen: "groups", instanceUrl: instanceA.url }), "g g"],
      ["sections", "Drafts", hash({ screen: "drafts", instanceUrl: instanceA.url }), "g r"],
      ["sections", "Releases", hash({ screen: "releases", instanceUrl: instanceA.url }), "g p"],
      ["sections", "Health", hash({ screen: "health", instanceUrl: instanceA.url }), "g h"],
      [
        "sections",
        "Library copies",
        hash({ screen: "library", instanceUrl: instanceA.url }),
        "g l",
      ],
      [
        "sections",
        "Import and export",
        hash({ screen: "transfer", instanceUrl: instanceA.url }),
        "g t",
      ],
      [
        "sections",
        "Name and catalog",
        hash({ screen: "instance", instanceUrl: instanceA.url }),
        "",
      ],
      ["sections", "All instances", hash({ screen: "instances" }), "g i"],
      ["instances", "Deck set A", hash({ screen: "home", instanceUrl: instanceA.url }), ""],
      ["instances", "Deck set B", hash({ screen: "home", instanceUrl: instanceB.url }), ""],
      ["decks", "Kanji N5", hash(cardsRoute), ""],
      ["decks", "Verbs", hash({ screen: "cards", deckUrl: verbs.url }), ""],
      // A draft that cannot be read cannot be opened.
      ["drafts", "Solid", hash({ screen: "draft", draftUrl: summary("solid").url }), ""],
      [
        "drafts",
        "Untitled (capitals)",
        hash({ screen: "draft", draftUrl: summary("capitals").url }),
        "",
      ],
      ["cards", "water", hash({ screen: "card", deckUrl: kanji.url, cardUrl: water.url }), ""],
    ]);
  });

  it("are known by their group and where they go, or by the command's id", () => {
    const commands = buildCommands(sources, en);
    const idOf = (group: string, label: string) =>
      commands.find((command) => command.group === group && command.label === label)!.id;
    expect(idOf("commands", "Check again")).toBe("command:checkAgain");
    expect(idOf("tabs", "Cards")).toBe(`tabs:${hash(cardsRoute)}`);
    // The same place, another entry: the deck is not its Cards tab, nor an instance its Decks section.
    expect(idOf("decks", "Kanji N5")).toBe(`decks:${hash(cardsRoute)}`);
    expect(idOf("instances", "Deck set A")).not.toBe(idOf("sections", "Decks"));
  });

  it("number only the first nine tabs, and have no section of an instance on the instances", () => {
    const tabs = Array.from({ length: 10 }, (_, n) => ({
      key: "cards",
      route: { screen: "draft", draftUrl: `${DRAFT_URL}${n}` } as StudioRoute,
      current: false as const,
    }));
    const commands = buildCommands(
      { ...sources, instanceUrl: null, tabs, decks: [], drafts: [], cards: null, commands: [] },
      en,
    );
    expect(
      commands.filter((command) => command.group === "tabs").map((command) => command.keys),
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", undefined]);
    expect(entries(commands.filter((command) => command.group === "sections"))).toEqual([
      ["sections", "All instances", hash({ screen: "instances" }), "g i"],
    ]);
  });
});

describe("matching what was typed", () => {
  it("needs every letter, in its order", () => {
    expect(matchScore("kn", "kanji n5")).not.toBeNull();
    expect(matchScore("nk", "kanji")).toBeNull();
    expect(matchScore("x", "kanji")).toBeNull();
  });

  it("scores the start of a word, and letters side by side, above letters apart", () => {
    expect(matchScore("dc", "deck colors")!).toBeGreaterThan(matchScore("dc", "dice")!);
    expect(matchScore("dec", "decks")!).toBeGreaterThan(matchScore("dec", "dance etc")!);
    // Matched at a later word's start, though the letter came before.
    expect(matchScore("kc", "kick colors")!).toBeGreaterThan(matchScore("kc", "kick")!);
    expect(matchScore("ck", "click a k")!).toBeGreaterThan(matchScore("ck", "click")!);
    // Not when the rest would not match after it: "ab" in "xab ax" is the first a's.
    expect(matchScore("ab", "xab ax")).toBe(matchScore("ab", "xab xx"));
  });

  it("scores a shorter text a little higher", () => {
    expect(matchScore("deck", "deck")!).toBeGreaterThan(matchScore("deck", "decks")!);
  });
});

describe("ranking the entries", () => {
  const commands = buildCommands(sources, en);
  /** The ranked entries as their groups, each with its entries' names. */
  const ranked = (query: string, recent: readonly string[] = [], pinned: readonly string[] = []) =>
    rankCommands(commands, query, recent, pinned).map((section) => [
      section.group,
      section.commands.map((command) => command.label),
    ]);

  it("lists every entry but the cards when nothing is typed, the entries used last first", () => {
    const recent = [
      `decks:${hash({ screen: "cards", deckUrl: verbs.url })}`,
      "gone",
      "command:checkAgain",
    ];
    const shown = ranked(" ", recent);
    expect(shown[0]).toEqual(["recent", ["Verbs", "Check again"]]);
    expect(shown.map(([group]) => group)).toEqual([
      "recent",
      "tabs",
      "sections",
      "instances",
      "decks",
      "drafts",
    ]);
    expect(shown.find(([group]) => group === "decks")![1]).toEqual(["Kanji N5"]);
  });

  it("lists the decks and drafts pinned before those used last, each once, when nothing is typed", () => {
    const verbsId = itemCommandId({ kind: "deck", url: verbs.url });
    const pinned = [itemCommandId({ kind: "draft", url: DRAFT_URL }), verbsId, "gone"];
    const shown = ranked("", [verbsId, "command:checkAgain"], pinned);
    expect(shown.slice(0, 2)).toEqual([
      ["pinned", ["Solid", "Verbs"]],
      ["recent", ["Check again"]],
    ]);
    expect(shown.find(([group]) => group === "drafts")).toEqual([
      "drafts",
      ["Untitled (capitals)"],
    ]);
    expect(ranked("verbs", [], pinned)).toEqual([["decks", ["Verbs"]]]);
  });

  it("keeps the matches, the best first, each group where its best is, case and accents aside", () => {
    expect(ranked("VERB")).toEqual([["decks", ["Verbs"]]]);
    expect(ranked("wáter")).toEqual([["cards", ["water"]]]);
    expect(ranked("ch")[0]).toEqual(["commands", ["Check again"]]);
    // Letters apart match too, below those side by side at a word's start.
    expect(ranked("de")).toEqual([
      ["sections", ["Decks", "Import and export"]],
      ["instances", ["Deck set A", "Deck set B"]],
      ["tabs", ["Schedule"]],
    ]);
    expect(ranked("zzz")).toEqual([]);
  });

  it("shows MAX_SHOWN entries at most", () => {
    const many = Array.from(
      { length: MAX_SHOWN + 10 },
      (_, n): Command => ({ id: `${n}`, group: "decks", label: `Deck ${n}`, run }),
    );
    expect(rankCommands(many, "", [])[0]!.commands).toHaveLength(MAX_SHOWN);
    expect(rankCommands(many, "deck", [])[0]!.commands).toHaveLength(MAX_SHOWN);
  });

  it("stays fast for a few thousand entries, growing with them no faster than they do", () => {
    const words = ["kanji", "verbs", "water", "fire", "mountain", "river", "capital", "color"];
    const entriesOf = (count: number) =>
      Array.from(
        { length: count },
        (_, n): Command => ({
          id: `${n}`,
          group: "cards",
          label: `${words[n % words.length]} ${words[(n * 7) % words.length]} ${n}`,
          run,
        }),
      );
    /** The milliseconds that ranking takes for a few queries. */
    const timed = (commands: readonly Command[]) => {
      const start = performance.now();
      for (const query of ["k", "wa ri", "cap", "mtn 12", "zz"]) rankCommands(commands, query, []);
      return performance.now() - start;
    };
    // The fewest of a few runs each, taken in turns, so that a machine
    // busier for a while slows both sizes and not only the one timed then.
    const smallEntries = entriesOf(500);
    const largeEntries = entriesOf(4000);
    let small = Infinity;
    let large = Infinity;
    for (let round = 0; round < 8; round++) {
      small = Math.min(small, timed(smallEntries));
      large = Math.min(large, timed(largeEntries));
    }
    // A keystroke's worth: well within a frame or two, even on a slow machine running tests side by side.
    expect(large / 5).toBeLessThan(50);
    // Eight times the entries: not much more than eight times the time (the slack is the timer's).
    expect(large).toBeLessThan(small * 8 * 3 + 10);
  });
});
