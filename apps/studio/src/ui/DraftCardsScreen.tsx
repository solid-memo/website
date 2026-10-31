// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { isMarkdown } from "@solid-memo/domain/deck";
import {
  DRAFT_CARD_FILTERS,
  draftCardLanguages,
  draftCardRows,
  type DraftCardFilter,
  type DraftCardRow,
  stepPlaceOf,
} from "@solid-memo/domain/release/draftOutline";
import type { QuestionPlace, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { DataLine } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { Pager, paginate } from "@solid-memo/ui/Pager";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { DraftScope, DraftStatus } from "./DraftParts";
import { NewQuestionForm } from "./NewQuestionForm";
import type { DraftCardColumn } from "./router";
import { BulkBar } from "./shell/BulkBar";
import { DataTable, type Column } from "./shell/DataTable";
import {
  nextSort,
  NO_SELECTION,
  sortedRows,
  type Selection,
  type TableSort,
} from "./shell/tableModel";

/** How many cards a page of the table shows. */
export const DRAFT_CARDS_PAGE = 50;

/** How the table is looked at, as its URL holds it: a filter, a language, a sort, a page. */
export interface DraftCardsView {
  filter?: DraftCardFilter;
  language?: string;
  sort?: TableSort<DraftCardColumn>;
  page?: number;
}

/** A view as the URL holds it: what it leaves out (no filter, any language, by id, the first page) not stated. */
function cleanView({
  filter,
  language,
  sort,
  page,
}: {
  filter?: DraftCardFilter | undefined;
  language?: string | undefined;
  sort?: TableSort<DraftCardColumn> | undefined;
  page?: number | undefined;
}): DraftCardsView {
  return {
    ...(filter === undefined ? {} : { filter }),
    ...(language === undefined ? {} : { language }),
    ...(sort === undefined ? {} : { sort }),
    ...(page === undefined || page === 1 ? {} : { page }),
  };
}

/**
 * A draft's cards as a table (docs/studio.md, A draft's cards): a row
 * each, by id, its front a link to its editor, its back, where it is
 * asked, its wrong options in use and whether it is retired. The URL
 * holds the view (`view`): a filter (asked nowhere, asked from two
 * places, too few wrong options, retired), a language its front or back
 * has text in, a column to sort by (each column's header sorts by it,
 * then the other way, then by id again), and the page, 50 cards each;
 * a change of the filter, the language or the sort goes back to the
 * first. The table is a DataTable, whose Columns menu shows or hides
 * its columns: cards are selected by their checkbox, or a page's at
 * once, and retired or restored together; Enter opens a card's editor
 * (`onOpen`), as its link does. A new card is added under it, asked
 * nowhere yet: a course's is placed in its editor.
 */
export function DraftCardsScreen({
  draft,
  view,
  readOnly,
  status,
  links,
  onView,
  onOpen,
  onEdit,
}: {
  draft: ReleaseDraft;
  view: DraftCardsView;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  onView: (view: DraftCardsView) => void;
  /** Open a card's editor, by its id. */
  onOpen: (card: string) => void;
  onEdit: DraftEditor["edit"];
}) {
  const { t, locale, readerText } = useI18n();
  const [chosen, setChosen] = useState<Selection>(NO_SELECTION);
  const found = draftCardRows(draft, {
    ...(view.filter === undefined ? {} : { filter: view.filter }),
    ...(view.language === undefined ? {} : { language: view.language }),
  });
  const languages = draftCardLanguages(draft);
  const chapterName = (id: string) => {
    const title = draft.chapters.find((node) => node.id === id)?.data.title;
    return title === undefined ? id : readerText(title);
  };
  const placeName = (place: QuestionPlace | null) => {
    if (place === null) return t("studio.question.nowhere");
    if (place.kind === "review")
      return t("studio.question.atReview", { chapter: chapterName(place.chapter) });
    const at = stepPlaceOf(draft, place.step);
    return at === null
      ? place.step
      : t("studio.question.atStep", { chapter: chapterName(at.chapter), step: at.index + 1 });
  };
  const languageName = (tag: string) =>
    tag === "unstated" ? t("studio.draftCards.unstated") : tag;
  const placeText = (row: DraftCardRow) =>
    row.asked > 1 ? t("studio.draftCards.askedTimes", { count: row.asked }) : placeName(row.place);
  const rows = sortedRows(
    found,
    view.sort,
    (row, column) => {
      switch (column) {
        case "front":
          return row.card.front === undefined ? row.id : readerText(row.card.front);
        case "back":
          return row.card.back === undefined ? undefined : readerText(row.card.back);
        case "place":
          return placeText(row);
        case "distractors":
          return row.distractors;
        case "id":
          return row.id;
      }
    },
    locale,
  );
  const page = paginate(rows, view.page ?? 1, DRAFT_CARDS_PAGE);
  // The cards selected the table keeps, in its order; one it hides stays selected, but is left alone.
  const selected = rows.filter((row) => chosen.has(row.id));
  const live = selected.filter((row) => !row.retired);
  const retired = selected.filter((row) => row.retired);
  const lifeOf = (kind: "retire" | "restore", of: readonly DraftCardRow[]) =>
    onEdit(of.map((row) => ({ kind, of: "card" as const, id: row.id })));
  const columns: Column<DraftCardRow>[] = [
    {
      key: "back",
      label: t("studio.draftCards.column.back"),
      cell: (row) =>
        row.card.back === undefined ? (
          ""
        ) : (
          <DataLine text={row.card.back} markdown={isMarkdown(row.card.textFormat)} />
        ),
    },
    ...(draft.course
      ? [{ key: "place", label: t("studio.draftCards.column.place"), cell: placeText }]
      : []),
    {
      key: "distractors",
      label: t("studio.draftCards.column.distractors"),
      number: true,
      cell: (row) => row.distractors,
    },
    { key: "id", label: t("studio.draftCards.column.id"), cell: (row) => <code>{row.id}</code> },
  ];

  return (
    <section>
      <header>
        <h2>
          {t(draft.course ? "studio.draftCards.headingCourse" : "studio.draftCards.heading", {
            draft:
              draft.root.title === undefined
                ? t("studio.draft.untitled")
                : readerText(draft.root.title),
          })}
        </h2>
      </header>
      <DraftStatus editor={status} />
      <div class="studio-filters">
        <label>
          {t("studio.draftCards.filter")}
          <select
            aria-keyshortcuts="/"
            value={view.filter ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onView(
                cleanView({
                  ...view,
                  filter: DRAFT_CARD_FILTERS.find((known) => known === value),
                  page: undefined,
                }),
              );
            }}
          >
            <option value="">{t("studio.draftCards.all")}</option>
            {DRAFT_CARD_FILTERS.filter(
              (filter) => draft.course || filter === "fewDistractors" || filter === "retired",
            ).map((filter) => (
              <option key={filter} value={filter}>
                {t(`studio.draftCards.filters.${filter}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("studio.draftCards.language")}
          <select
            value={view.language ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onView(
                cleanView({ ...view, language: value === "" ? undefined : value, page: undefined }),
              );
            }}
          >
            <option value="">{t("studio.draftCards.anyLanguage")}</option>
            {[
              ...new Set([...languages, ...(view.language === undefined ? [] : [view.language])]),
            ].map((tag) => (
              <option key={tag} value={tag}>
                {languageName(tag)}
              </option>
            ))}
          </select>
        </label>
        <p role="status">{t("studio.draftCards.count", { count: rows.length })}</p>
      </div>
      {rows.length > 0 && (
        <DataTable
          caption={t("studio.draftCards.caption")}
          captionHidden
          rows={page.items}
          keyOf={(row) => row.id}
          name={{
            key: "front",
            label: t("studio.draftCards.column.front"),
            cell: (row) => (
              <>
                <a href={links.questionHref(row.id)}>
                  {row.card.front === undefined ? (
                    row.id
                  ) : (
                    <DataLine text={row.card.front} markdown={isMarkdown(row.card.textFormat)} />
                  )}
                </a>
                {row.retired && <span class="hint"> {t("studio.draftCards.retired")}</span>}
              </>
            ),
          }}
          columns={columns}
          columnsOf={draft.course ? "draftQuestions" : "draftCards"}
          sort={view.sort}
          // Sorted afresh: from the first page.
          onSort={(key) =>
            onView(
              cleanView({
                ...view,
                sort: nextSort(view.sort, key as DraftCardColumn),
                page: undefined,
              }),
            )
          }
          // Nothing is changed while the draft may not be.
          {...(readOnly === null
            ? {
                select: {
                  label: t("studio.cards.select"),
                  allLabel: t("studio.cards.selectAll"),
                  rowLabel: (row: DraftCardRow) =>
                    t("studio.cards.selectCard", {
                      card: row.card.front === undefined ? row.id : readerText(row.card.front),
                    }),
                  chosen,
                  onChoose: setChosen,
                },
              }
            : {})}
          onOpen={(row) => onOpen(row.id)}
        />
      )}
      {page.pageCount > 1 && (
        <Pager
          page={page.currentPage}
          pageCount={page.pageCount}
          onPageChange={(next) => onView(cleanView({ ...view, page: next }))}
        />
      )}
      {readOnly === null && (
        <BulkBar
          label={t("studio.cardBulk.label")}
          count={chosen.size}
          said={t("studio.cards.selected", { count: chosen.size })}
          onClear={() => setChosen(NO_SELECTION)}
        >
          {live.length > 0 && (
            <button type="button" onClick={() => lifeOf("retire", live)}>
              {t("studio.draftCards.retire", { count: live.length })}
            </button>
          )}
          {retired.length > 0 && (
            <button type="button" onClick={() => lifeOf("restore", retired)}>
              {t("studio.draftCards.restore", { count: retired.length })}
            </button>
          )}
        </BulkBar>
      )}
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <NewQuestionForm
          id="draft-cards-new"
          draft={draft}
          place={null}
          legend={t(draft.course ? "studio.draftCards.newQuestion" : "studio.draft.newCard")}
          onAdd={(changes) => onEdit(changes) === null}
        />
      </DraftScope>
    </section>
  );
}
