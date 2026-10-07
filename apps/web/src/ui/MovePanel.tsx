import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import {
  locate,
  nodeId,
  type Anchor,
  type DeckGroup,
  type DeckTree,
  type TreeNode,
} from "@solid-memo/domain/deckTree";
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
 * same moves a drag makes: up or down among its neighbours, out of its
 * group, into another group (at its end), or into a new group with the
 * neighbour above or below. A disclosure opened in place by a row's
 * Move button, not a menu: focus goes to its first move as it opens (a
 * group's Delete button comes between, in a header), Tab goes through
 * its buttons, Escape closes it. A move that the node's place rules out (up from the top) is
 * marked so and does nothing, rather than leaving the list of moves.
 */
export function MovePanel({
  id,
  tree,
  nodeKey,
  onMove,
  onCombine,
  onClose,
}: {
  id: string;
  tree: DeckTree;
  /** The deck's or group's URL. */
  nodeKey: string;
  onMove: (to: Anchor) => void;
  /** Puts `dragged` with `target` in a new group, at target's place. */
  onCombine: (dragged: string, target: string) => void;
  onClose: () => void;
}) {
  const { t, readerText } = useI18n();
  const at = locate(tree, nodeKey)!;
  const holder = at.parent === null ? null : locate(tree, at.parent)!;
  const holderGroup = holder?.node as GroupNode | undefined;
  const siblings = holderGroup?.children ?? tree.children;
  const above = siblings[at.index - 1];
  const below = siblings[at.index + 1];
  const into = destinations(tree.children, nodeKey, at.parent);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    panel.current!.querySelector("button")!.focus();
  }, []);

  function action(label: ComponentChildren, next: TreeNode | undefined, act: (next: TreeNode) => void) {
    return (
      <button type="button" aria-disabled={next === undefined} onClick={() => next !== undefined && act(next)}>
        {label}
      </button>
    );
  }

  return (
    <div
      ref={panel}
      id={id}
      class="move-panel"
      data-no-drag
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {action(t("deckList.moveUp"), above, () =>
        onMove({ parent: at.parent, after: at.index < 2 ? null : nodeId(siblings[at.index - 2]!) }),
      )}
      {action(t("deckList.moveDown"), below, (next) => onMove({ parent: at.parent, after: nodeId(next) }))}
      {holder !== null && (
        <button type="button" onClick={() => onMove({ parent: holder.parent, after: at.parent })}>
          {t("deckList.moveOut", { group: readerText(holderGroup!.group.title) })}
        </button>
      )}
      {action(t("deckList.groupWithPrevious"), above, (next) => onCombine(nodeKey, nodeId(next)))}
      {action(t("deckList.groupWithNext"), below, (next) => onCombine(nodeId(next), nodeKey))}
      {into.length > 0 && (
        <div class="move-into" role="group" aria-labelledby={`${id}-into`}>
          <span id={`${id}-into`} class="hint">
            {t("deckList.moveInto")}
          </span>
          {into.map(({ group, depth, last }) => (
            <button
              key={group.url}
              type="button"
              style={`--depth: ${depth}`}
              onClick={() => onMove({ parent: group.url, after: last })}
            >
              <ReaderText text={group.title} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
