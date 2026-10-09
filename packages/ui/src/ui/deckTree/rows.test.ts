import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckTree, TreeNode } from "@solid-memo/domain/deckTree";
import { flatten, slotKey } from "./rows";

const deck = (url: string): TreeNode => {
  const value: Deck = {
    id: url,
    url,
    title: { en: url },
    cardsDocumentUrl: `${url}-cards`,
    reviewsDocumentUrl: `${url}-reviews`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
    authors: [],
  };
  return { kind: "deck", deck: value };
};
const group = (url: string, children: TreeNode[]): TreeNode => ({ kind: "group", group: { url, title: { en: url } }, children });

/** A; G (B; H (C); E ()); D. */
const tree: DeckTree = {
  readOnly: false,
  children: [deck("A"), group("G", [deck("B"), group("H", [deck("C")]), group("E", [])]), deck("D")],
};

describe("flatten", () => {
  it("lists the rows in reading order, each knowing its depth, parent, groups and neighbour", () => {
    expect(flatten(tree, new Set())).toEqual([
      { key: "A", kind: "deck", depth: 0, parent: null, ancestors: [], before: null, collapsed: false, last: null },
      { key: "G", kind: "group", depth: 0, parent: null, ancestors: [], before: "A", collapsed: false, last: "E" },
      { key: "B", kind: "deck", depth: 1, parent: "G", ancestors: ["G"], before: null, collapsed: false, last: null },
      { key: "H", kind: "group", depth: 1, parent: "G", ancestors: ["G"], before: "B", collapsed: false, last: "C" },
      { key: "C", kind: "deck", depth: 2, parent: "H", ancestors: ["G", "H"], before: null, collapsed: false, last: null },
      { key: "E", kind: "group", depth: 1, parent: "G", ancestors: ["G"], before: "H", collapsed: false, last: null },
      // An open, empty group's slot, where a drag can put something.
      {
        key: slotKey("E"),
        kind: "slot",
        depth: 2,
        parent: "E",
        ancestors: ["G", "E"],
        before: null,
        collapsed: false,
        last: null,
      },
      { key: "D", kind: "deck", depth: 0, parent: null, ancestors: [], before: "G", collapsed: false, last: null },
    ]);
  });

  it("leaves out what a group folded shut holds, a slot too", () => {
    expect(flatten(tree, new Set(["H", "E"])).map((row) => [row.key, row.collapsed])).toEqual([
      ["A", false],
      ["G", false],
      ["B", false],
      ["H", true],
      ["E", true],
      ["D", false],
    ]);
    expect(flatten(tree, new Set(["G"])).map((row) => row.key)).toEqual(["A", "G", "D"]);
  });

  it("keys a slot apart from any URL", () => {
    expect(slotKey("https://pod.example/catalog.ttl#group-1")).toBe("slot https://pod.example/catalog.ttl#group-1");
  });
});
