import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Deck } from "@solid-memo/domain/deck";
import { DeckIcon, MoveIcon } from "./icons";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/** How a row takes part in a drag: held (before it lifts), lifted, the row a drop would group it with, or the group it would go into. */
export type RowDrag = "pending" | "source" | "combine" | "into";

/** The class that shows each part a row takes in a drag (style.css). */
export const DRAG_CLASS: Record<RowDrag, string> = {
  pending: "press-pending",
  source: "drag-source",
  combine: "drop-combine",
  into: "drop-into",
};

/**
 * A deck in the deck list: its name, a link all over the row to its
 * page, what it offers today (`action`), and a Move button that opens
 * the moves it can make (`movePanel`) right under it. The whole row
 * is a handle to drag it by (deckTree/useDragReorder.ts), `drag` saying
 * what part it takes in a drag.
 */
export function DeckRow({
  deck,
  depth,
  drag,
  href,
  action,
  moving,
  readOnly,
  onMoveToggle,
  movePanel,
}: {
  deck: Deck;
  /** How many groups the deck is in. */
  depth: number;
  drag?: RowDrag;
  href: string;
  action: ComponentChildren;
  /** Whether its moves are open. */
  moving: boolean;
  /** The list cannot be rearranged here (DeckTree.readOnly). */
  readOnly: boolean;
  onMoveToggle: () => void;
  /** The moves, given the id their Move button names. */
  movePanel: (id: string) => ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  const panelId = useId();
  return (
    <li class={drag === undefined ? "deck-row" : `deck-row ${DRAG_CLASS[drag]}`} data-row-key={deck.url} style={`--depth: ${depth}`}>
      <a class="deck-open" href={href} draggable={false}>
        <DeckIcon />
        <ReaderText text={deck.title} />
      </a>
      <span class="deck-meta">{action}</span>
      <button
        type="button"
        class="row-move icon"
        aria-label={t("deckList.move", { name: readerText(deck.title) })}
        title={t("deckList.move", { name: readerText(deck.title) })}
        aria-expanded={moving}
        aria-controls={moving ? panelId : undefined}
        disabled={readOnly}
        onClick={onMoveToggle}
      >
        <MoveIcon />
      </button>
      {moving && movePanel(panelId)}
    </li>
  );
}
