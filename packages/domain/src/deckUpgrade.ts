import type { Deck } from "./deck";
import { sameText } from "./langText";
import type { LibraryUpgradePlan } from "./libraryUpgrade";

/**
 * Upgrading a library deck (see docs/migrations.md "How an upgrade is
 * applied"): the deck's documents are written where they are, each in
 * one write made only if it is still as it was read, in an order that
 * leaves the deck readable after each: its cards first; then, when the
 * upgrade drops review states (of cards the release removed), its
 * reviews document; and last its catalog entry, which says which release
 * the deck is. A failure leaves what was written so, the deck still
 * naming the release it came from: its plan then takes the cards already
 * as the newer release has them, or gone as it removed them, for the
 * release's, not the user's (LibraryUpgradePlan `applied`, `gone`) — and
 * those as the release in between has them, once a newer one is out —
 * and offers the upgrade again, which finishes it. Nothing is put back.
 * The deck keeps its URL, its documents theirs and its cards their ids,
 * so the answer log still names them.
 */

export type DeckUpgradeStep = "read" | "cards" | "reviews" | "entry";

export const DECK_UPGRADE_STEPS: readonly DeckUpgradeStep[] = ["read", "cards", "reviews", "entry"];

/** How far into a step it is, in the step's own units: documents, decks, reads, writes. */
export interface StepPart {
  done: number;
  total: number;
}

export interface DeckUpgradeProgress {
  step: DeckUpgradeStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into `step` it is; absent for a step done in one go. */
  part?: StepPart;
}

export type DeckUpgradeOutcome =
  /** Done: `deck` as it now is, at the newer release. */
  | { ok: true; deck: Deck }
  /**
   * Failed at `step`. `changed` says whether a document of the deck was
   * written, or may have been: a write whose answer was lost may have
   * been made (the entry's is read again to tell, when it can be). The
   * deck then has part of the newer release, or all of it once its entry
   * is written; one whose entry still names the release it came from is
   * offered the upgrade again, which finishes it. Else the deck is as it
   * was. `error` is what went wrong: an AppError the app can show in the
   * reader's language, or any other error.
   */
  | { ok: false; step: DeckUpgradeStep; error: unknown; changed: boolean };

/**
 * Whether `documentUrl` is, or was, the deck's cards document: the one it
 * has now, or one beside it that the deck was created with or an upgrade
 * by an earlier version of the app moved the cards to (it wrote the
 * upgraded cards into a new document), `…/decks/<deckId>.ttl` or
 * `…/decks/<deckId>-<uuid>.ttl`. A link written to a card before such
 * an upgrade still names its card by its fragment.
 */
export function isCardsDocumentOf(documentUrl: string, deck: Pick<Deck, "id" | "cardsDocumentUrl">): boolean {
  if (documentUrl === deck.cardsDocumentUrl) return true;
  const container = deck.cardsDocumentUrl.slice(0, deck.cardsDocumentUrl.lastIndexOf("/") + 1);
  if (!documentUrl.startsWith(container)) return false;
  const name = documentUrl.slice(container.length);
  if (!name.startsWith(deck.id)) return false;
  const rest = name.slice(deck.id.length);
  return rest === ".ttl" || /^-[^/]+\.ttl$/.test(rest);
}

/** A document an upgrade replaces (`from`) and the one it writes in its place (`to`). */
export interface DocumentMove {
  from: string;
  to: string;
}

/**
 * What an upgrade by an earlier version of the app was moving, which it
 * noted in the browser before it wrote, so that one cut off (a closed
 * tab) can be tidied away: the documents of the side that lost — the new
 * ones before it switched the deck's entry over, the old ones after.
 * This app's upgrade moves no document and notes nothing: it only reads
 * the notes an earlier one left.
 */
export interface DeckUpgradeNote {
  /** ISO dateTime the upgrade began. */
  startedAt: string;
  cards: DocumentMove;
  /** Absent when the upgrade keeps the reviews document. */
  reviews?: DocumentMove;
}

/**
 * How long an upgrade may take before its note counts as left behind.
 * An upgrade takes seconds; until then, the note may be another tab's
 * upgrade under way (the note is kept per browser, not per tab).
 */
export const ABANDONED_UPGRADE_MS = 10 * 60 * 1000;

/** Whether the upgrade the note is of began long enough ago to have been cut off. */
export function isAbandoned(note: DeckUpgradeNote, now: Date): boolean {
  const started = Date.parse(note.startedAt);
  return Number.isNaN(started) || now.getTime() - started >= ABANDONED_UPGRADE_MS;
}

/** The note again; null when it is not one (forgotten, or written by something else). */
export function decodeDeckUpgradeNote(text: string | null): DeckUpgradeNote | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.startedAt !== "string" || !isMove(value.cards)) return null;
  if (value.reviews !== undefined && !isMove(value.reviews)) return null;
  return {
    startedAt: value.startedAt,
    cards: { from: value.cards.from, to: value.cards.to },
    ...(value.reviews === undefined ? {} : { reviews: { from: value.reviews.from, to: value.reviews.to } }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMove(value: unknown): value is DocumentMove {
  return isRecord(value) && typeof value.from === "string" && typeof value.to === "string";
}

/** JSON with every object's keys in order, so equal values give equal text. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner) && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => (x < y ? -1 : 1)))
      : inner,
  );
}

/**
 * Whether two plans change the deck's cards and direction alike, to the
 * same release: the plan the user agreed to still holds. Its title and
 * description may differ; those are taken from the newer plan.
 */
export function sameCardChanges(a: LibraryUpgradePlan, b: LibraryUpgradePlan): boolean {
  const ids = (cards: readonly { id: string }[]) =>
    cards
      .map((card) => card.id)
      .sort()
      .join("\n");
  return (
    a.releaseUrl === b.releaseUrl &&
    a.direction === b.direction &&
    (["add", "change", "retire", "restore", "remove"] as const).every((key) => ids(a[key]) === ids(b[key]))
  );
}

/**
 * Whether the deck's catalog entry still says what an upgrade read from
 * it: where its cards and review states are, which release it is, how
 * it is studied, its title and description. Anything else may change
 * meanwhile; the upgrade's write of the entry keeps it (withDeckChanges).
 */
export function sameDeckState(a: Deck, b: Deck): boolean {
  return (
    a.url === b.url &&
    a.cardsDocumentUrl === b.cardsDocumentUrl &&
    a.reviewsDocumentUrl === b.reviewsDocumentUrl &&
    a.sourceUrl === b.sourceUrl &&
    a.direction === b.direction &&
    sameText(a.title, b.title) &&
    sameText(a.description, b.description)
  );
}

/**
 * The deck as stored, with what the upgrade changes from `current` to
 * `next`: a change made meanwhile to anything the upgrade does not touch
 * survives.
 */
export function withDeckChanges(stored: Deck, current: Deck, next: Deck): Deck {
  const changed = (Object.keys(next) as (keyof Deck)[]).filter(
    (key) => stableJson(next[key]) !== stableJson(current[key]),
  );
  return { ...stored, ...Object.fromEntries(changed.map((key) => [key, next[key]])) };
}
