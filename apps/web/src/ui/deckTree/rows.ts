import { nodeId, type DeckTree, type ParentId, type TreeNode } from "@solid-memo/domain/deckTree";

/**
 * A row of the deck list as it is on screen, in reading order: a deck, a
 * group's header, or the place in an open, empty group where a drag can
 * put something (a "slot", shown as the group's hint). What a group
 * folded shut holds has no rows.
 */
export interface VisibleRow {
  /** The deck's or group's URL; a slot's is `slotKey` of its group. */
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

/** The key of the slot row of an open, empty group: no URL has a space in it. */
export function slotKey(groupUrl: string): string {
  return `slot ${groupUrl}`;
}

/** The rows the tree shows, with the groups in `collapsed` folded shut. */
export function flatten(tree: DeckTree, collapsed: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: readonly TreeNode[], ancestors: readonly string[]) => {
    const parent = ancestors.at(-1) ?? null;
    for (const [index, node] of nodes.entries()) {
      const key = nodeId(node);
      const before = index === 0 ? null : nodeId(nodes[index - 1]!);
      const row = { key, depth: ancestors.length, parent, ancestors, before };
      if (node.kind === "deck") {
        rows.push({ ...row, kind: "deck", collapsed: false, last: null });
        continue;
      }
      const shut = collapsed.has(key);
      const last = node.children.at(-1);
      rows.push({ ...row, kind: "group", collapsed: shut, last: last === undefined ? null : nodeId(last) });
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
  walk(tree.children, []);
  return rows;
}
