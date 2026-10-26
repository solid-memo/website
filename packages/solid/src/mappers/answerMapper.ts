// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type NamedSubject, type Subject, asUrl } from "../client/rdf";
import type { Answer } from "@solid-memo/domain/answer";
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
 */
export function toAnswer(thing: Subject): Answer | null {
  const read = readVersioned(thing, "answer");
  if (read === null || !isStudyDay(read.record.data.studyDay)) return null;
  return answerFromRecord(
    fragmentIdOf(asUrl(thing)),
    migrate("answer", read.record, { subject: asUrl(thing) }),
  );
}

/** An answer as a new subject of its month's document. */
export function toAnswerThing(documentUrl: string, answer: Answer): NamedSubject {
  return recordThing(`${documentUrl}#${answer.id}`, ANSWER_V1, answerToRecord(answer), null);
}
