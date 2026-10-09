import type { Card, CardContent, Deck } from "./deck";
import { sameText } from "./langText";
import { sameContent, upgradedCards, type LibraryUpgradePlan } from "./libraryUpgrade";
import { reviewKeyOf, type ReviewState } from "./review";

/**
 * Upgrading a library deck, done safely (see docs/migrations.md): the
 * upgraded cards — and, when cards are removed, the review states — are
 * written into new documents beside the deck's own, read back, and only
 * once the originals are found unchanged is the deck's catalog entry
 * pointed at them, in one conditional write. The originals are never
 * written; they are deleted once the deck has moved. A failure before
 * the switch deletes the new documents and leaves the deck as it was.
 * The deck keeps its URL and its cards their ids, so the answer log
 * still names them.
 */

export type DeckUpgradeStep = "read" | "write" | "check" | "verify" | "switch" | "tidy";

export const DECK_UPGRADE_STEPS: readonly DeckUpgradeStep[] = ["read", "write", "check", "verify", "switch", "tidy"];

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
  /** Switched over: `deck` as it now is. `tidied` says whether its old documents were deleted. */
  | { ok: true; deck: Deck; tidied: boolean }
  /**
   * Failed before switching over, at `step`: the deck is as it was.
   * `cleanedUp` says whether the new documents were deleted again.
   * `error` is what went wrong: an AppError the app can show in the
   * reader's language, or any other error.
   */
  | { ok: false; step: DeckUpgradeStep; error: unknown; cleanedUp: boolean };

/**
 * Where an upgrade writes a new version of one of the deck's documents:
 * beside it, named by the deck and the upgrade, `…/decks/deck-1.ttl` →
 * `…/decks/deck-1-<uuid>.ttl`; the name never grows from one upgrade to
 * the next.
 */
export function stagedDocumentUrl(documentUrl: string, deckId: string, uuid: string): string {
  return `${documentUrl.slice(0, documentUrl.lastIndexOf("/") + 1)}${deckId}-${uuid}.ttl`;
}

/**
 * Whether `documentUrl` is, or was, the deck's cards document: the one it
 * has now, or one beside it that an upgrade names (stagedDocumentUrl) or
 * the deck was created with, `…/decks/<deckId>.ttl` or
 * `…/decks/<deckId>-<uuid>.ttl`. A link written to a card before an
 * upgrade moved the cards still names its card by its fragment.
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
 * What an upgrade under way is moving, noted down before it writes, so
 * that one cut off (a closed tab) can be tidied away: the documents of
 * the side that lost — the new ones before the switch, the old ones
 * after it.
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

export function encodeDeckUpgradeNote(note: DeckUpgradeNote): string {
  return JSON.stringify(note);
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

/** A card as an upgrade means to leave it: its id, content and retirement. */
export type ExpectedCard = CardContent & { id: string; retired?: true };

/** The deck's cards once the plan is applied to them. */
export function upgradedCardList(cards: readonly Card[], plan: LibraryUpgradePlan): ExpectedCard[] {
  const removed = new Set(plan.remove.map((card) => card.id));
  const byId = new Map<string, ExpectedCard>(
    cards.filter((card) => !removed.has(card.id)).map((card) => [card.id, card]),
  );
  for (const card of upgradedCards(plan)) byId.set(card.id, card);
  return [...byId.values()];
}

/** Whether the cards are the expected ones, no more and no fewer, each saying the same and as retired. */
export function sameCards(expected: readonly ExpectedCard[], actual: readonly ExpectedCard[]): boolean {
  if (expected.length !== actual.length) return false;
  const byId = new Map(actual.map((card) => [card.id, card]));
  return expected.every((card) => {
    const other = byId.get(card.id);
    return other !== undefined && sameContent(card, other) && (card.retired === true) === (other.retired === true);
  });
}

/** Whether two lists hold the same review states, in any order. */
export function sameReviewStates(a: readonly ReviewState[], b: readonly ReviewState[]): boolean {
  const canonical = (states: readonly ReviewState[]) =>
    states
      .map((state) => [reviewKeyOf(state), stableJson(state)] as const)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([, json]) => json)
      .join("\n");
  return a.length === b.length && canonical(a) === canonical(b);
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
 * meanwhile; the switch keeps it (withDeckChanges).
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
