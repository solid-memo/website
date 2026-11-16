// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createPortal } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import type { Anchor } from "@solid-memo/domain/deckTree";
import { isMarkdown } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { isPublished, stepQuestions } from "@solid-memo/domain/release/courseIds";
import {
  draftCardOf,
  draftOutline,
  outlineMove,
  type OutlineChapter,
} from "@solid-memo/domain/release/draftOutline";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import {
  type DraftChange,
  type DraftRefusal,
  iriIn,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
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
import { chapterTitles } from "./DraftParts";
import { ShowMore } from "./ReleaseLists";
import { useConfirm } from "./shell/ConfirmDialog";

/** A course's outline: its chapters at the top, its steps in a chapter, and no new groups. */
export const OUTLINE_RULES: DropRules = {
  combine: false,
  depths: (source) => (source.kind === "group" ? { min: 0, max: 0 } : { min: 1, max: 1 }),
};

/**
 * At most how many chapters the outline shows at first, and as many
 * more each time the user asks (a page); at most how many steps it shows
 * of a chapter; and how many of each list the chapter and step screens
 * show at first. A draft started from a release can have any number of
 * them.
 */
export const OUTLINE_LIMIT = 50;

/**
 * At most how many steps the outline shows for each page of chapters, over
 * its chapters, and at most how many questions, over its steps: the rest
 * of a chapter or a step is a link to its screen. The limits of each list
 * don't multiply: a page of the outline stays this small, however long
 * its chapters are, and a course as long as the project's own fits on
 * one.
 */
export const OUTLINE_ROW_LIMIT = 500;

/** At most how many questions the outline shows of a step. */
export const OUTLINE_QUESTION_LIMIT = 10;

/** How many steps, or questions, the outline shows at most over its first `chapters`: OUTLINE_ROW_LIMIT for each page. */
function rowBudget(chapters: number): number {
  return Math.ceil(chapters / OUTLINE_LIMIT) * OUTLINE_ROW_LIMIT;
}

/** A chapter of the part of the outline a list shows: where it is, its steps shown, each with where it is, and how many it has. */
interface ShownChapter extends OutlineChapter {
  at: number;
  shown: { step: OutlineChapter["steps"][number]; at: number }[];
}

/**
 * The chapter or step of the outline that shows `key`, the chapter's,
 * step's or question's id the page edits: a chapter or step itself; for a
 * question, the first step that asks it, else the first chapter that asks
 * it in its final review (which the outline lists no questions of); null
 * for none, or one the outline has not.
 */
function outlineAnchor(
  draft: ReleaseDraft,
  outline: readonly OutlineChapter[],
  key: string | null,
): string | null {
  if (key === null) return null;
  const iri = iriIn(draft, key);
  for (const { chapter, steps } of outline) {
    if (chapter.id === key) return key;
    for (const step of steps)
      if (step.id === key || step.data.checkedBy.includes(iri)) return step.id;
  }
  return (
    outline.find(({ chapter }) => chapter.data.reviewQuestion.includes(iri))?.chapter.id ?? null
  );
}

/**
 * The part of a course's outline the outline shows: its first
 * `chapters`, and of them at most OUTLINE_LIMIT steps of a chapter and
 * rowBudget(chapters) in all, first come first shown; and the chapter or
 * step `current` names (the one the page edits), wherever it is, a step
 * past those shown last of its chapter's. `more` counts the chapters past
 * the first `chapters`.
 */
function outlinePart(
  outline: readonly OutlineChapter[],
  chapters: number,
  current: string | null,
): { chapters: ShownChapter[]; more: number } {
  let here = -1;
  let hereStep = -1;
  if (current !== null)
    for (const [at, { chapter, steps }] of outline.entries()) {
      hereStep = chapter.id === current ? -1 : steps.findIndex((step) => step.id === current);
      if (chapter.id === current || hereStep >= 0) {
        here = at;
        break;
      }
    }
  const picked = outline.slice(0, chapters).map((_, at) => at);
  if (here >= chapters) picked.push(here);
  let left = rowBudget(chapters);
  return {
    chapters: picked.map((at) => {
      const { chapter, steps } = outline[at]!;
      const take = Math.min(steps.length, OUTLINE_LIMIT, left);
      left -= take;
      const shown = steps.slice(0, take).map((step, index) => ({ step, at: index }));
      if (at === here && hereStep >= take) shown.push({ step: steps[hereStep]!, at: hereStep });
      return { chapter, steps, at, shown };
    }),
    more: Math.max(0, outline.length - chapters),
  };
}

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
 * while the draft cannot be changed (`readOnly`). A chapter, step or
 * question the release check finds problems in has a badge counting
 * them, a link to the check, or (`badgeHref`) to where the first of them
 * is fixed. The one the page shown edits (`currentKey`) is marked, and
 * shown however far down it is: a question under the step that asks it
 * (outlineAnchor). A long outline is cut short
 * (outlinePart, rowBudget, OUTLINE_QUESTION_LIMIT): what it doesn't
 * show is a link to its chapter's or step's screen.
 */
export function DraftOutline({
  draft,
  readOnly,
  chapterHref,
  stepHref,
  questionHref,
  checkHref,
  problems,
  badgeHref,
  currentKey = null,
  onEdit,
}: {
  draft: ReleaseDraft;
  readOnly: boolean;
  chapterHref: (chapter: string) => string;
  stepHref: (step: string) => string;
  questionHref: (card: string) => string;
  checkHref: string;
  /** The problems the release check finds in each subject, by its id (outlineProblems). */
  problems: ReadonlyMap<string, readonly ReleaseProblem[]>;
  /** Where a badge links: where its first problem is fixed; the check, without. */
  badgeHref?: (problem: ReleaseProblem) => string;
  /** The chapter's, step's or question's id the page shown edits, if any. */
  currentKey?: string | null;
  onEdit: (changes: DraftChange[]) => DraftRefusal | null;
}) {
  const { t, readerText } = useI18n();
  const { ask, dialog } = useConfirm();
  const badge = (id: string, name: string) => {
    const found = problems.get(id);
    return found === undefined ? null : (
      <ProblemBadge count={found.length} name={name} href={badgeHref?.(found[0]!) ?? checkHref} />
    );
  };
  const current = (key: string) => (key === currentKey ? "page" : undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // A draft started from a release may have thousands of chapters, steps
  // and cards: the outline is worked out when its chapters or steps
  // change, not on every render (a menu opened, a drag, an edit to a
  // card or the title), and only a bounded part of it is drawn
  // (outlinePart, rowBudget).
  // The rows a drag froze may name one the draft has since retired.
  const chapterNodes = useMemo(
    () => new Map(draft.chapters.map((node) => [node.id, node])),
    [draft.chapters],
  );
  const chapterTitle = (id: string): LangText => titleOf(chapterNodes.get(id)!);
  const stepNodes = useMemo(
    () => new Map(draft.steps.map((node) => [node.id, node])),
    [draft.steps],
  );
  const cardOf = (id: string) => draftCardOf(draft, id);
  const outline = useMemo(
    () => draftOutline(draft),
    // draftOutline reads only these.
    [draft.url, draft.chapters, draft.steps],
  );
  // The rows shown; each chapter's steps in all, by its key; and each step's questions shown.
  const [chapterLimit, setChapterLimit] = useState(OUTLINE_LIMIT);
  // Where the page edited is: worked out when it or the outline changes.
  const anchor = useMemo(
    () => outlineAnchor(draft, outline, currentKey),
    // outlineAnchor reads only the draft's url, which the outline follows.
    [outline, currentKey],
  );
  const { nodes, chaptersShown, questionsOf, moreChapters } = useMemo(() => {
    const part = outlinePart(outline, chapterLimit, anchor);
    let left = rowBudget(chapterLimit);
    const questionsOf = new Map<string, { shown: string[]; more: number }>();
    for (const { shown } of part.chapters)
      for (const { step } of shown) {
        // stepQuestions reads only the draft's url, which the outline follows.
        const all = stepQuestions(draft, step);
        const take = Math.min(all.length, OUTLINE_QUESTION_LIMIT, left);
        left -= take;
        const listed = all.slice(0, take);
        if (currentKey !== null && all.indexOf(currentKey) >= take) listed.push(currentKey);
        questionsOf.set(step.id, { shown: listed, more: all.length - listed.length });
      }
    return {
      nodes: part.chapters.map<OutlineNode>(({ chapter, at, shown }) => ({
        key: chapter.id,
        title: titleOf(chapter),
        children: shown.map((step) => ({
          key: step.step.id,
          title: { "": t("studio.outline.stepNumber", { chapter: at + 1, step: step.at + 1 }) },
        })),
      })),
      chaptersShown: new Map(part.chapters.map((chapter) => [chapter.chapter.id, chapter])),
      questionsOf,
      moreChapters: part.more,
    };
  }, [outline, chapterLimit, anchor, currentKey, t]);
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

  /**
   * A drop: the outline's rules make no group, so it is a place, or into
   * a chapter. After the last step shown of a chapter cut short it is
   * the chapter's end, after the steps not shown too, and so is a drop
   * into the header of a chapter none of whose steps are shown (into the
   * header of one that shows some, it is the chapter's start); but after
   * the step the page edits, shown past those of its chapter shown, it is
   * right after that step.
   */
  function dropped(source: string, target: DropTarget) {
    const { to } = target as Exclude<DropTarget, { kind: "combine" }>;
    const chapter = to.parent === null ? undefined : chaptersShown.get(to.parent);
    const last = chapter?.shown.at(-1);
    const cut =
      chapter !== undefined &&
      chapter.shown.length < chapter.steps.length &&
      (last === undefined
        ? to.after === null
        : last.at === chapter.shown.length - 1 && to.after === last.step.id);
    move(
      source,
      cut ? { parent: to.parent, after: chapter.steps.at(-1)!.id } : to,
      drag.ghostRef.current!.getBoundingClientRect(),
    );
  }

  const drag = useDragReorder({
    containerRef: listRef,
    rows: () => flattenOutline(shown, new Set()),
    enabled: !readOnly,
    onDrop: dropped,
    onCancel: () => setAnnouncement(t("studio.outline.dragCancelled")),
    rules: OUTLINE_RULES,
    describe: (label: GapLabel) =>
      t(label.kind === "in" ? "studio.outline.inChapter" : "studio.outline.afterChapter", {
        chapter: readerText(chapterTitle(label.group)),
      }),
  });
  const dragging = drag.feedback.phase === "dragging";
  if (dragging) frozen.current ??= nodes;
  else frozen.current = null;
  const shown = frozen.current ?? nodes;
  /**
   * What an open row's menu moves among: the chapters shown, and the
   * row's neighbors in the whole outline, two before it and one after
   * (the steps of its chapter, for a step), so a move up or down, or to
   * another chapter's end (after its last step, shown or not), is the
   * move the whole outline makes. The chapters are named as the question
   * editor names them: cut short (chapterTitles).
   */
  function menuOutline(key: string): OutlineNode[] {
    const here = outline.findIndex(
      ({ chapter, steps }) => chapter.id === key || steps.some((step) => step.id === key),
    );
    const isChapter = outline[here]!.chapter.id === key;
    const around = (at: number) => [Math.max(0, at - 2), at + 2] as const;
    const ats = new Set([...chaptersShown.values()].map(({ at }) => at));
    if (isChapter) for (let at = around(here)[0]; at < around(here)[1]; at++) ats.add(at);
    ats.add(here);
    const picked = [...ats]
      .filter((at) => at < outline.length)
      .sort((a, b) => a - b)
      .map((at) => outline[at]!);
    const titles = chapterTitles(
      picked.map(({ chapter }) => chapter),
      readerText,
    );
    return picked.map(({ chapter, steps }) => {
      const at = steps.findIndex((step) => step.id === key);
      const children = at < 0 ? steps.slice(-1) : steps.slice(...around(at));
      return {
        key: chapter.id,
        title: titles.get(chapter.id)!,
        children: children.map((step) => ({ key: step.id, title: { "": step.id } })),
      };
    });
  }
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
        <MenuItem
          disabled={readOnly}
          onSelect={() =>
            onEdit([{ kind: "retire", of, id }]) === null &&
            setAnnouncement(t("studio.outline.retired", { name }))
          }
        >
          {t("studio.draftEdit.retire")}
        </MenuItem>
        <MenuItem
          danger
          disabled={readOnly || isPublished(draft, id)}
          onSelect={() =>
            ask({
              heading: t(`studio.confirm.deletePart.${of}`),
              text: t(`studio.draftEdit.deleteConfirm.${of}`, { name }),
              action: t("studio.draftEdit.delete"),
              onConfirm: () => {
                if (onEdit([{ kind: "delete", of, id }]) === null)
                  setAnnouncement(t("studio.outline.deleted", { name }));
              },
            })
          }
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
          nodes={menu === key ? menuOutline(key) : []}
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
      <div
        class="deck-tree"
        ref={listRef}
        data-dragging={dragging ? "" : undefined}
        {...drag.containerProps}
      >
        {shown.length === 0 ? (
          <p>{t("studio.outline.empty")}</p>
        ) : (
          <ul class="deck-list" aria-label={t("studio.draft.outline")}>
            {shown.map((chapter) => {
              const name = readerText(chapter.title);
              const steps = chapter.children!;
              // A chapter a drag's rows name may be gone from the draft.
              const stepCount = chaptersShown.get(chapter.key)?.steps.length ?? steps.length;
              const moreSteps = (
                <a href={chapterHref(chapter.key)} draggable={false}>
                  {t("studio.outline.moreSteps", { count: stepCount - steps.length })}
                </a>
              );
              return (
                <li
                  key={chapter.key}
                  class={`deck-group${dragging && drag.feedback.source === chapter.key ? " drag-source" : ""}`}
                >
                  <div
                    class={
                      dragOf(chapter.key) === undefined
                        ? "deck-group-header"
                        : `deck-group-header ${DRAG_CLASS[dragOf(chapter.key)!]}`
                    }
                    data-row-key={chapter.key}
                    style="--depth: 0"
                  >
                    <a
                      class="deck-open"
                      href={chapterHref(chapter.key)}
                      aria-current={current(chapter.key)}
                      draggable={false}
                    >
                      <ReaderText text={chapter.title} />
                    </a>
                    {badge(chapter.key, name)}
                    <span class="hint">{t("studio.outline.stepCount", { count: stepCount })}</span>
                    {rowMenu(chapter.key, name, "chapter")}
                  </div>
                  {steps.length === 0 ? (
                    <p class="hint deck-group-empty" data-row-key={slotKey(chapter.key)}>
                      {stepCount === 0 ? t("studio.outline.noSteps") : moreSteps}
                    </p>
                  ) : (
                    <ul class="deck-list" style="--depth: 1">
                      {steps.map((step) => {
                        const label = readerText(step.title);
                        const { data } = stepNodes.get(step.key)!;
                        const theory = readerText(data.theory ?? {});
                        // A row frozen by a drag may be one the draft has since retired.
                        const questions = questionsOf.get(step.key) ?? { shown: [], more: 0 };
                        return (
                          <li
                            key={step.key}
                            class={
                              dragOf(step.key) === undefined
                                ? "deck-row outline-step"
                                : `deck-row outline-step ${DRAG_CLASS[dragOf(step.key)!]}`
                            }
                            data-row-key={step.key}
                            style="--depth: 1"
                          >
                            <div class="outline-step-text">
                              <a
                                class="deck-open"
                                href={stepHref(step.key)}
                                aria-current={current(step.key)}
                                draggable={false}
                              >
                                {label}
                              </a>
                              {badge(step.key, label)}
                              <span class="hint">
                                {theory === ""
                                  ? t("studio.outline.noTheory")
                                  : plainDataText(theory, isMarkdown(data.textFormat), 80)}
                              </span>
                              <ul class="outline-questions">
                                {questions.shown.map((card) => {
                                  const found = cardOf(card);
                                  const question =
                                    found === null
                                      ? card
                                      : cardName({ ...found.content, id: card }, readerText);
                                  return (
                                    <li key={card}>
                                      <a
                                        href={questionHref(card)}
                                        aria-current={current(card)}
                                        draggable={false}
                                      >
                                        {question}
                                      </a>
                                      {badge(card, question)}
                                    </li>
                                  );
                                })}
                                {questions.more > 0 && (
                                  <li>
                                    <a href={stepHref(step.key)} draggable={false}>
                                      {t("studio.outline.moreQuestions", {
                                        count: questions.more,
                                      })}
                                    </a>
                                  </li>
                                )}
                              </ul>
                            </div>
                            {rowMenu(step.key, label, "step")}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {steps.length > 0 && stepCount > steps.length && (
                    <p class="hint deck-group-empty">{moreSteps}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div ref={drag.lineRef} class="drop-line" aria-hidden="true" hidden />
      </div>
      <ShowMore
        more={moreChapters}
        limit={OUTLINE_LIMIT}
        onShow={() => setChapterLimit((was) => was + OUTLINE_LIMIT)}
      />
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
      {dialog}
    </div>
  );
}

/** How many problems the release check finds in a subject, linking to the check or to the first one's field. */
function ProblemBadge({ count, name, href }: { count: number; name: string; href: string }) {
  const { t } = useI18n();
  return (
    <a class="studio-badge studio-badge-warning" href={href} draggable={false}>
      {t("studio.check.badge", { count })}
      <span class="visually-hidden"> {t("studio.check.badgeOf", { name })}</span>
    </a>
  );
}

/** A chapter's title, else its id. */
function titleOf(chapter: { id: string; data: { title?: LangText } }): LangText {
  return chapter.data.title ?? { "": chapter.id };
}

/** The title of a chapter or step of the outline shown, by its key. */
function shownTitle(nodes: readonly OutlineNode[], key: string): LangText {
  return nodes.flatMap((node) => [node, ...node.children!]).find((node) => node.key === key)!.title;
}
