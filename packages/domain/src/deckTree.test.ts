import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import type { Deck } from "./deck";
import {
  applyDeckTreeEdit,
  buildTree,
  combine,
  decksOf,
  deleteGroup,
  gather,
  graft,
  isDescendant,
  locate,
  moveNode,
  nodeId,
  renameGroup,
  treeChanges,
  type DeckTree,
  type GraftNode,
  type StoredGroup,
  type StoredLayout,
  type TreeNode,
} from "./deckTree";

/** A tree as nested ids: a deck by its URL, a group as [its URL, ...its children]. */
type Shape = string | Shape[];

function deck(url: string): Deck {
  return {
    id: url,
    url,
    title: { en: url },
    cardsDocumentUrl: `${url}-cards.ttl`,
    reviewsDocumentUrl: `${url}-reviews.ttl`,
    createdAt: "2026-10-06T10:00:00.000Z",
    formatVersion: 6,
    direction: "front-to-back",
    authors: [],
  };
}

function title(url: string) {
  return { en: `Group ${url}` };
}

function nodeOf(shape: Shape): TreeNode {
  if (typeof shape === "string") return { kind: "deck", deck: deck(shape) };
  const [url, ...children] = shape as [string, ...Shape[]];
  return { kind: "group", group: { url, title: title(url) }, children: children.map(nodeOf) };
}

function tree(...shapes: Shape[]): DeckTree {
  return { children: shapes.map(nodeOf), readOnly: false };
}

function shapeOf(node: TreeNode): Shape {
  return node.kind === "deck" ? node.deck.url : [node.group.url, ...node.children.map(shapeOf)];
}

function shape(of: DeckTree): Shape[] {
  return of.children.map(shapeOf);
}

function group(url: string, members: { decks?: string[]; groups?: string[]; position?: number } = {}): StoredGroup {
  return {
    group: { url, title: title(url) },
    decks: members.decks ?? [],
    groups: members.groups ?? [],
    ...(members.position === undefined ? {} : { position: members.position }),
  };
}

function layout(
  decks: string[],
  options: { positions?: Record<string, number>; groups?: StoredGroup[]; rootGroups?: string[]; readOnly?: boolean } = {},
): StoredLayout {
  return {
    decks: decks.map(deck),
    deckPositions: new Map(Object.entries(options.positions ?? {})),
    groups: options.groups ?? [],
    rootGroups: options.rootGroups ?? [],
    readOnly: options.readOnly ?? false,
  };
}

function changedError(run: () => unknown) {
  expect(run).toThrow(AppError);
  try {
    run();
  } catch (error) {
    expect((error as AppError).code).toBe("deckTreeChanged");
  }
}

describe("buildTree", () => {
  it("keeps today's order when nothing is grouped or positioned: document order", () => {
    expect(shape(buildTree(layout(["c", "a", "b"])))).toEqual(["c", "a", "b"]);
  });

  it("orders by position, those without one or with a negative one last in document order, decks before groups on a tie", () => {
    const stored = layout(["a", "b", "c", "d"], {
      positions: { c: 0, d: -1, b: 2 },
      groups: [group("g1", { position: 1 }), group("g2"), group("g3", { position: 2 })],
      rootGroups: ["g1", "g2", "g3"],
    });
    expect(shape(buildTree(stored))).toEqual(["c", ["g1"], "b", ["g3"], "a", "d", ["g2"]]);
  });

  it("nests decks and groups as their groups list them, a group listed by none at the top level", () => {
    const stored = layout(["a", "b", "c"], {
      groups: [group("g1", { decks: ["b"], groups: ["g2"] }), group("g2", { decks: ["c"] }), group("g3")],
      rootGroups: ["g1"],
    });
    expect(shape(buildTree(stored))).toEqual(["a", ["g1", "b", ["g2", "c"]], ["g3"]]);
  });

  it("leaves out links to what is not there, of the wrong kind, and a group listing itself", () => {
    const stored = layout(["a"], {
      groups: [group("g1", { decks: ["gone", "g2"], groups: ["a", "g1", "lost"] }), group("g2")],
      rootGroups: ["g1", "lost"],
    });
    expect(shape(buildTree(stored))).toEqual(["a", ["g1"], ["g2"]]);
  });

  it("puts a node listed by several groups in the one with the lowest URL, or at the top level when it lists it", () => {
    const stored = layout(["a"], {
      groups: [group("g2", { decks: ["a"], groups: ["g3"] }), group("g1", { decks: ["a"], groups: ["g3"] }), group("g3")],
      rootGroups: ["g2", "g1", "g3"],
    });
    expect(shape(buildTree(stored))).toEqual([["g2"], ["g1", "a"], ["g3"]]);
  });

  it("breaks a cycle of groups by lifting its lowest-URL group to the top level", () => {
    const two = layout([], { groups: [group("g2", { groups: ["g1"] }), group("g1", { groups: ["g2"] })] });
    expect(shape(buildTree(two))).toEqual([["g1", ["g2"]]]);
    const three = layout([], {
      groups: [
        group("g3", { groups: ["g1"] }),
        group("g2", { groups: ["g3"] }),
        group("g1", { groups: ["g2"] }),
        group("g4", { groups: ["g9"] }),
        group("g9", { groups: ["g4"] }),
      ],
    });
    expect(shape(buildTree(three))).toEqual([["g1", ["g2", ["g3"]]], ["g4", ["g9"]]]);
  });

  it("breaks a cycle that a group hangs off", () => {
    const stored = layout([], {
      groups: [group("g0"), group("g1", { groups: ["g2"] }), group("g2", { groups: ["g1", "a1"] }), group("a1")],
    });
    expect(shape(buildTree(stored))).toEqual([["g0"], ["g1", ["g2", ["a1"]]]]);
  });

  it("keeps a tree in a newer format read-only", () => {
    expect(buildTree(layout(["a"], { readOnly: true })).readOnly).toBe(true);
    expect(buildTree(layout(["a"])).readOnly).toBe(false);
  });
});

describe("tree lookups", () => {
  const sample = tree("a", ["g1", "b", ["g2", "c"]], "d");

  it("name a node by its URL", () => {
    expect(nodeId(sample.children[0]!)).toBe("a");
    expect(nodeId(sample.children[1]!)).toBe("g1");
  });

  it("locate a node with its parent and index", () => {
    expect(locate(sample, "a")).toMatchObject({ parent: null, index: 0 });
    expect(locate(sample, "c")).toMatchObject({ parent: "g2", index: 0 });
    expect(locate(sample, "g2")).toMatchObject({ parent: "g1", index: 1 });
    expect(locate(sample, "gone")).toBeUndefined();
  });

  it("tell whether a node is inside a group, at any depth", () => {
    expect(isDescendant(sample, "g1", "c")).toBe(true);
    expect(isDescendant(sample, "g1", "g2")).toBe(true);
    expect(isDescendant(sample, "g1", "g1")).toBe(false);
    expect(isDescendant(sample, "g2", "b")).toBe(false);
    expect(isDescendant(sample, "a", "b")).toBe(false);
    expect(isDescendant(sample, "gone", "b")).toBe(false);
  });

  it("list the decks under nodes, depth first", () => {
    expect(decksOf(sample.children).map((d) => d.url)).toEqual(["a", "b", "c", "d"]);
    expect(decksOf([sample.children[1]!]).map((d) => d.url)).toEqual(["b", "c"]);
  });
});

describe("moveNode", () => {
  const flat = tree("a", "b", "c");

  it("moves down and up within a parent", () => {
    expect(shape(moveNode(flat, "a", { parent: null, after: "b" }))).toEqual(["b", "a", "c"]);
    expect(shape(moveNode(flat, "a", { parent: null, after: "c" }))).toEqual(["b", "c", "a"]);
    expect(shape(moveNode(flat, "c", { parent: null, after: null }))).toEqual(["c", "a", "b"]);
    expect(shape(moveNode(flat, "c", { parent: null, after: "a" }))).toEqual(["a", "c", "b"]);
  });

  it("moves across parents, a group with everything in it", () => {
    const nested = tree("a", ["g1", "b"], ["g2", "c", ["g3", "d"]]);
    expect(shape(moveNode(nested, "a", { parent: "g1", after: null }))).toEqual([["g1", "a", "b"], ["g2", "c", ["g3", "d"]]]);
    expect(shape(moveNode(nested, "b", { parent: null, after: "g1" }))).toEqual(["a", ["g1"], "b", ["g2", "c", ["g3", "d"]]]);
    expect(shape(moveNode(nested, "g3", { parent: "g1", after: "b" }))).toEqual(["a", ["g1", "b", ["g3", "d"]], ["g2", "c"]]);
  });

  it("puts a node at the end of its parent when the sibling it was to follow has gone", () => {
    expect(shape(moveNode(tree("a", ["g1", "b"]), "a", { parent: "g1", after: "gone" }))).toEqual([["g1", "b", "a"]]);
  });

  it("changes nothing when the node is already there", () => {
    expect(moveNode(flat, "b", { parent: null, after: "a" })).toBe(flat);
    expect(moveNode(flat, "a", { parent: null, after: null })).toBe(flat);
    expect(moveNode(flat, "b", { parent: null, after: "b" })).toBe(flat);
  });

  it("refuses a node or parent that has gone, a deck as a parent, and a place inside the node itself", () => {
    const nested = tree("a", ["g1", ["g2"]]);
    changedError(() => moveNode(nested, "gone", { parent: null, after: null }));
    changedError(() => moveNode(nested, "a", { parent: "gone", after: null }));
    changedError(() => moveNode(nested, "g1", { parent: "a", after: null }));
    changedError(() => moveNode(nested, "g1", { parent: "g1", after: null }));
    changedError(() => moveNode(nested, "g1", { parent: "g2", after: null }));
  });
});

describe("combine", () => {
  const made = (url: string) => ({ url, title: { en: "New group" } });

  it("makes a group at the target's place, holding the target and then the dragged node", () => {
    expect(shape(combine(tree("a", "b", "c"), "c", "a", made("n")))).toEqual([["n", "a", "c"], "b"]);
    expect(shape(combine(tree("a", "b", "c"), "a", "c", made("n")))).toEqual(["b", ["n", "c", "a"]]);
  });

  it("combines groups with groups and decks", () => {
    const sample = tree("a", ["g1", "b"], ["g2", "c"]);
    expect(shape(combine(sample, "g2", "g1", made("n")))).toEqual(["a", ["n", ["g1", "b"], ["g2", "c"]]]);
    expect(shape(combine(sample, "a", "g2", made("n")))).toEqual([["g1", "b"], ["n", ["g2", "c"], "a"]]);
    expect(shape(combine(sample, "g1", "a", made("n")))).toEqual([["n", "a", ["g1", "b"]], ["g2", "c"]]);
  });

  it("takes the dragged node from inside another group", () => {
    expect(shape(combine(tree("a", ["g1", "b", "c"]), "b", "a", made("n")))).toEqual([["n", "a", "b"], ["g1", "c"]]);
    expect(shape(combine(tree("a", ["g1", "b", "c"]), "a", "c", made("n")))).toEqual([["g1", "b", ["n", "c", "a"]]]);
  });

  it("changes nothing when done again", () => {
    const once = combine(tree("a", "b"), "b", "a", made("n"));
    expect(combine(once, "b", "a", made("n"))).toBe(once);
  });

  it("refuses a group URL in use for anything else, a node that has gone, and a group with what is inside it or around it", () => {
    const sample = tree("a", "b", ["g1", "c", ["g2", "d"]]);
    changedError(() => combine(sample, "b", "a", made("g1")));
    changedError(() => combine(sample, "b", "a", made("c")));
    changedError(() => combine(sample, "gone", "a", made("n")));
    changedError(() => combine(sample, "a", "gone", made("n")));
    changedError(() => combine(sample, "g1", "d", made("n")));
    changedError(() => combine(sample, "d", "g1", made("n")));
    expect(() => combine(sample, "a", "a", made("n"))).toThrow("A node cannot be combined with itself");
  });
});

describe("deleteGroup", () => {
  it("puts the group's members, in order, in its place, up one level only", () => {
    expect(shape(deleteGroup(tree("a", ["g1", "b", "c"], "d"), "g1"))).toEqual(["a", "b", "c", "d"]);
    expect(shape(deleteGroup(tree(["g1", "a", ["g2", "b", ["g3", "c"]], "d"]), "g2"))).toEqual([["g1", "a", "b", ["g3", "c"], "d"]]);
    expect(shape(deleteGroup(tree("a", ["g1"]), "g1"))).toEqual(["a"]);
  });

  it("changes nothing when the group has gone, or is a deck", () => {
    const sample = tree("a");
    expect(deleteGroup(sample, "gone")).toBe(sample);
    expect(deleteGroup(sample, "a")).toBe(sample);
  });
});

describe("gather", () => {
  const sample = tree("a", "b", ["g1", "c", ["g2"]], "d");

  it("puts the nodes at the end of the parent, in the order given", () => {
    expect(shape(gather(sample, ["d", "a"], "g1"))).toEqual(["b", ["g1", "c", ["g2"], "d", "a"]]);
    expect(shape(gather(sample, ["c", "a"], "g2"))).toEqual(["b", ["g1", ["g2", "c", "a"]], "d"]);
    expect(shape(gather(sample, ["c"], null))).toEqual(["a", "b", ["g1", ["g2"]], "d", "c"]);
  });

  it("leaves a node already in the parent where it is, so that doing it again changes nothing", () => {
    const once = gather(sample, ["a", "c"], "g1");
    expect(shape(once)).toEqual(["b", ["g1", "c", ["g2"], "a"], "d"]);
    expect(gather(once, ["a", "c"], "g1")).toBe(once);
    expect(gather(sample, [], "g1")).toBe(sample);
  });

  it("refuses a parent or node that has gone, and a group put inside itself", () => {
    changedError(() => gather(sample, ["a"], "gone"));
    changedError(() => gather(sample, ["a"], "a"));
    changedError(() => gather(sample, ["a", "gone"], "g1"));
    changedError(() => gather(sample, ["g1"], "g2"));
  });
});

describe("renameGroup", () => {
  const sample = tree(["g1", ["g2", "a"]]);

  it("renames the group, keeping its members", () => {
    const renamed = renameGroup(sample, "g2", { sv: "Språk" });
    expect(shape(renamed)).toEqual(shape(sample));
    expect(locate(renamed, "g2")!.node).toMatchObject({ group: { url: "g2", title: { sv: "Språk" } } });
  });

  it("changes nothing when the name is the same", () => {
    expect(renameGroup(sample, "g2", title("g2"))).toBe(sample);
  });

  it("refuses a group that has gone", () => {
    changedError(() => renameGroup(sample, "gone", { en: "x" }));
    changedError(() => renameGroup(sample, "a", { en: "x" }));
  });
});

describe("graft", () => {
  const made = (url: string, ...children: GraftNode[]): GraftNode => ({
    kind: "group",
    group: { url, title: { en: `Group ${url}` } },
    children,
  });
  const deckNode = (url: string): GraftNode => ({ kind: "deck", url });

  it("places new groups holding decks of the tree, and decks, at the end of the top level, in order", () => {
    const grafted = graft(tree("a", "x", "y", "z"), [made("n1", deckNode("y"), made("n2", deckNode("x"))), deckNode("z"), made("n3")]);
    expect(shape(grafted)).toEqual(["a", ["n1", "y", ["n2", "x"]], "z", ["n3"]]);
    expect(locate(grafted, "n1")!.node).toMatchObject({ group: { title: { en: "Group n1" } } });
  });

  it("takes a deck from inside a group, and leaves out a deck the tree no longer has, or a group named as a deck", () => {
    expect(shape(graft(tree(["g1", "a", "b"]), [made("n", deckNode("b"), deckNode("gone"), deckNode("g1"))]))).toEqual([
      ["g1", "a"],
      ["n", "b"],
    ]);
  });

  it("changes nothing when done again", () => {
    const nodes = [made("n", deckNode("a"))];
    const once = graft(tree("a", "b"), nodes);
    expect(graft(once, nodes)).toBe(once);
    expect(graft(once, [made("other", made("n"))])).toBe(once);
  });
});

describe("applyDeckTreeEdit", () => {
  const sample = tree("a", ["g1", "b"]);

  it("applies each kind of edit", () => {
    expect(shape(applyDeckTreeEdit(sample, { kind: "move", node: "a", to: { parent: "g1", after: "b" } }))).toEqual([
      ["g1", "b", "a"],
    ]);
    const group = { url: "n", title: { en: "New group" } };
    expect(shape(applyDeckTreeEdit(sample, { kind: "combine", dragged: "g1", target: "a", group }))).toEqual([
      ["n", "a", ["g1", "b"]],
    ]);
    expect(locate(applyDeckTreeEdit(sample, { kind: "rename", group: "g1", title: { en: "x" } }), "g1")!.node).toMatchObject({
      group: { title: { en: "x" } },
    });
    expect(shape(applyDeckTreeEdit(sample, { kind: "removeGroup", group: "g1" }))).toEqual(["a", "b"]);
    expect(shape(applyDeckTreeEdit(sample, { kind: "gather", nodes: ["a"], parent: "g1" }))).toEqual([["g1", "b", "a"]]);
    expect(
      shape(applyDeckTreeEdit(sample, { kind: "graft", nodes: [{ kind: "group", group, children: [{ kind: "deck", url: "a" }] }] })),
    ).toEqual([["g1", "b"], ["n", "a"]]);
  });

  it("refuses to edit a tree in a newer format", () => {
    const edit = { kind: "removeGroup", group: "g1" } as const;
    expect(() => applyDeckTreeEdit({ ...sample, readOnly: true }, edit)).toThrow(new AppError("deckTreeTooNew").message);
  });
});

describe("treeChanges", () => {
  it("is empty for the tree the layout states", () => {
    const stored = layout(["a", "b"], { groups: [group("g1", { decks: ["b"], position: 1 })], rootGroups: ["g1"], positions: { a: 0 } });
    const changes = treeChanges(stored, buildTree(stored));
    expect(changes).toEqual({
      groupsAdded: [],
      groupsRemoved: [],
      groupsRetitled: [],
      members: new Map(),
      positions: new Map(),
    });
  });

  it("numbers every member of a level the first time it is arranged", () => {
    const stored = layout(["a", "b", "c"]);
    const after = moveNode(buildTree(stored), "c", { parent: null, after: null });
    const changes = treeChanges(stored, after);
    expect(changes.positions).toEqual(new Map([["c", 0], ["a", 1], ["b", 2]]));
  });

  it("writes only the positions that change when a level is arranged again", () => {
    const stored = layout(["a", "b", "c"], { positions: { a: 0, b: 1, c: 2 } });
    const after = moveNode(buildTree(stored), "c", { parent: null, after: "a" });
    expect(treeChanges(stored, after)).toEqual({
      groupsAdded: [],
      groupsRemoved: [],
      groupsRetitled: [],
      members: new Map(),
      positions: new Map([["c", 1], ["b", 2]]),
    });
  });

  it("adds a combined group with its members and positions, and lists it at the top level", () => {
    const stored = layout(["a", "b", "c"], { positions: { a: 0, b: 1, c: 2 } });
    const made = { url: "n", title: { en: "New group" } };
    const after = combine(buildTree(stored), "c", "a", made);
    expect(treeChanges(stored, after)).toEqual({
      groupsAdded: [made],
      groupsRemoved: [],
      groupsRetitled: [],
      members: new Map([["n", { decks: ["a", "c"], groups: [] }]]),
      rootGroups: ["n"],
      positions: new Map([["n", 0], ["a", 0], ["c", 1]]),
    });
  });

  it("removes a group, its members in its place", () => {
    const stored = layout(["a", "b"], {
      positions: { a: 0, b: 0 },
      groups: [group("g1", { decks: ["b"], groups: ["g2"], position: 1 }), group("g2", { position: 1 })],
      rootGroups: ["g1"],
    });
    const changes = treeChanges(stored, deleteGroup(buildTree(stored), "g1"));
    expect(changes).toEqual({
      groupsAdded: [],
      groupsRemoved: ["g1"],
      groupsRetitled: [],
      members: new Map(),
      rootGroups: ["g2"],
      positions: new Map([["b", 1], ["g2", 2]]),
    });
  });

  it("renames a group, and only that", () => {
    const stored = layout(["a"], { groups: [group("g1", { decks: ["a"] })], rootGroups: ["g1"] });
    const changes = treeChanges(stored, renameGroup(buildTree(stored), "g1", { en: "Words" }));
    expect(changes.groupsRetitled).toEqual([{ url: "g1", title: { en: "Words" } }]);
    expect(changes.members.size + changes.positions.size).toBe(0);
  });

  it("rewrites the member lists of groups whose members moved, and writes a moved node's position even when it is the same", () => {
    const stored = layout(["a", "b"], {
      positions: { a: 0, b: 0 },
      groups: [group("g1", { decks: ["a"], position: 0 }), group("g2", { decks: ["b"], position: 1 })],
      rootGroups: ["g1", "g2"],
    });
    const after = moveNode(buildTree(stored), "a", { parent: "g2", after: null });
    expect(treeChanges(stored, after)).toEqual({
      groupsAdded: [],
      groupsRemoved: [],
      groupsRetitled: [],
      members: new Map([
        ["g1", { decks: [], groups: [] }],
        ["g2", { decks: ["a", "b"], groups: [] }],
      ]),
      positions: new Map([["a", 0], ["b", 1]]),
    });
  });

  it("writes a node listed twice in its one place, but leaves a link to what has gone until its list is written", () => {
    const stored = layout(["a", "b"], {
      positions: { a: 0, b: 1 },
      groups: [group("g1", { decks: ["a", "gone"], position: 0 }), group("g2", { decks: ["a", "b"], groups: ["lost"], position: 1 })],
      rootGroups: ["g1", "g2", "lost"],
    });
    const changes = treeChanges(stored, buildTree(stored));
    expect(changes.members).toEqual(new Map([["g2", { decks: ["b"], groups: [] }]]));
  });

  it("sets a pod that is not one valid tree straight even for an edit that changed nothing, which the caller must not write", () => {
    const stored = layout(["a", "b"], {
      positions: { a: 0, b: 1 },
      groups: [group("n", { decks: ["a", "b"], position: 0 }), group("h", { decks: ["a"], position: 1 })],
      rootGroups: ["n"],
    });
    const read = buildTree(stored);
    const after = applyDeckTreeEdit(read, { kind: "rename", group: "n", title: title("n") });
    expect(after).toBe(read);
  });

  it("names at the top level only the groups the layout has, leaving the links to others to the writer", () => {
    const stored = layout(["a"], { positions: { a: 0 }, groups: [group("g1", { position: 1 })], rootGroups: ["g1", "unreadable"] });
    const after = deleteGroup(buildTree(stored), "g1");
    expect(treeChanges(stored, after).rootGroups).toEqual([]);
  });

  it("lists at the top level a group no group lists", () => {
    const stored = layout(["a"], { positions: { a: 0 }, groups: [group("g1", { position: 1 })] });
    const changes = treeChanges(stored, buildTree(stored));
    expect(changes).toMatchObject({ rootGroups: ["g1"], positions: new Map() });
  });
});
