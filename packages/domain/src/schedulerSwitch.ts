// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Answer } from "./answer";
import { chainIndexOf, promptKeyOf, segmentsOf } from "./answerChain";
import type { StepPart } from "./deckUpgrade";
import { memoryFromSm2, nextMemory, type FsrsMemory } from "./fsrs";
import { ratingOfAnswer } from "./grading";
import type { LangText } from "./langText";
import { FSRS_REVIEW_STATE_FORMAT_VERSION, type FsrsState, type ReviewState } from "./review";
import { daysBetween } from "./studyPatterns";

/**
 * Switching an instance to FSRS-6 (docs/srs.md, "Switching the
 * scheduler"): every prompt with an SM-2 state is given an FSRS-6 state,
 * replayed from its answers when the answer log holds its whole history
 * since it was introduced, else estimated from the SM-2 state. The due
 * days stay as SM-2 set them, so nothing falls due early or late on the
 * day of the switch. Each deck's states are written in one write; the
 * preferences are saved last, so a switch cut off half-way leaves SM-2
 * in charge and can simply be run again.
 */

/** The steps the user sees: reading the answer log and the decks, writing each deck's states, saving the preferences. */
export type SwitchStep = "read" | "decks" | "preferences";

export const SWITCH_STEPS: readonly SwitchStep[] = ["read", "decks", "preferences"];

export interface SwitchProgress {
  step: SwitchStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How many of the decks are done, while it writes them. */
  part?: StepPart;
}

/** A deck whose FSRS-6 states could not be written. */
export interface SwitchFailure {
  /** The deck's catalog entry. */
  url: string;
  title: LangText;
  /** Why: an AppError the app can show in the reader's language, or any other error. */
  error: unknown;
}

export interface SwitchOutcome {
  /** Whether the preferences now name the scheduler: false when a deck failed, and nothing was switched. */
  switched: boolean;
  /** The decks whose states were written. */
  decks: number;
  /** The prompts whose FSRS-6 state was replayed from their answers. */
  replayed: number;
  /** The prompts whose FSRS-6 state was estimated from their SM-2 state. */
  estimated: number;
  /** The decks that could not be written, each as it was; empty when the switch is done. */
  failed: SwitchFailure[];
}

/** A deck's FSRS-6 states as a switch makes them, and how many of them were replayed or estimated. */
export interface SwitchedStates {
  fsrs: FsrsState[];
  replayed: number;
  estimated: number;
}

/**
 * The answers of a prompt's history, oldest first, when the log holds
 * all of it: its last segment (since its last introduction) starts with
 * the introduction its SM-2 state records and ends with its last review.
 * Else null: a card moved in with its progress, answers cut off by a
 * guest's move, or a state left behind by an older app.
 */
function historyOf(
  sm2: ReviewState,
  chain: readonly Answer[] | undefined,
): readonly Answer[] | null {
  if (chain === undefined) return null;
  const last = segmentsOf(chain).at(-1)!;
  const first = last.answers[0]!;
  const latest = last.answers.at(-1)!;
  return !last.open &&
    Date.parse(first.answeredAt) === Date.parse(sm2.firstReviewedAt) &&
    Date.parse(latest.answeredAt) === Date.parse(sm2.lastReviewedAt)
    ? last.answers
    : null;
}

/**
 * The memory a prompt's answers leave, replayed one by one: the first
 * from its rating, each later one stepped by the study days since the
 * answer before it (0 the same study day).
 */
function replayed(history: readonly Answer[]): FsrsMemory {
  let memory: FsrsMemory | null = null;
  let day = history[0]!.studyDay;
  for (const answer of history) {
    memory = nextMemory(
      memory,
      ratingOfAnswer(answer),
      Math.max(0, daysBetween(day, answer.studyDay)),
    );
    day = answer.studyDay;
  }
  return memory!;
}

/**
 * The FSRS-6 state switching to FSRS-6 gives each SM-2 state of a deck
 * (`deckUrl`), given the instance's answers (any decks', any order):
 * replayed from the prompt's answers when they are its whole history
 * since it was introduced, else estimated from the SM-2 state
 * (memoryFromSm2). Each keeps the SM-2 state's due day and reviews, and
 * has no snapshot, as nothing FSRS-6 wrote is there to restore.
 */
export function switchedStates(
  deckUrl: string,
  sm2: readonly ReviewState[],
  answers: readonly Answer[],
): SwitchedStates {
  const { chains } = chainIndexOf(answers.filter((answer) => answer.deckUrl === deckUrl));
  let replayedCount = 0;
  const fsrs = sm2.map((state): FsrsState => {
    const key = promptKeyOf({ deckUrl, cardUrl: `#${state.cardId}`, direction: state.direction });
    const history = historyOf(state, chains.get(key));
    if (history !== null) replayedCount += 1;
    const memory = history === null ? memoryFromSm2(state) : replayed(history);
    return {
      cardId: state.cardId,
      direction: state.direction,
      stability: memory.stability,
      difficulty: memory.difficulty,
      due: state.due,
      firstReviewedAt: state.firstReviewedAt,
      lastReviewedAt: state.lastReviewedAt,
      formatVersion: FSRS_REVIEW_STATE_FORMAT_VERSION,
    };
  });
  return { fsrs, replayed: replayedCount, estimated: sm2.length - replayedCount };
}
