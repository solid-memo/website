// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isRecalled, type Answer } from "./answer";
import { fragmentIdOf } from "./subjectUrl";

/**
 * The answers to each prompt in the order they were given (its chain),
 * for what one answer cannot say of itself: whether it repeats an answer
 * the same study day, and so whether it is a review that counts toward
 * recall, or a lapse. Pure; built once over the answers a figure needs
 * (docs/statistics.md, "What the figures count").
 */

/** The answers to the prompts of the answers given, each prompt's oldest first. */
export interface ChainIndex {
  /** By prompt key (promptKeyOf). */
  chains: ReadonlyMap<string, readonly Answer[]>;
  /** Each answer's chain and its place in it. */
  places: ReadonlyMap<Answer, { chain: readonly Answer[]; at: number }>;
}

/** The part of a chain from one introduction up to the next. */
export interface Segment {
  /**
   * Whether it starts without an introduction: a card moved with its
   * progress, or one introduced before the answers given.
   */
  open: boolean;
  answers: readonly Answer[];
}

/**
 * The prompt an answer is to: its deck, its card by fragment id (so the
 * key survives an upgrade that moves the cards into a new document,
 * given answers rebased by deckAnswers) and its direction.
 */
export function promptKeyOf(answer: Pick<Answer, "deckUrl" | "cardUrl" | "direction">): string {
  return `${answer.deckUrl}#${fragmentIdOf(answer.cardUrl)}\n${answer.direction}`;
}

/** The answers given, by prompt, each prompt's in the order given (by time, then id). */
export function chainIndexOf(answers: readonly Answer[]): ChainIndex {
  const chains = new Map<string, Answer[]>();
  for (const answer of answers) {
    const key = promptKeyOf(answer);
    const chain = chains.get(key);
    if (chain === undefined) chains.set(key, [answer]);
    else chain.push(answer);
  }
  const places = new Map<Answer, { chain: readonly Answer[]; at: number }>();
  for (const chain of chains.values()) {
    chain.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id));
    chain.forEach((answer, at) => places.set(answer, { chain, at }));
  }
  return { chains, places };
}

/**
 * Whether an answer of the index follows another to its prompt the same
 * study day: a card failed and put back in the session, or answered again
 * in a course. A study day is never split between months, so this never
 * depends on how many months were read.
 */
export function isRepeat(answer: Answer, index: ChainIndex): boolean {
  const { chain, at } = index.places.get(answer)!;
  return at > 0 && chain[at - 1]!.studyDay === answer.studyDay;
}

/**
 * Whether an answer of the index introduces its prompt that day: one
 * without a prior interval that repeats none (a card forgotten in the
 * Studio and studied again the same day is a repeat, not a second new
 * card).
 */
export function isIntroduction(answer: Answer, index: ChainIndex): boolean {
  return answer.priorIntervalDays === undefined && !isRepeat(answer, index);
}

/**
 * Whether an answer of the index is a review that counts toward recall:
 * of a prompt already introduced, the first to it that study day, and
 * recalled and graded by the learner, not chosen among a course's
 * options.
 */
export function isScoredReview(answer: Answer, index: ChainIndex): boolean {
  return (
    answer.priorIntervalDays !== undefined &&
    (answer.mode ?? "recall") === "recall" &&
    !isRepeat(answer, index)
  );
}

/** Whether an answer of the index forgot its prompt: a scored review below grade 3. */
export function isLapse(answer: Answer, index: ChainIndex): boolean {
  return isScoredReview(answer, index) && !isRecalled(answer);
}

/**
 * A chain cut at each introduction (an answer without a prior interval):
 * a Studio "forget" starts the prompt over. The first segment is open
 * when the chain does not start with one.
 */
export function segmentsOf(chain: readonly Answer[]): Segment[] {
  const segments: { open: boolean; answers: Answer[] }[] = [];
  for (const answer of chain) {
    if (answer.priorIntervalDays === undefined) segments.push({ open: false, answers: [answer] });
    else if (segments.length === 0) segments.push({ open: true, answers: [answer] });
    else segments.at(-1)!.answers.push(answer);
  }
  return segments;
}
