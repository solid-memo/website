import type { ComponentChildren } from "preact";
import type { Anchor, ParentId } from "@solid-memo/domain/deckTree";
import { MenuGroup, MenuItem, MenuSeparator } from "./ActionsMenu";
import type { OutlineNode } from "./deckTree/rows";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/** Where a node is: its parent's key (null at the top) and its siblings, itself among them. */
interface Place {
  parent: ParentId;
  siblings: readonly OutlineNode[];
  index: number;
}

/** Where the node keyed `key` is among `nodes`, however deep; undefined when it is not there. */
function placeOf(nodes: readonly OutlineNode[], key: string, parent: ParentId = null): Place | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.key === key) return { parent, siblings: nodes, index };
    const inside = node.children === undefined ? undefined : placeOf(node.children, key, node.key);
    if (inside !== undefined) return inside;
  }
  return undefined;
}

/** A node that holds others the node can be moved into, and how deep it is in the tree. */
interface Destination {
  node: OutlineNode;
  depth: number;
  /** Its last member, which the node goes after; null when it has none. */
  last: string | null;
}

/**
 * Every node holding others that `key` can go into (`fits`), depth
 * first: all but the node itself, those inside it, and the one it is in
 * already.
 */
function destinations(
  nodes: readonly OutlineNode[],
  key: string,
  parent: ParentId,
  fits: (parent: ParentId) => boolean,
  depth = 0,
): Destination[] {
  return nodes.flatMap((node) => {
    if (node.children === undefined || node.key === key) return [];
    const inside = destinations(node.children, key, parent, fits, depth + 1);
    if (node.key === parent || !fits(node.key)) return inside;
    return [{ node, depth, last: node.children.at(-1)?.key ?? null }, ...inside];
  });
}

/**
 * The keyboard's and screen reader's way to arrange a list, the same
 * moves a drag makes, as items of a row's ActionsMenu: up or down among
 * its neighbours, out of the node it is in, into a new group with the
 * neighbour above or below (where the list makes groups: `onCombine`),
 * or into another node that holds others (at its end), each indented as
 * deep as it is. The list is the deck list (groups and decks) or a
 * course's outline (chapters and steps): `fits` says where the node may
 * be (a step only in a chapter, say), and `intoLabel` names the moves
 * into another ("Move into group" when absent). A move that the node's
 * place rules out (up from the top), or that the list cannot take
 * (`readOnly`), is marked so and does nothing, rather than leaving the
 * menu.
 */
export function MoveItems({
  nodes,
  nodeKey,
  readOnly,
  fits = () => true,
  intoLabel,
  onMove,
  onCombine,
}: {
  nodes: readonly OutlineNode[];
  /** The node's key. */
  nodeKey: string;
  /** The list cannot be rearranged here (DeckTree.readOnly), or the node is being removed. */
  readOnly: boolean;
  /** Whether the node may be in `parent` (null: at the top); anywhere when absent. */
  fits?: (parent: ParentId) => boolean;
  intoLabel?: string;
  onMove: (to: Anchor) => void;
  /** Puts `dragged` with `target` in a new group, at target's place; no such move when absent. */
  onCombine?: (dragged: string, target: string) => void;
}) {
  const { t, readerText } = useI18n();
  const at = placeOf(nodes, nodeKey)!;
  const holder = at.parent === null ? null : placeOf(nodes, at.parent)!;
  const above = at.siblings[at.index - 1];
  const below = at.siblings[at.index + 1];
  const into = destinations(nodes, nodeKey, at.parent, fits);

  function action(label: ComponentChildren, next: OutlineNode | undefined, act: (next: OutlineNode) => void) {
    return (
      <MenuItem disabled={readOnly || next === undefined} onSelect={() => act(next!)}>
        {label}
      </MenuItem>
    );
  }

  return (
    <>
      {action(t("deckList.moveUp"), above, () =>
        onMove({ parent: at.parent, after: at.index < 2 ? null : at.siblings[at.index - 2]!.key }),
      )}
      {action(t("deckList.moveDown"), below, (next) => onMove({ parent: at.parent, after: next.key }))}
      {holder !== null && fits(holder.parent) && (
        <MenuItem disabled={readOnly} onSelect={() => onMove({ parent: holder.parent, after: at.parent })}>
          {t("deckList.moveOut", { group: readerText(holder.siblings[holder.index]!.title) })}
        </MenuItem>
      )}
      {onCombine !== undefined && (
        <>
          {action(t("deckList.groupWithPrevious"), above, (next) => onCombine(nodeKey, next.key))}
          {action(t("deckList.groupWithNext"), below, (next) => onCombine(next.key, nodeKey))}
        </>
      )}
      {into.length > 0 && (
        <>
          <MenuSeparator />
          <MenuGroup label={intoLabel ?? t("deckList.moveInto")}>
            {into.map(({ node, depth, last }) => (
              <MenuItem
                key={node.key}
                disabled={readOnly}
                style={`--depth: ${depth}`}
                onSelect={() => onMove({ parent: node.key, after: last })}
              >
                <ReaderText text={node.title} />
              </MenuItem>
            ))}
          </MenuGroup>
        </>
      )}
    </>
  );
}
