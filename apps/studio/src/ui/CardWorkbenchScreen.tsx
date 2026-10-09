import { useEffect, useRef, useState } from "preact/hooks";
import {
  CARD_FEATURES,
  CARD_FIELDS,
  CARD_PAGE_SIZES,
  CARD_STATES,
  nextCardSort,
  UNSTATED,
  type CardPageSize,
  type CardQuery,
  type CardRow,
  type CardSort,
} from "@solid-memo/domain/cardQuery";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { CardRowBack, CardRowFront } from "@solid-memo/ui/CardFace";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { paginate, Pager } from "@solid-memo/ui/Pager";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { RetiredTag } from "@solid-memo/ui/RetiredCards";

/** The columns after the card's front, each sorted by its key. */
const COLUMNS: readonly Exclude<CardSort, "front">[] = ["back", "due", "interval", "ease", "created", "id"];

/** The columns of figures, aligned to compare. */
const NUMBERS: ReadonlySet<CardSort> = new Set(["interval", "ease"]);

/** Whether a key goes to a field the user types or chooses in (the search, a filter), which keeps it. */
function typedInto(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ? target.type !== "checkbox" : target instanceof HTMLSelectElement;
}

/**
 * The card workbench: a deck's cards as a table, a row each, searched,
 * filtered and sorted as the URL says (`query`, which the domain applies:
 * `rows` are every card that matches, in order), a page at a time.
 * A column's header sorts by it, then the other way, then back to the
 * deck's own order; the sorted column says so (`aria-sort`).
 *
 * Cards are selected by their checkbox, or a page's at once; the
 * selection stays as the view changes, and a status line counts it.
 * The keys j and k move between the rows (the focus goes to the row's
 * link; from outside the table, to the first), x selects the row, and
 * Enter opens it: its card in Solid Memo's editor (`cardHref`,
 * `onOpen`), as the link does. They work wherever the focus is, the
 * page's body too, as a reload or a cleared selection leaves it.
 */
export function CardWorkbenchScreen({
  deck,
  course,
  rows,
  total,
  languages,
  query,
  onQuery,
  cardHref,
  onOpen,
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
  query: CardQuery;
  onQuery: (query: CardQuery) => void;
  cardHref: (card: Card) => string;
  onOpen: (card: Card) => void;
}) {
  const { t, tx, readerText, languageLabel, formatDate } = useI18n();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const page = paginate([...rows], query.page, query.size);
  const shown = page.items;
  const count = chosen.size;
  const allShown = shown.length > 0 && shown.every((row) => chosen.has(row.card.url));
  const toggle = (urls: readonly string[], on: boolean) =>
    setChosen((all) => new Set(on ? [...all, ...urls] : [...all].filter((url) => !urls.includes(url))));
  /** A filter changed: from the first page. */
  const filter = (change: Partial<CardQuery>) => onQuery({ ...query, ...change, page: 1 });
  const choice = <K extends "lang" | "state" | "has">(key: K, value: string) => {
    const { [key]: _old, ...rest } = query;
    onQuery({ ...rest, ...(value === "" ? {} : { [key]: value }), page: 1 } as CardQuery);
  };

  const onKeyRef = useRef(onKeyDown);
  onKeyRef.current = onKeyDown;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyRef.current(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || typedInto(event.target)) return;
    const links = [...(bodyRef.current?.querySelectorAll<HTMLAnchorElement>("tr > th a") ?? [])];
    const at = links.findIndex((link) => link.closest("tr")!.contains(document.activeElement));
    const row = at === -1 ? undefined : shown[at];
    switch (event.key) {
      case "j":
      case "k": {
        const next = event.key === "j" ? Math.min(at + 1, links.length - 1) : Math.max(at - 1, 0);
        links[next]?.focus();
        break;
      }
      case "x":
        if (row === undefined) return;
        toggle([row.card.url], !chosen.has(row.card.url));
        break;
      case "Enter":
        // The row's link opens the card itself.
        if (row === undefined || event.target instanceof HTMLAnchorElement) return;
        onOpen(row.card);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // A language the URL names but the cards' sides do not have (one of
  // the notes', say) is still offered, so the filter shows and clears.
  const langOptions =
    query.lang === undefined || languages.includes(query.lang) ? languages : [...languages, query.lang];
  const sortOf = (key: CardSort) =>
    query.sort?.key !== key ? undefined : query.sort.descending ? "descending" : "ascending";
  const header = (key: CardSort) => (
    <th key={key} scope="col" class={NUMBERS.has(key) ? "number" : undefined} aria-sort={sortOf(key)}>
      <button type="button" class="sort" onClick={() => onQuery(nextCardSort(query, key))}>
        {t(`studio.cards.column.${key}`)}
      </button>
    </th>
  );
  const none = (
    <>
      <span aria-hidden="true">–</span>
      <span class="visually-hidden">{t("studio.cards.notStudied")}</span>
    </>
  );
  const select = (label: string, value: string, onChange: (value: string) => void, options: [string, string][]) => (
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
      {total === 0 ? (
        <p>{t("studio.cards.empty")}</p>
      ) : (
        <>
          <div class="studio-filters">
            <label class="studio-filter">
              {t("studio.cards.search")}
              <input type="search" value={query.text} onInput={(event) => filter({ text: event.currentTarget.value })} />
            </label>
            {select(
              t("studio.cards.field"),
              query.field,
              (field) => filter({ field: field as CardQuery["field"] }),
              CARD_FIELDS.map((field) => [field, t(`studio.cards.fields.${field}`)]),
            )}
            {select(t("studio.cards.lang"), query.lang ?? "", (lang) => choice("lang", lang), [
              ["", t("studio.cards.anyLang")],
              ...langOptions.map((tag): [string, string] => [tag, tag === UNSTATED ? t("studio.cards.unstated") : languageLabel(tag)]),
            ])}
            {select(t("studio.cards.state"), query.state ?? "", (state) => choice("state", state), [
              ["", t("studio.cards.anyState")],
              ...CARD_STATES.map((state): [string, string] => [state, t(`studio.cards.states.${state}`)]),
            ])}
            {select(t("studio.cards.has"), query.has ?? "", (has) => choice("has", has), [
              ["", t("studio.cards.anything")],
              ...CARD_FEATURES.map((feature): [string, string] => [feature, t(`studio.cards.features.${feature}`)]),
            ])}
            {select(
              t("studio.cards.pageSize"),
              String(query.size),
              (size) => filter({ size: Number(size) as CardPageSize }),
              CARD_PAGE_SIZES.map((size) => [String(size), String(size)]),
            )}
          </div>
          <p class="hint">{t("studio.cards.shown", { shown: rows.length, count: total })}</p>
          <p class="hint studio-keys">
            {tx("studio.cards.keys", {
              j: <kbd>j</kbd>,
              k: <kbd>k</kbd>,
              x: <kbd>x</kbd>,
              enter: <kbd>Enter</kbd>,
            })}
          </p>
          <div class="studio-selection">
            <p role="status">{t("studio.cards.selected", { count })}</p>
            {count > 0 && (
              <button type="button" onClick={() => setChosen(new Set())}>
                {t("studio.cards.clear")}
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p>{t("studio.cards.noMatch")}</p>
          ) : (
            <>
              <div class="studio-table">
                <table class="studio-list studio-cards">
                  <caption>{tx("studio.cards.caption", { deck: <ReaderText text={deck.title} /> })}</caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span class="visually-hidden">{t("studio.cards.select")}</span>
                        <input
                          type="checkbox"
                          aria-label={t("studio.cards.selectAll")}
                          checked={allShown}
                          onChange={(event) => toggle(shown.map((row) => row.card.url), event.currentTarget.checked)}
                        />
                      </th>
                      {header("front")}
                      {COLUMNS.map(header)}
                    </tr>
                  </thead>
                  <tbody ref={bodyRef}>
                    {shown.map(({ card, due, intervalDays, easeFactor }) => (
                      <tr key={card.url} class={card.retired ? "retired" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={t("studio.cards.selectCard", { card: cardName(card, readerText) })}
                            checked={chosen.has(card.url)}
                            onChange={(event) => toggle([card.url], event.currentTarget.checked)}
                          />
                        </td>
                        <th scope="row">
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
                        </th>
                        <td>
                          <CardRowBack
                            back={card.back}
                            imageUrl={card.backImageUrl}
                            imageDescription={card.backImageDescription}
                            textFormat={card.textFormat}
                          />
                        </td>
                        <td>{due === undefined ? none : formatDate(due)}</td>
                        <td class="number">
                          {intervalDays === undefined ? none : t("studio.cards.days", { count: intervalDays })}
                        </td>
                        <td class="number">{easeFactor === undefined ? none : easeFactor.toFixed(2)}</td>
                        <td>{formatDate(card.createdAt)}</td>
                        <td>
                          <code>{card.id}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {page.pageCount > 1 && (
                <Pager page={page.currentPage} pageCount={page.pageCount} onPageChange={(to) => onQuery({ ...query, page: to })} />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
