// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, createSolidDataset, getThingAll, removeThing, setThing } from "./client/rdf";
import type { AnswerLog } from "@solid-memo/application/ports";
import { monthOfStudyDay, type Answer } from "@solid-memo/domain/answer";
import {
  historyContainerOf,
  historyUrlOf,
  monthOfHistoryUrl,
} from "@solid-memo/domain/instanceLayout";
import { listContainerTree } from "./containers";
import {
  appendAllToDocument,
  appendToDocument,
  getSolidDatasetOrNull,
  PreconditionFailedError,
  saveDataset,
} from "./datasets";
import { toAnswer, toAnswerThing } from "./mappers/answerMapper";
import { mapSince, readSince } from "./readSince";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { unlessNewer } from "./records";

/** The answers of a month's document (none when there is none), each that fits its shape. */
function answersIn(dataset: Dataset | null): Answer[] {
  return dataset === null ? [] : getThingAll(dataset).flatMap((thing) => toAnswer(thing) ?? []);
}

/** Tries at removing answers while other writes keep adding to the document. */
const ATTEMPTS = 3;

/**
 * The answer log in the pod (see docs/data-model.md): one document per
 * study month under the instance's history/ container. An answer is
 * added with an insert-only PATCH, without reading the document: answers
 * never clash, whichever tab or device adds them. Read leniently: an
 * answer that does not fit its shape is left out of the statistics.
 */
export function createSolidAnswerLog({
  fetch,
  checkWrite = noWriteCheck,
}: {
  fetch: typeof globalThis.fetch;
  checkWrite?: WriteCheck;
}): AnswerLog {
  /** Remove the answers of a month's document that `which` picks, unless another write keeps getting in first. */
  async function removeAnswers(url: string, which: (answer: Answer) => boolean): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const dataset = await getSolidDatasetOrNull(url, fetch);
      if (dataset === null) return;
      const picked = getThingAll(dataset).filter((thing) => {
        const answer = toAnswer(thing);
        return answer !== null && which(answer);
      });
      if (picked.length === 0) return;
      try {
        await saveDataset(url, picked.map(unlessNewer).reduce(removeThing, dataset), fetch);
        return;
      } catch (error) {
        if (!(error instanceof PreconditionFailedError) || attempt === ATTEMPTS) throw error;
      }
    }
  }

  return {
    async append(instanceUrl, answer) {
      const url = historyUrlOf(instanceUrl, monthOfStudyDay(answer.studyDay));
      const thing = toAnswerThing(url, answer);
      await checkWrite(setThing(createSolidDataset(), thing), [`${url}#${answer.id}`], "pod");
      await appendToDocument(url, thing, fetch);
    },

    async appendAll(instanceUrl, answers) {
      const byMonth = new Map<string, Answer[]>();
      for (const answer of answers) {
        const url = historyUrlOf(instanceUrl, monthOfStudyDay(answer.studyDay));
        byMonth.set(url, [...(byMonth.get(url) ?? []), answer]);
      }
      for (const [url, month] of byMonth) {
        const things = month.map((answer) => toAnswerThing(url, answer));
        await checkWrite(
          things.reduce(setThing, createSolidDataset()),
          month.map((answer) => `${url}#${answer.id}`),
          "pod",
        );
        await appendAllToDocument(url, things, fetch);
      }
    },

    async months(instanceUrl) {
      const resources = await listContainerTree(historyContainerOf(instanceUrl), fetch);
      return resources
        .map((url) => monthOfHistoryUrl(instanceUrl, url))
        .filter((month): month is string => month !== null)
        .sort();
    },

    async readMonth(instanceUrl, month) {
      return answersIn(await getSolidDatasetOrNull(historyUrlOf(instanceUrl, month), fetch));
    },

    async readMonthSince(instanceUrl, month, version) {
      return mapSince(await readSince(historyUrlOf(instanceUrl, month), version, fetch), answersIn);
    },

    removeDay(instanceUrl, deckUrl, studyDay) {
      return removeAnswers(
        historyUrlOf(instanceUrl, monthOfStudyDay(studyDay)),
        (answer) => answer.deckUrl === deckUrl && answer.studyDay === studyDay,
      );
    },

    removeAnswer(instanceUrl, studyDay, id) {
      return removeAnswers(
        historyUrlOf(instanceUrl, monthOfStudyDay(studyDay)),
        (answer) => answer.id === id,
      );
    },
  };
}
