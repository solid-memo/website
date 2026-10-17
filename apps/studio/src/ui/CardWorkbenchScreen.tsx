// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useState } from "preact/hooks";
import {
  CARD_FEATURES,
  CARD_FIELDS,
  CARD_PAGE_SIZES,
  CARD_STATES,
  queryFromParams,
  UNSTATED,
  type CardPageSize,
  type CardQuery,
  type CardRow,
  type CardSort,
} from "@solid-memo/domain/cardQuery";
import type { CardEdit, CardEditPlan, SkipReason } from "@solid-memo/domain/cardBulk";
import { isMarkdown, type Card, type Deck } from "@solid-memo/domain/deck";
import { CardRowBack, CardRowFront } from "@solid-memo/ui/CardFace";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { cardName } from "@solid-memo/ui/DataText";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText, type I18n } from "@solid-memo/ui/i18n";
import { paginate, Pager } from "@solid-memo/ui/Pager";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { RetiredTag } from "@solid-memo/ui/RetiredCards";
import type { CardTransferPlan } from "@solid-memo/domain/cardTransfer";
import type { LapseIndex } from "@solid-memo/domain/cardHistory";
import { CardBulkActions, type ReviewEdit } from "./CardBulkActions";
import { ReadOnlyNotice } from "./ReadOnly";
import type { CardTransfer } from "./TransferCardsDialog";
import { useActivity } from "./shell/activity";
import { BulkBar } from "./shell/BulkBar";
import { DataTable, type Column } from "./shell/DataTable";
import { EditableCell, type CellEdit } from "./shell/EditableCell";
import { Keys } from "./shell/KeyHelp";
import { SavedViews } from "./shell/SavedViews";
import { nextSort, NO_SELECTION, toggled, type Selection } from "./shell/tableModel";
import {
  cardParams,
  cardViewOf,
  CARD_VIEWS,
  paramsText,
  withCardView,
  type SavedView,
} from "./shell/views";

/** An edit made, which can be undone while the page is open. */
export interface CardEditMade {
  edit: CardEdit;
  /** The plan as written: its inverse undoes it. */
  plan: CardEditPlan;
}

/** An edit of review states made, and how many cards it changed. */
export interface ReviewEditMade {
  edit: ReviewEdit;
  count: number;
}

/** A move or copy made, and what it did. */
export interface TransferMade {
  transfer: CardTransfer;
  plan: CardTransferPlan;
}

/** How the status line names an edit made. */
function doneKey(edit: CardEdit) {
  return edit.kind === "setTextFormat" ? (edit.markdown ? "markdownOn" : "markdownOff") : edit.kind;
}

/**
 * The card workbench: a deck's cards as a table, a row each, searched,
 * filtered and sorted as the URL says (`query`, which the domain applies:
 * `rows` are every card that matches, in order), a page at a time.
 * A column's header sorts by it, then the other way, then back to the
 * deck's own order; the sorted column says so (`aria-sort`). Its views,
 * tabs above it, each keep the cards in one state (views.ts), and the
 * views the user saved (`savedViews`, SavedViews) each a whole query.
 *
 * The table is a DataTable, whose Columns menu shows or hides its
 * columns. Cards are selected by their checkbox, or a
 * page's at once; the selection stays as the view changes, and a status
 * line counts it. The keys j and k move between the rows (the focus goes
 * to the row's link; from outside the table, to the first), x selects
 * the row, Shift+J and Shift+K select on from it, Escape clears the
 * selection, and Enter opens the row: its card in the inspector
 * (`cardHref`, `onOpen`), as the link does (useRowKeys). While a card is
 * shown beside the table (`current`), its row is the cursor's, and j and
 * k show the next card or the one before instead (`onMove`), from either
 * end of the page the card on the page beyond it.
 *
 * The selected cards the query keeps (on any page; one it hides stays
 * selected, but is left alone) can be edited at once, from the bar under
 * the table (BulkBar, CardBulkActions; `.` opens its first menu):
 * each edit is planned on them (`plan`) and made (`onEdit`), then the
 * status line says what it did, with a way to undo it (`lastEdit`,
 * `onUndo`) until the next edit, or until the page is left. A plain
 * text card's front and back, each in one language, are edited in their
 * cells too (EditableCell), as an edit of that card alone, which Undo
 * undoes the same way. Deleted
 * cards leave the selection. Their review states can be forgotten or
 * set due on a day (`onReviewEdit`); the status line then says how many
 * cards changed (`reviewDone`), with no undo. They can be moved or
 * copied to another of the instance's decks (`decks`, `onTransfer`);
 * the status line then says how many went where, how many got a new id
 * there and how many it had already (`transferDone`). Moved cards leave
 * the selection. While the deck may not be changed (`readOnly`: the
 * instance's data is being checked, or the deck is set aside), cards are
 * still found and selected, but no edit is offered, and a line says why,
 * with a link to the deck's health.
 *
 * Each card's lapses (`lapses`, from the answer log; a dash while it is
 * read, or when it cannot be, `lapsesFailed`) count its wrong answers
 * since the month of the deck's first answer in the log, which the row
 * of filters names at its end.
 * While the deck may not be changed, a line says why, with a link to
 * its health (`healthHref`).
 */
export function CardWorkbenchScreen({
  deck,
  course,
  rows,
  total,
  languages,
  lapses,
  lapsesFailed,
  healthHref,
  query,
  onQuery,
  savedViews,
  onSavedViews,
  cardHref,
  onOpen,
  current,
  onMove,
  plan,
  onEdit,
  lastEdit,
  undone,
  onUndo,
  today,
  onReviewEdit,
  reviewDone,
  decks,
  onTransfer,
  transferDone,
  readOnly,
  busy,
  error,
}: {
  deck: Deck;
  /** The deck is a copy of a course: its cards are the course's questions. */
  course: boolean;
  /** The cards the query keeps, in its order. */
  rows: readonly CardRow[];
  /** How many cards the deck has. */
  total: number;
  /** The languages the language filter offers (cardLanguages), with the query's own. */
  languages: readonly string[];
  /** How often each card was forgotten; absent while the answer log is read. */
  lapses: LapseIndex | undefined;
  /** The answer log could not be read. */
  lapsesFailed: boolean;
  /** The deck's health, where data set aside is repaired. */
  healthHref: string;
  query: CardQuery;
  onQuery: (query: CardQuery) => void;
  /** The views of the workbench the user saved, and keeping them as they change. */
  savedViews: readonly SavedView[];
  onSavedViews: (views: SavedView[]) => void;
  cardHref: (card: Card) => string;
  onOpen: (card: Card) => void;
  /** The card shown beside the table, by its URL. */
  current?: string;
  /** Show another card beside the table, as j and k ask. */
  onMove?: (card: Card) => void;
  /** What an edit of the cards of these ids would do. */
  plan: (ids: readonly string[], edit: CardEdit) => CardEditPlan;
  /** Make the edit as planned; whether it was made. */
  onEdit: (ids: readonly string[], edit: CardEdit, plan: CardEditPlan) => Promise<boolean>;
  /** The last edit made on this page, while it can be undone. */
  lastEdit: CardEditMade | null;
  /** The last edit was undone. */
  undone: boolean;
  onUndo: () => void;
  /** Today's study day. */
  today: string;
  /** Make an edit of the review states of the cards of these ids; whether it was made. */
  onReviewEdit: (ids: readonly string[], edit: ReviewEdit) => Promise<boolean>;
  /** The last edit of review states made on this page. */
  reviewDone: ReviewEditMade | null;
  /** The decks cards can be moved or copied to: the instance's others. */
  decks: readonly Deck[];
  /** Move or copy the cards of these ids; whether it was made. */
  onTransfer: (ids: readonly string[], transfer: CardTransfer) => Promise<boolean>;
  /** The last move or copy made on this page. */
  transferDone: TransferMade | null;
  /** Why the deck may not be changed now (useDataCheck); null when it may. */
  readOnly: ReadOnlyReason | null;
  /** An edit, or its undo, is being made. */
  busy: boolean;
  error: ErrorText | null;
}) {
  const { t, tx, readerText, partLang, languageLabel, formatDate, formatMonth } = useI18n();
  const [chosen, setChosen] = useState<Selection>(NO_SELECTION);
  // Why the last side edited in its cell was not saved, until another is.
  const [refusal, setRefusal] = useState<SkipReason | null>(null);

  const selected = useMemo(
    () => rows.filter((row) => chosen.has(row.card.url)).map((row) => row.card),
    [rows, chosen],
  );
  const ids = useMemo(() => selected.map((card) => card.id), [selected]);
  /** Planned again only when the selection or its cards change: a preview plans every selected card. */
  const planSelected = useCallback((edit: CardEdit) => plan(ids, edit), [plan, ids]);
  const page = paginate([...rows], query.page, query.size);
  const shown = page.items;
  const count = chosen.size;
  /** Cards leave the selection, once they leave the deck. */
  const unselect = (cards: readonly Card[]) =>
    setChosen((all) =>
      toggled(
        all,
        cards.map((card) => card.url),
        false,
      ),
    );
  const editSaid =
    lastEdit === null
      ? ""
      : t(`studio.cardBulk.done.${doneKey(lastEdit.edit)}`, {
          count: lastEdit.plan.save.length + lastEdit.plan.remove.length,
        }) +
        (lastEdit.plan.skipped.length > 0
          ? ` ${t("studio.cardBulk.skipped", { count: lastEdit.plan.skipped.length })}`
          : "");
  const reviewSaid =
    reviewDone === null
      ? ""
      : reviewDone.count === 0
        ? t("studio.cardBulk.notStudied")
        : reviewDone.edit.kind === "reset"
          ? t("studio.cardBulk.done.reset", { count: reviewDone.count })
          : t("studio.cardBulk.done.reschedule", {
              count: reviewDone.count,
              due: formatDate(reviewDone.edit.due),
            });
  // The Studio's activity keeps what each status line said.
  useActivity(lastEdit, () => editSaid);
  useActivity(undone, () => t("studio.cardBulk.undone"));
  useActivity(reviewDone, () => reviewSaid);
  useActivity(transferDone, () => transferText(transferDone!, { t, readerText }));
  /** A filter changed: from the first page. */
  const filter = (change: Partial<CardQuery>) => onQuery({ ...query, ...change, page: 1 });
  const choice = <K extends "lang" | "state" | "has">(key: K, value: string) => {
    const { [key]: _old, ...rest } = query;
    onQuery({ ...rest, ...(value === "" ? {} : { [key]: value }), page: 1 } as CardQuery);
  };

  // A language the URL names but the cards' sides do not have (one of
  // the notes', say) is still offered, so the filter shows and clears.
  const langOptions =
    query.lang === undefined || languages.includes(query.lang)
      ? languages
      : [...languages, query.lang];
  /**
   * How a side of a card is edited in its cell: only a plain text one's,
   * in one language that is stated, its field marked with that language
   * (an Arabic side's reads right to left, in its font), while the deck
   * may be changed; as an edit of that card alone, one that changes
   * nothing saved at once, one that would leave the side empty refused,
   * and why said.
   */
  const textEdit = (card: Card, side: "front" | "back"): CellEdit | null => {
    const tags = Object.keys(card[side]);
    if (readOnly !== null || isMarkdown(card.textFormat) || tags.length !== 1 || tags[0] === "")
      return null;
    const tag = tags[0]!;
    return {
      label: t("studio.inline.field", {
        column: t(`studio.cards.column.${side}`),
        row: cardName(card, readerText),
      }),
      shown: card[side][tag]!,
      value: card[side][tag]!,
      lang: partLang(tag),
      onSave: (text) => {
        const edit: CardEdit = { kind: "setText", side, tag, text };
        const planned = plan([card.id], edit);
        const reason = planned.save.length === 0 ? planned.skipped[0]!.reason : null;
        setRefusal(reason === "unchanged" ? null : reason);
        return reason === null
          ? onEdit([card.id], edit, planned)
          : Promise.resolve(reason === "unchanged");
      },
    };
  };
  const none = (
    <>
      <span aria-hidden="true">–</span>
      <span class="visually-hidden">{t("studio.cards.notStudied")}</span>
    </>
  );
  const columns: Column<CardRow>[] = [
    {
      key: "back",
      label: t("studio.cards.column.back"),
      cell: ({ card }) => (
        <EditableCell edit={textEdit(card, "back")}>
          <CardRowBack
            back={card.back}
            imageUrl={card.backImageUrl}
            imageDescription={card.backImageDescription}
            textFormat={card.textFormat}
          />
        </EditableCell>
      ),
    },
    {
      key: "due",
      label: t("studio.cards.column.due"),
      cell: ({ due }) => (due === undefined ? none : formatDate(due)),
    },
    {
      key: "interval",
      label: t("studio.cards.column.interval"),
      number: true,
      cell: ({ intervalDays }) =>
        intervalDays === undefined ? none : t("studio.cards.days", { count: intervalDays }),
    },
    {
      key: "ease",
      label: t("studio.cards.column.ease"),
      number: true,
      cell: ({ easeFactor }) => (easeFactor === undefined ? none : easeFactor.toFixed(2)),
    },
    {
      key: "lapses",
      label: t("studio.cards.column.lapses"),
      number: true,
      cell: ({ lapses }) => lapses ?? <span aria-hidden="true">–</span>,
    },
    {
      key: "created",
      label: t("studio.cards.column.created"),
      cell: ({ card }) => formatDate(card.createdAt),
    },
    { key: "id", label: t("studio.cards.column.id"), cell: ({ card }) => <code>{card.id}</code> },
  ];
  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: [string, string][],
  ) => (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section>
      <header>
        <h2>{tx("studio.cards.heading", { deck: <ReaderText text={deck.title} /> })}</h2>
        {course && <span class="studio-badge">{t("studio.decks.badge.course")}</span>}
      </header>
      {course && <p class="hint">{t("studio.cards.courseHint")}</p>}
      <ReadOnlyNotice reason={readOnly} subject="deck" healthHref={healthHref} />
      {lastEdit !== null && (
        <div class="studio-selection">
          <p role="status">{editSaid}</p>
          <button type="button" disabled={busy || readOnly !== null} onClick={onUndo}>
            {t("studio.cardBulk.undo")}
          </button>
        </div>
      )}
      {undone && <p role="status">{t("studio.cardBulk.undone")}</p>}
      {reviewDone !== null && <p role="status">{reviewSaid}</p>}
      {transferDone !== null && (
        <p role="status">{transferText(transferDone, { t, readerText })}</p>
      )}
      <ErrorMessage error={error} />
      {refusal !== null && (
        <p class="error" role="alert">
          {t("studio.inline.refused", { reason: t(`studio.cardBulk.reasons.${refusal}`) })}
        </p>
      )}
      {total === 0 ? (
        <p>{t("studio.cards.empty")}</p>
      ) : (
        <>
          <div class="studio-views" role="group" aria-label={t("studio.views.label")}>
            {CARD_VIEWS.map((each) => (
              <button
                key={each}
                type="button"
                aria-pressed={cardViewOf(query) === each}
                onClick={() => onQuery(withCardView(query, each))}
              >
                {t(`studio.views.cards.${each}`)}
              </button>
            ))}
            <SavedViews
              views={savedViews}
              current={paramsText(cardParams(query))}
              onApply={(params) => onQuery(queryFromParams(new URLSearchParams(params)))}
              onViews={onSavedViews}
            />
          </div>
          <div class="studio-filters">
            <label class="studio-filter">
              {t("studio.cards.search")}
              <input
                type="search"
                aria-keyshortcuts="/"
                value={query.text}
                onInput={(event) => filter({ text: event.currentTarget.value })}
              />
            </label>
            {select(
              t("studio.cards.field"),
              query.field,
              (field) => filter({ field: field as CardQuery["field"] }),
              CARD_FIELDS.map((field) => [field, t(`studio.cards.fields.${field}`)]),
            )}
            {select(t("studio.cards.lang"), query.lang ?? "", (lang) => choice("lang", lang), [
              ["", t("studio.cards.anyLang")],
              ...langOptions.map((tag): [string, string] => [
                tag,
                tag === UNSTATED ? t("studio.cards.unstated") : languageLabel(tag),
              ]),
            ])}
            {select(t("studio.cards.state"), query.state ?? "", (state) => choice("state", state), [
              ["", t("studio.cards.anyState")],
              ...CARD_STATES.map((state): [string, string] => [
                state,
                t(`studio.cards.states.${state}`),
              ]),
            ])}
            {select(t("studio.cards.has"), query.has ?? "", (has) => choice("has", has), [
              ["", t("studio.cards.anything")],
              ...CARD_FEATURES.map((feature): [string, string] => [
                feature,
                t(`studio.cards.features.${feature}`),
              ]),
            ])}
            {select(
              t("studio.cards.pageSize"),
              String(query.size),
              (size) => filter({ size: Number(size) as CardPageSize }),
              CARD_PAGE_SIZES.map((size) => [String(size), String(size)]),
            )}
            <p class="hint">{t("studio.cards.shown", { shown: rows.length, count: total })}</p>
            <p class="hint">
              {lapsesFailed
                ? t("studio.cards.lapsesFailed")
                : lapses === undefined
                  ? t("studio.cards.lapsesLoading")
                  : lapses.since === null
                    ? t("studio.cards.lapsesNone")
                    : t("studio.cards.lapsesSince", { month: formatMonth(lapses.since) })}
            </p>
          </div>
          {rows.length === 0 ? (
            <p>{t("studio.cards.noMatch")}</p>
          ) : (
            <>
              <DataTable
                caption={tx("studio.cards.caption", { deck: <ReaderText text={deck.title} /> })}
                class="studio-cards"
                rows={shown}
                keyOf={(row) => row.card.url}
                classOf={(row) => (row.card.retired ? "retired" : undefined)}
                name={{
                  key: "front",
                  label: t("studio.cards.column.front"),
                  cell: ({ card }) => (
                    <EditableCell edit={textEdit(card, "front")} link>
                      <a href={cardHref(card)}>
                        <CardRowFront
                          front={card.front}
                          back={card.back}
                          imageUrl={card.frontImageUrl}
                          imageDescription={card.frontImageDescription}
                          textFormat={card.textFormat}
                        />
                        {card.retired && <RetiredTag />}
                      </a>
                    </EditableCell>
                  ),
                }}
                columns={columns}
                columnsOf="cards"
                sort={query.sort}
                // Sorted afresh: from the first page.
                onSort={(key) => {
                  const { sort: _old, ...rest } = query;
                  const sort = nextSort(query.sort, key as CardSort);
                  onQuery({ ...rest, page: 1, ...(sort === undefined ? {} : { sort }) });
                }}
                select={{
                  label: t("studio.cards.select"),
                  allLabel: t("studio.cards.selectAll"),
                  rowLabel: ({ card }) =>
                    t("studio.cards.selectCard", { card: cardName(card, readerText) }),
                  chosen,
                  onChoose: setChosen,
                }}
                current={current}
                around={{
                  ...(page.firstIndex === 0 ? {} : { previous: rows[page.firstIndex - 1]! }),
                  ...(page.firstIndex + shown.length === rows.length
                    ? {}
                    : { next: rows[page.firstIndex + shown.length]! }),
                }}
                onMove={onMove === undefined ? undefined : (row) => onMove(row.card)}
                onOpen={(row) => onOpen(row.card)}
              />
              {page.pageCount > 1 && (
                <Pager
                  page={page.currentPage}
                  pageCount={page.pageCount}
                  onPageChange={(to) => onQuery({ ...query, page: to })}
                />
              )}
            </>
          )}
          <BulkBar
            label={t("studio.cardBulk.label")}
            count={count}
            said={t("studio.cards.selected", { count })}
            onClear={() => setChosen(NO_SELECTION)}
          >
            {selected.length > 0 && readOnly === null && (
              <CardBulkActions
                cards={selected}
                languages={languages}
                busy={busy}
                plan={planSelected}
                onEdit={(edit, planned) =>
                  onEdit(ids, edit, planned).then((ok) => {
                    if (ok && edit.kind === "remove") unselect(selected);
                    return ok;
                  })
                }
                today={today}
                onReviewEdit={(edit) => onReviewEdit(ids, edit)}
                decks={decks}
                onTransfer={(transfer) =>
                  onTransfer(ids, transfer).then((ok) => {
                    if (ok && transfer.mode === "move") unselect(selected);
                    return ok;
                  })
                }
              />
            )}
          </BulkBar>
          <p class="hint studio-keys">
            {tx("studio.cards.keys", {
              j: <kbd>j</kbd>,
              k: <kbd>k</kbd>,
              x: <kbd>x</kbd>,
              enter: <kbd>Enter</kbd>,
              shiftJ: <Keys keys="Shift+J" />,
              shiftK: <Keys keys="Shift+K" />,
              escape: <kbd>Escape</kbd>,
              f2: <kbd>F2</kbd>,
              dot: <kbd>.</kbd>,
            })}
          </p>
        </>
      )}
    </section>
  );
}

/** What a move or copy did: how many cards went where, how many got a new id, how many were there already. */
function transferText(
  { transfer, plan }: TransferMade,
  { t, readerText }: Pick<I18n, "t" | "readerText">,
): string {
  const renamed = plan.cards.filter((card) => card.to !== card.from).length;
  const present = plan.cards.filter((card) => card.present).length;
  const parts = [
    t(`studio.cardBulk.transfer.${transfer.mode === "move" ? "moved" : "copied"}`, {
      count: plan.cards.length,
      deck: readerText(transfer.to.title),
    }),
    ...(renamed > 0 ? [t("studio.cardBulk.transfer.renamed", { count: renamed })] : []),
    ...(present > 0 ? [t("studio.cardBulk.transfer.present", { count: present })] : []),
    ...(plan.missing.length > 0
      ? [t("studio.cardBulk.skipped", { count: plan.missing.length })]
      : []),
  ];
  return parts.join(" ");
}
