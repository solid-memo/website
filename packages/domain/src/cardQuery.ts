import { isMarkdown, studyDirections, type Card, type DeckDirection } from "./deck";
import { canonicalTag } from "./languageTag";
import { folded, type LangText } from "./langText";
import { reviewKeyOf, type ReviewState } from "./review";
import { MATURE_INTERVAL_DAYS } from "./statistics";

/**
 * The Studio's card workbench (docs/studio.md): a deck's cards searched,
 * filtered and sorted as the URL says (`CardQuery`), a row each with the
 * review states of the directions the deck is studied in.
 */

/** Which texts of a card the search reads; "any" reads them all. */
export type CardField = "any" | "front" | "back" | "note" | "label" | "distractor";

export const CARD_FIELDS: readonly CardField[] = ["any", "front", "back", "note", "label", "distractor"];

/**
 * Where a card is: in use (live) or retired; and, for a card in use,
 * where its prompts are in their schedule. A prompt never reviewed is
 * new; one answered wrong last time (no successful repetition in a row)
 * is learning; one at an interval below MATURE_INTERVAL_DAYS is young,
 * and at it or above mature; one whose due day has come is due. A card
 * studied both ways is in a state when either of its prompts is.
 */
export type CardState = "live" | "retired" | "new" | "learning" | "young" | "mature" | "due";

export const CARD_STATES: readonly CardState[] = ["live", "retired", "new", "learning", "young", "mature", "due"];

/** What a card has: a picture on either side, distractors, Markdown text, or a note under either side. */
export type CardFeature = "picture" | "distractors" | "markdown" | "notes";

export const CARD_FEATURES: readonly CardFeature[] = ["picture", "distractors", "markdown", "notes"];

/** What the cards can be sorted by. */
export type CardSort = "id" | "created" | "front" | "back" | "due" | "interval" | "ease";

export const CARD_SORTS: readonly CardSort[] = ["id", "created", "front", "back", "due", "interval", "ease"];

/** How many cards a page shows. */
export const CARD_PAGE_SIZES = [10, 50, 200] as const;

export type CardPageSize = (typeof CARD_PAGE_SIZES)[number];

/** The language filter of the side texts whose language is not stated (untagged). */
export const UNSTATED = "unstated";

/**
 * How the workbench looks at a deck's cards: those whose texts in
 * `field` hold `text`, in the language `lang` when it is set (a tag, or
 * UNSTATED), in the `state` and with what `has` names, sorted by `sort`
 * (else in the deck's own order), one page of `size` at a time.
 */
export interface CardQuery {
  text: string;
  field: CardField;
  lang?: string;
  state?: CardState;
  has?: CardFeature;
  sort?: { key: CardSort; descending: boolean };
  /** 1-based. */
  page: number;
  size: CardPageSize;
}

export const DEFAULT_CARD_QUERY: CardQuery = { text: "", field: "any", page: 1, size: 50 };

/** A deck's review states, with the direction it is studied in: which prompts its cards make. */
export interface DeckReviews {
  direction: DeckDirection;
  states: readonly ReviewState[];
}

/** A card as the workbench lists it. */
export interface CardRow {
  card: Card;
  /** The card's review states, of the directions the deck is studied in. */
  states: readonly ReviewState[];
  /** Of those, the earliest due day, the shortest interval and the lowest ease: the prompt that needs the most work. */
  due?: string;
  intervalDays?: number;
  easeFactor?: number;
}

/** The query a route states; anything it does not know is left out (or, for the page and its size, as by default). */
export function queryFromParams(params: URLSearchParams): CardQuery {
  const pick = <T extends string>(name: string, values: readonly T[]): T | undefined => {
    const value = params.get(name);
    return value !== null && (values as readonly string[]).includes(value) ? (value as T) : undefined;
  };
  const lang = params.get("lang");
  const tag = lang === null || lang === UNSTATED ? lang : canonicalTag(lang);
  const sort = pick("sort", CARD_SORTS);
  const state = pick("state", CARD_STATES);
  const has = pick("has", CARD_FEATURES);
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    text: params.get("q") ?? "",
    field: pick("field", CARD_FIELDS) ?? "any",
    ...(tag === null ? {} : { lang: tag }),
    ...(state === undefined ? {} : { state }),
    ...(has === undefined ? {} : { has }),
    ...(sort === undefined ? {} : { sort: { key: sort, descending: params.get("order") === "desc" } }),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    size: (CARD_PAGE_SIZES as readonly number[]).includes(size) ? (size as CardPageSize) : DEFAULT_CARD_QUERY.size,
  };
}

/** The query parameters of a query, none for what is as by default. */
export function queryToParams(query: CardQuery): Record<string, string> {
  return {
    ...(query.text === "" ? {} : { q: query.text }),
    ...(query.field === "any" ? {} : { field: query.field }),
    ...(query.lang === undefined ? {} : { lang: query.lang }),
    ...(query.state === undefined ? {} : { state: query.state }),
    ...(query.has === undefined ? {} : { has: query.has }),
    ...(query.sort === undefined ? {} : { sort: query.sort.key }),
    ...(query.sort?.descending === true ? { order: "desc" } : {}),
    ...(query.page === 1 ? {} : { page: String(query.page) }),
    ...(query.size === DEFAULT_CARD_QUERY.size ? {} : { size: String(query.size) }),
  };
}

/** Whether a query is as by default: nothing filtered, sorted or paged. */
export function isDefaultQuery(query: CardQuery): boolean {
  return Object.keys(queryToParams(query)).length === 0;
}

/**
 * The query sorted by `key` next: ascending first, then descending, then
 * in the deck's own order again; from the first page.
 */
export function nextCardSort(query: CardQuery, key: CardSort): CardQuery {
  const { sort: current, ...rest } = query;
  const from = { ...rest, page: 1 };
  if (current?.key !== key) return { ...from, sort: { key, descending: false } };
  return current.descending ? from : { ...from, sort: { key, descending: true } };
}

/** One text of a card: its language tag ("" when unstated), its words, and whether they are written in Markdown. */
interface CardText {
  tag: string;
  value: string;
  markdown: boolean;
}

function textsOf(text: LangText | undefined, markdown: boolean): CardText[] {
  return Object.entries(text ?? {}).map(([tag, value]) => ({ tag, value, markdown }));
}

/** The card's texts the field names; "any" adds the pictures' descriptions, which are never Markdown. */
function fieldTexts(card: Card, field: CardField): CardText[] {
  const markdown = isMarkdown(card.textFormat);
  switch (field) {
    case "front":
      return textsOf(card.front, markdown);
    case "back":
      return textsOf(card.back, markdown);
    case "note":
      return [...textsOf(card.frontNote, markdown), ...textsOf(card.backNote, markdown)];
    case "label":
      return textsOf(card.backLabel, markdown);
    case "distractor":
      return (card.distractors ?? []).flatMap((d) => [...textsOf(d.text, markdown), ...textsOf(d.note, markdown)]);
    case "any":
      return [
        ...(["front", "back", "note", "label", "distractor"] as const).flatMap((part) => fieldTexts(card, part)),
        ...textsOf(card.frontImageDescription, false),
        ...textsOf(card.backImageDescription, false),
      ];
  }
}

/** The languages of the cards' sides, as the language filter offers them: their tags in order, then UNSTATED when a side's language is not stated. */
export function cardLanguages(cards: readonly Card[]): string[] {
  const tags = new Set(cards.flatMap((card) => [...Object.keys(card.front), ...Object.keys(card.back)]));
  const stated = [...tags].filter((tag) => tag !== "").sort();
  return tags.has("") ? [...stated, UNSTATED] : stated;
}

/** Whether a text's tag is the language wanted: the tag itself, or a regional form of it ("sv" finds "sv-fi"). */
function inLanguage(tag: string, lang: string): boolean {
  return lang === UNSTATED ? tag === "" : tag === lang || tag.startsWith(`${lang}-`);
}

function hasFeature(card: Card, feature: CardFeature): boolean {
  switch (feature) {
    case "picture":
      return card.frontImageUrl !== undefined || card.backImageUrl !== undefined;
    case "distractors":
      return (card.distractors?.length ?? 0) > 0;
    case "markdown":
      return isMarkdown(card.textFormat);
    case "notes":
      return card.frontNote !== undefined || card.backNote !== undefined;
  }
}

/** Whether a card is in the state; a card's prompts are those of `directions`, `states` their review states (absent: never reviewed). */
function inState(card: Card, state: CardState, states: readonly (ReviewState | undefined)[], today: string): boolean {
  if (state === "retired") return card.retired === true;
  if (card.retired === true) return false;
  switch (state) {
    case "live":
      return true;
    case "new":
      return states.some((s) => s === undefined);
    case "learning":
      return states.some((s) => s !== undefined && s.repetitions === 0);
    case "young":
      return states.some((s) => s !== undefined && s.repetitions > 0 && s.intervalDays < MATURE_INTERVAL_DAYS);
    case "mature":
      return states.some((s) => s !== undefined && s.intervalDays >= MATURE_INTERVAL_DAYS);
    case "due":
      return states.some((s) => s !== undefined && s.due <= today);
  }
}

function least<T>(values: readonly T[], compare: (a: T, b: T) => number): T | undefined {
  return values.reduce<T | undefined>((low, value) => (low === undefined || compare(value, low) < 0 ? value : low), undefined);
}

/**
 * A deck's cards as the query shows them, every page: those that match
 * it, sorted by its key (ties, and every card unsorted, in the order they
 * were given in). The search ignores case and diacritics, and reads a
 * card in Markdown as `plain` gives its texts (the plain text of
 * docs/markdown.md, injected so the domain does not parse Markdown).
 * `today` is the study day ("YYYY-MM-DD") a card is due by. A side is
 * sorted by the text the reader is shown of it (`text`), compared as the
 * reader's language sorts it (`locale`), case aside and numbers by value.
 */
export function queryCards(
  cards: readonly Card[],
  reviews: DeckReviews,
  query: CardQuery,
  today: string,
  plain: (text: string) => string,
  text: (text: LangText) => string,
  locale: string,
): CardRow[] {
  const directions = studyDirections(reviews.direction);
  const stateOf = new Map(reviews.states.map((state) => [reviewKeyOf(state), state]));
  const wanted = folded(query.text.trim());
  const readable = (text: CardText) => (text.markdown ? plain(text.value) : text.value);

  const rows: CardRow[] = [];
  for (const card of cards) {
    if (query.has !== undefined && !hasFeature(card, query.has)) continue;
    const prompts = directions.map((direction) => stateOf.get(reviewKeyOf({ cardId: card.id, direction })));
    if (query.state !== undefined && !inState(card, query.state, prompts, today)) continue;
    if (wanted !== "" || query.lang !== undefined) {
      const texts = fieldTexts(card, query.field).filter((text) => query.lang === undefined || inLanguage(text.tag, query.lang));
      if (!texts.some((text) => wanted === "" || folded(readable(text)).includes(wanted))) continue;
    }
    const states = prompts.filter((state) => state !== undefined);
    const due = least(states.map((s) => s.due), (a, b) => a.localeCompare(b));
    const intervalDays = least(states.map((s) => s.intervalDays), (a, b) => a - b);
    const easeFactor = least(states.map((s) => s.easeFactor), (a, b) => a - b);
    rows.push({
      card,
      states,
      ...(due === undefined ? {} : { due }),
      ...(intervalDays === undefined ? {} : { intervalDays }),
      ...(easeFactor === undefined ? {} : { easeFactor }),
    });
  }

  const sort = query.sort;
  if (sort === undefined) return rows;
  const sideText = (row: CardRow, side: "front" | "back") => {
    const shown = text(row.card[side]);
    return shown === "" ? undefined : isMarkdown(row.card.textFormat) ? plain(shown) : shown;
  };
  const keyOf = (row: CardRow): string | number | undefined => {
    switch (sort.key) {
      case "id":
        return row.card.id;
      case "created":
        return Date.parse(row.card.createdAt);
      case "front":
      case "back":
        return sideText(row, sort.key);
      case "due":
        return row.due;
      case "interval":
        return row.intervalDays;
      case "ease":
        return row.easeFactor;
    }
  };
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const keys = rows.map(keyOf);
  const compare = (a: string | number, b: string | number) =>
    typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return rows
    .map((row, index) => ({ row, index, key: keys[index] }))
    .sort((a, b) => {
      const [x, y] = [a.key, b.key];
      // A card without the key (never reviewed, or a picture only) comes last, either way.
      if (x === undefined || y === undefined) return x === y ? a.index - b.index : x === undefined ? 1 : -1;
      return (sort.descending ? compare(y, x) : compare(x, y)) || a.index - b.index;
    })
    .map(({ row }) => row);
}
