import { asUrl, type Thing, type ThingPersisted } from "@inrupt/solid-client";
import type { Answer } from "@solid-memo/domain/answer";
import { answerFromRecord, answerToRecord } from "@solid-memo/domain/answerRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { ANSWER_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/** An answer-log subject as an Answer; null when it is not an sm:Answer that fits its shape. */
export function toAnswer(thing: Thing): Answer | null {
  const read = readVersioned(thing, "answer");
  if (read === null) return null;
  return answerFromRecord(
    fragmentIdOf(asUrl(thing)),
    migrate("answer", read.record, { subject: asUrl(thing) }),
  );
}

/** An answer as a new subject of its month's document. */
export function toAnswerThing(documentUrl: string, answer: Answer): ThingPersisted {
  return recordThing(`${documentUrl}#${answer.id}`, ANSWER_V1, answerToRecord(answer), null);
}
