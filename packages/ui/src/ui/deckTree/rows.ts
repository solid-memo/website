import { nodeId, type DeckTree, type ParentId, type TreeNode } from "@solid-memo/domain/deckTree";
import type { LangText } from "@solid-memo/domain/langText";

/**
 * A list arranged by dragging its rows, as plain data: the deck list
 * (decks in groups, groups in groups) or a course's outline (steps in
 * chapters). A node with `children` holds others, as a group does (its
 * row is a "group" row, even when it is a chapter); one without is a
 * leaf, as a deck is.
 */
export interface OutlineNode {
  /** Its key: a deck's or group's URL, a chapter's or step's id. */
  key: string;
  /** Its name, as a move names where it goes. */
  title: LangText;
  children?: readonly OutlineNode[];
}

/** The deck list's tree as an outline: groups hold, decks do not. */
export function outlineOf(nodes: readonly TreeNode[]): OutlineNode[] {
  return nodes.map((node) =>
    node.kind === "deck"
      ? { key: nodeId(node), title: node.deck.title }
      : { key: nodeId(node), title: node.group.title, children: outlineOf(node.children) },
  );
}

/**
 * A row of an arranged list as it is on screen, in reading order: a leaf
 * (a deck, a step), the header of a node that holds others (a group, a
 * chapter), or the place in an open, empty one where a drag can put
 * something (a "slot", shown as its hint). What a node folded shut holds
 * has no rows.
 */
export interface VisibleRow {
  /** Its node's key (OutlineNode); a slot's is `slotKey` of its group. */
  key: string;
  kind: "deck" | "group" | "slot";
  /** How many groups it is in. */
  depth: number;
  parent: ParentId;
  /** The groups it is in, the outermost first. */
  ancestors: readonly string[];
  /** The member right before it in its parent; null for the first (and for a slot). */
  before: string | null;
  /** A group's: whether it is folded shut. */
  collapsed: boolean;
  /** A group's last member; null when it has none (and for a deck or slot). */
  last: string | null;
}

/** The key of the slot row of an open, empty group: no URL, nor id, has a space in it. */
export function slotKey(groupUrl: string): string {
  return `slot ${groupUrl}`;
}

/** The rows the tree shows, with the groups in `collapsed` folded shut. */
export function flatten(tree: DeckTree, collapsed: ReadonlySet<string>): VisibleRow[] {
  return flattenOutline(outlineOf(tree.children), collapsed);
}

/** The rows an outline shows, with the nodes in `collapsed` folded shut. */
export function flattenOutline(nodes: readonly OutlineNode[], collapsed: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: readonly OutlineNode[], ancestors: readonly string[]) => {
    const parent = ancestors.at(-1) ?? null;
    for (const [index, node] of nodes.entries()) {
      const { key } = node;
      const before = index === 0 ? null : nodes[index - 1]!.key;
      const row = { key, depth: ancestors.length, parent, ancestors, before };
      if (node.children === undefined) {
        rows.push({ ...row, kind: "deck", collapsed: false, last: null });
        continue;
      }
      const shut = collapsed.has(key);
      rows.push({ ...row, kind: "group", collapsed: shut, last: node.children.at(-1)?.key ?? null });
      if (shut) continue;
      const inside = [...ancestors, key];
      if (node.children.length === 0) {
        rows.push({
          key: slotKey(key),
          kind: "slot",
          depth: inside.length,
          parent: key,
          ancestors: inside,
          before: null,
          collapsed: false,
          last: null,
        });
      }
      walk(node.children, inside);
    }
  };
  walk(nodes, []);
  return rows;
}
