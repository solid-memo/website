import { AppError } from "./appError";
import type { Deck } from "./deck";
import { sameText, type LangText } from "./langText";

/**
 * The deck list as the user arranged it (see docs/data-model.md "Deck
 * groups"): decks and named groups, a group holding decks and groups of
 * its own, in the order the user put them. The pod states it in the
 * catalog document, every group a dcat:Catalog listing its members and
 * each member's place an `sm:position` within its parent; the root is
 * the instance's catalogue, whose `dcat:catalog` lists the top-level
 * groups (its `dcat:dataset` lists every deck, grouped or not).
 *
 * The pod's statements may disagree with a tree (a deck in two groups, a
 * group inside itself, a member that is gone), for another app may have
 * written them: `buildTree` reads them into the one tree they come
 * closest to, and `treeChanges` says what to write so the pod states the
 * tree an edit made. Edits are intents (`DeckTreeEdit`), not finished
 * layouts, so the same edit can be applied to the tree the screen shows
 * at once and again to the pod's as it is when it is written, keeping
 * what another tab or app changed meanwhile. An edit that changes
 * nothing returns the very tree it was given.
 */

/** A group of decks: the dcat:Catalog subject, and its one name, in the language the user named it in. */
export interface DeckGroup {
  url: string;
  title: LangText;
}

export type TreeNode =
  | { kind: "deck"; deck: Deck }
  | { kind: "group"; group: DeckGroup; children: readonly TreeNode[] };

export interface DeckTree {
  /** The top level, in order. */
  children: readonly TreeNode[];
  /** A group is in a newer format than this app's, so it may show the tree but not change it. */
  readOnly: boolean;
}

/** Where a node is: a group's URL, or null for the top level. */
export type ParentId = string | null;

/**
 * A place in the tree: in `parent`, right after the sibling `after`, or
 * first when that is null. A place names its neighbour rather than an
 * index so that it still means the same after other changes.
 */
export interface Anchor {
  parent: ParentId;
  after: string | null;
}

export type DeckTreeEdit =
  | { kind: "move"; node: string; to: Anchor }
  /** Make `group` (its URL minted by the client) at `target`'s place, holding target, then dragged. */
  | { kind: "combine"; dragged: string; target: string; group: DeckGroup }
  | { kind: "rename"; group: string; title: LangText }
  | { kind: "removeGroup"; group: string }
  /** Place `nodes` at the end of the top level: decks the tree has, and new groups (URLs minted by the client) holding them. */
  | { kind: "graft"; nodes: readonly GraftNode[] };

/** A node of a graft: a deck of the tree, by its URL, or a new group with what it holds. */
export type GraftNode =
  | { kind: "deck"; url: string }
  | { kind: "group"; group: DeckGroup; children: readonly GraftNode[] };

/** A group as the catalog document states it: its members' links as they are, each kind apart. */
export interface StoredGroup {
  group: DeckGroup;
  /** Its `dcat:dataset` links: decks. */
  decks: readonly string[];
  /** Its `dcat:catalog` links: groups. */
  groups: readonly string[];
  position?: number;
}

/** The catalog document's arrangement as it is stated, read by the persistence adapter. */
export interface StoredLayout {
  /** In document order. */
  decks: readonly Deck[];
  /** Each deck's `sm:position`, when it states one. */
  deckPositions: ReadonlyMap<string, number>;
  /** The groups the app can read, in document order. */
  groups: readonly StoredGroup[];
  /** The catalogue's `dcat:catalog` links, as they are. */
  rootGroups: readonly string[];
  /** A group is in a newer format than this app's. */
  readOnly: boolean;
}

/**
 * What to write so that the pod states a tree (see `treeChanges`). Its
 * member lists name only nodes the layout has: the writer keeps the
 * links it must keep to others (a group the app cannot read, a member
 * that is not a deck or group of this document) beside them.
 */
export interface TreeChanges {
  /** Each added group's members are in `members`, its position in `positions`. */
  groupsAdded: readonly DeckGroup[];
  groupsRemoved: readonly string[];
  groupsRetitled: readonly DeckGroup[];
  /** The full new member lists, of the nodes the layout has, of every group whose members changed (each added group's too). */
  members: ReadonlyMap<string, { decks: readonly string[]; groups: readonly string[] }>;
  /** The catalogue's new `dcat:catalog` list of the groups the layout has, when it changed; a link to a group it cannot read stays beside it. */
  rootGroups?: readonly string[];
  /** A node's new position within its parent, for each one whose position or parent changed. */
  positions: ReadonlyMap<string, number>;
}

export function nodeId(node: TreeNode): string {
  return node.kind === "deck" ? node.deck.url : node.group.url;
}

/** Every deck under the nodes, depth first: the decks a group holds, or (of a tree's children) all of them. */
export function decksOf(nodes: readonly TreeNode[]): Deck[] {
  return nodes.flatMap((node) => (node.kind === "deck" ? [node.deck] : decksOf(node.children)));
}

export interface TreeLocation {
  node: TreeNode;
  parent: ParentId;
  index: number;
}

function locateIn(nodes: readonly TreeNode[], parent: ParentId, id: string): TreeLocation | undefined {
  for (const [index, node] of nodes.entries()) {
    if (nodeId(node) === id) return { node, parent, index };
    if (node.kind === "group") {
      const found = locateIn(node.children, node.group.url, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Where a deck or group is in the tree; undefined when it is not. */
export function locate(tree: DeckTree, id: string): TreeLocation | undefined {
  return locateIn(tree.children, null, id);
}

/** Whether `id` is inside the group `ancestor`, at any depth (not the group itself). */
export function isDescendant(tree: DeckTree, ancestor: string, id: string): boolean {
  const found = locate(tree, ancestor);
  return found?.node.kind === "group" && locateIn(found.node.children, ancestor, id) !== undefined;
}

/** A parent's children; undefined when there is no such group. */
function childrenOf(tree: DeckTree, parent: ParentId): readonly TreeNode[] | undefined {
  if (parent === null) return tree.children;
  const found = locate(tree, parent);
  return found?.node.kind === "group" ? found.node.children : undefined;
}

/** The tree with a parent's children replaced (the parent must exist). */
function withChildren(tree: DeckTree, parent: ParentId, children: readonly TreeNode[]): DeckTree {
  if (parent === null) return { ...tree, children };
  const replace = (nodes: readonly TreeNode[]): readonly TreeNode[] =>
    nodes.map((node) => {
      if (node.kind === "deck") return node;
      if (node.group.url === parent) return { ...node, children };
      return { ...node, children: replace(node.children) };
    });
  return { ...tree, children: replace(tree.children) };
}

function spliced<T>(items: readonly T[], index: number, remove: number, ...add: T[]): T[] {
  const copy = [...items];
  copy.splice(index, remove, ...add);
  return copy;
}

/** The tree without a node that is in it. */
function without(tree: DeckTree, at: TreeLocation): DeckTree {
  return withChildren(tree, at.parent, spliced(childrenOf(tree, at.parent)!, at.index, 1));
}

function changed(): AppError {
  return new AppError("deckTreeChanged");
}

/**
 * The tree with a node moved to a place. A place whose `after` has gone
 * is the end of its parent; a parent that has gone, a node that has, or a
 * place inside the node itself mean the tree changed under the edit.
 */
export function moveNode(tree: DeckTree, id: string, to: Anchor): DeckTree {
  const from = locate(tree, id);
  if (from === undefined || childrenOf(tree, to.parent) === undefined) throw changed();
  if (to.parent === id || (to.parent !== null && isDescendant(tree, id, to.parent))) throw changed();
  if (to.parent === from.parent && to.after === id) return tree;
  const rest = without(tree, from);
  const siblings = childrenOf(rest, to.parent)!;
  const after = to.after === null ? -1 : siblings.findIndex((node) => nodeId(node) === to.after);
  const index = to.after !== null && after === -1 ? siblings.length : after + 1;
  if (to.parent === from.parent && index === from.index) return tree;
  return withChildren(rest, to.parent, spliced(siblings, index, 0, from.node));
}

/**
 * The tree with a new group at `target`'s place, holding target and then
 * `dragged`, taken from wherever it was. Done again, it changes nothing,
 * so an edit retried after its write went through still succeeds. A
 * group cannot be combined with a deck or group inside it, nor with the
 * group it is in.
 */
export function combine(tree: DeckTree, dragged: string, target: string, group: DeckGroup): DeckTree {
  if (dragged === target) throw new Error("A node cannot be combined with itself");
  const existing = locate(tree, group.url);
  if (existing !== undefined) {
    const members = existing.node.kind === "group" ? existing.node.children.map(nodeId) : [];
    if (members.includes(target) && members.includes(dragged)) return tree;
    throw changed();
  }
  const from = locate(tree, dragged);
  if (from === undefined || locate(tree, target) === undefined) throw changed();
  if (isDescendant(tree, dragged, target) || isDescendant(tree, target, dragged)) throw changed();
  const rest = without(tree, from);
  const at = locate(rest, target)!;
  const node: TreeNode = { kind: "group", group, children: [at.node, from.node] };
  return withChildren(rest, at.parent, spliced(childrenOf(rest, at.parent)!, at.index, 1, node));
}

/**
 * The tree without a group, its members, in order, in its place: up one
 * level, no further. A group that is already gone changes nothing.
 */
export function deleteGroup(tree: DeckTree, url: string): DeckTree {
  const at = locate(tree, url);
  if (at?.node.kind !== "group") return tree;
  return withChildren(tree, at.parent, spliced(childrenOf(tree, at.parent)!, at.index, 1, ...at.node.children));
}

/** The tree with a group renamed; a group that is gone means the tree changed under the edit. */
export function renameGroup(tree: DeckTree, url: string, title: LangText): DeckTree {
  const at = locate(tree, url);
  if (at?.node.kind !== "group") throw changed();
  if (sameText(at.node.group.title, title)) return tree;
  const node: TreeNode = { ...at.node, group: { ...at.node.group, title } };
  return withChildren(tree, at.parent, spliced(childrenOf(tree, at.parent)!, at.index, 1, node));
}

/**
 * The tree with `nodes` at the end of the top level, in order: each deck
 * taken from wherever it was, each group new, holding its own. A deck
 * the tree no longer has is left out (removed meanwhile). Done again —
 * one of its groups already there — it changes nothing, so an edit
 * retried after its write went through still succeeds.
 */
export function graft(tree: DeckTree, nodes: readonly GraftNode[]): DeckTree {
  const groups = (list: readonly GraftNode[]): string[] =>
    list.flatMap((node) => (node.kind === "group" ? [node.group.url, ...groups(node.children)] : []));
  if (groups(nodes).some((url) => locate(tree, url) !== undefined)) return tree;
  let rest = tree;
  const placed = (list: readonly GraftNode[]): TreeNode[] =>
    list.flatMap((node): TreeNode[] => {
      if (node.kind === "group") return [{ kind: "group", group: node.group, children: placed(node.children) }];
      const at = locate(rest, node.url);
      if (at?.node.kind !== "deck") return [];
      rest = without(rest, at);
      return [at.node];
    });
  const added = placed(nodes);
  return { ...rest, children: [...rest.children, ...added] };
}

/** The tree an edit makes; a tree in a newer format than this app's cannot be edited. */
export function applyDeckTreeEdit(tree: DeckTree, edit: DeckTreeEdit): DeckTree {
  if (tree.readOnly) throw new AppError("deckTreeTooNew");
  switch (edit.kind) {
    case "move":
      return moveNode(tree, edit.node, edit.to);
    case "combine":
      return combine(tree, edit.dragged, edit.target, edit.group);
    case "rename":
      return renameGroup(tree, edit.group, edit.title);
    case "removeGroup":
      return deleteGroup(tree, edit.group);
    case "graft":
      return graft(tree, edit.nodes);
  }
}

/** Each grouped node's group as the layout states it, one each (`buildTree` steps 1 to 4); the rest are at the top level. */
function parentsOf(stored: StoredLayout): Map<string, string> {
  const decks = new Set(stored.decks.map((deck) => deck.url));
  const groups = new Set(stored.groups.map((entry) => entry.group.url));
  const rootGroups = new Set(stored.rootGroups.filter((url) => groups.has(url)));
  const parents = new Map<string, string>();
  // Lowest group URL first, so its claim on a node listed twice wins.
  const byUrl = [...stored.groups].sort((a, b) => (a.group.url < b.group.url ? -1 : 1));
  for (const { group, decks: deckLinks, groups: groupLinks } of byUrl) {
    for (const url of deckLinks) if (decks.has(url) && !parents.has(url)) parents.set(url, group.url);
    for (const url of groupLinks) {
      if (groups.has(url) && url !== group.url && !rootGroups.has(url) && !parents.has(url)) parents.set(url, group.url);
    }
  }
  // A group that cannot reach the top level is in a cycle: lift its lowest member to the top, until none is.
  for (const { group } of byUrl) {
    const chain: string[] = [];
    let at: string | undefined = group.url;
    while (at !== undefined && !chain.includes(at)) {
      chain.push(at);
      at = parents.get(at);
    }
    if (at !== undefined) {
      const cycle = chain.slice(chain.indexOf(at));
      parents.delete(cycle.sort()[0]!);
    }
  }
  return parents;
}

/**
 * The tree a catalog document states. Links to what is not there, a
 * group listing itself, and a deck linked as a group or a group as a deck
 * are left out; a node listed by several parents is where the top level
 * lists it, else in the group with the lowest URL; a cycle of groups is
 * broken by lifting its lowest-URL group to the top level; and whatever
 * no group lists is at the top level. Within a parent, members come by
 * position, those without one (or with a negative one) last, and in
 * document order on a tie: decks before groups, which a pod written by
 * this app never ties.
 */
export function buildTree(stored: StoredLayout): DeckTree {
  const parents = parentsOf(stored);
  type Entry = { id: string; order: number; position: number | undefined } & ({ deck: Deck } | { group: DeckGroup });
  const entries: Entry[] = [
    ...stored.decks.map((deck, order) => ({ deck, id: deck.url, order, position: stored.deckPositions.get(deck.url) })),
    ...stored.groups.map(({ group, position }, order) => ({ group, id: group.url, order: stored.decks.length + order, position })),
  ];
  const rank = (entry: Entry) => (entry.position !== undefined && entry.position >= 0 ? entry.position : Infinity);
  entries.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  const childrenIn = (parent: ParentId): TreeNode[] =>
    entries
      .filter((entry) => (parents.get(entry.id) ?? null) === parent)
      .map((entry) =>
        "deck" in entry ? { kind: "deck", deck: entry.deck } : { kind: "group", group: entry.group, children: childrenIn(entry.id) },
      );
  return { children: childrenIn(null), readOnly: stored.readOnly };
}

/** Every group's (and the top level's) children's ids, by parent. */
function levels(tree: DeckTree): Map<ParentId, string[]> {
  const result = new Map<ParentId, string[]>();
  const walk = (parent: ParentId, nodes: readonly TreeNode[]) => {
    result.set(parent, nodes.map(nodeId));
    for (const node of nodes) if (node.kind === "group") walk(node.group.url, node.children);
  };
  walk(null, tree.children);
  return result;
}

function sameMembers(stated: readonly string[], known: ReadonlySet<string>, wanted: readonly string[]): boolean {
  const kept = new Set(stated.filter((url) => known.has(url)));
  return kept.size === wanted.length && wanted.every((url) => kept.has(url));
}

/**
 * What to write so that the pod, which states `stored`, states `after`:
 * the groups to add, remove and rename; the new member lists of each
 * group whose members changed, and of the top level (its groups only:
 * the catalogue lists every deck anyway); and the new position of every
 * member of a parent whose order changed, renumbered from 0. Member lists
 * are compared to what the layout states of the nodes it has, so a link
 * to a node that is gone is dropped only as its list is written anyway,
 * while a node listed twice is written in its one place.
 *
 * The comparison is with what the pod states, not with the tree
 * `buildTree` reads from it, so on a pod that is not one valid tree even
 * the tree it reads gives changes. An edit that changes nothing (the
 * same tree back from `applyDeckTreeEdit`) must therefore write nothing
 * without asking: the pod is set straight only alongside a real edit.
 */
export function treeChanges(stored: StoredLayout, after: DeckTree): TreeChanges {
  const before = levels(buildTree(stored));
  const now = levels(after);
  const storedGroups = new Map(stored.groups.map((entry) => [entry.group.url, entry]));
  const decks = new Set(stored.decks.map((deck) => deck.url));
  const groups = new Set(storedGroups.keys());
  const kinds = new Map<string, TreeNode>();
  const collect = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      kinds.set(nodeId(node), node);
      if (node.kind === "group") collect(node.children);
    }
  };
  collect(after.children);
  const split = (ids: readonly string[]) => ({
    decks: ids.filter((id) => kinds.get(id)!.kind === "deck"),
    groups: ids.filter((id) => kinds.get(id)!.kind === "group"),
  });
  const parentBefore = new Map<string, ParentId>();
  for (const [parent, ids] of before) for (const id of ids) parentBefore.set(id, parent);

  const groupsAdded: DeckGroup[] = [];
  const groupsRetitled: DeckGroup[] = [];
  const members = new Map<string, { decks: readonly string[]; groups: readonly string[] }>();
  const positions = new Map<string, number>();
  let rootGroups: readonly string[] | undefined;
  for (const [parent, ids] of now) {
    const list = split(ids);
    if (parent === null) {
      if (!sameMembers(stored.rootGroups, groups, list.groups)) rootGroups = list.groups;
    } else {
      const group = (kinds.get(parent) as Extract<TreeNode, { kind: "group" }>).group;
      const entry = storedGroups.get(parent);
      if (entry === undefined) groupsAdded.push(group);
      else if (!sameText(entry.group.title, group.title)) groupsRetitled.push(group);
      if (entry === undefined || !sameMembers(entry.decks, decks, list.decks) || !sameMembers(entry.groups, groups, list.groups)) {
        members.set(parent, list);
      }
    }
    const old = before.get(parent);
    if (old !== undefined && old.length === ids.length && old.every((id, index) => ids[index] === id)) continue;
    for (const [index, id] of ids.entries()) {
      const position = storedGroups.has(id) ? storedGroups.get(id)!.position : stored.deckPositions.get(id);
      if (position !== index || parentBefore.get(id) !== parent) positions.set(id, index);
    }
  }
  return {
    groupsAdded,
    groupsRemoved: [...groups].filter((url) => !now.has(url)),
    groupsRetitled,
    members,
    ...(rootGroups === undefined ? {} : { rootGroups }),
    positions,
  };
}
