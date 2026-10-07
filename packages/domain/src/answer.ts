import type { StudyDirection } from "./deck";
import type { ReviewQuality } from "./review";

/**
 * One grade given to one prompt during study: an entry of the instance's
 * answer log, which the study statistics are computed from (see
 * docs/data-model.md). Appended as it is given, never edited; resetting a
 * study day removes that day's answers.
 */
export interface Answer {
  /** The entry's fragment id in its month document: "answer-<time>-<random>". */
  id: string;
  /** The deck's catalog entry, which may since have been removed. */
  deckUrl: string;
  /** The card's subject, which may since have been removed. */
  cardUrl: string;
  direction: StudyDirection;
  /** The SM-2 quality, whichever answer scale gave it. */
  grade: ReviewQuality;
  /** ISO dateTime. */
  answeredAt: string;
  /** The study day the answer counts towards, fixed when it was given. */
  studyDay: string;
  /** The prompt's interval before the answer; absent on its first answer, which introduced it. */
  priorIntervalDays?: number;
  /** The prompt's interval after the answer. */
  nextIntervalDays: number;
  /**
   * How it was answered (vocabulary 1.14): recalled and graded by the
   * learner, or chosen among options, as a course asks. Absent means
   * recalled, as every answer before 1.14 was.
   */
  mode?: AnswerMode;
  /**
   * For a wrong multiple-choice answer, the wrong option chosen: the
   * distractor's subject in the deck's cards document. Absent otherwise.
   */
  chosenDistractor?: string;
}

/** How an answer was given; the notations of the AnswerModes scheme's concepts. */
export type AnswerMode = "recall" | "multiple-choice";

/** An entry's fragment id: its time without separators and a random part, so tabs and devices never collide. */
export function answerIdOf(answeredAt: string, random: string): string {
  return `answer-${answeredAt.replace(/[-:.]/g, "")}-${random}`;
}

/** The month of the answer log a study day belongs to, "YYYY-MM": a study day is never split. */
export function monthOfStudyDay(studyDay: string): string {
  return studyDay.slice(0, 7);
}

/** Whether an answer remembered the card: SM-2 grades 3 and up. */
export function isRecalled(answer: Pick<Answer, "grade">): boolean {
  return answer.grade >= 3;
}
