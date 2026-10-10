import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckTree, TreeNode } from "@solid-memo/domain/deckTree";
import { hitTest, scrollStep, type DropRules, type Hit, type Layout } from "./dropZones";
import { flatten, flattenOutline, type OutlineNode, type VisibleRow } from "./rows";

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
const treeOf = (...children: TreeNode[]): DeckTree => ({ readOnly: false, children });

/**
 * What a drop of `source` does at `y`, each row 40px tall and 8px below
 * the one before (row i from 48i to 48i + 40), with the rows of `source`
 * and what it holds set apart as the hole it leaves.
 */
function hit(tree: DeckTree, source: string, y: number, collapsed: string[] = []): Hit {
  return hitRows(flatten(tree, new Set(collapsed)), source, y);
}

/** What a drop of `source` does at `y` among `shown`, measured as `hit` measures them, under `rules`. */
function hitRows(shown: VisibleRow[], source: string, y: number, rules?: DropRules): Hit {
  const rows = shown.map((row, index) => ({ ...row, top: index * 48, bottom: index * 48 + 40 }));
  const lifted = (row: (typeof rows)[number]) => row.key === source || row.ancestors.includes(source);
  const hole = rows.filter(lifted);
  const layout: Layout = {
    rows: rows.filter((row) => !lifted(row)),
    hole: { top: hole[0]!.top, bottom: hole.at(-1)!.bottom },
    ...(rules === undefined ? {} : { rules }),
  };
  return hitTest(layout, y, rows.find((row) => row.key === source)!);
}

type Label = { kind: "in" | "after"; group: string };
const gap = (parent: string | null, after: string | null, depth: number, y: number, label: Label | null = null) => ({
  kind: "gap",
  to: { parent, after },
  depth,
  y,
  label,
});
const inGroup = (group: string): Label => ({ kind: "in", group });
const afterGroup = (group: string): Label => ({ kind: "after", group });
const noop = { kind: "noop" };

/**
 * Rows: A 0-40; G 48-88; B 96-136; H 144-184; C 192-232; D 240-280;
 * S 288-328 (the deck dragged, last at the top level).
 */
const middle = treeOf(deck("A"), group("G", [deck("B"), group("H", [deck("C")])]), deck("D"), deck("S"));

/** Rows: S 0-40 (dragged); A 48-88; G 96-136; B 144-184; H 192-232; C 240-280, the last. */
const ending = treeOf(deck("S"), deck("A"), group("G", [deck("B"), group("H", [deck("C")])]));

describe("hitTest: the user's rules", () => {
  it.each<[string, DeckTree, string, number, string[], unknown]>([
    ["directly under a group's header: its first place", middle, "S", 90, [], gap("G", null, 1, 92, inGroup("G"))],
    ["between two decks: that place", middle, "S", 44, [], gap(null, "A", 0, 44)],
    ["between two decks in a group: that place there", middle, "S", 140, [], gap("G", "B", 1, 140, inGroup("G"))],
    ["at the top of the list: first", middle, "S", 2, [], gap(null, null, 0, -4)],
    ["above the list: first", middle, "S", -30, [], gap(null, null, 0, -4)],
    // Under C, D at the top level next: three levels close, a slice each.
    ["right under a group's last deck: last in that group", middle, "S", 224, [], gap("H", "C", 2, 236, inGroup("H"))],
    ["a little further: after that group, in the one around it", middle, "S", 234, [], gap("G", "H", 1, 236, afterGroup("H"))],
    ["further still: after the outer group too", middle, "S", 246, [], gap(null, "G", 0, 236, afterGroup("G"))],
    ["right under the list's last deck: last in its group", ending, "S", 275, [], gap("H", "C", 2, 284, inGroup("H"))],
    ["under the list, less than 20px: still last in its group", ending, "S", 299, [], gap("H", "C", 2, 284, inGroup("H"))],
    ["20px under the list: after its group", ending, "S", 300, [], gap("G", "H", 1, 284, afterGroup("H"))],
    ["40px under the list: after the group around that too", ending, "S", 320, [], gap(null, "G", 0, 284, afterGroup("G"))],
    ["far under the list: still the top level's last place", ending, "S", 900, [], gap(null, "G", 0, 284, afterGroup("G"))],
    // H folded shut: rows A; G; B; H 144-184; D 192-232; S.
    ["directly under a folded group's header: after it", middle, "S", 186, ["H"], gap("G", "H", 1, 188, afterGroup("H"))],
    ["lower under a folded group's header: after the group around it", middle, "S", 200, ["H"], gap(null, "G", 0, 188, afterGroup("G"))],
    // G folded shut: rows A; G 48-88; D 96-136; S.
    ["under a folded group at the top level: after it", middle, "S", 90, ["G"], gap(null, "G", 0, 92, afterGroup("G"))],
    ["over the list's first place, where the deck is: nothing", ending, "S", 50, [], noop],
    ["over the deck's own place: nothing", middle, "S", 300, [], noop],
    ["right under the deck before it, its own place: nothing", middle, "S", 284, [], noop],
  ])("%s", (_, tree, source, y, collapsed, expected) => {
    expect(hit(tree, source, y, collapsed)).toEqual(expected);
  });
});

describe("hitTest: a row's middle", () => {
  it("makes a new group with a deck, or till that is armed, the gap on the nearer side", () => {
    expect(hit(middle, "S", 15)).toEqual({ kind: "combine", target: "A", fallback: gap(null, null, 0, -4) });
    expect(hit(middle, "S", 25)).toEqual({ kind: "combine", target: "A", fallback: gap(null, "A", 0, 44) });
    // Below the middle of C, the deepest place; above the middle of B, the shallowest.
    expect(hit(middle, "S", 220)).toEqual({ kind: "combine", target: "C", fallback: gap("H", "C", 2, 236, inGroup("H")) });
    expect(hit(middle, "S", 110)).toEqual({ kind: "combine", target: "B", fallback: gap("G", null, 1, 92, inGroup("G")) });
  });

  it("puts a deck into a group by its header, at its end", () => {
    expect(hit(middle, "S", 68)).toEqual({ kind: "into", group: "G", to: { parent: "G", after: "H" } });
    expect(hit(middle, "S", 164, ["H"])).toEqual({ kind: "into", group: "H", to: { parent: "H", after: "C" } });
  });

  it("makes a new group with a group from a group's header, or with a deck", () => {
    const tree = treeOf(group("L", [deck("X")]), group("K", [deck("Y")]), deck("Z"));
    // Rows: L 0-40; X 48-88 (dragged with L); K 96-136; Y 144-184; Z 192-232.
    // Above K's middle, L's own place; below it, K's first.
    expect(hit(tree, "L", 110)).toEqual({ kind: "combine", target: "K", fallback: noop });
    expect(hit(tree, "L", 120)).toEqual({ kind: "combine", target: "K", fallback: gap("K", null, 1, 140, inGroup("K")) });
    expect(hit(tree, "L", 210)).toEqual({ kind: "combine", target: "Z", fallback: gap(null, "K", 0, 188, afterGroup("K")) });
    expect(hit(tree, "L", 20)).toEqual(noop);
  });

  it("splits the header of the deck's own group into the gaps above and below", () => {
    // B dragged: rows A; G 48-88; H 144-184 …
    expect(hit(middle, "B", 60)).toEqual(gap(null, "A", 0, 44));
    // Its first place in G, where it is.
    expect(hit(middle, "B", 75)).toEqual(noop);
    expect(hit(middle, "C", 160)).toEqual(gap("G", "B", 1, 140, inGroup("G")));
    expect(hit(middle, "C", 175)).toEqual(noop);
  });
});

describe("hitTest: an empty group", () => {
  /** Rows: A 0-40; K 48-88 (open, empty); its slot 96-136; S 144-184. */
  const tree = treeOf(deck("A"), group("K", []), deck("S"));

  it("takes a drop into its first place anywhere on its slot but its bottom", () => {
    for (const y of [90, 100, 116, 125]) expect(hit(tree, "S", y)).toEqual(gap("K", null, 1, 92, inGroup("K")));
  });

  it("goes after the group from the slot's bottom, by the slices under it", () => {
    expect(hit(tree, "S", 128)).toEqual(gap("K", null, 1, 140, inGroup("K")));
    // Under it the deck's own place: after K at the top level.
    expect(hit(tree, "S", 145)).toEqual(noop);
  });

  it("at the list's end, goes out of the group 20px down", () => {
    const last = treeOf(deck("S"), deck("A"), group("K", []));
    // Rows: S; A 48-88; K 96-136; slot 144-184.
    expect(hit(last, "S", 190)).toEqual(gap("K", null, 1, 188, inGroup("K")));
    expect(hit(last, "S", 210)).toEqual(gap(null, "K", 0, 188, afterGroup("K")));
  });
});

describe("hitTest: what cannot move anywhere", () => {
  it("gives nothing for the list's only deck or group", () => {
    expect(hit(treeOf(deck("S")), "S", 100)).toEqual(noop);
    expect(hit(treeOf(group("S", [deck("A")])), "S", 100)).toEqual(noop);
  });

  it("leaves out what a dragged group holds, its rows the group's own place", () => {
    // H and C dragged: rows A; G; B 96-136; (hole 144-232); D 240-280; S.
    expect(hit(middle, "H", 200)).toEqual(noop);
    expect(hit(middle, "H", 245)).toEqual(gap(null, "G", 0, 188, afterGroup("G")));
  });
});

describe("hitTest: a course's outline", () => {
  /** Chapters at the top, steps in a chapter, and no new groups. */
  const OUTLINE: DropRules = { combine: false, depths: (source) => (source.kind === "group" ? { min: 0, max: 0 } : { min: 1, max: 1 }) };
  const step = (key: string): OutlineNode => ({ key, title: { en: key } });
  const chapter = (key: string, steps: OutlineNode[]): OutlineNode => ({ key, title: { en: key }, children: steps });
  /** Rows: A 0-40; a1 48-88; a2 96-136; B 144-184; b1 192-232; C 240-280; its slot 288-328. */
  const rows = flattenOutline([chapter("A", [step("a1"), step("a2")]), chapter("B", [step("b1")]), chapter("C", [])], new Set());
  const at = (source: string, y: number) => hitRows(rows, source, y, OUTLINE);

  it("keeps a step in a chapter: never at the top", () => {
    // Under a2, before B's header: the end of A, however far down.
    expect(at("a1", 128)).toEqual(gap("A", "a2", 1, 140, inGroup("A")));
    expect(at("a1", 140)).toEqual(gap("A", "a2", 1, 140, inGroup("A")));
    // Above the first chapter there is no place for it.
    expect(at("a2", 2)).toEqual(noop);
    // Past the list's end: still in the last chapter, the empty C.
    expect(at("a1", 400)).toEqual(gap("C", null, 1, 332, inGroup("C")));
  });

  it("puts a step into a chapter by its header, and makes no group of two steps", () => {
    expect(at("a1", 164)).toEqual({ kind: "into", group: "B", to: { parent: "B", after: "b1" } });
    expect(at("a2", 212)).toEqual(gap("B", "b1", 1, 236, inGroup("B")));
  });

  it("keeps a chapter at the top: never among steps, nor in another chapter", () => {
    // A dragged with its steps: B 144-184 … C 240-280. Over C's header, the gap above it: after B.
    expect(at("A", 255)).toEqual(gap(null, "B", 0, 236, afterGroup("B")));
    // Between two steps there is no place for B.
    expect(at("B", 68)).toEqual(noop);
    // On the header of an empty chapter: under it is C's first place, which is no chapter's.
    expect(at("B", 262)).toEqual(noop);
  });

  it("goes into a group only at a depth the rules allow", () => {
    const flat: DropRules = { combine: true, depths: () => ({ min: 0, max: 0 }) };
    expect(hitRows(rows, "a1", 164, flat)).toEqual({ kind: "combine", target: "B", fallback: noop });
  });
});

describe("scrollStep", () => {
  it.each([
    [400, 0],
    [56, 0],
    [744, 0],
    [28, -4.5],
    [0, -18],
    [-20, -18],
    [772, 4.5],
    [800, 18],
    [900, 18],
  ])("at %ipx in an 800px viewport, scrolls %fpx", (clientY, step) => {
    expect(scrollStep(clientY, 800)).toBe(step);
  });
});
