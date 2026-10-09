import { createSolidDataset, getThingAll, removeThing, setThing } from "@inrupt/solid-client";
import type { AnswerLog } from "@solid-memo/application/ports";
import { monthOfStudyDay } from "@solid-memo/domain/answer";
import { historyContainerOf, historyUrlOf, monthOfHistoryUrl } from "@solid-memo/domain/instanceLayout";
import { listContainerTree } from "./containers";
import { appendToDocument, getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { toAnswer, toAnswerThing } from "./mappers/answerMapper";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { unlessNewer } from "./records";

/** Tries at removing a day's answers while other writes keep adding to the document. */
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
  return {
    async append(instanceUrl, answer) {
      const url = historyUrlOf(instanceUrl, monthOfStudyDay(answer.studyDay));
      const thing = toAnswerThing(url, answer);
      await checkWrite(setThing(createSolidDataset(), thing), [`${url}#${answer.id}`]);
      await appendToDocument(url, thing, fetch);
    },

    async months(instanceUrl) {
      const resources = await listContainerTree(historyContainerOf(instanceUrl), fetch);
      return resources
        .map((url) => monthOfHistoryUrl(instanceUrl, url))
        .filter((month): month is string => month !== null)
        .sort();
    },

    async readMonth(instanceUrl, month) {
      const dataset = await getSolidDatasetOrNull(historyUrlOf(instanceUrl, month), fetch);
      if (dataset === null) return [];
      return getThingAll(dataset).flatMap((thing) => toAnswer(thing) ?? []);
    },

    async removeDay(instanceUrl, deckUrl, studyDay) {
      const url = historyUrlOf(instanceUrl, monthOfStudyDay(studyDay));
      for (let attempt = 1; ; attempt++) {
        const dataset = await getSolidDatasetOrNull(url, fetch);
        if (dataset === null) return;
        const day = getThingAll(dataset).filter((thing) => {
          const answer = toAnswer(thing);
          return answer !== null && answer.deckUrl === deckUrl && answer.studyDay === studyDay;
        });
        if (day.length === 0) return;
        try {
          await saveDataset(url, day.map(unlessNewer).reduce(removeThing, dataset), fetch);
          return;
        } catch (error) {
          if (!(error instanceof PreconditionFailedError) || attempt === ATTEMPTS) throw error;
        }
      }
    },
  };
}
