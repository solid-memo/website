import type { ComponentChildren } from "preact";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { ChevronIcon, FolderIcon, FolderOpenIcon } from "./icons";
import { DRAG_CLASS, type RowDrag } from "./DeckRow";
import { useI18n } from "./i18n";
import { NameEditor } from "./NameEditor";
import { ReaderText } from "./ReaderText";

/**
 * A deck group's header in the deck list: a button that folds the group
 * open and shut, naming it and how many decks it holds (in its groups
 * too), and beside it, right-aligned, the menu of what can be done with
 * the group (`menu`). While the group is being named, an inline field
 * stands in for the button. The header, its fold button too, is a
 * handle to drag the group by, with what it holds; `drag` says what part
 * it takes in a drag, an open folder showing a drop would go into it.
 */
export function GroupHeader({
  group,
  deckCount,
  depth,
  drag,
  expanded,
  bodyId,
  naming,
  onToggle,
  onNamed,
  menu,
}: {
  group: DeckGroup;
  deckCount: number;
  /** How many groups the group is in. */
  depth: number;
  drag?: RowDrag;
  expanded: boolean;
  /** The id of what the header folds. */
  bodyId: string;
  /** Whether the name field is open. */
  naming: boolean;
  onToggle: () => void;
  /** The name field closed (NameEditor's `onDone`). */
  onNamed: (name: string | null, refocus: boolean) => void;
  /** Its actions menu (ActionsMenu). */
  menu: ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  return (
    <div
      class={drag === undefined ? "deck-group-header" : `deck-group-header ${DRAG_CLASS[drag]}`}
      data-row-key={group.url}
      style={`--depth: ${depth}`}
    >
      {naming ? (
        <NameEditor initial={readerText(group.title)} label={t("deckList.groupName")} maxLength={80} onDone={onNamed} />
      ) : (
        <button
          type="button"
          class="group-toggle"
          data-drag-handle
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <ChevronIcon />
          {expanded || drag === "into" ? <FolderOpenIcon /> : <FolderIcon />}
          <span class="group-name">
            <ReaderText text={group.title} />
          </span>
          <span class="hint">{t("deckList.deckCount", { count: deckCount })}</span>
        </button>
      )}
      {menu}
    </div>
  );
}
