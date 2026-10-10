import type { ComponentChildren } from "preact";
import type { Deck } from "@solid-memo/domain/deck";
import { DeckIcon } from "./icons";
import { useI18n } from "./i18n";
import { NameEditor } from "./NameEditor";
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
 * page, the host a copy of a release added from a link came from
 * (`fromHost`), what it offers today (`action`), and last the menu of
 * what can be done with it (`menu`). While the deck is being renamed, an inline
 * field stands in for the link. The whole row is a handle to drag it by
 * (deckTree/useDragReorder.ts), `drag` saying what part it takes in a
 * drag.
 */
export function DeckRow({
  deck,
  depth,
  drag,
  href,
  fromHost = null,
  action,
  naming,
  onNamed,
  menu,
}: {
  deck: Deck;
  /** How many groups the deck is in. */
  depth: number;
  drag?: RowDrag;
  href: string;
  /** The host the release the deck is a copy of was added from, by a link; none for any other deck. */
  fromHost?: string | null;
  action: ComponentChildren;
  /** Whether the name field is open. */
  naming: boolean;
  /** The name field closed (NameEditor's `onDone`). */
  onNamed: (name: string | null, refocus: boolean) => void;
  /** Its actions menu (ActionsMenu). */
  menu: ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  return (
    <li class={drag === undefined ? "deck-row" : `deck-row ${DRAG_CLASS[drag]}`} data-row-key={deck.url} style={`--depth: ${depth}`}>
      {naming ? (
        <NameEditor initial={readerText(deck.title)} label={t("deckList.deckName")} onDone={onNamed} />
      ) : (
        <a class="deck-open" href={href} draggable={false}>
          <DeckIcon />
          <ReaderText text={deck.title} />
          {fromHost !== null && <span class="hint deck-source">{t("deckList.fromHost", { host: fromHost })}</span>}
        </a>
      )}
      <span class="deck-meta">{action}</span>
      {menu}
    </li>
  );
}
