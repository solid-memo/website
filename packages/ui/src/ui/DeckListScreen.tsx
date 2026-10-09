import { createPortal, type ComponentChildren } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Deck } from "@solid-memo/domain/deck";
import {
  applyDeckTreeEdit,
  decksOf,
  locate,
  nodeId,
  type DeckGroup,
  type DeckTree,
  type DeckTreeEdit,
  type TreeNode,
} from "@solid-memo/domain/deckTree";
import { shownTag, type LangText } from "@solid-memo/domain/langText";
import { ActionsMenu, MenuItem, MenuLink, MenuSeparator } from "./ActionsMenu";
import { DeckRow, type RowDrag } from "./DeckRow";
import type { DropTarget } from "./deckTree/dragMachine";
import type { GapLabel } from "./deckTree/dropZones";
import { flatten, slotKey } from "./deckTree/rows";
import { useDragReorder } from "./deckTree/useDragReorder";
import { useFlip } from "./deckTree/useFlip";
import { ErrorMessage } from "./ErrorMessage";
import { GroupHeader } from "./GroupHeader";
import { CollectionIcon, DeckIcon, FolderIcon, LibraryIcon } from "./icons";
import { useI18n, type ErrorText } from "./i18n";
import { reducedMotion } from "./motion";
import { MoveItems } from "./MoveItems";
import { ReaderText } from "./ReaderText";

type GroupNode = Extract<TreeNode, { kind: "group" }>;

/** How long a deleted group's header is waited for to fold away, should its animation's end never be heard. */
export const LEAVE_FALLBACK_MS = 300;

/**
 * Where focus goes once the list shows an edit: a row's menu button, a
 * group's fold button, or (`key` null) the heading. An edit can remount
 * the row it moves, more than once (shown at once, then as written, or
 * taken back), which drops focus to the page: so focus is put back each
 * time, until the user takes it elsewhere (`met`: it got there once), or
 * points anywhere on the page.
 */
interface FocusRequest {
  key: string | null;
  part: "menu" | "toggle";
  met: boolean;
}

/**
 * Decks to open or study, as the user arranged them into groups (see
 * domain/deckTree.ts): a group folds open and shut. Each deck and
 * group has, last in its row, a menu of what can be done with it
 * (ActionsMenu): going on with a deck's course, a deck's preferences,
 * renaming it in place, the moves it can make (MoveItems), a new group
 * among them, and deleting it, last. A deck or group is also dragged to a new place
 * (deckTree/useDragReorder.ts): between rows, into a group by its
 * header, or onto another deck or group to make a new group of the two.
 * Deleting a group keeps what it holds; deleting a deck, once the user
 * confirms, takes its cards with it. A list arranged by a newer version,
 * or one whose arrangement has invalid data set aside, cannot be
 * rearranged, nor its groups renamed or deleted, but its decks can still
 * be renamed and deleted: that is the deck's own data. Nor can a list
 * be rearranged while the data is still being checked, under a policy
 * that may set its arrangement aside.
 *
 * While a row is dragged the list stays as it was when it was lifted,
 * whatever comes in meanwhile, so that what the user aims at stays put;
 * the drop is made on the list as it is by then, or, when that can no
 * longer be done, comes to nothing and says so.
 *
 * Every edit moves the rows to their new places (deckTree/useFlip.ts):
 * a dropped row settles from where the pointer let it go, a new group's
 * header comes in, and a deleted group's header folds away before what
 * it held takes its place. Under reduced motion, all of it is at once.
 */
export function DeckListScreen({
  tree,
  arrangementSetAside = false,
  checking = false,
  collapsed,
  onToggle,
  onUnfold,
  onEdit,
  newGroup,
  onRenameDeck,
  onRemoveDeck,
  error,
  libraryHref,
  deckHref,
  preferencesHref,
  studioHref,
  heading,
  courseHref = () => undefined,
  renderStudyAction,
  createDeckHref,
  offer,
}: {
  tree: DeckTree;
  /** The catalogue or a deck group has invalid data, set aside: the list cannot be rearranged. */
  arrangementSetAside?: boolean;
  /** The data is still being checked, and the arrangement may yet be set aside: it cannot be rearranged until the check is done. */
  checking?: boolean;
  /** The groups folded shut, by URL. */
  collapsed: ReadonlySet<string>;
  onToggle: (groupUrl: string) => void;
  /** Opens the groups, at once (to show what was moved into them). */
  onUnfold: (groupUrls: readonly string[]) => void;
  /**
   * Makes an edit, which the list shows at once; resolves to whether it
   * was written (the container says why not, through `error`).
   */
  onEdit: (edit: DeckTreeEdit) => Promise<boolean>;
  /** A new group's URL and name, for a combine (UseCases.newDeckGroup). */
  newGroup: (title: LangText) => DeckGroup;
  /** Renames the deck, which the list shows at once (the container says why it failed, through `error`). */
  onRenameDeck: (deck: Deck, title: LangText) => void;
  /** Removes the deck and its cards; resolves to whether it did (the container says why not, through `error`). */
  onRemoveDeck: (deck: Deck) => Promise<boolean>;
  /** Why the last edit was not made. */
  error: ErrorText | null;
  /** URL of the deck library, where ready-made decks are imported from. */
  libraryHref: string;
  /** URL of a deck's page; wherever the UI names a deck, it links there. */
  deckHref: (deck: Deck) => string;
  /** URL of a deck's preferences. */
  preferencesHref: (deck: Deck) => string;
  /** URL of the instance in Solid Memo Studio, which each deck's menu offers; none in the Studio itself. */
  studioHref?: string;
  /** The list's heading, where it is not the instance's deck list ("Decks"). */
  heading?: string;
  /** URL of the course a deck is the copy of; undefined for a deck that is none. */
  courseHref?: (deck: Deck) => string | undefined;
  /**
   * What the row offers for the deck today (Study, or nothing). Supplied
   * by the container: it depends on each deck's queue.
   */
  renderStudyAction: (deck: Deck) => ComponentChildren;
  /** URL of the deck creator. */
  createDeckHref: string;
  /**
   * What the container offers under the heading, before the list (the
   * course for newcomers): next after the heading in reading and Tab order.
   */
  offer?: ComponentChildren;
}) {
  const { t, locale, readerText } = useI18n();
  const readOnly = tree.readOnly || arrangementSetAside || checking;
  /** The deck or group whose name field is open. */
  const [naming, setNaming] = useState<string | null>(null);
  /** The deck or group whose actions menu is open. */
  const [menu, setMenu] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** The decks being removed, by URL: until they are gone or stay, nothing more is done with them. */
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  /** The tree as last shown, for what is done once a removal is through. */
  const latest = useRef(tree);
  latest.current = tree;
  /** The groups deleted, whose headers fold away (until the list no longer shows them). */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  /** What each deleted group does once its header has folded away, by URL. */
  const afterLeaving = useRef(new Map<string, () => void>());
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const proxyRef = useRef<HTMLInputElement>(null);
  /** The tree as it was when a row was lifted, shown till the drop. */
  const frozen = useRef<DeckTree | null>(null);
  /** Once a row has been dragged, the rows no longer slide in as they come (style.css). */
  const arranged = useRef(false);
  const focusRequest = useRef<FocusRequest | null>(null);
  const [, setFocusRequested] = useState(0);

  // A pointer goes where the user wants focus, or nowhere: either way, not back.
  useEffect(() => {
    const forget = () => {
      focusRequest.current = null;
    };
    document.addEventListener("pointerdown", forget);
    return () => document.removeEventListener("pointerdown", forget);
  }, []);

  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (request === null) return;
    const control = request.part === "menu" ? ".row-menu" : ".group-toggle";
    const target =
      request.key === null
        ? headingRef.current!
        : [...listRef.current!.querySelectorAll<HTMLElement>(`[data-row-key] ${control}`)].find(
            (element) => element.closest<HTMLElement>("[data-row-key]")!.dataset.rowKey === request.key,
          );
    // Not there (yet): a row that is gone takes no focus.
    if (target === undefined) return;
    if (document.activeElement === target) {
      request.met = true;
      return;
    }
    if (request.met && document.activeElement !== document.body) {
      focusRequest.current = null;
      return;
    }
    target.focus();
    // Not taken (in a group still folded shut, say): tried again as the list changes.
    request.met = document.activeElement === target;
  });

  function focusLater(key: string | null, part: FocusRequest["part"]) {
    focusRequest.current = { key, part, met: false };
    setFocusRequested((count) => count + 1);
  }

  const nameOf = (node: TreeNode) => readerText(node.kind === "deck" ? node.deck.title : node.group.title);

  /**
   * Makes the edit, the rows moving from where they are now to where it
   * puts them; `from`, the row a drop moves and where it was let go.
   */
  function edit(change: DeckTreeEdit, said: string, from?: { key: string; rect: DOMRect }) {
    // Rows that come and go from here on take their places as the edits put them, not by sliding in.
    arranged.current = true;
    flip.capture(from);
    setAnnouncement(said);
    return onEdit(change);
  }

  /**
   * `from`: dropped there by a pointer, which leaves focus where it is;
   * a keyboard move puts it back on the node's menu button.
   */
  function move(node: TreeNode, to: DeckTreeEdit & { kind: "move" }, from?: DOMRect) {
    const next = applyDeckTreeEdit(tree, to);
    const at = locate(next, nodeId(node))!;
    const holder = at.parent === null ? null : (locate(next, at.parent)!.node as GroupNode);
    // Into a group folded shut, or one in a group folded shut: each opens, to show it.
    const shut: string[] = [];
    for (let up = at.parent; up !== null; up = locate(next, up)!.parent) {
      if (collapsed.has(up)) shut.push(up);
    }
    if (shut.length > 0) onUnfold(shut);
    if (from === undefined) focusLater(nodeId(node), "menu");
    void edit(
      to,
      t("deckList.moved", {
        name: nameOf(node),
        position: at.index + 1,
        count: (holder?.children ?? next.children).length,
        place:
          holder === null ? t("deckList.atTopLevel") : t("deckList.inGroup", { group: readerText(holder.group.title) }),
      }),
      from && { key: nodeId(node), rect: from },
    );
  }

  function combine(
    dragged: TreeNode,
    target: TreeNode,
    group = newGroup({ [locale]: t("deckList.newGroupName") }),
    from?: DOMRect,
  ) {
    setNaming(group.url);
    void edit(
      { kind: "combine", dragged: nodeId(dragged), target: nodeId(target), group },
      t("deckList.combined", { name: nameOf(target), other: nameOf(dragged), group: t("deckList.newGroupName") }),
      from && { key: nodeId(dragged), rect: from },
    ).then((written) => {
      if (written) return;
      // The group is not there to name: back to where the user was.
      setNaming((current) => (current === group.url ? null : current));
      focusLater(nodeId(target), "menu");
    });
  }

  /** `refocus`: focus is on nothing else, so it goes back to the group. */
  function named(group: DeckGroup, name: string | null, refocus: boolean) {
    setNaming(null);
    if (refocus) focusLater(group.url, "toggle");
    if (name !== null) {
      void edit({ kind: "rename", group: group.url, title: { [locale]: name } }, t("deckList.renamed", { name }));
    }
  }

  function remove(node: GroupNode, parent: DeckGroup | null) {
    const name = readerText(node.group.title);
    const count = decksOf(node.children).length;
    const question =
      node.children.length === 0
        ? t("deckList.deleteEmptyGroupConfirm", { name })
        : count === 0
          ? t("deckList.deleteGroupOfGroupsConfirm", { name })
          : t("deckList.deleteGroupConfirm", { name, count });
    if (!window.confirm(question)) return;
    // Focus goes to what took the group's place, or to the group it was in.
    const first = node.children[0];
    if (first !== undefined) focusLater(nodeId(first), "menu");
    else focusLater(parent?.url ?? null, "toggle");
    const url = node.group.url;
    const removeGroup = () =>
      void edit(
        { kind: "removeGroup", group: url },
        first === undefined ? t("deckList.deletedEmpty", { name }) : t("deckList.deleted", { name }),
      ).then((written) => {
        // Back, as it was: its header unfolds again.
        if (!written) setLeaving((all) => new Set([...all].filter((other) => other !== url)));
      });
    if (reducedMotion()) {
      removeGroup();
      return;
    }
    afterLeaving.current.set(url, removeGroup);
    setLeaving((all) => new Set([...all, url]));
    setTimeout(() => left(url), LEAVE_FALLBACK_MS);
  }

  /**
   * The deck's new name, in the language it is shown in, its other
   * languages kept as they are.
   */
  function renamedDeck(deck: Deck, name: string | null, refocus: boolean) {
    setNaming(null);
    if (refocus) focusLater(deck.url, "menu");
    if (name === null) return;
    setAnnouncement(t("deckList.deckRenamed", { name }));
    onRenameDeck(deck, { ...deck.title, [shownTag(deck.title, [locale, ...navigator.languages])!]: name });
  }

  /**
   * Once it is gone, focus goes to what took its place, else to the one
   * before it, else to the group it was in, else to the heading, of
   * those still there; unless the user took it elsewhere meanwhile.
   */
  function removeDeck(deck: Deck) {
    const name = readerText(deck.title);
    if (!window.confirm(t("deckPreferences.removeConfirm", { title: name }))) return;
    // The deck's menu button, the menu closed back on it.
    const from = document.activeElement;
    const at = locate(tree, deck.url)!;
    const siblings = at.parent === null ? tree.children : (locate(tree, at.parent)!.node as GroupNode).children;
    const near = [siblings[at.index + 1], siblings[at.index - 1]].filter((node) => node !== undefined);
    setRemoving((all) => new Set([...all, deck.url]));
    void onRemoveDeck(deck).then((removed) => {
      setRemoving((all) => new Set([...all].filter((url) => url !== deck.url)));
      if (!removed) return;
      setAnnouncement(t("deckList.deckDeleted", { name }));
      if (document.activeElement !== from && document.activeElement !== document.body) return;
      const there = (key: string) => locate(latest.current, key) !== undefined;
      const next = near.map(nodeId).find(there);
      if (next !== undefined) focusLater(next, "menu");
      else focusLater(at.parent !== null && there(at.parent) ? at.parent : null, "toggle");
    });
  }

  /** The deleted group's header has folded away (or been given time enough to): the group goes. */
  function left(url: string) {
    const removeGroup = afterLeaving.current.get(url);
    if (removeGroup === undefined) return;
    afterLeaving.current.delete(url);
    removeGroup();
  }

  /**
   * Whether an edit a drop asks for still changes the list as it is now,
   * which may have changed under the drag; when it cannot be made any
   * more, the drag comes to nothing, and says so.
   */
  function applies(change: DeckTreeEdit): boolean {
    try {
      return applyDeckTreeEdit(tree, change) !== tree;
    } catch {
      setAnnouncement(t("deckList.dragCancelled"));
      return false;
    }
  }

  function dropped(source: string, target: DropTarget) {
    if (target.kind === "combine") {
      const group = newGroup({ [locale]: t("deckList.newGroupName") });
      if (!applies({ kind: "combine", dragged: source, target: target.target, group })) return;
      // Focused within the drop's own event, a field brings a phone's
      // keyboard up, and keeps it up as the name field takes the focus over.
      proxyRef.current!.focus({ preventScroll: true });
      combine(locate(tree, source)!.node, locate(tree, target.target)!.node, group, released());
      return;
    }
    const change = { kind: "move", node: source, to: target.to } as const;
    if (applies(change)) move(locate(tree, source)!.node, change, released());
  }

  /** Where the copy that followed the pointer was let go: the dropped row settles from there. */
  const released = () => drag.ghostRef.current!.getBoundingClientRect();

  const drag = useDragReorder({
    containerRef: listRef,
    rows: () => flatten(shown, collapsed),
    enabled: !readOnly && naming === null,
    onDrop: dropped,
    onCancel: () => setAnnouncement(t("deckList.dragCancelled")),
    describe: (label: GapLabel) => {
      const name = readerText((locate(shown, label.group)!.node as GroupNode).group.title);
      return label.kind === "in" ? t("deckList.inGroup", { group: name }) : t("deckList.afterGroup", { group: name });
    },
  });
  const dragging = drag.feedback.phase === "dragging";
  if (dragging) {
    frozen.current ??= tree;
    arranged.current = true;
  } else {
    frozen.current = null;
  }
  const shown = frozen.current ?? tree;
  const flip = useFlip(listRef, tree);
  const lifted = dragging ? locate(shown, drag.feedback.source!)!.node : null;

  function dragOf(key: string): RowDrag | undefined {
    const { phase, source, combine: other, into } = drag.feedback;
    if (source === key) return phase === "pending" ? "pending" : "source";
    if (other === key) return "combine";
    return into === key ? "into" : undefined;
  }

  /** The menu of what can be done with the node, last in its row. */
  function actionsMenu(node: TreeNode, parent: DeckGroup | null) {
    const key = nodeId(node);
    const busy = removing.has(key);
    return (
      <ActionsMenu
        label={t("deckList.actions", { name: nameOf(node) })}
        buttonClass="row-menu"
        open={menu === key}
        onOpen={() => setMenu(key)}
        onClose={() => setMenu(null)}
      >
        {node.kind === "deck" && courseHref(node.deck) !== undefined && (
          <MenuLink href={courseHref(node.deck)!}>{t("deckList.continueCourse")}</MenuLink>
        )}
        {node.kind === "deck" && <MenuLink href={preferencesHref(node.deck)}>{t("deckList.preferences")}</MenuLink>}
        {node.kind === "deck" && studioHref !== undefined && <MenuLink href={studioHref}>{t("studio.open")}</MenuLink>}
        {/* A group's name is the arrangement's, a deck's its own. */}
        <MenuItem disabled={busy || (node.kind === "group" && readOnly)} onSelect={() => setNaming(key)}>
          {t("deckList.rename")}
        </MenuItem>
        <MenuSeparator />
        <MoveItems
          tree={shown}
          nodeKey={key}
          readOnly={readOnly || busy}
          onMove={(to) => move(node, { kind: "move", node: key, to })}
          onCombine={(dragged, target) => combine(locate(tree, dragged)!.node, locate(tree, target)!.node)}
        />
        <MenuSeparator />
        {node.kind === "deck" ? (
          <MenuItem danger disabled={busy} onSelect={() => removeDeck(node.deck)}>
            {t("deckList.deleteDeck")}
          </MenuItem>
        ) : (
          <MenuItem danger disabled={readOnly} onSelect={() => remove(node, parent)}>
            {t("deckList.deleteGroup")}
          </MenuItem>
        )}
      </ActionsMenu>
    );
  }

  function renderNodes(nodes: readonly TreeNode[], parent: DeckGroup | null, depth: number) {
    return nodes.map((node) =>
      node.kind === "deck" ? (
        <DeckRow
          key={node.deck.url}
          deck={node.deck}
          depth={depth}
          drag={dragOf(node.deck.url)}
          href={deckHref(node.deck)}
          action={renderStudyAction(node.deck)}
          naming={naming === node.deck.url}
          onNamed={(name, refocus) => renamedDeck(node.deck, name, refocus)}
          menu={actionsMenu(node, parent)}
        />
      ) : (
        <DeckGroupItem
          key={node.group.url}
          slot={slotKey(node.group.url)}
          lifted={dragging && drag.feedback.source === node.group.url}
          leaving={leaving.has(node.group.url)}
          onLeft={() => left(node.group.url)}
          collapsed={collapsed.has(node.group.url)}
          empty={node.children.length === 0}
          depth={depth}
          header={(bodyId, expanded) => (
            <GroupHeader
              group={node.group}
              deckCount={decksOf(node.children).length}
              depth={depth}
              drag={dragOf(node.group.url)}
              expanded={expanded}
              bodyId={bodyId}
              naming={naming === node.group.url}
              onToggle={() => onToggle(node.group.url)}
              onNamed={(name, refocus) => named(node.group, name, refocus)}
              menu={actionsMenu(node, parent)}
            />
          )}
        >
          {renderNodes(node.children, node.group, depth + 1)}
        </DeckGroupItem>
      ),
    );
  }

  return (
    <section>
      <header>
        <h2 ref={headingRef} tabIndex={-1}>
          <CollectionIcon />
          {heading ?? t("deckList.heading")}
        </h2>
        <span class="hint">
          {t("deckList.deckCount", { count: decksOf(shown.children).length })}
        </span>
      </header>
      {offer}
      {tree.readOnly ? (
        <p class="hint">{t("deckList.readOnly")}</p>
      ) : (
        arrangementSetAside && <p class="hint">{t("deckList.arrangementSetAside")}</p>
      )}
      <div
        class="deck-tree"
        ref={listRef}
        data-dragging={dragging ? "" : undefined}
        data-arranged={arranged.current ? "" : undefined}
        {...drag.containerProps}
      >
        {shown.children.length === 0 ? (
          <p>{t("deckList.empty")}</p>
        ) : (
          <ul class="deck-list">{renderNodes(shown.children, null, 0)}</ul>
        )}
        <div ref={drag.lineRef} class="drop-line" aria-hidden="true" hidden />
      </div>
      {lifted !== null &&
        createPortal(
          <div ref={drag.ghostRef} class="drag-ghost" aria-hidden="true">
            {lifted.kind === "deck" ? <DeckIcon /> : <FolderIcon />}
            <ReaderText text={lifted.kind === "deck" ? lifted.deck.title : lifted.group.title} />
            {lifted.kind === "group" && (
              <span class="hint">{t("deckList.deckCount", { count: decksOf(lifted.children).length })}</span>
            )}
          </div>,
          document.body,
        )}
      {/* Takes the focus for a moment as a drop makes a group, see dropped. */}
      <input ref={proxyRef} class="focus-proxy" tabIndex={-1} aria-hidden="true" />
      <p class="visually-hidden" role="status">
        {announcement}
      </p>
      <ErrorMessage error={error} />
      <div class="actions">
        <a class="button primary" href={createDeckHref}>
          {t("deckList.createButton")}
        </a>
        <a class="button" href={libraryHref}>
          <LibraryIcon />
          {t("deckList.libraryLink")}
        </a>
      </div>
    </section>
  );
}

/**
 * A deck group in the list: its header, and under it what it holds,
 * which folds away (out of the tab order and the accessibility tree too)
 * while the group is shut.
 */
function DeckGroupItem({
  slot,
  lifted,
  leaving,
  onLeft,
  collapsed,
  empty,
  depth,
  header,
  children,
}: {
  /** The key of the row an empty group shows, where a drag can put something. */
  slot: string;
  /** Being dragged, with what it holds. */
  lifted: boolean;
  /** Deleted: its header folds away, then `onLeft`. */
  leaving: boolean;
  onLeft: () => void;
  collapsed: boolean;
  empty: boolean;
  depth: number;
  header: (bodyId: string, expanded: boolean) => ComponentChildren;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  return (
    <li
      class={`deck-group${lifted ? " drag-source" : ""}${leaving ? " leaving" : ""}`}
      onAnimationEnd={(event) => {
        // Not the end of what a row in it does.
        if (event.animationName === "group-leave") onLeft();
      }}
    >
      {header(bodyId, !collapsed)}
      <div id={bodyId} class="deck-group-body" data-collapsed={collapsed ? "" : undefined} inert={collapsed}>
        <div class="deck-group-clip">
          {empty ? (
            <p class="hint deck-group-empty" data-row-key={slot}>
              {t("deckList.emptyGroup")}
            </p>
          ) : (
            <ul class="deck-list" style={`--depth: ${depth + 1}`}>
              {children}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
