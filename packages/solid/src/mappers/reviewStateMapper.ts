// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  type Subject,
  asUrl,
  getTermAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  setThing,
} from "../client/rdf";
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
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { FSRS_REVIEW_STATE_V1, REVIEW_STATE_V2 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing, removeUnlessNewer } from "../records";
import { RDF, SM } from "../vocab";

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
  const terms = getTermAll(thing, SM.scheduler);
  const all = (iri: string) =>
    terms.every((term) => term.termType === "NamedNode" && term.value === iri);
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
  const reviewOf = getUrl(thing, SM.reviewOf);
  const direction = getUrl(thing, SM.reviewDirection);
  if (reviewOf !== null) links.reviewOf = reviewOf;
  if (direction !== null) links.direction = direction;
  if (schedulerOf(thing) !== "sm2") links.anotherScheduler = true;
  return links;
}

const isReviewState = (thing: Subject) => getUrlAll(thing, RDF.type).includes(SM.ReviewState);

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

/** Each state of the document `read` maps a subject to, with its subject: one per card and direction (pickReviewStates, the subject `named` names first). */
function readOf<T extends ReviewKey>(
  dataset: Dataset,
  documents: ReviewDocuments,
  read: (thing: Subject, deck: ReviewedDeck) => T | null,
  named: (reviewsDocumentUrl: string, key: ReviewKey) => string,
): Read<T>[] {
  const states = getThingAll(dataset).flatMap((thing) => {
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
 * subject), a new subject `#review-<id>`, which names its card.
 */
function newSubjectFor<T>(
  dataset: Dataset,
  documents: ReviewDocuments,
  kind: Kind<T>,
  key: ReviewKey,
  newId: () => string,
): string {
  const named = kind.named(documents.reviewsDocumentUrl, key);
  const there = getThing(dataset, named);
  if (there === null) return named;
  const thereKey = kind.keyOf(there, documents);
  return thereKey !== null && sameKey(thereKey, key)
    ? named
    : `${documents.reviewsDocumentUrl}#review-${newId()}`;
}

/** The states to write: SM-2's, and FSRS-6's, left out when there are none. */
export interface StatesToWrite {
  sm2: readonly ReviewState[];
  fsrs?: readonly FsrsState[];
}

/**
 * The reviews document with each state written in this app's format: a
 * state read from the document onto the subject it was read from,
 * whatever that is called; any other at the subject newSubjectFor gives.
 * The document is read once, however many states are written. Returns
 * the subjects written, the SM-2 states' then the FSRS-6 states', each
 * in their order.
 */
export function withReviewStates(
  dataset: Dataset,
  documents: ReviewDocuments,
  states: StatesToWrite,
  newId: () => string,
): { dataset: Dataset; subjects: string[] } {
  return writeBoth(dataset, documents, readBoth(dataset, documents), states, newId);
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
): { dataset: Dataset; subjects: string[] } {
  const sm2 = writeStates(dataset, documents, SM2_KIND, read.sm2, states.sm2, newId);
  const fsrs = writeStates(sm2.dataset, documents, FSRS_KIND, read.fsrs, states.fsrs ?? [], newId);
  return { dataset: fsrs.dataset, subjects: [...sm2.subjects, ...fsrs.subjects] };
}

/** The document with `states` of one kind written, each at the subject `read` has it at, else a new one. */
function writeStates<T extends ReviewKey>(
  dataset: Dataset,
  documents: ReviewDocuments,
  kind: Kind<T>,
  read: readonly { url: string; key: ReviewKey }[],
  states: readonly T[],
  newId: () => string,
): { dataset: Dataset; subjects: string[] } {
  const subjectOf = new Map(read.map(({ url, key }) => [reviewKeyOf(key), url]));
  let updated = dataset;
  const subjects: string[] = [];
  for (const state of states) {
    const subject =
      subjectOf.get(reviewKeyOf(state)) ?? newSubjectFor(updated, documents, kind, state, newId);
    subjectOf.set(reviewKeyOf(state), subject);
    updated = setThing(updated, kind.thing(documents, state, getThing(updated, subject), subject));
    subjects.push(subject);
  }
  return { dataset: updated, subjects };
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
  return [...removed(read.sm2, keys.sm2), ...removed(read.fsrs, keys.fsrs)].reduce(
    (current, { url }) => removeUnlessNewer(current, url),
    dataset,
  );
}

/**
 * The reviews document without any state of the given cards and
 * directions (a card removed, by hand or by an upgrade): every subject
 * typed sm:ReviewState that is an SM-2 state of one, by its links or the
 * fragment rule, or this app's FSRS-6 state of one, by its links, read
 * or not. Another scheduler's states, and any other subject, stay.
 */
export function withoutReviewStates(
  dataset: Dataset,
  documents: ReviewDocuments,
  keys: readonly ReviewKey[],
): Dataset {
  return getThingAll(dataset)
    .filter((thing) => {
      const key = keyOfSubject(thing, documents) ?? fsrsKeyOfSubject(thing, documents);
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
