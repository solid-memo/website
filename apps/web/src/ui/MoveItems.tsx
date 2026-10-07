import type { ComponentChildren } from "preact";
import {
  locate,
  nodeId,
  type Anchor,
  type DeckGroup,
  type DeckTree,
  type TreeNode,
} from "@solid-memo/domain/deckTree";
import { MenuGroup, MenuItem, MenuSeparator } from "./ActionsMenu";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

type GroupNode = Extract<TreeNode, { kind: "group" }>;

/** A group a node can be moved into, and how deep it is in the tree. */
interface Destination {
  group: DeckGroup;
  depth: number;
  /** Its last member, which the node goes after; null when it has none. */
  last: string | null;
}

/**
 * Every group `key` can go into, depth first: all but the node itself,
 * the groups inside it, and the group it is in already.
 */
function destinations(nodes: readonly TreeNode[], key: string, parent: string | null, depth = 0): Destination[] {
  return nodes.flatMap((node) => {
    if (node.kind === "deck" || node.group.url === key) return [];
    const inside = destinations(node.children, key, parent, depth + 1);
    if (node.group.url === parent) return inside;
    const last = node.children.at(-1);
    return [{ group: node.group, depth, last: last === undefined ? null : nodeId(last) }, ...inside];
  });
}

/**
 * The keyboard's and screen reader's way to arrange the deck list, the
 * same moves a drag makes, as items of a row's ActionsMenu: up or down
 * among its neighbours, out of its group, into a new group with the
 * neighbour above or below, or into another group (at its end), each
 * group indented as deep as it is. A move that the node's place rules
 * out (up from the top), or that the list cannot take (`readOnly`), is
 * marked so and does nothing, rather than leaving the menu.
 */
export function MoveItems({
  tree,
  nodeKey,
  readOnly,
  onMove,
  onCombine,
}: {
  tree: DeckTree;
  /** The deck's or group's URL. */
  nodeKey: string;
  /** The list cannot be rearranged here (DeckTree.readOnly), or the node is being removed. */
  readOnly: boolean;
  onMove: (to: Anchor) => void;
  /** Puts `dragged` with `target` in a new group, at target's place. */
  onCombine: (dragged: string, target: string) => void;
}) {
  const { t, readerText } = useI18n();
  const at = locate(tree, nodeKey)!;
  const holder = at.parent === null ? null : locate(tree, at.parent)!;
  const holderGroup = holder?.node as GroupNode | undefined;
  const siblings = holderGroup?.children ?? tree.children;
  const above = siblings[at.index - 1];
  const below = siblings[at.index + 1];
  const into = destinations(tree.children, nodeKey, at.parent);

  function action(label: ComponentChildren, next: TreeNode | undefined, act: (next: TreeNode) => void) {
    return (
      <MenuItem disabled={readOnly || next === undefined} onSelect={() => act(next!)}>
        {label}
      </MenuItem>
    );
  }

  return (
    <>
      {action(t("deckList.moveUp"), above, () =>
        onMove({ parent: at.parent, after: at.index < 2 ? null : nodeId(siblings[at.index - 2]!) }),
      )}
      {action(t("deckList.moveDown"), below, (next) => onMove({ parent: at.parent, after: nodeId(next) }))}
      {holder !== null && (
        <MenuItem disabled={readOnly} onSelect={() => onMove({ parent: holder.parent, after: at.parent })}>
          {t("deckList.moveOut", { group: readerText(holderGroup!.group.title) })}
        </MenuItem>
      )}
      {action(t("deckList.groupWithPrevious"), above, (next) => onCombine(nodeKey, nodeId(next)))}
      {action(t("deckList.groupWithNext"), below, (next) => onCombine(nodeId(next), nodeKey))}
      {into.length > 0 && (
        <>
          <MenuSeparator />
          <MenuGroup label={t("deckList.moveInto")}>
            {into.map(({ group, depth, last }) => (
              <MenuItem
                key={group.url}
                disabled={readOnly}
                style={`--depth: ${depth}`}
                onSelect={() => onMove({ parent: group.url, after: last })}
              >
                <ReaderText text={group.title} />
              </MenuItem>
            ))}
          </MenuGroup>
        </>
      )}
    </>
  );
}
