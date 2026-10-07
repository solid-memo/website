import type { AnswerV1 } from "@solid-memo/vocab/types.generated";
import type { Answer } from "./answer";
import { answerModeOfConcept, conceptOfAnswerMode, conceptOfDirection, directionOfConcept } from "./concepts";
import type { StudyDirection } from "./deck";
import type { ReviewQuality } from "./review";

/**
 * An answer between its shape record and the model; its id is the
 * subject's fragment. The mode is written as the answer states it: a
 * study session states none, which reads as recall.
 */
export function answerToRecord(answer: Answer): AnswerV1 {
  return {
    deck: answer.deckUrl,
    card: answer.cardUrl,
    direction: conceptOfDirection(answer.direction) as AnswerV1["direction"],
    grade: answer.grade,
    answeredAt: answer.answeredAt,
    studyDay: answer.studyDay,
    ...(answer.priorIntervalDays === undefined ? {} : { priorIntervalDays: answer.priorIntervalDays }),
    nextIntervalDays: answer.nextIntervalDays,
    ...(answer.mode === undefined ? {} : { mode: conceptOfAnswerMode(answer.mode) }),
    ...(answer.chosenDistractor === undefined ? {} : { chosenDistractor: answer.chosenDistractor }),
  };
}

export function answerFromRecord(id: string, data: AnswerV1): Answer {
  return {
    id,
    deckUrl: data.deck,
    cardUrl: data.card,
    direction: directionOfConcept(data.direction) as StudyDirection,
    grade: data.grade as ReviewQuality,
    answeredAt: data.answeredAt,
    studyDay: data.studyDay,
    ...(data.priorIntervalDays === undefined ? {} : { priorIntervalDays: data.priorIntervalDays }),
    nextIntervalDays: data.nextIntervalDays,
    ...(data.mode === undefined ? {} : { mode: answerModeOfConcept(data.mode)! }),
    ...(data.chosenDistractor === undefined ? {} : { chosenDistractor: data.chosenDistractor }),
  };
}
