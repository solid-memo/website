// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  createSolidDataset,
  getThingAll,
  removeThings,
  setThing,
  setThings,
} from "./client/rdf";
import type { AnswerLog } from "@solid-memo/application/ports";
import {
  isOfStudyMonth,
  MAX_LOG_MONTHS,
  monthOfStudyDay,
  type Answer,
} from "@solid-memo/domain/answer";
import {
  historyContainerOf,
  historyUrlOf,
  monthOfHistoryUrl,
} from "@solid-memo/domain/instanceLayout";
import { listContainer } from "./containers";
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
import { READ_DEADLINE_MS } from "./readDeadline";
import { unlessNewer } from "./records";

/**
 * The answers of a month's document (none when there is none), each that
 * fits its shape and is of the month (isOfStudyMonth): the statistics
 * count every day from the first answer's to the last's.
 */
function answersIn(month: string, dataset: Dataset | null): Answer[] {
  return dataset === null
    ? []
    : getThingAll(dataset).flatMap((thing) => {
        const answer = toAnswer(thing);
        return answer !== null && isOfStudyMonth(answer.studyDay, month) ? [answer] : [];
      });
}

/**
 * How long adding an answer waits for the server, in milliseconds: as
 * long as a read (readDeadline.ts). An answer is added whole, so one cut
 * off is added again later; a server that never answers holds up nothing
 * waiting for the log.
 */
export const APPEND_DEADLINE_MS = READ_DEADLINE_MS;

/** Tries at removing answers while other writes keep adding to the document. */
const ATTEMPTS = 3;

/**
 * The answer log in the pod (see docs/data-model.md): one document per
 * study month under the instance's history/ container. An answer is
 * added with an insert-only PATCH, without reading the document: answers
 * never clash, whichever tab or device adds them, and one the server
 * does not answer in time is given up (APPEND_DEADLINE_MS), to be
 * added again later. Read leniently: an
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
        await saveDataset(url, removeThings(dataset, picked.map(unlessNewer)), fetch);
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
      // Given up when the server does not answer in time, as a read is: it is added again later, which changes nothing if it was saved.
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), APPEND_DEADLINE_MS);
      try {
        await appendToDocument(url, thing, fetch, deadline.signal);
      } finally {
        clearTimeout(timer);
      }
    },

    async appendAll(instanceUrl, answers) {
      const byMonth = new Map<string, Answer[]>();
      for (const answer of answers) {
        const url = historyUrlOf(instanceUrl, monthOfStudyDay(answer.studyDay));
        const month = byMonth.get(url);
        if (month === undefined) byMonth.set(url, [answer]);
        else month.push(answer);
      }
      for (const [url, month] of byMonth) {
        const things = month.map((answer) => toAnswerThing(url, answer));
        await checkWrite(
          setThings(createSolidDataset(), things),
          month.map((answer) => `${url}#${answer.id}`),
          "pod",
        );
        await appendAllToDocument(url, things, fetch);
      }
    },

    async months(instanceUrl, until) {
      // One listing, of history/ alone: a month's document is one of its own (monthOfHistoryUrl), never in a folder below.
      // A month after `until` holds nothing to read, so it is left out before the newest are taken.
      const months = new Set<string>();
      for (const url of await listContainer(historyContainerOf(instanceUrl), fetch)) {
        const month = monthOfHistoryUrl(instanceUrl, url);
        if (month !== null && month <= until) months.add(month);
      }
      return [...months].sort().slice(-MAX_LOG_MONTHS);
    },

    async readMonth(instanceUrl, month) {
      return answersIn(month, await getSolidDatasetOrNull(historyUrlOf(instanceUrl, month), fetch));
    },

    async readMonthSince(instanceUrl, month, version) {
      return mapSince(
        await readSince(historyUrlOf(instanceUrl, month), version, fetch),
        (dataset) => answersIn(month, dataset),
      );
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
