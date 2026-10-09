import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { Deck, DeckDirection } from "@solid-memo/domain/deck";
import type { DeckPace } from "@solid-memo/domain/deckPace";
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
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { LoadingDots } from "@solid-memo/ui/Loading";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { DeckBulkActions } from "./DeckBulkActions";

/** One figure of a deck's row: a number, or why there is none yet. */
export type Count = number | "loading" | "unreadable";

/** What a deck is, beside its name: a copy of a library deck or of a course, or one whose data is invalid or could not be read. */
export type DeckBadge = "library" | "course" | "invalid" | "unreadable";

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
 * other way, then not), else the order the user arranged the decks in.
 *
 * Rows are selected by their checkbox, or all those shown at once, and
 * DeckBulkActions does what can be done with those shown, in the
 * table's order, one action at a time: a deck the filter hides stays
 * selected, but is left alone until shown again. A deck's name opens
 * what it says of itself (`deckHref`), its number of cards its cards in
 * the Studio's card workbench (`cardsHref`). The header links to the
 * groups, to the instance's name and catalogue (`instanceHref`) and to
 * its health (`healthHref`) and to its copies of library releases
 * (`libraryHref`); each deck's name has its health beside it
 * (`healthBadge`), and for a library copy whether a newer release is out
 * (`updateBadge`).
 */
export function DeckTableScreen({
  instance,
  rows,
  view,
  onView,
  pending,
  badges,
  groups,
  readOnly,
  deckHref,
  cardsHref,
  appHref,
  groupsHref,
  instanceHref,
  healthHref,
  healthBadge,
  libraryHref,
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
  /** Why a deck's figure is not in its row yet. */
  pending: (deck: Deck, figure: DeckFigure) => "loading" | "unreadable";
  badges: (deck: Deck) => readonly DeckBadge[];
  /** Every group, each with its trail, to move decks into. */
  groups: readonly { group: DeckGroup; trail: readonly DeckGroup[] }[];
  /** A newer version arranged the decks, so none can be moved. */
  readOnly: boolean;
  deckHref: (deck: Deck) => string;
  cardsHref: (deck: Deck) => string;
  /** Solid Memo, open at the instance's decks. */
  appHref: string;
  /** The Groups screen. */
  groupsHref: string;
  /** The instance's name and catalogue. */
  instanceHref: string;
  /** The instance's health. */
  healthHref: string;
  /** A deck's health, as a badge beside its name. */
  healthBadge: (deck: Deck) => ComponentChildren;
  /** The instance's copies of library releases. */
  libraryHref: string;
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
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  if (rows.length === 0) {
    return (
      <section>
        <header>
          <h2>{t("studio.decks.heading")}</h2>
          <a href={instanceHref}>{t("studio.decks.instanceLink")}</a>
        </header>
        <p class="hint">{tx("studio.decks.empty", { app: <a href={appHref}>{t("app.documentTitle")}</a> })}</p>
      </section>
    );
  }

  const shown = arrangeDeckRows(rows, view, readerText, locale);
  // Only decks shown, in the table's order: one filtered out, or deleted here or elsewhere, is left alone.
  const selected = shown.map((row) => row.deck).filter((deck) => chosen.has(deck.url));
  const count = selected.length;
  const allShown = shown.length > 0 && shown.every((row) => chosen.has(row.deck.url));

  const toggle = (urls: readonly string[], on: boolean) =>
    setChosen((all) => new Set(on ? [...all, ...urls] : [...all].filter((url) => !urls.includes(url))));

  /** Makes a bulk action; once it is done, says so (and, after a deletion, nothing stays selected). */
  async function bulk(made: Promise<boolean>, said: string, clear = false): Promise<boolean> {
    setBusy(true);
    setAnnouncement("");
    const ok = await made;
    setBusy(false);
    if (ok) {
      setAnnouncement(said);
      if (clear) setChosen(new Set());
    }
    return ok;
  }

  const sortOf = (column: DeckColumn) =>
    view.sort?.column !== column ? undefined : view.sort.descending ? "descending" : "ascending";
  const header = (column: DeckColumn) => (
    <th key={column} scope="col" class={NUMBERS.has(column) ? "number" : undefined} aria-sort={sortOf(column)}>
      <button type="button" class="sort" onClick={() => onView(nextSort(view, column))}>
        {t(`studio.decks.${column}`)}
      </button>
    </th>
  );
  const figure = (row: DeckTableRow, which: DeckFigure): Count => row.figures[which] ?? pending(row.deck, which);
  const pace = (row: DeckTableRow, cap: "newCardsPerDay" | "maxReviewsPerDay") => (
    <>
      {row[cap]}
      {row.deck[cap] === undefined && <span class="hint"> {t("studio.decks.followsInstance")}</span>}
    </>
  );

  return (
    <section>
      <header>
        <h2>{t("studio.decks.heading")}</h2>
        <a href={groupsHref}>{t("studio.decks.groupsLink")}</a> <a href={instanceHref}>{t("studio.decks.instanceLink")}</a>{" "}
        <a href={healthHref}>{t("studio.decks.healthLink")}</a> <a href={libraryHref}>{t("studio.decks.libraryLink")}</a>
      </header>
      <label class="studio-filter">
        {t("studio.decks.filter")}
        <input type="search" value={view.filter} onInput={(event) => onView({ ...view, filter: event.currentTarget.value })} />
      </label>
      {view.filter.trim() !== "" && (
        <p class="hint">{t("studio.decks.shown", { shown: shown.length, count: rows.length })}</p>
      )}
      {count > 0 && (
        <DeckBulkActions
          selected={selected}
          groups={groups}
          readOnly={readOnly}
          busy={busy}
          onMove={(parent) => {
            const group = groups.find((entry) => entry.group.url === parent)?.group ?? null;
            const name = group === null ? t("studio.bulk.topLevel") : readerText(group.title);
            return bulk(onMove(selected, group), t("studio.bulk.moved", { count, group: name }));
          }}
          onPace={(change) => bulk(onPace(selected, change), t("studio.bulk.paced", { count }))}
          onDirection={(direction) => bulk(onDirection(selected, direction), t("studio.bulk.directed", { count }))}
          onRemove={() => bulk(onRemove(selected), t("studio.bulk.removed", { count }), true)}
          onClear={() => setChosen(new Set())}
        />
      )}
      <p class="visually-hidden" role="status">
        {announcement}
      </p>
      <ErrorMessage error={error} />
      {shown.length === 0 ? (
        <p>{t("studio.decks.noMatch", { filter: view.filter.trim() })}</p>
      ) : (
        <div class="studio-table">
          <table class="studio-list">
            <caption>{t("studio.decks.caption", { instance: instance.name })}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span class="visually-hidden">{t("studio.decks.select")}</span>
                  <input
                    type="checkbox"
                    aria-label={t("studio.decks.selectAll")}
                    checked={allShown}
                    onChange={(event) => toggle(shown.map((row) => row.deck.url), event.currentTarget.checked)}
                  />
                </th>
                {header("title")}
                {COLUMNS.map(header)}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const { deck } = row;
                const cards = figure(row, "cards");
                return (
                  <tr key={deck.url}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t("studio.decks.selectDeck", { deck: readerText(deck.title) })}
                        checked={chosen.has(deck.url)}
                        onChange={(event) => toggle([deck.url], event.currentTarget.checked)}
                      />
                    </td>
                    <th scope="row">
                      <a href={deckHref(deck)}>
                        <ReaderText text={deck.title} />
                      </a>
                      {badges(deck).map((badge) => (
                        <span key={badge} class="studio-badge">
                          {t(`studio.decks.badge.${badge}`)}
                        </span>
                      ))}
                      {healthBadge(deck)}
                      {updateBadge(deck)}
                    </th>
                    <td>
                      {row.groups.length === 0 ? (
                        <span class="hint">{t("studio.decks.topLevel")}</span>
                      ) : (
                        row.groups.map((group) => readerText(group.title)).join(" › ")
                      )}
                    </td>
                    <td>{directionLabel(deck.direction)}</td>
                    <td class="number">{pace(row, "newCardsPerDay")}</td>
                    <td class="number">{pace(row, "maxReviewsPerDay")}</td>
                    <td class="number">
                      <CountCell count={figure(row, "due")} />
                    </td>
                    <td class="number">
                      <CountCell count={figure(row, "new")} />
                    </td>
                    <td>{formatDate(deck.modifiedAt ?? deck.createdAt)}</td>
                    <td class="number">
                      {typeof cards === "number" ? (
                        <a href={cardsHref(deck)}>
                          {cards}
                          <span class="visually-hidden"> {t("studio.decks.cardsOf", { deck: readerText(deck.title) })}</span>
                        </a>
                      ) : (
                        <CountCell count={cards} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A figure, or while it is counted a loader, or a dash for one that could not be read; each named for a screen reader. */
function CountCell({ count }: { count: Count }) {
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
