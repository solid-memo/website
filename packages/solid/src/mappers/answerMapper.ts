// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type NamedSubject, type Subject, asUrl } from "../client/rdf";
import { type Answer, isOfStudyDayRange } from "@solid-memo/domain/answer";
import { answerFromRecord, answerToRecord } from "@solid-memo/domain/answerRecord";
import { isStudyDay } from "@solid-memo/domain/reviewStateEdits";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { ANSWER_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/**
 * An answer-log subject as an Answer; null when it is not an sm:Answer
 * that fits its shape, or its study day is not a real date (the shape's
 * pattern lets "2026-13-01" through, and the statistics count days from it).
 * A prior due day that is not a real date, or is outside the range the
 * study days are held to (isOfStudyDayRange), is left out, the answer
 * kept: the reader does not apply the shape's pattern, and the
 * statistics count days from that day too.
 */
export function toAnswer(thing: Subject): Answer | null {
  const read = readVersioned(thing, "answer");
  if (read === null || !isStudyDay(read.record.data.studyDay)) return null;
  const { priorDue, ...data } = migrate("answer", read.record, { subject: asUrl(thing) });
  return answerFromRecord(
    fragmentIdOf(asUrl(thing)),
    priorDue === undefined || !isStudyDay(priorDue) || !isOfStudyDayRange(priorDue)
      ? data
      : { ...data, priorDue },
  );
}

/** An answer as a new subject of its month's document. */
export function toAnswerThing(documentUrl: string, answer: Answer): NamedSubject {
  return recordThing(`${documentUrl}#${answer.id}`, ANSWER_V1, answerToRecord(answer), null);
}
