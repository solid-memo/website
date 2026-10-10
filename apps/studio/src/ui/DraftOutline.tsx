import { createPortal } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Anchor } from "@solid-memo/domain/deckTree";
import { isMarkdown } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { isPublished, questionsOfStep } from "@solid-memo/domain/release/courseIds";
import { draftCardOf, draftOutline, outlineMove } from "@solid-memo/domain/release/draftOutline";
import type { DraftChange, DraftRefusal, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ActionsMenu, MenuItem, MenuSeparator } from "@solid-memo/ui/ActionsMenu";
import { cardName, plainDataText } from "@solid-memo/ui/DataText";
import { DRAG_CLASS, type RowDrag } from "@solid-memo/ui/DeckRow";
import type { DropTarget } from "@solid-memo/ui/deckTree/dragMachine";
import type { DropRules, GapLabel } from "@solid-memo/ui/deckTree/dropZones";
import { flattenOutline, slotKey, type OutlineNode } from "@solid-memo/ui/deckTree/rows";
import { useDragReorder } from "@solid-memo/ui/deckTree/useDragReorder";
import { useFlip } from "@solid-memo/ui/deckTree/useFlip";
import { useI18n } from "@solid-memo/ui/i18n";
import { MoveItems } from "@solid-memo/ui/MoveItems";
import { ReaderText } from "@solid-memo/ui/ReaderText";

/** A course's outline: its chapters at the top, its steps in a chapter, and no new groups. */
export const OUTLINE_RULES: DropRules = {
  combine: false,
  depths: (source) => (source.kind === "group" ? { min: 0, max: 0 } : { min: 1, max: 1 }),
};

/**
 * A course draft's outline (docs/studio.md, The outline): its
 * chapters in their order, each with its steps, each step with the
 * questions that check it, in the order of their ids. Each chapter and
 * step links to its editor, and each question to its own.
 *
 * Chapters and steps are arranged as the deck list's decks and groups
 * are, with the same drag (useDragReorder, OUTLINE_RULES: a chapter
 * among the chapters, a step into any chapter) and the same moves in each
 * row's menu (MoveItems), for the keyboard and screen readers; each is a
 * moveChapter or moveStep change (outlineMove). The menu also retires a
 * chapter or step, or deletes one no release published, once the user
 * confirms; a published one is retired, never deleted. Nothing moves
 * while the draft cannot be changed (`readOnly`).
 */
export function DraftOutline({
  draft,
  readOnly,
  chapterHref,
  stepHref,
  questionHref,
  onEdit,
}: {
  draft: ReleaseDraft;
  readOnly: boolean;
  chapterHref: (chapter: string) => string;
  stepHref: (step: string) => string;
  questionHref: (card: string) => string;
  onEdit: (changes: DraftChange[]) => DraftRefusal | null;
}) {
  const { t, readerText } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const outline = draftOutline(draft);
  const chapterTitle = (id: string): LangText => draft.chapters.find((node) => node.id === id)!.data.title ?? { "": id };
  const stepLabel = (chapter: number, step: number) => t("studio.outline.stepNumber", { chapter: chapter + 1, step: step + 1 });
  const nodes: OutlineNode[] = outline.map(({ chapter, steps }, at) => ({
    key: chapter.id,
    title: chapterTitle(chapter.id),
    children: steps.map((step, index) => ({ key: step.id, title: { "": stepLabel(at, index) } })),
  }));
  const frozen = useRef<OutlineNode[] | null>(null);

  /**
   * Moves a chapter or step to `to`, from where it shows (`rect`, the copy
   * a drop let go of): a move the draft no longer has a place for (it
   * changed under a drag) comes to nothing, and says so.
   */
  function move(key: string, to: Anchor, rect?: DOMRect) {
    const change = outlineMove(draft, key, to);
    if (change === null) {
      setAnnouncement(t("studio.outline.dragCancelled"));
      return;
    }
    flip.capture(rect === undefined ? undefined : { key, rect });
    if (onEdit([change]) === null) setAnnouncement(t("studio.outline.moved"));
  }

  /** A drop: the outline's rules make no group, so it is a place, or into a chapter. */
  function dropped(source: string, target: DropTarget) {
    move(source, (target as Exclude<DropTarget, { kind: "combine" }>).to, drag.ghostRef.current!.getBoundingClientRect());
  }

  const drag = useDragReorder({
    containerRef: listRef,
    rows: () => flattenOutline(shown, new Set()),
    enabled: !readOnly,
    onDrop: dropped,
    onCancel: () => setAnnouncement(t("studio.outline.dragCancelled")),
    rules: OUTLINE_RULES,
    describe: (label: GapLabel) =>
      t(label.kind === "in" ? "studio.outline.inChapter" : "studio.outline.afterChapter", { chapter: readerText(chapterTitle(label.group)) }),
  });
  const dragging = drag.feedback.phase === "dragging";
  if (dragging) frozen.current ??= nodes;
  else frozen.current = null;
  const shown = frozen.current ?? nodes;
  const flip = useFlip(listRef, draft);

  function dragOf(key: string): RowDrag | undefined {
    const { phase, source, into } = drag.feedback;
    if (source === key) return phase === "pending" ? "pending" : "source";
    return into === key ? "into" : undefined;
  }

  /** Retire, or delete once the user confirms: a subject an earlier release published is only retired. */
  function lifeItems(of: "chapter" | "step", id: string, name: string) {
    return (
      <>
        <MenuSeparator />
        <MenuItem disabled={readOnly} onSelect={() => onEdit([{ kind: "retire", of, id }]) === null && setAnnouncement(t("studio.outline.retired", { name }))}>
          {t("studio.draftEdit.retire")}
        </MenuItem>
        <MenuItem
          danger
          disabled={readOnly || isPublished(draft, id)}
          onSelect={() => {
            if (window.confirm(t(`studio.draftEdit.deleteConfirm.${of}`, { name }))) {
              if (onEdit([{ kind: "delete", of, id }]) === null) setAnnouncement(t("studio.outline.deleted", { name }));
            }
          }}
        >
          {t("studio.draftEdit.delete")}
        </MenuItem>
      </>
    );
  }

  function rowMenu(key: string, name: string, of: "chapter" | "step") {
    return (
      <ActionsMenu
        label={t("studio.outline.actions", { name })}
        buttonClass="row-menu"
        open={menu === key}
        onOpen={() => setMenu(key)}
        onClose={() => setMenu(null)}
      >
        <MoveItems
          nodes={shown}
          nodeKey={key}
          readOnly={readOnly}
          fits={(parent) => (of === "chapter" ? parent === null : parent !== null)}
          intoLabel={t("studio.outline.moveTo")}
          onMove={(to) => move(key, to)}
        />
        {lifeItems(of, key, name)}
      </ActionsMenu>
    );
  }

  return (
    <div class="draft-outline">
      <div class="deck-tree" ref={listRef} data-dragging={dragging ? "" : undefined} {...drag.containerProps}>
        {shown.length === 0 ? (
          <p>{t("studio.outline.empty")}</p>
        ) : (
          <ul class="deck-list">
            {shown.map((chapter, at) => {
              const name = readerText(chapter.title);
              const steps = chapter.children!;
              return (
                <li key={chapter.key} class={`deck-group${dragging && drag.feedback.source === chapter.key ? " drag-source" : ""}`}>
                  <div
                    class={dragOf(chapter.key) === undefined ? "deck-group-header" : `deck-group-header ${DRAG_CLASS[dragOf(chapter.key)!]}`}
                    data-row-key={chapter.key}
                    style="--depth: 0"
                  >
                    <a class="deck-open" href={chapterHref(chapter.key)} draggable={false}>
                      <ReaderText text={chapter.title} />
                    </a>
                    <span class="hint">{t("studio.outline.stepCount", { count: steps.length })}</span>
                    {rowMenu(chapter.key, name, "chapter")}
                  </div>
                  {steps.length === 0 ? (
                    <p class="hint deck-group-empty" data-row-key={slotKey(chapter.key)}>
                      {t("studio.outline.noSteps")}
                    </p>
                  ) : (
                    <ul class="deck-list" style="--depth: 1">
                      {steps.map((step, index) => {
                        const label = stepLabel(at, index);
                        const data = draft.steps.find((node) => node.id === step.key)!.data;
                        const theory = readerText(data.theory ?? {});
                        return (
                          <li
                            key={step.key}
                            class={dragOf(step.key) === undefined ? "deck-row outline-step" : `deck-row outline-step ${DRAG_CLASS[dragOf(step.key)!]}`}
                            data-row-key={step.key}
                            style="--depth: 1"
                          >
                            <div class="outline-step-text">
                              <a class="deck-open" href={stepHref(step.key)} draggable={false}>
                                {label}
                              </a>
                              <span class="hint">{theory === "" ? t("studio.outline.noTheory") : plainDataText(theory, isMarkdown(data.textFormat), 80)}</span>
                              <ul class="outline-questions">
                                {questionsOfStep(draft, step.key).map((card) => {
                                  const found = draftCardOf(draft, card);
                                  return (
                                    <li key={card}>
                                      <a href={questionHref(card)} draggable={false}>
                                        {found === null ? card : cardName({ ...found.content, id: card }, readerText)}
                                      </a>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                            {rowMenu(step.key, label, "step")}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div ref={drag.lineRef} class="drop-line" aria-hidden="true" hidden />
      </div>
      {dragging &&
        createPortal(
          <div ref={drag.ghostRef} class="drag-ghost" aria-hidden="true">
            {readerText(shownTitle(shown, drag.feedback.source!))}
          </div>,
          document.body,
        )}
      <p class="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}

/** The title of a chapter or step of the outline shown, by its key. */
function shownTitle(nodes: readonly OutlineNode[], key: string): LangText {
  return nodes.flatMap((node) => [node, ...node.children!]).find((node) => node.key === key)!.title;
}
