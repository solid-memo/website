// @vitest-environment node
/**
 * The answer log against a real Solid server (docs/data-model.md): an
 * answer is added to its month's document with one insert-only PATCH,
 * unread and unconditional, which every server tested creates when it is
 * missing and keeps however many tabs add at once; resetting a study day
 * removes that deck's answers of the day; the Studio reads a month again
 * only once it changed. Runs against each server globalSetup.ts starts.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit } from "./serverTraits";

const SERVERS = inject("solidServers");

/** The answer log as createAppUseCases wires it: every answer checked against its shape before it is added. */
function answerLog() {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  return createSolidAnswerLog({ fetch, checkWrite: shapeValidator.checkSubjects });
}

function answerOf(instanceUrl: string, studyDay: string, deck: string, n: number): Answer {
  return {
    id: `answer-${studyDay.replace(/-/g, "")}T100000000Z-${n}`,
    deckUrl: `${instanceUrl}catalog.ttl#${deck}`,
    cardUrl: `${instanceUrl}decks/${deck}.ttl#card-${n}`,
    direction: n % 2 === 0 ? "front-to-back" : "back-to-front",
    grade: n % 6 as Answer["grade"],
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(n % 3 === 0 ? {} : { priorIntervalDays: n }),
    nextIntervalDays: n + 1,
  };
}

describe.each(SERVERS)("the answer log on $name", ({ url: server }) => {
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("reads a month again only once it changed since the version read", async (context) => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    await expect(log.readMonthSince(instanceUrl, "2026-09", undefined)).resolves.toEqual({ unchanged: false, value: [], version: "absent" });
    const first = answerOf(instanceUrl, "2026-09-21", "deck-1", 1);
    await log.append(instanceUrl, first);
    const read = await log.readMonthSince(instanceUrl, "2026-09", "absent");
    expect(read).toMatchObject({ unchanged: false, value: [first] });
    if (read.unchanged || read.version === null) return context.skip("this server gives no ETag on a read, so every read is a whole one");
    await expect(log.readMonthSince(instanceUrl, "2026-09", read.version)).resolves.toEqual({ unchanged: true });
    if (!everyEdit) return context.skip(ETAG_OUTLIVES_EDITS);
    const second = answerOf(instanceUrl, "2026-09-22", "deck-1", 2);
    await log.append(instanceUrl, second);
    const again = await log.readMonthSince(instanceUrl, "2026-09", read.version);
    expect(again.unchanged).toBe(false);
    expect(again.unchanged ? [] : again.value).toEqual(expect.arrayContaining([first, second]));
  });

  it("adds answers to month documents it creates as needed, all of several added at once, and reads them back", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    await expect(log.months(instanceUrl)).resolves.toEqual([]);
    const october = answerOf(instanceUrl, "2026-10-01", "deck-1", 1);
    await log.append(instanceUrl, october);
    const september = Array.from({ length: 5 }, (_, i) => answerOf(instanceUrl, "2026-09-21", "deck-1", i + 2));
    await Promise.all(september.map((answer) => log.append(instanceUrl, answer)));
    await expect(log.months(instanceUrl)).resolves.toEqual(["2026-09", "2026-10"]);
    const read = await log.readMonth(instanceUrl, "2026-09");
    expect(read).toHaveLength(5);
    expect(read).toEqual(expect.arrayContaining(september));
    await expect(log.readMonth(instanceUrl, "2026-10")).resolves.toEqual([october]);
  });

  it("removes a deck's answers of a study day, and only those", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const kept = [answerOf(instanceUrl, "2026-09-20", "deck-1", 1), answerOf(instanceUrl, "2026-09-21", "deck-2", 2)];
    for (const answer of [...kept, answerOf(instanceUrl, "2026-09-21", "deck-1", 3), answerOf(instanceUrl, "2026-09-21", "deck-1", 4)]) {
      await log.append(instanceUrl, answer);
    }
    await log.removeDay(instanceUrl, `${instanceUrl}catalog.ttl#deck-1`, "2026-09-21");
    const left = await log.readMonth(instanceUrl, "2026-09");
    expect(left).toHaveLength(2);
    expect(left).toEqual(expect.arrayContaining(kept));
  });

  it("adds nothing that does not fit the answer shape", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const odd = { ...answerOf(instanceUrl, "2026-09-21", "deck-1", 1), grade: 7 } as unknown as Answer;
    await expect(log.append(instanceUrl, odd)).rejects.toThrow("An answer's grade is one whole number, 0 to 5.");
    await expect(log.months(instanceUrl)).resolves.toEqual([]);
  });
});
