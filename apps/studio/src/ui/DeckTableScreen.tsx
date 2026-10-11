import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { DECK_DIRECTIONS, type Deck, type DeckDirection } from "@solid-memo/domain/deck";
import { paceOf, type DeckPace } from "@solid-memo/domain/deckPace";
import {
  arrangeDeckRows,
  nextSort,
  type DeckColumn,
  type DeckFigure,
  type DeckTableRow,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { LoadingDots } from "@solid-memo/ui/Loading";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { DeckBulkActions, type MoveLock } from "./DeckBulkActions";
import { ReadOnlyNotice } from "./ReadOnly";
import { useActivityLog } from "./shell/activity";
import { BulkBar } from "./shell/BulkBar";
import { DataTable, type Column } from "./shell/DataTable";
import { EditableCell } from "./shell/EditableCell";
import { SavedViews } from "./shell/SavedViews";
import { NO_SELECTION, type Selection } from "./shell/tableModel";
import { homeParams, homeQueryOf, HOME_VIEWS, inView, paramsText, type HomeQuery, type HomeView, type SavedView } from "./shell/views";

/** One figure of a deck's row: a number, or why there is none yet. */
export type Count = number | "loading" | "unreadable";

/**
 * What a deck is, beside its name: a copy of a library deck or of a
 * course, one of a release added from a link (the host it came from),
 * or one whose data is invalid or could not be read.
 */
export type DeckBadge = "library" | "course" | "invalid" | "unreadable" | { from: string };

/** The columns of figures, aligned to compare. */
const NUMBERS: ReadonlySet<DeckColumn> = new Set(["newCardsPerDay", "maxReviewsPerDay", "due", "new", "cards"]);

/** The columns, in the table's order, after the deck's name. */
const COLUMNS: readonly Exclude<DeckColumn, "title">[] = [
  "group",
  "direction",
  "newCardsPerDay",
  "maxReviewsPerDay",
  "due",
  "new",
  "modified",
  "cards",
];

/**
 * Home: every deck of the instance as a table, a row each, with the
 * groups it is in, how it is studied, its pace (its own, or the
 * instance's), today's figures as they come in, when it last changed and
 * its cards. The URL holds how it is looked at (`view`): a filter, and a
 * column to sort by (each column's header button sorts by it, then the
 * other way, then not), else the order the user arranged the decks in;
 * and the view it is in (`shownView`, views.ts), whose tabs above it
 * count the decks each keeps; beside them the views the user saved
 * (`savedViews`, SavedViews), each a query to put Home in (`onApply`).
 * The table is a DataTable, whose Columns
 * menu shows or hides its columns. The deck at its cursor is shown
 * beside it (`onCursor`, `current`); Enter opens it (`onOpen`).
 *
 * Rows are selected by their checkbox, or all those shown at once, and
 * DeckBulkActions does what can be done with those shown, in the
 * table's order, one action at a time: a deck the filter hides stays
 * selected, but is left alone until shown again. A deck's name opens
 * what it says of itself (`deckHref`), its number of cards its cards in
 * the Studio's card workbench (`cardsHref`); the bulk actions' Export
 * opens import and export with the selected decks checked
 * (`transferHref`). Each deck's name has its health beside it
 * (`healthBadge`), and for a library copy whether a newer release is out
 * (`updateBadge`). Only a deck that may be changed (`selectable`) can be
 * selected: none while the instance's data is being checked, and none
 * set aside, which a line says (`readOnly`), with a link to the health.
 * Such a deck's direction and pace are edited in their cells too
 * (EditableCell), as the bulk actions change them, one deck at a time.
 */
export function DeckTableScreen({
  instance,
  rows,
  view,
  onView,
  shownView,
  onShow,
  savedViews,
  onSavedViews,
  onApply,
  current,
  onCursor,
  onOpen,
  pending,
  badges,
  groups,
  moveLocked,
  readOnly,
  selectable,
  deckHref,
  cardsHref,
  appHref,
  healthHref,
  healthBadge,
  transferHref,
  updateBadge,
  onMove,
  onPace,
  onDirection,
  onRemove,
  error,
}: {
  instance: Instance;
  /** Every deck's row, in the order the user arranged the decks. */
  rows: readonly DeckTableRow[];
  view: DeckTableView;
  onView: (view: DeckTableView) => void;
  /** The view of Home the table is in (views.ts). */
  shownView: HomeView;
  onShow: (view: HomeView) => void;
  /** The views of Home the user saved, and keeping them as they change. */
  savedViews: readonly SavedView[];
  onSavedViews: (views: SavedView[]) => void;
  /** Put Home in a query, a saved view's. */
  onApply: (query: HomeQuery) => void;
  /** The deck shown beside the table, by its URL. */
  current?: string;
  /** Show the deck at the table's cursor beside it. */
  onCursor: (deck: Deck) => void;
  /** Open a deck's about screen, as Enter on its row asks. */
  onOpen: (deck: Deck) => void;
  /** Why a deck's figure is not in its row yet. */
  pending: (deck: Deck, figure: DeckFigure) => "loading" | "unreadable";
  badges: (deck: Deck) => readonly DeckBadge[];
  /** Every group, each with its trail, to move decks into. */
  groups: readonly { group: DeckGroup; trail: readonly DeckGroup[] }[];
  /** Why no deck can be moved into a group: a newer version arranged them, or the arrangement is set aside. */
  moveLocked: MoveLock | null;
  /** Why some decks, or all, cannot be selected now (useDataCheck); null when all can. */
  readOnly: ReadOnlyReason | null;
  /** Whether a deck may be changed, so selected. */
  selectable: (deck: Deck) => boolean;
  deckHref: (deck: Deck) => string;
  cardsHref: (deck: Deck) => string;
  /** Solid Memo, open at the instance's decks. */
  appHref: string;
  /** The instance's health. */
  healthHref: string;
  /** A deck's health, as a badge beside its name. */
  healthBadge: (deck: Deck) => ComponentChildren;
  /** Import and export, these decks checked to export. */
  transferHref: (decks: readonly Deck[]) => string;
  /** Whether the library has a newer release of a deck, as a badge beside its name. */
  updateBadge: (deck: Deck) => ComponentChildren;
  /** Each resolves to whether it was done (the container says why not, through `error`). */
  onMove: (decks: readonly Deck[], parent: DeckGroup | null) => Promise<boolean>;
  onPace: (decks: readonly Deck[], pace: DeckPace) => Promise<boolean>;
  onDirection: (decks: readonly Deck[], direction: DeckDirection) => Promise<boolean>;
  onRemove: (decks: readonly Deck[]) => Promise<boolean>;
  /** Why the last bulk action was not made. */
  error: ErrorText | null;
}) {
  const { t, tx, locale, readerText, directionLabel, formatDate } = useI18n();
  const [chosen, setChosen] = useState<Selection>(NO_SELECTION);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const log = useActivityLog();

  if (rows.length === 0) {
    return (
      <section>
        <header>
          <h2>{t("studio.decks.heading")}</h2>
        </header>
        <p class="hint">{tx("studio.decks.empty", { app: <a href={appHref}>{t("app.documentTitle")}</a> })}</p>
      </section>
    );
  }

  const figure = (row: DeckTableRow, which: DeckFigure): Count => row.figures[which] ?? pending(row.deck, which);
  const factsOf = (row: DeckTableRow) => ({ due: figure(row, "due"), badges: badges(row.deck) });
  const shown = arrangeDeckRows(
    rows.filter((row) => inView(shownView, factsOf(row))),
    view,
    readerText,
    locale,
  );
  // Only decks shown, in the table's order: one filtered out, or deleted here or elsewhere, is left alone.
  const selected = shown.map((row) => row.deck).filter((deck) => chosen.has(deck.url) && selectable(deck));
  const count = selected.length;

  /** Makes a bulk action; once it is done, says so, the Studio's activity too (and, after a deletion, nothing stays selected). */
  async function bulk(made: Promise<boolean>, said: string, clear = false): Promise<boolean> {
    setBusy(true);
    setAnnouncement("");
    const ok = await made;
    setBusy(false);
    if (ok) {
      setAnnouncement(said);
      log(said);
      if (clear) setChosen(NO_SELECTION);
    }
    return ok;
  }

  /** What a deck's cell is, for its field's name: "New per day of Kanji N5". */
  const fieldOf = (column: DeckColumn, deck: Deck) => t("studio.inline.field", { column: t(`studio.decks.${column}`), row: readerText(deck.title) });
  const pace = ({ deck, ...row }: DeckTableRow, cap: "newCardsPerDay" | "maxReviewsPerDay") => {
    const follows = deck[cap] === undefined;
    return (
      <EditableCell
        edit={
          selectable(deck)
            ? {
                label: fieldOf(cap, deck),
                shown: follows ? `${row[cap]} ${t("studio.decks.followsInstance")}` : String(row[cap]),
                // Empty, the instance's pace again.
                value: follows ? "" : String(deck[cap]),
                number: true,
                onSave: (value) => {
                  const { [cap]: _old, ...rest } = paceOf(deck);
                  const change = value.trim() === "" ? rest : { ...rest, [cap]: Number(value) };
                  return bulk(onPace([deck], change), t("studio.bulk.paced", { count: 1 }));
                },
              }
            : null
        }
      >
        {row[cap]}
        {follows && <span class="hint"> {t("studio.decks.followsInstance")}</span>}
      </EditableCell>
    );
  };
  const cells: Record<Exclude<DeckColumn, "title">, (row: DeckTableRow) => ComponentChildren> = {
    group: (row) =>
      row.groups.length === 0 ? <span class="hint">{t("studio.decks.topLevel")}</span> : row.groups.map((group) => readerText(group.title)).join(" › "),
    direction: ({ deck }) => (
      <EditableCell
        edit={
          selectable(deck)
            ? {
                label: fieldOf("direction", deck),
                shown: directionLabel(deck.direction),
                value: deck.direction,
                options: DECK_DIRECTIONS.map((direction) => ({ value: direction, label: directionLabel(direction) })),
                onSave: (value) => bulk(onDirection([deck], value as DeckDirection), t("studio.bulk.directed", { count: 1 })),
              }
            : null
        }
      >
        {directionLabel(deck.direction)}
      </EditableCell>
    ),
    newCardsPerDay: (row) => pace(row, "newCardsPerDay"),
    maxReviewsPerDay: (row) => pace(row, "maxReviewsPerDay"),
    due: (row) => <CountCell count={figure(row, "due")} />,
    new: (row) => <CountCell count={figure(row, "new")} />,
    modified: (row) => formatDate(row.deck.modifiedAt ?? row.deck.createdAt),
    cards: (row) => {
      const cards = figure(row, "cards");
      return typeof cards === "number" ? (
        <a href={cardsHref(row.deck)}>
          {cards}
          <span class="visually-hidden"> {t("studio.decks.cardsOf", { deck: readerText(row.deck.title) })}</span>
        </a>
      ) : (
        <CountCell count={cards} />
      );
    },
  };
  const columns: Column<DeckTableRow>[] = COLUMNS.map((column) => ({
    key: column,
    label: t(`studio.decks.${column}`),
    number: NUMBERS.has(column),
    cell: cells[column],
  }));

  return (
    <section>
      <header>
        <h2>{t("studio.decks.heading")}</h2>
      </header>
      <div class="studio-views" role="group" aria-label={t("studio.views.label")}>
        {HOME_VIEWS.map((each) => (
          <button key={each} type="button" aria-pressed={each === shownView} onClick={() => onShow(each)}>
            {t(`studio.views.${each}`)} <span class="studio-count">{rows.filter((row) => inView(each, factsOf(row))).length}</span>
          </button>
        ))}
        <SavedViews
          views={savedViews}
          current={paramsText(homeParams({ view, ...(shownView === "all" ? {} : { show: shownView }) }))}
          onApply={(params) => onApply(homeQueryOf(new URLSearchParams(params)))}
          onViews={onSavedViews}
        />
      </div>
      <div class="studio-filters">
        <label class="studio-filter">
          {t("studio.decks.filter")}
          <input
            type="search"
            aria-keyshortcuts="/"
            value={view.filter}
            onInput={(event) => onView({ ...view, filter: event.currentTarget.value })}
          />
        </label>
        {(view.filter.trim() !== "" || shownView !== "all") && (
          <p class="hint">{t("studio.decks.shown", { shown: shown.length, count: rows.length })}</p>
        )}
      </div>
      <p class="visually-hidden" role="status">
        {announcement}
      </p>
      <ReadOnlyNotice reason={readOnly} subject="decks" healthHref={healthHref} />
      <ErrorMessage error={error} />
      {shown.length === 0 ? (
        <p>{view.filter.trim() === "" ? t("studio.views.none") : t("studio.decks.noMatch", { filter: view.filter.trim() })}</p>
      ) : (
        <DataTable
          caption={t("studio.decks.caption", { instance: instance.name })}
          rows={shown}
          keyOf={(row) => row.deck.url}
          name={{
            key: "title",
            label: t("studio.decks.title"),
            cell: ({ deck }) => (
              <>
                <a href={deckHref(deck)}>
                  <ReaderText text={deck.title} />
                </a>
                {badges(deck).map((badge) =>
                  typeof badge === "string" ? (
                    <span key={badge} class="studio-badge">
                      {t(`studio.decks.badge.${badge}`)}
                    </span>
                  ) : (
                    <span key="from" class="studio-badge">
                      {t("studio.decks.badge.from", { host: badge.from })}
                    </span>
                  ),
                )}
                {healthBadge(deck)}
                {updateBadge(deck)}
              </>
            ),
          }}
          columns={columns}
          columnsOf="decks"
          sort={view.sort === undefined ? undefined : { key: view.sort.column, descending: view.sort.descending }}
          onSort={(column) => onView(nextSort(view, column as DeckColumn))}
          select={{
            label: t("studio.decks.select"),
            allLabel: t("studio.decks.selectAll"),
            rowLabel: ({ deck }) => t("studio.decks.selectDeck", { deck: readerText(deck.title) }),
            enabled: ({ deck }) => selectable(deck),
            chosen,
            onChoose: setChosen,
          }}
          current={current}
          onCursor={({ deck }) => onCursor(deck)}
          onOpen={({ deck }) => onOpen(deck)}
        />
      )}
      <BulkBar label={t("studio.bulk.label")} count={count} said={t("studio.bulk.selected", { count })} onClear={() => setChosen(NO_SELECTION)}>
        <DeckBulkActions
          selected={selected}
          groups={groups}
          moveLocked={moveLocked}
          busy={busy}
          exportHref={transferHref(selected)}
          onMove={(parent) => {
            const group = groups.find((entry) => entry.group.url === parent)?.group ?? null;
            const name = group === null ? t("studio.bulk.topLevel") : readerText(group.title);
            return bulk(onMove(selected, group), t("studio.bulk.moved", { count, group: name }));
          }}
          onPace={(change) => bulk(onPace(selected, change), t("studio.bulk.paced", { count }))}
          onDirection={(direction) => bulk(onDirection(selected, direction), t("studio.bulk.directed", { count }))}
          onRemove={() => bulk(onRemove(selected), t("studio.bulk.removed", { count }), true)}
        />
      </BulkBar>
    </section>
  );
}

/** A figure, or while it is counted a loader, or a dash for one that could not be read; each named for a screen reader. */
export function CountCell({ count }: { count: Count }) {
  const { t } = useI18n();
  if (typeof count === "number") return <>{count}</>;
  return count === "loading" ? (
    <>
      <LoadingDots />
      <span class="visually-hidden">{t("studio.decks.counting")}</span>
    </>
  ) : (
    <>
      <span aria-hidden="true">–</span>
      <span class="visually-hidden">{t("studio.decks.unreadable")}</span>
    </>
  );
}
