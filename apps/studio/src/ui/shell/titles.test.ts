// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createI18n } from "@solid-memo/ui/i18n";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { courseDraft, DRAFT_URL, instanceA, makeCard, makeDeck } from "../../test/fixtures";
import { studioRouteToHash, type StudioRoute } from "../router";
import { crumbsOf, draftNameOf, type CrumbSubjects } from "./titles";

const en = createI18n("en");
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const water = makeCard(kanji, "water");
const draft = courseDraft();
const subjects: CrumbSubjects = { deck: kanji, card: water, draft };
const instanceUrl = instanceA.url;
const deckUrl = kanji.url;
const draftUrl = DRAFT_URL;

/** A trail as its labels, each with the hash it links to. */
const trail = (route: StudioRoute, given: CrumbSubjects = subjects) =>
  crumbsOf(route, given, en).map((crumb) => [crumb.label, studioRouteToHash(crumb.route)]);

const instances = ["Instances", studioRouteToHash({ screen: "instances" })];
const decks = ["Decks", studioRouteToHash({ screen: "home", instanceUrl })];
const cards = ["Cards of Kanji N5", studioRouteToHash({ screen: "cards", deckUrl })];
const toDraft = [
  instances,
  decks,
  ["Drafts", studioRouteToHash({ screen: "drafts", instanceUrl })],
  ["Solid", studioRouteToHash({ screen: "draft", draftUrl })],
];
const here = (label: string, route: StudioRoute) => [label, studioRouteToHash(route)];

describe("crumbsOf", () => {
  const cases: [string, StudioRoute, string[][]][] = [
    ["the instances", { screen: "instances" }, [instances]],
    [
      "Home, at its view",
      { screen: "home", instanceUrl, view: { filter: "kanji" } },
      [instances, here("Decks", { screen: "home", instanceUrl, view: { filter: "kanji" } })],
    ],
    [
      "the groups",
      { screen: "groups", instanceUrl },
      [instances, decks, here("Groups", { screen: "groups", instanceUrl })],
    ],
    [
      "the instance",
      { screen: "instance", instanceUrl },
      [instances, decks, here("Name and catalog", { screen: "instance", instanceUrl })],
    ],
    [
      "the library copies",
      { screen: "library", instanceUrl },
      [instances, decks, here("Library copies", { screen: "library", instanceUrl })],
    ],
    [
      "import and export",
      { screen: "transfer", instanceUrl },
      [instances, decks, here("Import and export", { screen: "transfer", instanceUrl })],
    ],
    [
      "the drafts",
      { screen: "drafts", instanceUrl },
      [instances, decks, here("Drafts", { screen: "drafts", instanceUrl })],
    ],
    [
      "the releases",
      { screen: "releases", instanceUrl },
      [instances, decks, here("Releases", { screen: "releases", instanceUrl })],
    ],
    [
      "the graph",
      { screen: "graph", instanceUrl, node: instanceUrl },
      [instances, decks, here("Graph", { screen: "graph", instanceUrl, node: instanceUrl })],
    ],
    [
      "the instance's health",
      { screen: "health", instanceUrl },
      [instances, decks, here("Health", { screen: "health", instanceUrl })],
    ],
    [
      "a deck's health",
      { screen: "health", instanceUrl, deckUrl },
      [
        instances,
        decks,
        here("Health", { screen: "health", instanceUrl }),
        here("Kanji N5", { screen: "health", instanceUrl, deckUrl }),
      ],
    ],
    [
      "a deck's about screen",
      { screen: "about", deckUrl },
      [instances, decks, here("About Kanji N5", { screen: "about", deckUrl })],
    ],
    ["a deck's cards", { screen: "cards", deckUrl }, [instances, decks, cards]],
    [
      "a deck's schedule",
      { screen: "schedule", deckUrl },
      [instances, decks, cards, here("Schedule", { screen: "schedule", deckUrl })],
    ],
    [
      "a card, at a tab",
      { screen: "card", deckUrl, cardUrl: water.url, tab: "history" },
      [
        instances,
        decks,
        cards,
        here("water", { screen: "card", deckUrl, cardUrl: water.url, tab: "history" }),
      ],
    ],
    ["a draft", { screen: "draft", draftUrl }, toDraft],
    [
      "a draft's cards",
      { screen: "draftCards", draftUrl },
      [...toDraft, here("Cards", { screen: "draftCards", draftUrl })],
    ],
    [
      "a draft's check",
      { screen: "check", draftUrl },
      [...toDraft, here("Release check", { screen: "check", draftUrl })],
    ],
    [
      "a draft's preview",
      { screen: "preview", draftUrl },
      [...toDraft, here("Listing preview", { screen: "preview", draftUrl })],
    ],
    [
      "a draft's trial",
      { screen: "trial", draftUrl },
      [...toDraft, here("Trial", { screen: "trial", draftUrl })],
    ],
    [
      "a draft's changes",
      { screen: "diff", draftUrl },
      [...toDraft, here("Changes", { screen: "diff", draftUrl })],
    ],
    [
      "a draft's release",
      { screen: "release", draftUrl },
      [...toDraft, here("Release", { screen: "release", draftUrl })],
    ],
    [
      "a chapter",
      { screen: "chapter", draftUrl, chapter: "ch-pods" },
      [...toDraft, here("Pods", { screen: "chapter", draftUrl, chapter: "ch-pods" })],
    ],
    [
      "a step, under its chapter",
      { screen: "step", draftUrl, step: "ch-pods-2" },
      [
        ...toDraft,
        here("Pods", { screen: "chapter", draftUrl, chapter: "ch-pods" }),
        here("Step 2", { screen: "step", draftUrl, step: "ch-pods-2" }),
      ],
    ],
    [
      "a question, under the draft's cards",
      { screen: "question", draftUrl, card: "q-pods-1a" },
      [
        ...toDraft,
        here("Cards", { screen: "draftCards", draftUrl }),
        here("What holds data?", { screen: "question", draftUrl, card: "q-pods-1a" }),
      ],
    ],
  ];

  it.each(cases)("leads to %s", (_name, route, expected) => {
    expect(trail(route)).toEqual(expected);
  });

  it("names a draft of no title, a chapter of none by its id, and a step of no chapter by its id", () => {
    const loose: ReleaseDraft = {
      ...draft,
      root: { ...draft.root, title: undefined },
      chapters: draft.chapters.map((node) => ({
        ...node,
        data: { ...node.data, title: undefined },
      })),
      steps: [...draft.steps, { id: "loose", data: { checkedBy: [] } }],
    };
    const given = { ...subjects, draft: loose };
    expect(
      trail({ screen: "chapter", draftUrl, chapter: "ch-pods" }, given)
        .slice(-2)
        .map(([label]) => label),
    ).toEqual(["Untitled draft", "ch-pods"]);
    expect(
      trail({ screen: "step", draftUrl, step: "loose" }, given)
        .slice(-2)
        .map(([label]) => label),
    ).toEqual(["Untitled draft", "loose"]);
  });
});

describe("draftNameOf", () => {
  it("names a draft by its title, else by its name", () => {
    expect(draftNameOf({ title: { en: "Solid" }, name: "solid" }, en)).toBe("Solid");
    expect(draftNameOf({ title: {}, name: "solid" }, en)).toBe("Untitled (solid)");
  });
});
