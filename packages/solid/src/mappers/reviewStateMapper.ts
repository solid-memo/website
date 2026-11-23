// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, type NamedSubject, type Subject, asUrl, getThing } from "../client/rdf";
import { editOf, type DatasetEdit } from "../datasetEdit";
import type { Scheduler } from "@solid-memo/domain/fsrs";
import type { GradedPrompt, PromptStates } from "@solid-memo/domain/grading";
import {
  reviewKeyOf,
  type FsrsState,
  type ReviewKey,
  type ReviewState,
  type ReviewStates,
} from "@solid-memo/domain/review";
import {
  FSRS6_SCHEDULER,
  fsrsKeyOfLinks,
  fsrsReviewStateFromRecord,
  fsrsReviewStateToRecord,
  namedFsrsSubject,
  namedReviewSubject,
  pickReviewStates,
  reviewKeyOfSubject,
  reviewStateFromRecord,
  reviewStateToRecord,
  SM2_SCHEDULER,
  type ReviewedDeck,
  type ReviewLinks,
} from "@solid-memo/domain/reviewRecord";
import { AppError } from "@solid-memo/domain/appError";
import { isIriPastBound } from "@solid-memo/domain/pathKeys";
import { isCardsDocumentOf } from "@solid-memo/domain/deckUpgrade";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import {
  FSRS_REVIEW_STATE_V1,
  REVIEW_LINKS_TERMS,
  REVIEW_STATE_V2,
} from "@solid-memo/vocab/descriptors.generated";
import {
  carriedTo,
  everyValue,
  hasClass,
  readTerms,
  isWrittenByNewer,
  ownSubjectsOf,
  readVersioned,
  recordThing,
  removeAllUnlessNewer,
} from "../records";
import { SM } from "../vocab";

/**
 * The deck whose review states are read and written: its id and where
 * its cards are (a state names its card there, or in a cards document an
 * upgrade moved it from), and its reviews document, where each state is
 * a subject. A prompt has an SM-2 state there and, once FSRS-6 has
 * scheduled it, an FSRS-6 state beside it (docs/data-model.md).
 */
export interface ReviewDocuments extends ReviewedDeck {
  reviewsDocumentUrl: string;
}

/**
 * Which of this app's schedulers a subject names: SM-2 when it names
 * none or only the sm:sm2 IRI, FSRS-6 when only the sm:fsrs6 IRI; null
 * for any other value of sm:scheduler, a literal too, which is another
 * app's scheduler.
 */
function schedulerOf(thing: Subject): Scheduler | null {
  const all = (iri: string) =>
    everyValue(thing, SM.scheduler, (term) => term.termType === "NamedNode" && term.value === iri);
  if (all(SM2_SCHEDULER)) return "sm2";
  return all(FSRS6_SCHEDULER) ? "fsrs6" : null;
}

/**
 * Whether a subject names a scheduler other than Solid Memo's SM-2 and
 * FSRS-6: any value of sm:scheduler but the sm:sm2 and sm:fsrs6 IRIs, a
 * literal too. Such a state is another app's: never read, written over
 * or removed.
 */
export function namesAnotherScheduler(thing: Subject): boolean {
  return schedulerOf(thing) === null;
}

/** What a subject says of the card, direction and scheduler it is of, in any format. */
function linksOf(thing: Subject): ReviewLinks {
  const links: ReviewLinks = {};
  const { reviewOf, reviewDirection } = readTerms(thing, REVIEW_LINKS_TERMS);
  if (reviewOf !== undefined) links.reviewOf = reviewOf;
  if (reviewDirection !== undefined) links.direction = reviewDirection;
  if (schedulerOf(thing) !== "sm2") links.anotherScheduler = true;
  return links;
}

const isReviewState = (thing: Subject) => hasClass(thing, SM.ReviewState);

/**
 * The card and direction a subject typed sm:ReviewState is of as an SM-2
 * state, whether or not its fields fit its shape; null for any other
 * subject, and for a state this app does not schedule by SM-2
 * (reviewKeyOfSubject).
 */
function keyOfSubject(thing: Subject, deck: ReviewedDeck): ReviewKey | null {
  if (!isReviewState(thing)) return null;
  return reviewKeyOfSubject(asUrl(thing), deck, linksOf(thing));
}

/**
 * The card and direction a subject typed sm:ReviewState and naming
 * sm:fsrs6 is of, by its links alone (fsrsKeyOfLinks), whether or not
 * its fields fit its shape; null for any other subject.
 */
function fsrsKeyOfSubject(thing: Subject, deck: ReviewedDeck): ReviewKey | null {
  if (!isReviewState(thing) || schedulerOf(thing) !== "fsrs6") return null;
  return fsrsKeyOfLinks(deck, linksOf(thing));
}

/**
 * The id of the card a subject typed sm:ReviewState is of, SM-2 or
 * FSRS-6, by its links alone (keyOfSubject, fsrsKeyOfSubject); null for
 * any other subject, and for a state of a card elsewhere.
 */
export function reviewedCardIdOf(thing: Subject, deck: ReviewedDeck): string | null {
  return (keyOfSubject(thing, deck) ?? fsrsKeyOfSubject(thing, deck))?.cardId ?? null;
}

const sameKey = (a: ReviewKey, b: ReviewKey) =>
  a.cardId === b.cardId && a.direction === b.direction;

/**
 * Map a reviews-document subject to a ReviewState of `deck`; null when the subject is not an
 * sm:ReviewState that fits its format's shape, or not one this app
 * schedules by SM-2 (an FSRS-6 state, another scheduler's, or of a card
 * elsewhere).
 *
 * sm:due is a plain string literal ("YYYY-MM-DD"): a study day is a
 * calendar label, not an instant — xsd:date round-trips risk timezone
 * off-by-one shifts.
 */
export function toReviewState(thing: Subject, deck: ReviewedDeck): ReviewState | null {
  const read = readVersioned(thing, "reviewState");
  if (read === null) return null;
  const key = reviewKeyOfSubject(asUrl(thing), deck, linksOf(thing));
  if (key === null) return null;
  return reviewStateFromRecord(
    key,
    read.storedVersion,
    migrate("reviewState", read.record, { subject: asUrl(thing) }),
  );
}

/**
 * Map a reviews-document subject to an FSRS-6 state of `deck`; null when
 * the subject is not an sm:ReviewState naming sm:fsrs6 alone that fits
 * its format's shape, or names a card elsewhere.
 */
export function toFsrsState(thing: Subject, deck: ReviewedDeck): FsrsState | null {
  const read = readVersioned(thing, "fsrsReviewState");
  if (read === null) return null;
  const key = fsrsKeyOfSubject(thing, deck);
  if (key === null) return null;
  return fsrsReviewStateFromRecord(
    key,
    read.storedVersion,
    migrate("fsrsReviewState", read.record, { subject: asUrl(thing) }),
  );
}

/** A state read from the document, with its subject. */
interface Read<T> {
  url: string;
  key: ReviewKey;
  state: T;
}

/**
 * Each state of the document `read` maps a subject to, with its subject:
 * one per card and direction (pickReviewStates, the subject `named`
 * names first). Only the reviews document's own subjects are read
 * (ownSubjectsOf): one of another document is never a state of the
 * deck's, though its fragment names one of the deck's cards.
 */
function readOf<T extends ReviewKey>(
  dataset: Dataset,
  documents: ReviewDocuments,
  read: (thing: Subject, deck: ReviewedDeck) => T | null,
  named: (reviewsDocumentUrl: string, key: ReviewKey) => string,
): Read<T>[] {
  const states = ownSubjectsOf(dataset, documents.reviewsDocumentUrl).flatMap((thing) => {
    const state = read(thing, documents);
    return state === null
      ? []
      : [{ url: asUrl(thing), key: { cardId: state.cardId, direction: state.direction }, state }];
  });
  return pickReviewStates(documents.reviewsDocumentUrl, states, named);
}

/** Each SM-2 and FSRS-6 state of the document this app reads, with its subject. */
function readBoth(
  dataset: Dataset,
  documents: ReviewDocuments,
): { sm2: Read<ReviewState>[]; fsrs: Read<FsrsState>[] } {
  return {
    sm2: readOf(dataset, documents, toReviewState, namedReviewSubject),
    fsrs: readOf(dataset, documents, toFsrsState, namedFsrsSubject),
  };
}

/**
 * The deck's review states in its reviews document: the SM-2 states and
 * the FSRS-6 states, each one per card and direction, in document order.
 */
export function toReviewStates(dataset: Dataset, documents: ReviewDocuments): ReviewStates {
  const read = readBoth(dataset, documents);
  return {
    sm2: read.sm2.map(({ state }) => state),
    fsrs: read.fsrs.map(({ state }) => state),
  };
}

/**
 * The most ways of reading one read of a reviews document that
 * sharedReviewStatesOf maps it to: a deck's cards document, and the
 * older cards documents of the deck the document's states name
 * (isCardsDocumentOf), are what its states are read by. Decks the app
 * makes each have a reviews document of their own; a catalog may point
 * many decks at one, and a way past this many is refused, as each would
 * be mapped from the whole document.
 */
export const MAX_READINGS = 8;

/**
 * How many times over the names of the documents a read's states name
 * finding the ways decks read it may go through them (startOf), all
 * decks together: once each when no deck's id starts another's in a
 * folder, as with the decks the app makes. Ids that do may make every
 * deck go through the same names; past this, a deck whose way isn't
 * found yet is refused (reviewsReadTooManyWays), so the work of a read
 * stays a few times its names, however many decks name it.
 */
export const SCANS_OF_NAMES = 4;

/** The ways one read of a reviews document was mapped: see sharedReviewStatesOf. */
interface Readings {
  /** The documents the states name their cards in (sm:reviewOf), each once, in the order of `<`. */
  named: readonly string[];
  /** The named documents a deck's id makes its cards documents, by where their names start (startOf). */
  byStart: Map<string, Found>;
  /** Each list of such documents found, by its text, numbered. */
  lists: Map<string, number>;
  /** The way each deck read it, by its start and cards document (readingOf). */
  byDeck: Map<string, string>;
  /** The states read, by the way they were read. */
  byReading: Map<string, ReviewStates>;
  /** The characters of named documents startOf may still go through (SCANS_OF_NAMES). */
  budget: number;
}

/** Named documents a deck's id makes its cards documents, in order, and the number of that list. */
interface Found {
  urls: readonly string[];
  number: number;
}

const readings = new WeakMap<Dataset, Map<string, Readings>>();

/**
 * The deck's review states of a read of its reviews document
 * (toReviewStates), mapped once for each way of reading it and frozen:
 * decks whose states are read alike, by the same cards documents, share
 * them, and what is worked out of a deck's cards and states then is
 * worked out once for all of them (domain/frozen.ts). A dataset never
 * changes (each write makes a new one), so what it was mapped to stays
 * true; a new download is a new dataset, mapped afresh. The way a deck
 * reads it is found by a lookup in the documents its states name, sorted
 * once a read, not by a pass over them all for each deck. Refused
 * (reviewsReadTooManyWays) once one read is read in more than
 * MAX_READINGS ways, or once finding the ways has gone through the
 * names more than SCANS_OF_NAMES times over.
 */
export function sharedReviewStatesOf(dataset: Dataset, documents: ReviewDocuments): ReviewStates {
  let byDocument = readings.get(dataset);
  if (byDocument === undefined) readings.set(dataset, (byDocument = new Map()));
  let read = byDocument.get(documents.reviewsDocumentUrl);
  if (read === undefined) {
    const named = namedCardsDocuments(dataset, documents);
    read = {
      named,
      byStart: new Map(),
      lists: new Map(),
      byDeck: new Map(),
      byReading: new Map(),
      budget: SCANS_OF_NAMES * named.reduce((sum, url) => sum + url.length, 0),
    };
    byDocument.set(documents.reviewsDocumentUrl, read);
  }
  // A state's card is read by the deck's cards document and those of the named ones that are the deck's.
  const reading = `${readingOf(read, documents)} ${documents.cardsDocumentUrl}`;
  const known = read.byReading.get(reading);
  if (known !== undefined) return known;
  if (read.byReading.size >= MAX_READINGS) throw tooManyWays(documents);
  const { sm2, fsrs } = toReviewStates(dataset, documents);
  const states: ReviewStates = Object.freeze({
    sm2: Object.freeze(sm2),
    fsrs: Object.freeze(fsrs),
  }) as ReviewStates;
  read.byReading.set(reading, states);
  return states;
}

/**
 * The way a deck reads a read of its reviews document, beside its cards
 * document: the named documents its id makes its cards documents
 * (isCardsDocumentOf), its own left out, as a number. Those are the ones
 * whose names start with its id in its cards document's folder, next to
 * each other in the sorted names: found by a search, once for each start
 * a read (startOf), so a deck costs a lookup, not a pass over all the
 * named documents. Its own is left out while they are few (MAX_READINGS
 * at most); past that, a deck whose own is among them reads it apart, as
 * one more way. Found once for each start and cards document a read.
 */
function readingOf(read: Readings, documents: ReviewDocuments): string {
  const { cardsDocumentUrl } = documents;
  const { start, found } = startOf(read, documents);
  const key = `${start} ${cardsDocumentUrl}`;
  const known = read.byDeck.get(key);
  if (known !== undefined) return known;
  const { urls, number } = found;
  const reading =
    urls.length > MAX_READINGS || !urls.includes(cardsDocumentUrl)
      ? String(number)
      : String(
          numberOf(
            read,
            urls.filter((url) => url !== cardsDocumentUrl),
          ),
        );
  read.byDeck.set(key, reading);
  return reading;
}

/**
 * The named documents whose names start with the deck's id in its cards
 * document's folder and that its id makes its cards documents
 * (isCardsDocumentOf), and their number, by that start. Each name gone
 * through is taken from the read's budget; a deck that would go past it
 * is refused (SCANS_OF_NAMES).
 */
function startOf(read: Readings, documents: ReviewDocuments): { start: string; found: Found } {
  const { cardsDocumentUrl, id } = documents;
  const folder = cardsDocumentUrl.slice(0, cardsDocumentUrl.lastIndexOf("/") + 1);
  const start = folder + id;
  const known = read.byStart.get(start);
  if (known !== undefined) return { start, found: known };
  const { named } = read;
  let low = 0;
  let high = named.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (named[middle]! < start) low = middle + 1;
    else high = middle;
  }
  // By the folder and id alone, as every deck of this start has it: its own cards document is readingOf's.
  const byName = { id, cardsDocumentUrl: folder };
  const urls: string[] = [];
  for (let at = low; at < named.length && named[at]!.startsWith(start); at++) {
    read.budget -= named[at]!.length;
    if (read.budget < 0) throw tooManyWays(documents);
    if (isCardsDocumentOf(named[at]!, byName)) urls.push(named[at]!);
  }
  const found = { urls, number: numberOf(read, urls) };
  read.byStart.set(start, found);
  return { start, found };
}

/** The refusal of a deck that would read a reviews document in yet another way. */
function tooManyWays(documents: ReviewDocuments): AppError {
  return new AppError("reviewsReadTooManyWays", {
    limit: MAX_READINGS,
    document: documents.reviewsDocumentUrl,
  });
}

/** The number of a list of named documents, the same for the same list. */
function numberOf(read: Readings, urls: readonly string[]): number {
  const text = JSON.stringify(urls);
  let number = read.lists.get(text);
  if (number === undefined) read.lists.set(text, (number = read.lists.size));
  return number;
}

/** The documents the states of a reviews document name their cards in (sm:reviewOf), each once, in the order of `<`. */
function namedCardsDocuments(dataset: Dataset, documents: ReviewDocuments): string[] {
  const named = new Set<string>();
  for (const thing of ownSubjectsOf(dataset, documents.reviewsDocumentUrl)) {
    const { reviewOf } = readTerms(thing, REVIEW_LINKS_TERMS);
    if (reviewOf?.includes("#") === true) named.add(documentUrlOf(reviewOf));
  }
  return [...named].sort((a, b) => (a < b ? -1 : 1));
}

/** How one kind of state is written: where it is named, how a subject is read as one, and its subject. */
interface Kind<T> {
  named: (reviewsDocumentUrl: string, key: ReviewKey) => string;
  keyOf: (thing: Subject, deck: ReviewedDeck) => ReviewKey | null;
  thing: (
    documents: ReviewDocuments,
    state: T,
    existing: NamedSubject | null,
    subjectUrl: string,
  ) => NamedSubject;
}

const SM2_KIND: Kind<ReviewState> = {
  named: namedReviewSubject,
  keyOf: keyOfSubject,
  thing: toReviewStateThing,
};

const FSRS_KIND: Kind<FsrsState> = {
  named: namedFsrsSubject,
  keyOf: fsrsKeyOfSubject,
  thing: toFsrsStateThing,
};

/**
 * The subject a state of `key` not read from the document is written to:
 * the one its kind names, when nothing is there or it is a state of the
 * same kind, card and direction that cannot be read (written over, as
 * before); else, when that subject is another's (a state of another card
 * by its sm:reviewOf, of another kind or scheduler, another app's
 * subject), or longer than a term may be (isIriPastBound: a card id
 * near that bound, which a deck file or release can carry, makes the
 * named subject, with its suffixes, longer than the card's IRI), a new
 * subject `#review-<id>`, which names its card. A state is read by its
 * links, whatever its subject is called, so either is read alike.
 */
function newSubjectFor<T>(
  edit: DatasetEdit<Dataset>,
  documents: ReviewDocuments,
  kind: Kind<T>,
  key: ReviewKey,
  newId: () => string,
): string {
  const named = kind.named(documents.reviewsDocumentUrl, key);
  const fresh = () => `${documents.reviewsDocumentUrl}#review-${newId()}`;
  if (isIriPastBound(named)) return fresh();
  const there = edit.getThing(named);
  if (there === null) return named;
  const thereKey = kind.keyOf(there, documents);
  return thereKey !== null && sameKey(thereKey, key) ? named : fresh();
}

/** The states to write: SM-2's, and FSRS-6's, left out when there are none. */
export interface StatesToWrite {
  sm2: readonly ReviewState[];
  fsrs?: readonly FsrsState[];
}

/** The state of each kind another reviews document holds of a prompt, which a copy of it starts from; null for none. */
export interface CarriedStates {
  sm2: (key: ReviewKey) => Subject | null;
  fsrs: (key: ReviewKey) => Subject | null;
}

const NOTHING_CARRIED: CarriedStates = { sm2: () => null, fsrs: () => null };

/**
 * The states a copy of cards starts from: for a prompt of a card in the
 * target, by the id the card has there, the state of each kind that
 * `source`, the reviews document it was copied from, holds of the card
 * it is a copy of (`ids`: the id there, by the id in the target).
 */
export function carriedStatesOf(
  source: Dataset,
  documents: ReviewDocuments,
  ids: Readonly<Record<string, string>>,
): CarriedStates {
  const read = readBoth(source, documents);
  const lookup = (states: readonly Read<unknown>[]) => {
    const urls = new Map(states.map(({ url, key }) => [reviewKeyOf(key), url]));
    return ({ cardId, direction }: ReviewKey) => {
      if (!Object.hasOwn(ids, cardId)) return null;
      const url = urls.get(reviewKeyOf({ cardId: ids[cardId]!, direction }));
      return url === undefined ? null : getThing(source, url);
    };
  };
  return { sm2: lookup(read.sm2), fsrs: lookup(read.fsrs) };
}

/**
 * The reviews document with each state written in this app's format: a
 * state read from the document onto the subject it was read from,
 * whatever that is called; any other at the subject newSubjectFor gives,
 * starting from the state `carried` has for it, when nothing is there
 * (carriedTo). The document is read once, however many states are
 * written. Returns the subjects written, the SM-2 states' then the
 * FSRS-6 states', each in their order.
 */
export function withReviewStates(
  dataset: Dataset,
  documents: ReviewDocuments,
  states: StatesToWrite,
  newId: () => string,
  carried: CarriedStates = NOTHING_CARRIED,
): { dataset: Dataset; subjects: string[] } {
  return writeBoth(dataset, documents, readBoth(dataset, documents), states, newId, carried);
}

/**
 * The reviews document with the states of `key` as `grade` makes them of
 * the states the document holds of it (each null: none), written as
 * withReviewStates writes them: SM-2's always, FSRS-6's when the grade
 * gives one; with the states written and those they were made of. The
 * document's states are read once.
 */
export function withGradedReviewState(
  dataset: Dataset,
  documents: ReviewDocuments,
  key: ReviewKey,
  grade: (current: PromptStates) => GradedPrompt,
  newId: () => string,
): { dataset: Dataset; subjects: string[]; current: PromptStates; state: GradedPrompt } {
  const read = readBoth(dataset, documents);
  const current: PromptStates = {
    sm2: read.sm2.find((stored) => sameKey(stored.key, key))?.state ?? null,
    fsrs: read.fsrs.find((stored) => sameKey(stored.key, key))?.state ?? null,
  };
  const state = grade(current);
  const states = { sm2: [state.sm2], ...(state.fsrs === undefined ? {} : { fsrs: [state.fsrs] }) };
  return { ...writeBoth(dataset, documents, read, states, newId), current, state };
}

/** The document with both kinds' states written, each at the subject `read` has it at, else a new one. */
function writeBoth(
  dataset: Dataset,
  documents: ReviewDocuments,
  read: { sm2: readonly Read<ReviewState>[]; fsrs: readonly Read<FsrsState>[] },
  states: StatesToWrite,
  newId: () => string,
  carried: CarriedStates = NOTHING_CARRIED,
): { dataset: Dataset; subjects: string[] } {
  const edit = editOf(dataset);
  const sm2 = writeStates(edit, documents, SM2_KIND, read.sm2, states.sm2, newId, carried.sm2);
  const fsrs = writeStates(
    edit,
    documents,
    FSRS_KIND,
    read.fsrs,
    states.fsrs ?? [],
    newId,
    carried.fsrs,
  );
  return { dataset: edit.done(), subjects: [...sm2, ...fsrs] };
}

/**
 * Writes `states` of one kind, each at the subject `read` has it at,
 * else a new one, through one edit of the document (editOf): many states
 * take time that grows with them and the document, not their product.
 * Returns the subjects written.
 */
function writeStates<T extends ReviewKey>(
  edit: DatasetEdit<Dataset>,
  documents: ReviewDocuments,
  kind: Kind<T>,
  read: readonly { url: string; key: ReviewKey }[],
  states: readonly T[],
  newId: () => string,
  carried: (key: ReviewKey) => Subject | null,
): string[] {
  const subjectOf = new Map(read.map(({ url, key }) => [reviewKeyOf(key), url]));
  const subjects: string[] = [];
  for (const state of states) {
    const subject =
      subjectOf.get(reviewKeyOf(state)) ?? newSubjectFor(edit, documents, kind, state, newId);
    subjectOf.set(reviewKeyOf(state), subject);
    const there = edit.getThing(subject);
    const from = there === null ? carried(state) : null;
    const existing = from === null ? there : carriedTo(from, subject);
    edit.setThing(kind.thing(documents, state, existing, subject));
    subjects.push(subject);
  }
  return subjects;
}

/** The prompts whose states go: their SM-2 states, their FSRS-6 states. */
export interface StatesToRemove {
  sm2?: readonly ReviewKey[];
  fsrs?: readonly ReviewKey[];
}

/**
 * The reviews document without the states read for the given cards and
 * directions (a day reset's, an undo's), of each kind: only the subject
 * each was read from. A second state of the same kind, card and
 * direction, which the app never read, stays.
 */
export function withoutReadReviewStates(
  dataset: Dataset,
  documents: ReviewDocuments,
  keys: StatesToRemove,
): Dataset {
  const read = readBoth(dataset, documents);
  const removed = (states: readonly Read<unknown>[], keys: readonly ReviewKey[] = []) => {
    const gone = new Set(keys.map(reviewKeyOf));
    return states.filter(({ key }) => gone.has(reviewKeyOf(key)));
  };
  return removeAllUnlessNewer(
    dataset,
    [...removed(read.sm2, keys.sm2), ...removed(read.fsrs, keys.fsrs)].map(({ url }) => url),
  );
}

/**
 * The reviews document without any state of the given cards and
 * directions (a card removed, by hand or by an upgrade): every subject
 * typed sm:ReviewState that is an SM-2 state of one, by its links or the
 * fragment rule, or this app's FSRS-6 state of one, by its links, read
 * or not, of the reviews document's own subjects (ownSubjectsOf).
 * Another scheduler's states, a subject of another document, and any
 * other subject, stay. So does a state a newer version of the app wrote
 * (isWrittenByNewer) that is not the one read of its card and
 * direction: this app never removes one, and no write needs it gone, so
 * it is left as it is rather than refused (GHSA-7x88-hfwx-whvj). The
 * state read is the card's progress the removal is for: one a newer
 * version wrote is refused (writtenByNewerApp), as it is everywhere.
 */
export function withoutReviewStates(
  dataset: Dataset,
  documents: ReviewDocuments,
  keys: readonly ReviewKey[],
): Dataset {
  const removed = new Set(keys.map(reviewKeyOf));
  const read = readBoth(dataset, documents);
  const readAt = new Set([...read.sm2, ...read.fsrs].map(({ url }) => url));
  return removeAllUnlessNewer(
    dataset,
    ownSubjectsOf(dataset, documents.reviewsDocumentUrl)
      .filter((thing) => {
        const key = keyOfSubject(thing, documents) ?? fsrsKeyOfSubject(thing, documents);
        return (
          key !== null &&
          removed.has(reviewKeyOf(key)) &&
          (readAt.has(asUrl(thing)) || !isWrittenByNewer(thing))
        );
      })
      .map(asUrl),
  );
}

/**
 * The subject of one ReviewState inside its reviews document, written in
 * this app's format at `subjectUrl`, onto `existing` (what is there now,
 * if anything): it names its card, direction and scheduler.
 */
export function toReviewStateThing(
  documents: ReviewDocuments,
  state: ReviewState,
  existing: NamedSubject | null,
  subjectUrl: string,
): NamedSubject {
  return recordThing(
    subjectUrl,
    REVIEW_STATE_V2,
    reviewStateToRecord(state, documents.cardsDocumentUrl),
    existing,
  );
}

/**
 * The subject of one FSRS-6 state inside its reviews document, written
 * in this app's format at `subjectUrl`, onto `existing`: it names its
 * card, its direction and sm:fsrs6, the value its shape fixes.
 */
export function toFsrsStateThing(
  documents: ReviewDocuments,
  state: FsrsState,
  existing: NamedSubject | null,
  subjectUrl: string,
): NamedSubject {
  return recordThing(
    subjectUrl,
    FSRS_REVIEW_STATE_V1,
    fsrsReviewStateToRecord(state, documents.cardsDocumentUrl),
    existing,
  );
}
