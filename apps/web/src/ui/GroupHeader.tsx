import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import {
  CheckIcon,
  ChevronIcon,
  FolderIcon,
  FolderOpenIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "./icons";
import { DRAG_CLASS, type RowDrag } from "./DeckRow";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/**
 * A deck group's header in the deck list: a button that folds the group
 * open and shut, naming it and how many decks it holds (in its groups
 * too), and beside it, right-aligned, Rename, Move… and Delete, the one
 * that cannot be taken back last. While the group is being named, an
 * inline field stands in for the button. The header, its fold button
 * too, is a handle to drag the group by, with what it holds; `drag` says
 * what part it takes in a drag, an open folder showing a drop would go
 * into it.
 */
export function GroupHeader({
  group,
  deckCount,
  depth,
  drag,
  expanded,
  bodyId,
  naming,
  moving,
  readOnly,
  onToggle,
  onRename,
  onNamed,
  onMoveToggle,
  onDelete,
  movePanel,
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
  /** Whether its moves are open. */
  moving: boolean;
  /** The list cannot be rearranged here (DeckTree.readOnly). */
  readOnly: boolean;
  onToggle: () => void;
  onRename: () => void;
  /**
   * The name field closed: with a new name, or null to keep the one it
   * has; `refocus` unless the user left it for another control.
   */
  onNamed: (name: string | null, refocus: boolean) => void;
  onMoveToggle: () => void;
  onDelete: () => void;
  /** The moves, given the id their Move button names. */
  movePanel: (id: string) => ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  const panelId = useId();
  const name = readerText(group.title);
  return (
    <div
      class={drag === undefined ? "deck-group-header" : `deck-group-header ${DRAG_CLASS[drag]}`}
      data-row-key={group.url}
      style={`--depth: ${depth}`}
    >
      {naming ? (
        <GroupNameEditor initial={name} onDone={onNamed} />
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
      <span class="group-actions">
        <button
          type="button"
          class="icon"
          aria-label={t("deckList.renameGroup", { name })}
          title={t("deckList.renameGroup", { name })}
          disabled={readOnly || naming}
          onClick={onRename}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          class="row-move icon"
          aria-label={t("deckList.move", { name })}
          title={t("deckList.move", { name })}
          aria-expanded={moving}
          aria-controls={moving ? panelId : undefined}
          disabled={readOnly}
          onClick={onMoveToggle}
        >
          <MoveIcon />
        </button>
        <button
          type="button"
          class="danger icon"
          aria-label={t("deckList.deleteGroup", { name })}
          title={t("deckList.deleteGroup", { name })}
          disabled={readOnly}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
      </span>
      {moving && movePanel(panelId)}
    </div>
  );
}

/**
 * The group's name, to edit in place: focused with its text selected, so
 * typing replaces it. Enter, the check button or leaving the field with
 * a name in it keeps that name; Escape, or leaving it empty or as it
 * was, keeps the name the group has. Left for another control, it says
 * not to take focus back from there.
 */
function GroupNameEditor({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null, refocus: boolean) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  // The field goes as it is done, and a browser may say it lost focus as it goes.
  const done = useRef(false);

  useLayoutEffect(() => {
    input.current!.focus();
    input.current!.select();
  }, []);

  function finish(name: string | null, refocus: boolean) {
    if (done.current) return;
    done.current = true;
    onDone(name, refocus);
  }

  function commit(refocus: boolean) {
    const name = draft.trim();
    finish(name === "" || name === initial ? null : name, refocus);
  }

  return (
    <form
      class="group-name-form"
      onSubmit={(event) => {
        event.preventDefault();
        commit(true);
      }}
      onFocusOut={(event) => {
        const to = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(to)) commit(to === null);
      }}
    >
      <input
        ref={input}
        value={draft}
        aria-label={t("deckList.groupName")}
        maxLength={80}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          finish(null, true);
        }}
      />
      <button type="submit" class="icon" aria-label={t("deckList.saveName")} title={t("deckList.saveName")}>
        <CheckIcon />
      </button>
    </form>
  );
}
