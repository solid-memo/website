import {
  asUrl,
  getThing,
  getThingAll,
  getTermAll,
  getUrl,
  getUrlAll,
  setThing,
  type SolidDataset,
  type Thing,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { reviewKeyOf, type ReviewKey, type ReviewState } from "@solid-memo/domain/review";
import {
  namedReviewSubject,
  pickReviewStates,
  reviewKeyOfSubject,
  reviewStateFromRecord,
  reviewStateToRecord,
  type ReviewedDeck,
  type ReviewLinks,
} from "@solid-memo/domain/reviewRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { REVIEW_STATE_V2 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing, removeUnlessNewer } from "../records";
import { RDF, SM } from "../vocab";

/**
 * The deck whose review states are read and written: its id and where
 * its cards are (a state names its card there, or in a cards document an
 * upgrade moved it from), and its reviews document, where each state is
 * a subject.
 */
export interface ReviewDocuments extends ReviewedDeck {
  reviewsDocumentUrl: string;
}

/**
 * Whether a subject names a scheduler other than Solid Memo's SM-2: any
 * value of sm:scheduler but the sm:sm2 IRI, a literal too. Such a state
 * is another app's: never read as SM-2, written over or removed.
 */
export function namesAnotherScheduler(thing: Thing): boolean {
  return getTermAll(thing, SM.scheduler).some((term) => term.termType !== "NamedNode" || term.value !== SM.sm2);
}

/** What a subject says of the card, direction and scheduler it is of, in any format. */
function linksOf(thing: Thing): ReviewLinks {
  const links: ReviewLinks = {};
  const reviewOf = getUrl(thing, SM.reviewOf);
  const direction = getUrl(thing, SM.reviewDirection);
  if (reviewOf !== null) links.reviewOf = reviewOf;
  if (direction !== null) links.direction = direction;
  if (namesAnotherScheduler(thing)) links.anotherScheduler = true;
  return links;
}

/**
 * The card and direction a subject typed sm:ReviewState is of, whether
 * or not its fields fit its shape; null for any other subject, and for a
 * state this app does not schedule (reviewKeyOfSubject).
 */
function keyOfSubject(thing: Thing, deck: ReviewedDeck): ReviewKey | null {
  if (!getUrlAll(thing, RDF.type).includes(SM.ReviewState)) return null;
  return reviewKeyOfSubject(asUrl(thing), deck, linksOf(thing));
}

const sameKey = (a: ReviewKey, b: ReviewKey) => a.cardId === b.cardId && a.direction === b.direction;

/**
 * Map a reviews-document subject to a ReviewState of `deck`; null when the subject is not an
 * sm:ReviewState that fits its format's shape, or not one this app
 * schedules (another scheduler's, or of a card elsewhere).
 *
 * sm:due is a plain string literal ("YYYY-MM-DD"): a study day is a
 * calendar label, not an instant — xsd:date round-trips risk timezone
 * off-by-one shifts.
 */
export function toReviewState(thing: Thing, deck: ReviewedDeck): ReviewState | null {
  const read = readVersioned(thing, "reviewState");
  if (read === null) return null;
  const key = reviewKeyOfSubject(asUrl(thing), deck, linksOf(thing));
  if (key === null) return null;
  return reviewStateFromRecord(key, read.storedVersion, migrate("reviewState", read.record, { subject: asUrl(thing) }));
}

/** Each state of the document this app reads, with its subject: one per card and direction (pickReviewStates). */
function readStates(dataset: SolidDataset, documents: ReviewDocuments): { url: string; key: ReviewKey; state: ReviewState }[] {
  const read = getThingAll(dataset).flatMap((thing) => {
    const state = toReviewState(thing, documents);
    return state === null ? [] : [{ url: asUrl(thing), key: { cardId: state.cardId, direction: state.direction }, state }];
  });
  return pickReviewStates(documents.reviewsDocumentUrl, read);
}

/** The deck's review states in its reviews document: one per card and direction, in document order. */
export function toReviewStates(dataset: SolidDataset, documents: ReviewDocuments): ReviewState[] {
  return readStates(dataset, documents).map(({ state }) => state);
}

/**
 * The subject a state of `key` not read from the document is written to:
 * the one the fragment rule names, when nothing is there or it is a state
 * of the same card and direction that cannot be read (written over, as
 * before); else, when that subject is another's (a state of another card
 * by its sm:reviewOf, another scheduler's, another app's subject), a new
 * subject `#review-<id>`, which names its card.
 */
function newSubjectFor(dataset: SolidDataset, documents: ReviewDocuments, key: ReviewKey, newId: () => string): string {
  const named = namedReviewSubject(documents.reviewsDocumentUrl, key);
  const there = getThing(dataset, named);
  if (there === null) return named;
  const thereKey = keyOfSubject(there, documents);
  return thereKey !== null && sameKey(thereKey, key) ? named : `${documents.reviewsDocumentUrl}#review-${newId()}`;
}

/**
 * The reviews document with each state written in this app's format: a
 * state read from the document onto the subject it was read from,
 * whatever that is called; any other at the subject newSubjectFor gives.
 * The document is read once, however many states are written. Returns
 * the subjects written, in the order of `states`.
 */
export function withReviewStates(
  dataset: SolidDataset,
  documents: ReviewDocuments,
  states: readonly ReviewState[],
  newId: () => string,
): { dataset: SolidDataset; subjects: string[] } {
  const subjectOf = new Map(readStates(dataset, documents).map(({ url, key }) => [reviewKeyOf(key), url]));
  let updated = dataset;
  const subjects: string[] = [];
  for (const state of states) {
    const subject = subjectOf.get(reviewKeyOf(state)) ?? newSubjectFor(updated, documents, state, newId);
    subjectOf.set(reviewKeyOf(state), subject);
    updated = setThing(updated, toReviewStateThing(documents, state, getThing(updated, subject), subject));
    subjects.push(subject);
  }
  return { dataset: updated, subjects };
}

/**
 * The reviews document without the states read for the given cards and
 * directions (a day reset's): only the subject each was read from. A
 * second state of the same card and direction, which the app never
 * read, stays.
 */
export function withoutReadReviewStates(dataset: SolidDataset, documents: ReviewDocuments, keys: readonly ReviewKey[]): SolidDataset {
  const removed = new Set(keys.map(reviewKeyOf));
  return readStates(dataset, documents)
    .filter(({ key }) => removed.has(reviewKeyOf(key)))
    .reduce((current, { url }) => removeUnlessNewer(current, url), dataset);
}

/**
 * The reviews document without any state of the given cards and
 * directions (a card removed, by hand or by an upgrade): every subject
 * typed sm:ReviewState that is of one, by its links or the fragment
 * rule, read or not. Another scheduler's states, and any other subject,
 * stay.
 */
export function withoutReviewStates(dataset: SolidDataset, documents: ReviewDocuments, keys: readonly ReviewKey[]): SolidDataset {
  return getThingAll(dataset)
    .filter((thing) => {
      const key = keyOfSubject(thing, documents);
      return key !== null && keys.some((removed) => sameKey(removed, key));
    })
    .reduce((current, thing) => removeUnlessNewer(current, asUrl(thing)), dataset);
}

/**
 * The subject of one ReviewState inside its reviews document, written in
 * this app's format at `subjectUrl`, onto `existing` (what is there now,
 * if anything): it names its card, direction and scheduler.
 */
export function toReviewStateThing(
  documents: ReviewDocuments,
  state: ReviewState,
  existing: ThingPersisted | null,
  subjectUrl: string,
): ThingPersisted {
  return recordThing(subjectUrl, REVIEW_STATE_V2, reviewStateToRecord(state, documents.cardsDocumentUrl), existing);
}
